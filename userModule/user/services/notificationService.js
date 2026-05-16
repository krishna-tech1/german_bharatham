const Notification = require('../models/Notification');
const User = require('../models/User');

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

  const recipients = await User.find({ role: 'user', isActive: true })
    .select('_id')
    .lean();

  if (!recipients.length) return { inserted: 0 };

  const docs = recipients.map((u) => ({
    recipient: u._id,
    sender,
    type,
    title,
    message,
    senderName,
    senderPhoto,
    data,
    read,
  }));

  // insertMany is much faster than create() in a loop.
  await Notification.insertMany(docs, { ordered: false });
  return { inserted: docs.length };
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
      entityId,
    },
    read: false,
  });
}

module.exports = {
  broadcastNotification,
  notifyListingActivated,
};
