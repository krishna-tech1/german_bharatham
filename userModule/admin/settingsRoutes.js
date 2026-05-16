const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../user/models/User');
const { protect, adminOnly } = require('../../middleware/auth');

// ── Content Management collection ─────────────────────────────────────────────
const contentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'content-management-admin' }
);
const Content = mongoose.models['ContentAdmin'] || mongoose.model('ContentAdmin', contentSchema);

// ── Password log collection ────────────────────────────────────────────────────
const pwLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminEmail: String,
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: 'Password updated by admin' },
  },
  { collection: 'password setting - admin' }
);
const PwLog = mongoose.models['PwLog'] || mongoose.model('PwLog', pwLogSchema);

// ── GET public content (no auth – for user app) ───────────────────────────────
router.get('/public', async (req, res) => {
  try {
    const docs = await Content.find({});
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
    const docs = await Content.find({});
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
    const doc = await Content.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
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
    const ops = Object.entries(entries).map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { $set: { value, updatedAt: now } },
        upsert: true,
      },
    }));
    await Content.bulkWrite(ops);
    res.json({ message: 'Settings saved' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── POST change password ───────────────────────────────────────────────────────
router.post('/change-password', protect, adminOnly, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required' });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ message: 'New passwords do not match' });

    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const admin = await User.findById(req.user._id);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    admin.password = hashed;
    await admin.save();

    // Log the password change
    await PwLog.create({
      adminId: admin._id,
      adminEmail: admin.email,
      changedAt: new Date(),
      note: 'Password updated by admin',
    });

    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
