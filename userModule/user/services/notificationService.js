const prisma = require('../../../config/prisma');

async function broadcastNotification({
  type,
  title,
  message,
  data = null,
  sender = null,
  senderName = null,
  senderPhoto = null,
  read = false,
}) {
  if (!type) throw new Error('type is required');
  if (!title) throw new Error('title is required');
  if (!message) throw new Error('message is required');

  let postgresInserted = 0;
  try {
    const pgRecipients = await prisma.user.findMany({
      where: { role: 'user', isActive: true },
      select: { id: true }
    });
    if (pgRecipients.length) {
      let pgSenderId = null;
      if (sender) {
        const parsed = parseInt(sender);
        if (!isNaN(parsed)) pgSenderId = parsed;
      }
      const pgDocs = pgRecipients.map((u) => ({
        recipientId: u.id,
        senderId: pgSenderId,
        type,
        title,
        message,
        senderName,
        senderPhoto,
        data: data || undefined, // Prisma Json field
        read,
      }));
      await prisma.notification.createMany({ data: pgDocs });
      postgresInserted = pgDocs.length;
    }
  } catch (err) {
    console.error("Failed to broadcast notification to PostgreSQL:", err);
  }

  return { inserted: postgresInserted };
}

async function notifyListingActivated({ module, entityId, listingTitle }) {
  const safeTitle = (listingTitle || '').toString().trim();
  const name = safeTitle ? `: ${safeTitle}` : '';

  const pretty = {
    services: 'Service',
    foodgrocery: 'Food & Grocery',
    jobs: 'Job',
    accommodation: 'Accommodation',
  }[module] || 'Listing';

  return broadcastNotification({
    type: 'listing_activated',
    title: `New ${pretty} available`,
    message: `A new ${pretty.toLowerCase()} listing is now active${name}`,
    senderName: 'German Bharatham',
    senderPhoto: null,
    data: {
      module,
      entityId: String(entityId),
    },
    read: false,
  });
}

module.exports = {
  broadcastNotification,
  notifyListingActivated,
};
