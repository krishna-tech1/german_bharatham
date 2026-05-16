const mongoose = require("mongoose");
const dns = require("dns");

// Optional custom DNS servers for MongoDB SRV lookups.
// Some networks block public DNS (8.8.8.8/1.1.1.1), which can cause querySrv timeouts.
// If you need to override DNS, set:
//   DNS_SERVERS=8.8.8.8,1.1.1.1
const dnsServers = (process.env.DNS_SERVERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
}

const connectDB = async () => {
  try {
    const mongoUri = String(process.env.MONGO_URI || "").trim();
    if (!mongoUri) {
      console.error(
        "DB connection failed: MONGO_URI is missing. Set it in your .env (local) or in your production environment variables."
      );
      process.exit(1);
    }

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("DB connection failed:", error && error.message ? error.message : error);
    // Print extra details for diagnosing Atlas connectivity problems
    if (error) {
      if (error.name) console.error("DB error name:", error.name);
      if (error.code) console.error("DB error code:", error.code);
      if (error.reason) console.error("DB error reason:", error.reason);
      if (error.cause) console.error("DB error cause:", error.cause);
      try {
        console.error("DB error stack:", error.stack);
      } catch (_) {}
    }
    process.exit(1);
  }
};

module.exports = connectDB;