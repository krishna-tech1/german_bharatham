const prisma = require("../config/prisma");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const importData = async () => {
  try {
    const workbookPath = "Guides_Dataset.xlsx";
    if (!fs.existsSync(workbookPath)) {
      console.error("Workbook not found:", workbookPath);
      process.exit(1);
    }

    const workbook = xlsx.readFile(workbookPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = xlsx.utils.sheet_to_json(sheet);

    const docs = raw.map((row) => ({
      title: row.title || row.Title || "Untitled",
      category: row.category || row.Category || "Guide",
      readTime: parseInt(row.readTime || row.ReadTime || row["Read Time"]) || 5,
      description: row.description || row.Description || row.Content || "",
      keyPoints: row.keyPoints
        ? String(row.keyPoints)
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      officialWebsites: row.officialWebsites || row.OfficialWebsites || "",
      communityDiscussions: row.communityDiscussions || row.CommunityDiscussions || "",
      author: row.author || row.Author || "Imported",
      date: row.date || new Date().toDateString(),
    }));

    // Clear existing guides
    await prisma.guide.deleteMany({});

    if (docs.length > 0) {
      await prisma.guide.createMany({ data: docs });
      console.log(`Inserted ${docs.length} guides into community guides in PostgreSQL`);
    } else {
      console.log("No rows found in workbook");
    }

    console.log("Data Imported Successfully 🎉");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

importData();