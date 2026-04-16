"use client";

import { useState } from "react";
import ProductAutocomplete from "../components/ProductAutocomplete";

type ComparedIngredient = {
  name: string;
  normalizedName?: string | null;
  riskLevel: string;
  riskScore: number;
  category?: string | null;
  source?: string | null;
  reviewBucket?: string | null;
  description?: string | null;
  concerns?: string[];
  aliases?: string[];
};

type ScannedComparisonInput = {
  name: string;
  ingredients: ComparedIngredient[];
  parsedIngredients: string[];
  fileName: string;
};

type CompareResponse = {
  productA: {
    id: string | null;
    name: string;
    brand?: string | null;
    score: number;
    color: string;
    ingredientCount: number;
    source: "catalog" | "scan";
    standoutBenefits: string[];
    standoutConcerns: string[];
    flaggedIngredients: {
      name: string;
      riskLevel: string;
      riskScore: number;
      category?: string | null;
      source?: string | null;
      reviewBucket: string;
      description?: string | null;
      concerns: string[];
      aliases: string[];
    }[];
  };
  productB: {
    id: string | null;
    name: string;
    brand?: string | null;
    score: number;
    color: string;
    ingredientCount: number;
    source: "catalog" | "scan";
    standoutBenefits: string[];
    standoutConcerns: string[];
    flaggedIngredients: {
      name: string;
      riskLevel: string;
      riskScore: number;
      category?: string | null;
      source?: string | null;
      reviewBucket: string;
      description?: string | null;
      concerns: string[];
      aliases: string[];
    }[];
  };
  better: "A" | "B" | "Tie";
  summary: string;
  reasons: string[];
  tradeoffs: string[];
  audienceNotes: {
    label: string;
    winner: "A" | "B" | "Tie";
    summary: string;
  }[];
};

type CompareSlot = {
  productId: string;
  productLabel: string;
  file: File | null;
  fileName: string;
  scannedInput: ScannedComparisonInput | null;
  scanStatus: string;
};

const emptyCompareSlot: CompareSlot = {
  productId: "",
  productLabel: "",
  file: null,
  fileName: "",
  scannedInput: null,
  scanStatus: "",
};

export default function ComparePage() {
  const [slotA, setSlotA] = useState<CompareSlot>(emptyCompareSlot);
  const [slotB, setSlotB] = useState<CompareSlot>(emptyCompareSlot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompareResponse | null>(null);

  const setSlot = (side: "A" | "B", updater: (previous: CompareSlot) => CompareSlot) => {
    if (side === "A") {
      setSlotA(updater);
      return;
    }

    setSlotB(updater);
  };

  const getSlot = (side: "A" | "B") => (side === "A" ? slotA : slotB);

  const handleScanCompareProduct = async (side: "A" | "B") => {
    const slot = getSlot(side);

    if (!slot.file) {
      setError(`Please choose an ingredient label image for Product ${side}.`);
      return;
    }

    setError("");

    setSlot(side, (previous) => ({
      ...previous,
      scanStatus: `Scanning Product ${side} ingredient panel...`,
    }));

    const formData = new FormData();
    formData.append("file", slot.file);
    formData.append("mode", "ingredients");

    try {
      const response = await fetch("/api/scans/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Unable to scan Product ${side}.`);
      }

      const matchedIngredients = Array.isArray(data.matchedIngredients)
        ? (data.matchedIngredients as ComparedIngredient[])
        : [];

      if (!matchedIngredients.length) {
        throw new Error(`No usable ingredients were matched for Product ${side}.`);
      }

      const parsedIngredients = Array.isArray(data.parsedIngredients)
        ? (data.parsedIngredients as string[])
        : [];

      const inferredName =
        slot.file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() ||
        `Scanned Product ${side}`;

      setSlot(side, (previous) => ({
        ...previous,
        productId: "",
        productLabel: "",
        scannedInput: {
          name: inferredName,
          ingredients: matchedIngredients,
          parsedIngredients,
          fileName: slot.file?.name || inferredName,
        },
        scanStatus: `Scanned ${matchedIngredients.length} matched ingredients for Product ${side}.`,
      }));
    } catch (caughtError) {
      setSlot(side, (previous) => ({
        ...previous,
        scanStatus:
          caughtError instanceof Error
            ? caughtError.message
            : `Unable to scan Product ${side}.`,
      }));
    }
  };

  const handleCompare = async () => {
    setError("");
    setResult(null);

    const inputA = slotA.scannedInput;
    const inputB = slotB.scannedInput;
    const hasA = Boolean(slotA.productId.trim() || inputA);
    const hasB = Boolean(slotB.productId.trim() || inputB);

    if (!hasA || !hasB) {
      setError("Please choose or scan both sides before comparing.");
      return;
    }

    if (slotA.productId.trim() && slotA.productId.trim() === slotB.productId.trim()) {
      setError("Please choose two different products.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productAId: inputA ? undefined : slotA.productId.trim(),
          productBId: inputB ? undefined : slotB.productId.trim(),
          productAInput: inputA
            ? {
                name: inputA.name,
                ingredients: inputA.ingredients,
              }
            : undefined,
          productBInput: inputB
            ? {
                name: inputB.name,
                ingredients: inputB.ingredients,
              }
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Comparison failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const badgeClasses = (color: string) => {
    switch (color) {
      case "green":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "yellow":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "red":
        return "bg-rose-100 text-rose-700 border-rose-200";
      default:
        return "bg-neutral-100 text-neutral-700 border-neutral-200";
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-rose-50/40">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-rose-600">
            Compare
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
            Compare Beauty Products
          </h1>
          <p className="mt-2 max-w-2xl text-neutral-600">
            Compare two products side by side and see which option looks better
            based on ingredient scoring and flagged concerns.
          </p>
        </div>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {([
              {
                side: "A" as const,
                title: "Product A",
                placeholder: "Search for the first product...",
                helperText: "Pick a catalog product or scan an ingredient panel instead.",
                slot: slotA,
              },
              {
                side: "B" as const,
                title: "Product B",
                placeholder: "Search for the second product...",
                helperText: "Choose another catalog product or scan a label instead.",
                slot: slotB,
              },
            ]).map(({ side, title, placeholder, helperText, slot }) => (
              <div key={side} className="space-y-4 rounded-2xl bg-neutral-50 p-4">
                <ProductAutocomplete
                  label={title}
                  placeholder={placeholder}
                  helperText={helperText}
                  selectedLabel={slot.productLabel}
                  selectedId={slot.productId}
                  onSelect={(product) => {
                    setSlot(side, (previous) => ({
                      ...previous,
                      productId: product.id,
                      productLabel: product.name,
                      scannedInput: null,
                      scanStatus: `Selected ${product.name} from your catalog.`,
                    }));
                  }}
                />

                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                    Or Scan Ingredient Label
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    Upload an ingredient panel if this product is not in the database yet.
                  </p>

                  <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center transition hover:border-rose-400 hover:bg-rose-50">
                    <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-semibold text-rose-500">
                      +
                    </span>
                    <span className="text-sm font-medium text-neutral-700">
                      Upload ingredient panel for {title}
                    </span>
                    <span className="mt-1 text-xs text-neutral-500">
                      PNG, JPG, or WEBP. Tight crop works best.
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        setSlot(side, (previous) => ({
                          ...previous,
                          file: event.target.files?.[0] || null,
                          fileName: event.target.files?.[0]?.name || "",
                        }))
                      }
                    />
                  </label>

                  {slot.fileName && (
                    <p className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                      Selected scan: <span className="font-medium">{slot.fileName}</span>
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleScanCompareProduct(side)}
                      disabled={!slot.file || loading}
                      className="rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Scan {title}
                    </button>

                    {slot.scannedInput && (
                      <button
                        onClick={() =>
                          setSlot(side, (previous) => ({
                            ...previous,
                            scannedInput: null,
                            scanStatus: "",
                          }))
                        }
                        className="rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
                      >
                        Clear scan
                      </button>
                    )}
                  </div>

                  {slot.scanStatus && (
                    <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {slot.scanStatus}
                    </p>
                  )}

                  {slot.scannedInput && (
                    <div className="mt-3 rounded-2xl bg-white px-4 py-4 text-sm">
                      <p className="font-medium text-neutral-900">{slot.scannedInput.name}</p>
                      <p className="mt-1 text-neutral-600">
                        {slot.scannedInput.ingredients.length} matched ingredients from OCR
                      </p>
                      {slot.scannedInput.parsedIngredients.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {slot.scannedInput.parsedIngredients.slice(0, 8).map((ingredient) => (
                            <span
                              key={`${side}-${ingredient}`}
                              className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
                            >
                              {ingredient}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleCompare}
              disabled={loading}
              className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Comparing..." : "Compare Products"}
            </button>

            <p className="text-sm text-neutral-500">
              Each side can come from your product database or from a scanned ingredient panel.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        {result && (
          <>
            <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">Recommendation</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                {result.better === "A" && `Better Choice: ${result.productA.name}`}
                {result.better === "B" && `Better Choice: ${result.productB.name}`}
                {result.better === "Tie" && "These products are closely matched"}
              </h2>
              <p className="mt-3 text-neutral-600">{result.summary}</p>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-800">Why this looks better</p>
                  <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                    {result.reasons.map((reason) => (
                      <li key={reason} className="rounded-xl bg-white px-3 py-2">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-800">Tradeoffs to know</p>
                  {result.tradeoffs.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                      {result.tradeoffs.map((tradeoff) => (
                        <li key={tradeoff} className="rounded-xl bg-white px-3 py-2">
                          {tradeoff}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-neutral-600">
                      No major tradeoff stands out beyond the ingredients listed below.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                <p className="text-sm font-medium text-neutral-800">Audience fit</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {result.audienceNotes.map((note) => (
                    <div key={note.label} className="rounded-xl bg-white px-3 py-3 text-sm">
                      <p className="font-medium text-neutral-900">{note.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {note.winner === "Tie" ? "Tie" : `Leans Product ${note.winner}`}
                      </p>
                      <p className="mt-2 text-neutral-600">{note.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-neutral-500">Product A</p>
                    <h3 className="mt-1 text-2xl font-semibold text-neutral-900">
                      {result.productA.name}
                    </h3>
                    {result.productA.brand && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {result.productA.brand}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        {result.productA.source === "scan" ? "Scanned OCR input" : "Catalog product"}
                      </span>
                      {result.productA.id && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                          <span className="font-medium text-neutral-800">ID</span>
                          <code className="rounded bg-white px-2 py-0.5 text-[11px] text-neutral-700">
                            {result.productA.id}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${badgeClasses(
                      result.productA.color
                    )}`}
                  >
                    {result.productA.score} • {result.productA.color}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-sm font-medium text-neutral-500">At a glance</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Ingredient count</p>
                        <p className="mt-1">{result.productA.ingredientCount}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Standout benefits</p>
                        <p className="mt-1">
                          {result.productA.standoutBenefits.length
                            ? result.productA.standoutBenefits.join(", ")
                            : "No standout support ingredients called out yet."}
                        </p>
                      </div>
                    </div>
                    {result.productA.standoutConcerns.length > 0 && (
                      <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Main concern signals</p>
                        <p className="mt-1">{result.productA.standoutConcerns.join(", ")}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-medium text-neutral-500">
                    Flagged Ingredients
                  </p>

                  {result.productA.flaggedIngredients.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {result.productA.flaggedIngredients.map((ingredient) => (
                        <li
                          key={ingredient.name}
                          className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{ingredient.name}</span>
                            <span className="text-xs uppercase tracking-wide text-neutral-500">
                              {ingredient.riskLevel}
                            </span>
                          </div>
                          <details className="mt-2 rounded-xl bg-white p-3">
                            <summary className="cursor-pointer font-medium text-neutral-700">
                              More ingredient info
                            </summary>
                            <div className="mt-3 space-y-2 text-neutral-600">
                              <p>
                                <span className="font-medium text-neutral-800">Risk score:</span>{" "}
                                {ingredient.riskScore}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Category:</span>{" "}
                                {ingredient.category || "Unknown"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Source:</span>{" "}
                                {ingredient.source || "Unknown"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Review bucket:</span>{" "}
                                {ingredient.reviewBucket}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Aliases:</span>{" "}
                                {ingredient.aliases.length
                                  ? ingredient.aliases.join(", ")
                                  : "None"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Concerns:</span>{" "}
                                {ingredient.concerns.length
                                  ? ingredient.concerns.join(", ")
                                  : "None listed"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Description:</span>{" "}
                                {ingredient.description || "No description available yet."}
                              </p>
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      No major flagged ingredients found.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-neutral-500">Product B</p>
                    <h3 className="mt-1 text-2xl font-semibold text-neutral-900">
                      {result.productB.name}
                    </h3>
                    {result.productB.brand && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {result.productB.brand}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        {result.productB.source === "scan" ? "Scanned OCR input" : "Catalog product"}
                      </span>
                      {result.productB.id && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                          <span className="font-medium text-neutral-800">ID</span>
                          <code className="rounded bg-white px-2 py-0.5 text-[11px] text-neutral-700">
                            {result.productB.id}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${badgeClasses(
                      result.productB.color
                    )}`}
                  >
                    {result.productB.score} • {result.productB.color}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-sm font-medium text-neutral-500">At a glance</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Ingredient count</p>
                        <p className="mt-1">{result.productB.ingredientCount}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Standout benefits</p>
                        <p className="mt-1">
                          {result.productB.standoutBenefits.length
                            ? result.productB.standoutBenefits.join(", ")
                            : "No standout support ingredients called out yet."}
                        </p>
                      </div>
                    </div>
                    {result.productB.standoutConcerns.length > 0 && (
                      <div className="mt-3 rounded-xl bg-white px-3 py-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Main concern signals</p>
                        <p className="mt-1">{result.productB.standoutConcerns.join(", ")}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-medium text-neutral-500">
                    Flagged Ingredients
                  </p>

                  {result.productB.flaggedIngredients.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {result.productB.flaggedIngredients.map((ingredient) => (
                        <li
                          key={ingredient.name}
                          className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{ingredient.name}</span>
                            <span className="text-xs uppercase tracking-wide text-neutral-500">
                              {ingredient.riskLevel}
                            </span>
                          </div>
                          <details className="mt-2 rounded-xl bg-white p-3">
                            <summary className="cursor-pointer font-medium text-neutral-700">
                              More ingredient info
                            </summary>
                            <div className="mt-3 space-y-2 text-neutral-600">
                              <p>
                                <span className="font-medium text-neutral-800">Risk score:</span>{" "}
                                {ingredient.riskScore}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Category:</span>{" "}
                                {ingredient.category || "Unknown"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Source:</span>{" "}
                                {ingredient.source || "Unknown"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Review bucket:</span>{" "}
                                {ingredient.reviewBucket}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Aliases:</span>{" "}
                                {ingredient.aliases.length
                                  ? ingredient.aliases.join(", ")
                                  : "None"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Concerns:</span>{" "}
                                {ingredient.concerns.length
                                  ? ingredient.concerns.join(", ")
                                  : "None listed"}
                              </p>
                              <p>
                                <span className="font-medium text-neutral-800">Description:</span>{" "}
                                {ingredient.description || "No description available yet."}
                              </p>
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      No major flagged ingredients found.
                    </div>
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
