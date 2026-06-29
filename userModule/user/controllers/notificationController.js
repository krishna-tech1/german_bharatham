const prisma = require('../../../config/prisma');

// Helper to format PostgreSQL notification to match frontend expectations
const formatNotification = (n) => {
  if (!n) return null;
  return {
    ...n,
    _id: String(n.id),
    recipient: String(n.recipientId),
    sender: n.senderId ? String(n.senderId) : null,
  };
};

// GET /api/user/notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const numericId = parseInt(req.user.id);
    if (isNaN(numericId)) return res.status(401).json({ message: "Invalid session user ID" });

    const rawPg = await prisma.notification.findMany({
      where: { recipientId: numericId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    
    res.json(rawPg.map(formatNotification));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/user/notifications/like
exports.createLikeNotification = async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: 'targetUserId is required' });
    }

    if (String(targetUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'Cannot like your own profile' });
    }

    const numericTargetId = parseInt(targetUserId);
    const numericSenderId = parseInt(req.user.id);

    if (isNaN(numericTargetId)) {
      return res.status(400).json({ message: 'Invalid targetUserId format' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: numericTargetId },
      select: { id: true, name: true, photo: true }
    });

    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const senderName = (req.user.name || 'Someone').toString();
    const targetName = (targetUser.name || 'a user').toString();

    const [received, sent] = await Promise.all([
      prisma.notification.create({
        data: {
          recipientId: targetUser.id,
          senderId: !isNaN(numericSenderId) ? numericSenderId : null,
          type: 'like_received',
          title: 'Profile liked',
          message: `${senderName} liked your profile`,
          senderName,
          senderPhoto: req.user.photo || null,
          data: {
            module: 'profiles',
            action: 'like_received',
            senderUserId: String(req.user.id),
          },
          read: false,
        }
      }),
      prisma.notification.create({
        data: {
          recipientId: !isNaN(numericSenderId) ? numericSenderId : 0,
          senderId: targetUser.id,
          type: 'like_sent',
          title: 'Profile liked',
          message: `You liked ${targetName}'s profile`,
          senderName: targetName,
          senderPhoto: targetUser.photo || null,
          data: {
            module: 'profiles',
            action: 'like_sent',
            targetUserId: String(targetUser.id),
          },
          read: true,
        }
      })
    ]);

    return res.status(201).json({
      received: formatNotification(received),
      sent: formatNotification(sent)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/user/notifications/:id/read
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id);
    if (isNaN(numericId)) return res.status(400).json({ message: "Invalid notification ID format" });

    const recipientId = parseInt(req.user.id);
    if (isNaN(recipientId)) return res.status(400).json({ message: 'Invalid recipient ID' });

    const updated = await prisma.notification.update({
      where: { id: numericId, recipientId: recipientId },
      data: { read: true }
    });

    return res.json(formatNotification(updated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
