const express = require('express');
const router = express.Router();
const prisma = require('../../config/prisma');
const bcrypt = require('bcryptjs');
const { protect, adminOnly } = require('../../middleware/auth');

// ── GET public content (no auth – for user app) ───────────────────────────────
router.get('/public', async (req, res) => {
  try {
    const docs = await prisma.contentAdmin.findMany({});
    const result = {};
    docs.forEach(d => { result[d.key] = d.value; });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── GET all content ────────────────────────────────────────────────────────────
router.get('/content', protect, adminOnly, async (req, res) => {
  try {
    const docs = await prisma.contentAdmin.findMany({});
    const result = {};
    docs.forEach(d => { result[d.key] = { value: d.value, updatedAt: d.updatedAt }; });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PUT (upsert) a single content key ──────────────────────────────────────────
router.put('/content/:key', protect, adminOnly, async (req, res) => {
  try {
    const { value } = req.body;
    const key = req.params.key;
    const doc = await prisma.contentAdmin.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value: value || '', updatedAt: new Date() }
    });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PUT save all content at once ───────────────────────────────────────────────
router.put('/content', protect, adminOnly, async (req, res) => {
  try {
    const entries = req.body; // { key: value, ... }
    const now = new Date();
    
    for (const [key, value] of Object.entries(entries)) {
      await prisma.contentAdmin.upsert({
        where: { key },
        update: { value: String(value), updatedAt: now },
        create: { key, value: String(value), updatedAt: now }
      });
    }

    res.json({ message: 'Settings saved' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── POST change password ───────────────────────────────────────────────────────
router.post('/change-password', protect, adminOnly, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const numericUserId = parseInt(req.user.id);

    if (isNaN(numericUserId)) {
      return res.status(401).json({ message: 'Invalid admin session' });
    }

    if (!currentPassword || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required' });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ message: 'New passwords do not match' });

    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const admin = await prisma.user.findUnique({
      where: { id: numericUserId }
    });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: numericUserId },
      data: { password: hashed }
    });

    // Log the password change
    await prisma.pwLog.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        changedAt: new Date(),
        note: 'Password updated by admin',
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
