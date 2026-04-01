"use client";

import { useState } from "react";
import ProductAutocomplete from "../components/ProductAutocomplete";

type CompareResponse = {
  ingredientDetails: {
    name: string;
    riskLevel: string;
    riskScore: number;
    category?: string | null;
    source?: string | null;
    reviewBucket: string;
    description?: string | null;
    concerns: string[];
    aliases: string[];
  };
  productA: {
    id: string;
    name: string;
    brand?: string | null;
    score: number;
    color: string;
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
    id: string;
    name: string;
    brand?: string | null;
    score: number;
    color: string;
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
};

export default function ComparePage() {
  const [productA, setProductA] = useState("");
  const [productB, setProductB] = useState("");
  const [productALabel, setProductALabel] = useState("");
  const [productBLabel, setProductBLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompareResponse | null>(null);

  const handleCompare = async () => {
    setError("");
    setResult(null);

    if (!productA.trim() || !productB.trim()) {
      setError("Please select two products to compare.");
      return;
    }

    if (productA.trim() === productB.trim()) {
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
          productAId: productA.trim(),
          productBId: productB.trim(),
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
            <ProductAutocomplete
              label="Product A"
              placeholder="Search for the first product..."
              helperText="Start typing to see available products."
              selectedLabel={productALabel}
              selectedId={productA}
              onSelect={(product) => {
                setProductA(product.id);
                setProductALabel(product.name);
              }}
            />

            <ProductAutocomplete
              label="Product B"
              placeholder="Search for the second product..."
              helperText="Choose another product from the dropdown."
              selectedLabel={productBLabel}
              selectedId={productB}
              onSelect={(product) => {
                setProductB(product.id);
                setProductBLabel(product.name);
              }}
            />
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
              Use the dropdowns to pick available products from your database.
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
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                      <span className="font-medium text-neutral-800">ID</span>
                      <code className="rounded bg-white px-2 py-0.5 text-[11px] text-neutral-700">
                        {result.productA.id}
                      </code>
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
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                      <span className="font-medium text-neutral-800">ID</span>
                      <code className="rounded bg-white px-2 py-0.5 text-[11px] text-neutral-700">
                        {result.productB.id}
                      </code>
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
