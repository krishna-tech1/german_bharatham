const Notification = require('../models/Notification');
const User = require('../models/User');

// GET /api/user/notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/user/notifications/like
// body: { targetUserId }
exports.createLikeNotification = async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: 'targetUserId is required' });
    }

    if (String(targetUserId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot like your own profile' });
    }

    const targetUser = await User.findById(targetUserId).select('_id name photo');
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const senderName = (req.user.name || 'Someone').toString();
    const targetName = (targetUser.name || 'a user').toString();

    const [received, sent] = await Promise.all([
      Notification.create({
        recipient: targetUser._id,
        sender: req.user._id,
        type: 'like_received',
        title: 'Profile liked',
        message: `${senderName} liked your profile`,
        senderName,
        senderPhoto: req.user.photo || null,
        data: {
          module: 'profiles',
          action: 'like_received',
          senderUserId: req.user._id,
        },
        read: false,
      }),
      Notification.create({
        recipient: req.user._id,
        sender: targetUser._id,
        type: 'like_sent',
        title: 'Profile liked',
        message: `You liked ${targetName}'s profile`,
        senderName: targetName,
        senderPhoto: targetUser.photo || null,
        data: {
          module: 'profiles',
          action: 'like_sent',
          targetUserId: targetUser._id,
        },
        // Don't trigger unread red-dot for the person who performed the action
        read: true,
      }),
    ]);

    res.status(201).json({ received, sent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/user/notifications/:id/read
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
