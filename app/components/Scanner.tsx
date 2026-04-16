"use client";

import { useState } from "react";

type PackagingSignal = {
  status: "match" | "possible_match" | "warning" | "unknown";
  summary: string;
  barcodeCandidates: string[];
  logos: string[];
  matchedProduct: null | {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
  };
};

type ScanMode = "ingredients" | "packaging";

type IngredientMatch = {
  name: string;
  riskLevel: string;
  riskScore: number;
};

type ProductExplanation = {
  summary: string;
  scoreContext: string;
  reasons: string[];
  tradeoffs: string[];
  flaggedIngredients: {
    name: string;
    reason: string;
    cautionLevel: "low" | "moderate" | "high";
  }[];
  recommendation: string;
  confidenceNote: string;
  personalizationNote: string | null;
  allergyAlerts: string[];
  audienceNotes: {
    focus: "sensitive_skin" | "acne_prone" | "pregnancy_safe" | "fragrance_free";
    label: string;
    summary: string;
  }[];
  source: "ai" | "fallback";
};

type ProductScore = {
  score: number;
  color: "green" | "yellow" | "red";
};

type ScanState = {
  file: File | null;
  isFocused: boolean;
  status: string;
  parsedIngredients: string[];
  matchedIngredients: IngredientMatch[];
  productScore: ProductScore | null;
  explanation: ProductExplanation | null;
  packagingSignal: PackagingSignal | null;
};

const emptyScanState: ScanState = {
  file: null,
  isFocused: false,
  status: "",
  parsedIngredients: [],
  matchedIngredients: [],
  productScore: null,
  explanation: null,
  packagingSignal: null,
};

function createLabelClasses(isActive: boolean) {
  return isActive
    ? "border-rose-500 bg-rose-50 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]"
    : "border-neutral-300 bg-neutral-50 hover:border-rose-400 hover:bg-rose-50";
}

function createIconClasses(isActive: boolean) {
  return isActive ? "bg-rose-500 text-white" : "bg-white text-rose-500";
}

function packagingSignalClasses(status: PackagingSignal["status"]) {
  switch (status) {
    case "match":
      return "border-emerald-200 bg-emerald-50";
    case "possible_match":
      return "border-amber-200 bg-amber-50";
    case "warning":
      return "border-rose-200 bg-rose-50";
    default:
      return "border-neutral-200 bg-neutral-50";
  }
}

export default function Scanner() {
  const [ingredientScan, setIngredientScan] = useState<ScanState>(emptyScanState);
  const [packagingScan, setPackagingScan] = useState<ScanState>(emptyScanState);

  const updateScanState = (
    mode: ScanMode,
    updater: (previous: ScanState) => ScanState
  ) => {
    if (mode === "ingredients") {
      setIngredientScan(updater);
      return;
    }

    setPackagingScan(updater);
  };

  const getScanState = (mode: ScanMode) =>
    mode === "ingredients" ? ingredientScan : packagingScan;

  const handleUpload = async (mode: ScanMode) => {
    const currentScan = getScanState(mode);
    if (!currentScan.file) return;

    updateScanState(mode, (previous) => ({
      ...previous,
      status:
        mode === "ingredients"
          ? "Scanning ingredient label..."
          : "Checking packaging text, logo clues, and barcode hints...",
      parsedIngredients: [],
      matchedIngredients: [],
      productScore: null,
      explanation: null,
      packagingSignal: null,
    }));

    const formData = new FormData();
    formData.append("file", currentScan.file);
    formData.append("mode", mode);

    const res = await fetch("/api/scans/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      updateScanState(mode, (previous) => ({
        ...previous,
        status: data.error || "OCR failed.",
      }));
      return;
    }

    updateScanState(mode, (previous) => ({
      ...previous,
      parsedIngredients: Array.isArray(data.parsedIngredients) ? data.parsedIngredients : [],
      matchedIngredients: Array.isArray(data.matchedIngredients) ? data.matchedIngredients : [],
      productScore: data.productScore ?? null,
      explanation: data.explanation ?? null,
      packagingSignal: data.packagingSignal ?? null,
      status: !data.text
        ? "No text found."
        : mode === "ingredients"
          ? `Detected ${
              Array.isArray(data.parsedIngredients) ? data.parsedIngredients.length : 0
            } ingredient candidates.`
          : "Packaging scan completed. Review the packaging signal below.",
    }));
  };

  const ingredientActive = ingredientScan.isFocused || Boolean(ingredientScan.file);
  const packagingActive = packagingScan.isFocused || Boolean(packagingScan.file);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              Ingredient Scan
            </p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">Ingredient Label</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Upload a tight crop of the INCI panel to extract ingredients with less packaging
              noise.
            </p>
          </div>

          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${createLabelClasses(
              ingredientActive
            )}`}
          >
            <span
              className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold transition ${createIconClasses(
                ingredientActive
              )}`}
            >
              +
            </span>
            <span className="text-sm font-medium text-neutral-700">Upload ingredient label</span>
            <span className="mt-1 text-xs text-neutral-500">
              PNG, JPG, or WEBP. Best results: crop tightly around the ingredient panel.
            </span>

            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onFocus={() =>
                updateScanState("ingredients", (previous) => ({
                  ...previous,
                  isFocused: true,
                }))
              }
              onBlur={() =>
                updateScanState("ingredients", (previous) => ({
                  ...previous,
                  isFocused: false,
                }))
              }
              onChange={(event) =>
                updateScanState("ingredients", (previous) => ({
                  ...previous,
                  file: event.target.files?.[0] || null,
                }))
              }
            />
          </label>

          {ingredientScan.file && (
            <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              Selected: <span className="font-medium">{ingredientScan.file.name}</span>
            </div>
          )}

          <button
            onClick={() => handleUpload("ingredients")}
            className="mt-4 w-full rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Scan Ingredient Panel
          </button>

          {ingredientScan.status && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {ingredientScan.status}
            </div>
          )}

          {ingredientScan.parsedIngredients.length > 0 && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-4">
              <h3 className="text-sm font-semibold text-neutral-900">Parsed Ingredients</h3>
              <p className="mt-1 text-xs text-neutral-500">
                OCR extracted these ingredient candidates from the image.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ingredientScan.parsedIngredients.map((ingredient) => (
                  <span
                    key={ingredient}
                    className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
                  >
                    {ingredient}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ingredientScan.matchedIngredients.length > 0 && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-4">
              <h3 className="text-sm font-semibold text-neutral-900">Matched Ingredients</h3>
              {ingredientScan.productScore && (
                <p className="mt-1 text-xs text-neutral-500">
                  Product score: {ingredientScan.productScore.score} •{" "}
                  {ingredientScan.productScore.color}
                </p>
              )}
              <div className="mt-3 space-y-2">
                {ingredientScan.matchedIngredients.map((ingredient) => (
                  <div
                    key={`${ingredient.name}-${ingredient.riskLevel}`}
                    className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-neutral-900">{ingredient.name}</span>
                    <span className="text-neutral-500">
                      {ingredient.riskLevel} • score {ingredient.riskScore}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ingredientScan.explanation && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-900">AI Explanation</h3>
                <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  {ingredientScan.explanation.source === "ai" ? "AI grounded" : "Rules fallback"}
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-700">{ingredientScan.explanation.summary}</p>
              {ingredientScan.explanation.personalizationNote && (
                <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700">
                  {ingredientScan.explanation.personalizationNote}
                </p>
              )}
              <p className="mt-3 text-sm text-neutral-600">
                {ingredientScan.explanation.scoreContext}
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-neutral-50 px-4 py-4">
                  <p className="text-sm font-medium text-neutral-900">What is driving this</p>
                  <div className="mt-3 space-y-2">
                    {ingredientScan.explanation.reasons.map((reason) => (
                      <p key={reason} className="rounded-xl bg-white px-3 py-2 text-sm text-neutral-700">
                        {reason}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-neutral-50 px-4 py-4">
                  <p className="text-sm font-medium text-neutral-900">Tradeoffs</p>
                  {ingredientScan.explanation.tradeoffs.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {ingredientScan.explanation.tradeoffs.map((tradeoff) => (
                        <p key={tradeoff} className="rounded-xl bg-white px-3 py-2 text-sm text-neutral-700">
                          {tradeoff}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-neutral-600">
                      No major tradeoff stands out beyond the ingredients listed below.
                    </p>
                  )}
                </div>
              </div>
              {ingredientScan.explanation.allergyAlerts.length > 0 && (
                <div className="mt-4 space-y-2">
                  {ingredientScan.explanation.allergyAlerts.map((alert) => (
                    <div
                      key={alert}
                      className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    >
                      {alert}
                    </div>
                  ))}
                </div>
              )}
              {ingredientScan.explanation.flaggedIngredients.length > 0 && (
                <div className="mt-4 space-y-2">
                  {ingredientScan.explanation.flaggedIngredients.map((ingredient) => (
                    <div
                      key={ingredient.name}
                      className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
                    >
                      <p className="font-medium text-neutral-900">
                        {ingredient.name} • {ingredient.cautionLevel}
                      </p>
                      <p className="mt-1">{ingredient.reason}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-neutral-700">
                <span className="font-medium text-neutral-900">Recommendation:</span>{" "}
                {ingredientScan.explanation.recommendation}
              </p>
              {ingredientScan.explanation.audienceNotes.length > 0 && (
                <div className="mt-4 space-y-2">
                  {ingredientScan.explanation.audienceNotes.map((note) => (
                    <div key={note.focus} className="rounded-2xl bg-rose-50 px-4 py-3 text-sm">
                      <p className="font-medium text-neutral-900">{note.label}</p>
                      <p className="mt-1 text-neutral-700">{note.summary}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-neutral-500">
                {ingredientScan.explanation.confidenceNote}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              Packaging Check
            </p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">Front / Barcode</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Upload the front label or barcode to compare packaging clues against your catalog.
            </p>
          </div>

          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${createLabelClasses(
              packagingActive
            )}`}
          >
            <span
              className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold transition ${createIconClasses(
                packagingActive
              )}`}
            >
              +
            </span>
            <span className="text-sm font-medium text-neutral-700">
              Upload front label or barcode
            </span>
            <span className="mt-1 text-xs text-neutral-500">
              PNG, JPG, or WEBP. Best results: show the brand, product name, or barcode clearly.
            </span>

            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onFocus={() =>
                updateScanState("packaging", (previous) => ({
                  ...previous,
                  isFocused: true,
                }))
              }
              onBlur={() =>
                updateScanState("packaging", (previous) => ({
                  ...previous,
                  isFocused: false,
                }))
              }
              onChange={(event) =>
                updateScanState("packaging", (previous) => ({
                  ...previous,
                  file: event.target.files?.[0] || null,
                }))
              }
            />
          </label>

          {packagingScan.file && (
            <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              Selected: <span className="font-medium">{packagingScan.file.name}</span>
            </div>
          )}

          <button
            onClick={() => handleUpload("packaging")}
            className="mt-4 w-full rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Check Packaging
          </button>

          {packagingScan.status && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {packagingScan.status}
            </div>
          )}

          {packagingScan.packagingSignal && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-4 ${packagingSignalClasses(
                packagingScan.packagingSignal.status
              )}`}
            >
              <h3 className="text-sm font-semibold text-neutral-900">Packaging Signal</h3>
              <p className="mt-2 text-sm text-neutral-700">
                {packagingScan.packagingSignal.summary}
              </p>
              {packagingScan.packagingSignal.matchedProduct && (
                <p className="mt-3 text-sm text-neutral-700">
                  Closest catalog match:{" "}
                  <span className="font-medium text-neutral-900">
                    {packagingScan.packagingSignal.matchedProduct.name}
                  </span>
                  {packagingScan.packagingSignal.matchedProduct.brand
                    ? ` by ${packagingScan.packagingSignal.matchedProduct.brand}`
                    : ""}
                </p>
              )}
              {packagingScan.packagingSignal.logos.length > 0 && (
                <p className="mt-3 text-xs text-neutral-600">
                  Logos detected: {packagingScan.packagingSignal.logos.join(", ")}
                </p>
              )}
              {packagingScan.packagingSignal.barcodeCandidates.length > 0 && (
                <p className="mt-1 text-xs text-neutral-600">
                  Barcode-like numbers:{" "}
                  {packagingScan.packagingSignal.barcodeCandidates.join(", ")}
                </p>
              )}
              <p className="mt-3 text-[11px] text-neutral-500">
                This is a packaging consistency check, not a guaranteed real-vs-fake decision.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
