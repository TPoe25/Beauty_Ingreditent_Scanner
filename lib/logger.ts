type LogValue = unknown;

export function logScan(
  input: LogValue,
  matched: LogValue,
  score: LogValue
) {
  console.log("🔍 SCAN INPUT:", input);
  console.log("🧪 MATCHED INGREDIENTS:", matched);
  console.log("📊 SCORE:", score);
}
