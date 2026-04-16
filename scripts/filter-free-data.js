const fs = require("fs");
const path = require("path");

const RAW_DIR = path.join(process.cwd(), "data", "raw_data");
const FILTERED_DIR = path.join(process.cwd(), "data", "filtered_data");

if (!fs.existsSync(FILTERED_DIR)) {
  fs.mkdirSync(FILTERED_DIR, { recursive: true });
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function guessRisk(name) {
  const n = normalizeName(name);

  const high = ["formaldehyde", "vinyl chloride", "bithionol"];
  const moderate = ["phenoxyethanol", "fragrance", "parfum"];

  if (high.includes(n)) {
    return { riskLevel: "high", riskScore: 40, reviewBucket: "high_review_needed" };
  }

  if (moderate.includes(n)) {
    return { riskLevel: "moderate", riskScore: 20, reviewBucket: "moderate_review_needed" };
  }

  return { riskLevel: "unknown", riskScore: 0, reviewBucket: "needs_review" };
}

function extractPubChemRecord(wrapper) {
  const props = wrapper?.data?.PropertyTable?.Properties?.[0];
  if (!props?.Title) return null;

  const risk = guessRisk(props.Title);

  return {
    name: props.Title,
    normalizedName: normalizeName(props.Title),
    source: "PUBCHEM",
    sourceUrl: wrapper.url,
    aliases: [],
    molecularFormula: props.MolecularFormula || "",
    smiles: props.CanonicalSMILES || "",
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    reviewBucket: risk.reviewBucket
  };
}

function main() {
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
  const output = [];

  for (const file of files) {
    const fullPath = path.join(RAW_DIR, file);

    try {
      const wrapper = JSON.parse(fs.readFileSync(fullPath, "utf-8"));

      if (wrapper.source === "pubchem") {
        const record = extractPubChemRecord(wrapper);
        if (record) output.push(record);
      }
    } catch (err) {
      console.error(`failed parsing ${file}: ${err.message}`);
    }
  }

  const deduped = Array.from(
    new Map(output.map((item) => [item.normalizedName, item])).values()
  );

  const outPath = path.join(FILTERED_DIR, "ingredients.filtered.json");
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2), "utf-8");

  console.log(`saved: ${outPath}`);
  console.log(`records: ${deduped.length}`);
}

main();
