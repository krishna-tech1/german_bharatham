const prisma = require("../../config/prisma");
require("dotenv").config();

const updateGuidesWithURLs = async () => {
  try {
    const guideURLs = [
      {
        title: "Complete Guide to German Registration - Anmeldung",
        officialWebsites: "https://www.bva.bund.de/DE/Aufgaben/Ref-I-3/Anmeldung/",
        communityDiscussions: "https://www.toytowngermany.com/forum/"
      },
      {
        title: "German Banking System 101",
        officialWebsites: "https://www.bundesbank.de/en",
        communityDiscussions: "https://www.reddit.com/r/germany/"
      },
      {
        title: "Finding Accommodation in Germany",
        officialWebsites: "https://www.immobilienscout24.de/",
        communityDiscussions: "https://www.expat.com/en/forum/viewforum.php?id=23"
      },
      {
        title: "Health Insurance in Germany",
        officialWebsites: "https://www.bmg.bund.de/en/topics/health-insurance",
        communityDiscussions: "https://www.toytowngermany.com/forum/viewforum.php?f=60"
      },
      {
        title: "German Job Market for Expats",
        officialWebsites: "https://www.make-it-in-germany.com/en/job-placement",
        communityDiscussions: "https://www.reddit.com/r/germanjobs/"
      },
      {
        title: "German Language Learning Tips",
        officialWebsites: "https://www.goethe.de/en/index.html",
        communityDiscussions: "https://www.duolingo.com/comment/1234"
      }
    ];

    for (const guideData of guideURLs) {
      await prisma.guide.updateMany({
        where: { title: guideData.title },
        data: {
          officialWebsites: guideData.officialWebsites,
          communityDiscussions: guideData.communityDiscussions
        }
      });
    }

    console.log("✅ Guides updated with URLs successfully in PostgreSQL!");

    const guides = await prisma.guide.findMany({});
    guides.forEach(guide => {
      console.log(`\n${guide.title}`);
      console.log(`  - Official: ${guide.officialWebsites}`);
      console.log(`  - Community: ${guide.communityDiscussions}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

updateGuidesWithURLs();
