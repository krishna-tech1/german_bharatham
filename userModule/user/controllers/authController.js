const prisma = require("../../../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../../../services/mailer");
const axios = require("axios");

let googleAuthLib;
try {
  googleAuthLib = require("google-auth-library");
} catch (_) {
  googleAuthLib = null;
}

let jose;
try {
  jose = require("jose");
} catch (_) {
  jose = null;
}

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const obj = { ...userDoc, _id: String(userDoc.id) };
  if (obj.password !== undefined) delete obj.password;
  return obj;
};

const generateToken = (user) => {
  return jwt.sign(
    { id: String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const getOrCreateSocialUser = async ({
  provider,
  providerUserId,
  email,
  name,
  photo,
}) => {
  const providerField =
    provider === "google"
      ? "googleId"
      : provider === "facebook"
        ? "facebookId"
        : provider === "apple"
          ? "appleSub"
          : null;

  if (!providerField) {
    throw new Error("Unsupported provider");
  }

  let user = await prisma.user.findFirst({
    where: { [providerField]: providerUserId }
  });

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() }
    });
    if (user && !user[providerField]) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          [providerField]: providerUserId,
          authProvider: provider,
          photo: photo && !user.photo ? photo : undefined,
          name: name && !user.name ? name : undefined,
        }
      });
    }
  }

  if (!user) {
    if (!email) {
      throw new Error("Email permission is required for this login");
    }
    user = await prisma.user.create({
      data: {
        name: String(name || "User").trim() || "User",
        email: String(email).toLowerCase().trim(),
        password: null,
        role: "user",
        authProvider: provider,
        [providerField]: providerUserId,
        photo: photo || null,
      },
    });
  }

  if (user.isActive === false) {
    const err = new Error("Account is deactivated");
    err.statusCode = 403;
    throw err;
  }

  return user;
};

const verifyGoogle = async ({ idToken, accessToken }) => {
  if (!googleAuthLib) {
    throw new Error(
      "Google auth library not installed. Run: npm install google-auth-library"
    );
  }

  const allowedClientIds = Array.from(
    new Set([
      ...parseCsv(process.env.GOOGLE_CLIENT_IDS),
      ...parseCsv(process.env.GOOGLE_CLIENT_ID),
      ...parseCsv(process.env.GOOGLE_SERVER_CLIENT_ID),
      ...parseCsv(process.env.GOOGLE_WEB_CLIENT_ID),
      ...parseCsv(process.env.GOOGLE_ANDROID_CLIENT_ID),
      ...parseCsv(process.env.GOOGLE_IOS_CLIENT_ID),
    ])
  );
  if (allowedClientIds.length === 0) {
    throw new Error(
      "Missing Google OAuth client id(s). Set GOOGLE_CLIENT_IDS (comma-separated) or GOOGLE_WEB_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID in .env"
    );
  }

  const trimmedIdToken = String(idToken || "").trim();
  const trimmedAccessToken = String(accessToken || "").trim();

  if (trimmedIdToken) {
    const { OAuth2Client } = googleAuthLib;
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: trimmedIdToken,
      audience: allowedClientIds,
    });
    const payload = ticket.getPayload() || {};

    return {
      providerUserId: payload.sub,
      email: payload.email,
      name: payload.name,
      photo: payload.picture,
      emailVerified: payload.email_verified,
    };
  }

  if (!trimmedAccessToken) {
    throw new Error("Missing idToken or accessToken for Google login");
  }

  const url = `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${trimmedAccessToken}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  if (!data || !data.sub) {
    throw new Error("Invalid access token");
  }

  return {
    providerUserId: data.sub,
    email: data.email,
    name: data.name,
    photo: data.picture,
    emailVerified: data.email_verified === true || data.email_verified === "true",
  };
};

const verifyFacebook = async ({ accessToken }) => {
  const trimmed = String(accessToken || "").trim();
  if (!trimmed) {
    throw new Error("Missing accessToken for Facebook login");
  }

  const url = `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${trimmed}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  if (!data || !data.id) {
    throw new Error("Invalid access token or graph response");
  }

  return {
    providerUserId: data.id,
    email: data.email || null,
    name: data.name || null,
    photo: data.picture?.data?.url || null,
  };
};

const verifyApple = async ({ identityToken }) => {
  if (!jose) {
    throw new Error("jose library not installed. Run: npm install jose");
  }

  const trimmed = String(identityToken || "").trim();
  if (!trimmed) {
    throw new Error("Missing identityToken for Apple login");
  }

  const keysUrl = "https://appleid.apple.com/auth/keys";
  const { data } = await axios.get(keysUrl, { timeout: 10000 });
  if (!data || !Array.isArray(data.keys)) {
    throw new Error("Failed to fetch Apple public keys");
  }

  const JWKS = jose.createLocalJWKSet(data);
  const { payload } = await jose.jwtVerify(trimmed, JWKS, {
    issuer: "https://appleid.apple.com",
  });

  if (!payload || !payload.sub) {
    throw new Error("Invalid identity token claims");
  }

  return {
    providerUserId: payload.sub,
    email: payload.email || null,
    name: null,
    photo: null,
  };
};

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const getAppBaseUrl = (req) => {
  const configured = String(process.env.BACKEND_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"]
    ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim()
    : req.protocol;
  return `${proto}://${req.get("host")}`;
};

// REGISTER
exports.register = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] register called at ${new Date().toISOString()}`);
  try {
    const { name, email, phone, password } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    const cleanEmail = email.toLowerCase().trim();
    console.log(`🔍 [DB QUERY] checking for existing user with email: ${cleanEmail}`);
    
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`🔍 [DB QUERY] creating new user with email: ${cleanEmail}`);
    const createStart = Date.now();
    const user = await prisma.user.create({
      data: {
        name,
        email: cleanEmail,
        phone,
        password: hashedPassword,
        role: "user",
      },
    });
    console.log(`✅ [DB RESULT] User created successfully in ${Date.now() - createStart}ms`);
    console.log(`📤 [RESPONSE] sending 201 response after ${Date.now() - start}ms`);
    res.status(201).json({
      token: generateToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(`❌ [ERROR] register failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

// SEND VERIFICATION CODE
exports.sendVerificationCode = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] sendVerificationCode called at ${new Date().toISOString()}`);
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    console.log(`🔍 [DB QUERY] checking if user already exists with email: ${cleanEmail}`);
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });
    if (existingUser) {
      console.log(`⚠️ [DUPLICATE EMAIL] User already exists with email: ${cleanEmail}`);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert the verification code to DB first (fast)
    console.log(`🔍 [DB QUERY] upserting verification code for email: ${cleanEmail}`);
    const upsertStart = Date.now();
    await prisma.emailVerification.upsert({
      where: { email: cleanEmail },
      update: { code, expiresAt },
      create: { email: cleanEmail, code, expiresAt }
    });
    console.log(`✅ [DB RESULT] upsert completed in ${Date.now() - upsertStart}ms`);

    // ✅ Respond immediately — do NOT wait for SMTP
    console.log(`📤 [RESPONSE] sending 200 immediately after ${Date.now() - start}ms`);
    res.status(200).json({ message: 'Verification code sent.' });

    // 🔁 Send email in background after response is flushed
    setImmediate(async () => {
      try {
        const emailStart = Date.now();
        await sendEmail({
          to: email,
          subject: 'Your Verification Code',
          text: `Your German Bharatham verification code is: ${code}\n\nThis code expires in 10 minutes.`
        });
        console.log(`✅ [BG EMAIL] sendEmail completed in ${Date.now() - emailStart}ms`);
      } catch (emailErr) {
        console.error(`❌ [BG EMAIL] sendEmail failed: ${emailErr.message}`);
      }
    });
  } catch (error) {
    console.error(`❌ [ERROR] sendVerificationCode failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

// VERIFY EMAIL CODE
exports.verifyEmailCode = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] verifyEmailCode called at ${new Date().toISOString()}`);
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.trim();

    console.log(`🔍 [DB QUERY] checking code for email: ${cleanEmail}`);
    const checkStart = Date.now();
    const record = await prisma.emailVerification.findUnique({
      where: { email: cleanEmail }
    });
    console.log(`✅ [DB RESULT] query completed in ${Date.now() - checkStart}ms`);

    if (!record || record.code !== cleanCode) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    // Delete verification record on success
    await prisma.emailVerification.delete({
      where: { email: cleanEmail }
    });

    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyEmail = exports.verifyEmailCode;

// GET PROFILE
exports.getProfile = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] getProfile called at ${new Date().toISOString()}`);
  try {
    const numericId = parseInt(req.user.id);
    if (isNaN(numericId)) return res.status(401).json({ message: "Invalid session user ID" });

    console.log(`🔍 [DB QUERY] finding user with id: ${numericId}`);
    const queryStart = Date.now();
    const user = await prisma.user.findUnique({
      where: { id: numericId }
    });
    console.log(`✅ [DB RESULT] findUnique completed in ${Date.now() - queryStart}ms`);
    if (!user) return res.status(404).json({ message: 'User not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error(`❌ [ERROR] getProfile failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

// UPDATE PROFILE
exports.updateProfile = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] updateProfile called at ${new Date().toISOString()}`);
  try {
    const {
      name, phone, photo,
      dob, gender, location, preferredCity,
      education, profession, germanLevel, passport,
    } = req.body;
    
    const numericId = parseInt(req.user.id);
    if (isNaN(numericId)) return res.status(401).json({ message: "Invalid session user ID" });

    const update = {};
    if (name          !== undefined) update.name          = name.trim();
    if (phone         !== undefined) update.phone         = phone.trim();
    if (photo         !== undefined) update.photo         = photo;
    if (dob           !== undefined) update.dob           = dob;
    if (gender        !== undefined) update.gender        = gender;
    if (location      !== undefined) update.location      = location;
    if (preferredCity !== undefined) update.preferredCity = preferredCity;
    if (education     !== undefined) update.education     = education;
    if (profession    !== undefined) update.profession    = profession;
    if (germanLevel   !== undefined) update.germanLevel   = germanLevel;
    if (passport      !== undefined) update.passport      = passport;

    console.log(`🔍 [DB QUERY] updating user with id: ${numericId}`);
    const updateStart = Date.now();
    const user = await prisma.user.update({
      where: { id: numericId },
      data: update
    });
    console.log(`✅ [DB RESULT] update completed in ${Date.now() - updateStart}ms`);
    if (!user) return res.status(404).json({ message: 'User not found' });
    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error(`❌ [ERROR] updateProfile failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] login called at ${new Date().toISOString()}`);
  try {
    const identifierRaw = String(
      req.body.identifier ?? req.body.email ?? req.body.phone ?? ""
    ).trim();
    const password = String(req.body.password ?? "").trim();

    const isLikelyEmail = identifierRaw.includes("@");
    const email = identifierRaw.toLowerCase();
    const phoneDigits = identifierRaw.replace(/\D/g, "");

    let user = null;
    if (isLikelyEmail) {
      user = await prisma.user.findUnique({ where: { email } });
    } else {
      const orFilters = [{ phone: identifierRaw }];
      if (phoneDigits) {
        orFilters.push({ phone: phoneDigits });
        orFilters.push({ phone: `+${phoneDigits}` });
        orFilters.push({ phone: { endsWith: phoneDigits } });
      }
      user = await prisma.user.findFirst({
        where: { OR: orFilters }
      });
    }

    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "This account uses social login. Please login with Google/Facebook/Apple.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const now = new Date();
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAt: user.firstLoginAt ? undefined : now,
        lastLoginAt: now
      }
    });

    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    res.status(200).json({
      token: generateToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(`❌ [ERROR] login failed: ${error.message} after ${Date.now() - start}ms`);
    res.status(500).json({ message: error.message });
  }
};

// SOCIAL LOGIN (Google, Facebook, Apple)
exports.socialLogin = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] socialLogin called at ${new Date().toISOString()}`);
  try {
    const { provider, idToken, accessToken, identityToken } = req.body;
    if (!provider) {
      return res.status(400).json({ message: "Provider is required" });
    }

    let payload = null;
    if (provider === "google") {
      payload = await verifyGoogle({ idToken, accessToken });
    } else if (provider === "facebook") {
      payload = await verifyFacebook({ accessToken });
    } else if (provider === "apple") {
      payload = await verifyApple({ identityToken });
    } else {
      return res.status(400).json({ message: `Unsupported provider: ${provider}` });
    }

    if (!payload || !payload.providerUserId) {
      return res.status(400).json({ message: "Failed to verify social credentials" });
    }

    let user = await getOrCreateSocialUser({
      provider,
      providerUserId: payload.providerUserId,
      email: payload.email,
      name: req.body.name || payload.name,
      photo: req.body.photo || payload.photo,
    });

    const now = new Date();
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAt: user.firstLoginAt ? undefined : now,
        lastLoginAt: now
      }
    });

    res.status(200).json({
      token: generateToken(user),
      user: sanitizeUser(user),
      debugLoginTimes: {
        firstLoginAt: user.firstLoginAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    const status = error && error.statusCode ? Number(error.statusCode) : 500;
    console.error(`❌ [ERROR] socialLogin failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(status).json({ message: error.message || "Social login failed" });
  }
};

// CHANGE PASSWORD
exports.changePassword = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] changePassword called at ${new Date().toISOString()}`);
  try {
    const { currentPassword, newPassword } = req.body;
    const numericId = parseInt(req.user.id);

    if (isNaN(numericId)) return res.status(401).json({ message: "Invalid session user ID" });

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword and newPassword are required" });
    }

    const trimmedNew = String(newPassword).trim();
    if (trimmedNew.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters" });
    }

    console.log(`🔍 [DB QUERY] finding user with id: ${numericId}`);
    const user = await prisma.user.findUnique({ where: { id: numericId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.password) {
      return res.status(400).json({
        message: "This account does not have a password set (social login account).",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(trimmedNew, 10);
    await prisma.user.update({
      where: { id: numericId },
      data: { password: hashed }
    });

    console.log(`📤 [RESPONSE] sending 200 response after ${Date.now() - start}ms`);
    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error(`❌ [ERROR] changePassword failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(500).json({ message: error.message });
  }
};

// FORGOT PASSWORD (send reset link)
exports.forgotPassword = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] forgotPassword called at ${new Date().toISOString()}`);
  try {
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    if (!emailRaw) return res.status(400).json({ message: "Email is required" });

    console.log(`🔍 [DB QUERY] finding user with email: ${emailRaw}`);
    const user = await prisma.user.findUnique({ where: { email: emailRaw } });

    if (!user || user.isActive === false) {
      return res
        .status(200)
        .json({ message: "If the email exists, a reset link was sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: sha256(resetToken),
        resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }
    });

    const baseUrl = getAppBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    const devReturnLink =
      String(process.env.DEV_RETURN_RESET_LINK || "").toLowerCase() === "true";

    const subject = "Reset your password";
    const text = `You requested a password reset. Open this link to set a new password: ${resetUrl}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:10px 14px;background:#4E7F6D;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
        <p style="color:#555">This link expires in 1 hour.</p>
        <p style="color:#777;font-size:12px">If you didn’t request this, you can ignore this email.</p>
      </div>
    `;

    let emailSent = true;
    try {
      await sendEmail({ to: emailRaw, subject, text, html });
    } catch (mailErr) {
      emailSent = false;
      console.error("[forgotPassword] Failed to send reset email:", mailErr);
    }

    if (devReturnLink) {
      return res.status(200).json({
        message: emailSent
          ? "Reset link generated. Returning reset link for dev."
          : "Email not sent. Returning reset link for dev.",
        resetUrl,
        emailSent,
      });
    }

    return res.status(200).json({ message: "If the email exists, a reset link was sent." });
  } catch (error) {
    console.error(`❌ [ERROR] forgotPassword failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(500).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] resetPassword called at ${new Date().toISOString()}`);
  try {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();

    if (!token || !newPassword) {
      return res.status(400).json({ message: "token and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters" });
    }

    console.log(`🔍 [DB QUERY] finding user with valid reset token`);
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: sha256(token),
        resetPasswordExpires: { gt: new Date() }
      }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error(`❌ [ERROR] resetPassword failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(500).json({ message: error.message });
  }
};

// OTP-BASED FORGOT PASSWORD
exports.forgotPasswordOtp = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] forgotPasswordOtp called at ${new Date().toISOString()}`);
  try {
    const emailRaw = String(req.body.email || '').trim().toLowerCase();
    if (!emailRaw) return res.status(400).json({ message: 'Email is required.' });

    console.log(`🔍 [DB QUERY] finding user with email: ${emailRaw}`);
    const user = await prisma.user.findUnique({ where: { email: emailRaw } });

    if (!user || user.isActive === false) {
      return res.status(200).json({ message: 'If the email exists, an OTP was sent.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log(`🔍 [DB QUERY] upserting OTP for forgot-password: ${emailRaw}`);
    await prisma.emailVerification.upsert({
      where: { email: emailRaw },
      update: { code, expiresAt },
      create: { email: emailRaw, code, expiresAt }
    });

    // ✅ Respond immediately
    console.log(`📤 [RESPONSE] sending 200 immediately after ${Date.now() - start}ms`);
    res.status(200).json({ message: 'OTP sent to your email.' });

    // 🔁 Send email in background
    setImmediate(async () => {
      try {
        await sendEmail({
          to: emailRaw,
          subject: 'Your Password Reset OTP',
          text: `Your OTP to reset your password is: ${code}. It expires in 10 minutes.`,
        });
        console.log(`✅ [BG EMAIL] forgot-password OTP sent to: ${emailRaw}`);
      } catch (emailErr) {
        console.error(`❌ [BG EMAIL] forgot-password sendEmail failed: ${emailErr.message}`);
      }
    });
  } catch (error) {
    console.error(`❌ [ERROR] forgotPasswordOtp failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(500).json({ message: error.message });
  }
};

// Verify OTP + set new password
exports.resetPasswordOtp = async (req, res) => {
  const start = Date.now();
  console.log(`🚀 [START] resetPasswordOtp called at ${new Date().toISOString()}`);
  try {
    const emailRaw = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!emailRaw || !code || !newPassword) {
      return res.status(400).json({ message: 'email, code and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    console.log(`🔍 [DB QUERY] finding OTP record for: ${emailRaw}`);
    const record = await prisma.emailVerification.findUnique({ where: { email: emailRaw } });

    if (!record || record.code !== code) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    console.log(`🔍 [DB QUERY] finding user with email: ${emailRaw}`);
    const user = await prisma.user.findUnique({ where: { email: emailRaw } });
    if (!user) return res.status(400).json({ message: 'User not found.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    // Delete OTP record
    await prisma.emailVerification.delete({ where: { email: emailRaw } });

    return res.status(200).json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error(`❌ [ERROR] resetPasswordOtp failed: ${error.message} after ${Date.now() - start}ms`);
    return res.status(500).json({ message: error.message });
  }
};