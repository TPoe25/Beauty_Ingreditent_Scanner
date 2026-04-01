import fs from "fs";
import path from "path";

const INPUT = path.join(process.cwd(), "data/raw/cosing_annex2.jsonl");
const OUTPUT = path.join(process.cwd(), "data/ingredients.generated.json");

// helper: determine risk bucket
function getRiskBucket(name: string) {
  return {
    riskLevel: "high",
    riskScore: 40,
    reviewBucket: "high_review_needed",
  };
}

// normalize name
function normalizeName(name: string) {
  return name
    ?.toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const raw = fs
  .readFileSync(INPUT, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const seen = new Set();

const transformed = raw
  .map((item) => {
    const name = item.title || "unknown";

    if (!name || seen.has(name)) return null;
    seen.add(name);

    const desc =
      item.description ||
      item.sections?.[0]?.text ||
      "Banned substance under EU regulation";

    return {
      name,
      normalizedName: normalizeName(name),
      ...getRiskBucket(name),
      description: desc,
      source: "EU_COSING_ANNEX_II",
      aliases: [],
    };
  })
  .filter(Boolean);

fs.writeFileSync(OUTPUT, JSON.stringify(transformed, null, 2));

console.log(`✅ Generated ${transformed.length} ingredients`);
