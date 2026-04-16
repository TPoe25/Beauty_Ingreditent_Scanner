require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const inputPath = path.join(
  process.cwd(),
  "data",
  "filtered_data",
  "ingredients.filtered.json"
);

async function main() {
  console.log("Reading:", inputPath);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Filtered file not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const items = JSON.parse(raw);

  console.log(`Loaded ${items.length} filtered records`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.name || !item.normalizedName) {
      skipped++;
      console.log("skipped invalid item:", item);
      continue;
    }

    const existing = await prisma.ingredient.findFirst({
      where: {
        OR: [
          { name: item.name },
          { normalizedName: item.normalizedName }
        ]
      }
    });

    if (existing) {
      await prisma.ingredient.update({
        where: { id: existing.id },
        data: {
          source: item.source || existing.source,
          riskLevel: item.riskLevel || existing.riskLevel,
          riskScore: item.riskScore ?? existing.riskScore,
          description: item.molecularFormula
            ? `Formula: ${item.molecularFormula}${item.smiles ? ` | SMILES: ${item.smiles}` : ""}`
            : existing.description,
        }
      });

      updated++;
      console.log(`updated: ${item.name}`);
    } else {
      await prisma.ingredient.create({
        data: {
          name: item.name,
          normalizedName: item.normalizedName,
          source: item.source || "PUBCHEM",
          riskLevel: item.riskLevel || "unknown",
          riskScore: item.riskScore ?? 0,
          description: item.molecularFormula
            ? `Formula: ${item.molecularFormula}${item.smiles ? ` | SMILES: ${item.smiles}` : ""}`
            : null,
          reviewBucket: item.reviewBucket || "needs_review",
          concerns: []
        }
      });

      created++;
      console.log(`created: ${item.name}`);
    }
  }

  console.log("\nImport complete");
  console.log("created:", created);
  console.log("updated:", updated);
  console.log("skipped:", skipped);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Import failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
