const fs = require("fs");
const path = require("path");

const RAW_DIR = path.join(process.cwd(), "data", "raw_data");
const DELAY_MS = 1200;

if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

const sources = [
  {
    source: "pubchem",
    kind: "api",
    name: "phenoxyethanol",
    url: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/phenoxyethanol/property/Title,MolecularFormula,CanonicalSMILES/JSON"
  },
  {
    source: "pubchem",
    kind: "api",
    name: "sodium_benzoate",
    url: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/sodium%20benzoate/property/Title,MolecularFormula,CanonicalSMILES/JSON"
  },
  {
    source: "pubchem",
    kind: "api",
    name: "niacinamide",
    url: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/niacinamide/property/Title,MolecularFormula,CanonicalSMILES/JSON"
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BeautyIngredientScanner/1.0 (research project; respectful rate limiting)"
    }
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function main() {
  for (const item of sources) {
    const outPath = path.join(
      RAW_DIR,
      `${item.source}__${safeFileName(item.name)}.json`
    );

    try {
      const data = await fetchJson(item.url);

      const wrapped = {
        fetchedAt: new Date().toISOString(),
        source: item.source,
        kind: item.kind,
        name: item.name,
        url: item.url,
        data
      };

      fs.writeFileSync(outPath, JSON.stringify(wrapped, null, 2), "utf-8");
      console.log(`saved: ${outPath}`);
    } catch (err) {
      console.error(`failed: ${item.name} -> ${err.message}`);
    }

    await sleep(DELAY_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
