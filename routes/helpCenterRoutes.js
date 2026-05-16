const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const helpCenterSchema = new mongoose.Schema({}, { strict: false, collection: 'help center' });
const HelpCenter = mongoose.models.HelpCenter || mongoose.model('HelpCenter', helpCenterSchema);

const DEFAULT_FAQS = [
  {
    question: 'How to apply for jobs?',
    answer: 'Open the Jobs section from the home screen. Tap any job listing to view details and apply using the Apply Now button.',
  },
  {
    question: 'How to book accommodation?',
    answer: 'Open the Accommodation section, browse available places, and tap a listing to view its details. Use the contact details provided in the listing to proceed with booking.',
  },
  {
    question: 'How to save listings?',
    answer: 'Tap the bookmark icon on any listing to save it. You can access saved listings later from the Saved tab.',
  },
  {
    question: 'How to contact support?',
    answer: 'Go to the Profile page and open Contact Us or Report a Problem if you need support from our team.',
  },
  {
    question: 'How can I update my profile information?',
    answer: 'Go to Profile → Personal Information and edit your details like phone number, preferred city, or education.',
  },
  {
    question: 'What services are available in the Services section?',
    answer: 'The Services section provides help with relocation, documentation, language support, and settling in Germany.',
  },
  {
    question: 'What should I do if a listing looks suspicious?',
    answer: 'Go to Profile → Report a Problem and submit the listing details so our team can review it.',
  },
  {
    question: 'How can I change my password?',
    answer: 'Go to Profile → Change Password and enter your current password to set a new one.',
  },
];

const normaliseFaq = (item) => {
  const question = (item?.question || item?.title || item?.q || '').toString().trim();
  const answer = (item?.answer || item?.description || item?.a || '').toString().trim();
  if (!question || !answer) return null;
  return { question, answer };
};

router.get('/', async (_req, res) => {
  try {
    let docs = await HelpCenter.find({}).lean();

    if (!docs.length) {
      await HelpCenter.insertMany(DEFAULT_FAQS);
      docs = await HelpCenter.find({}).lean();
    }

    const faqs = [];

    docs.forEach((doc) => {
      if (Array.isArray(doc?.faqs)) {
        doc.faqs.forEach((f) => {
          const mapped = normaliseFaq(f);
          if (mapped) faqs.push(mapped);
        });
      }

      const mapped = normaliseFaq(doc);
      if (mapped) faqs.push(mapped);
    });

    return res.status(200).json({ success: true, count: faqs.length, data: faqs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message, data: [] });
  }
});

module.exports = router;
