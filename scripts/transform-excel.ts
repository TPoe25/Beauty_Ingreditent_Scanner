import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const inputArg = process.argv[2];
const outputArg = process.argv[3];

function sanitizeBaseName(filePath: string) {
  return path
    .basename(filePath, path.extname(filePath))
    .trim()
    .replace(/\s+/g, "-");
}

function convertWorkbook(inputPath: string, outputPath: string) {
  const workbook = xlsx.readFile(inputPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = xlsx.utils.sheet_to_json(sheet);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));

  console.log(`✅ Converted Excel → JSON: ${path.relative(repoRoot, outputPath)}`);
}

const defaultInputPath = path.resolve(repoRoot, inputArg ?? "data/raw/eye-products.xlsx");

if (fs.existsSync(defaultInputPath) && fs.statSync(defaultInputPath).isDirectory()) {
  const outputDir = path.resolve(repoRoot, outputArg ?? "data");
  const workbookPaths = fs
    .readdirSync(defaultInputPath)
    .filter((file) => file.toLowerCase().endsWith(".xlsx"))
    .sort()
    .map((file) => path.join(defaultInputPath, file));

  if (workbookPaths.length === 0) {
    throw new Error(`No .xlsx files found in ${defaultInputPath}`);
  }

  for (const workbookPath of workbookPaths) {
    const outputPath = path.join(outputDir, `${sanitizeBaseName(workbookPath)}.json`);
    convertWorkbook(workbookPath, outputPath);
  }
} else {
  const outputPath = path.resolve(
    repoRoot,
    outputArg ?? `data/${sanitizeBaseName(defaultInputPath)}.json`
  );

  convertWorkbook(defaultInputPath, outputPath);
}
