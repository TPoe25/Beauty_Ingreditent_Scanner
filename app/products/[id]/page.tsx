import { notFound } from "next/navigation";
import { generateProductExplanation } from "@/lib/aiExplanation";
import { getViewerExplanationProfile } from "@/lib/explanationProfile";
import { prisma } from "@/lib/prisma";
import { calculateScore } from "@/lib/scoring";

async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      ingredients: {
        include: {
          ingredient: {
            include: {
              aliases: true,
            },
          },
        },
      },
    },
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  const profile = await getViewerExplanationProfile();
  const ingredients = product.ingredients.map((item) => item.ingredient);
  const score =
    ingredients.length > 0
      ? calculateScore(
          ingredients.map((ingredient) => ({
            name: ingredient.name,
            riskLevel: ingredient.riskLevel,
            riskScore: ingredient.riskScore,
          }))
        )
      : null;
  const explanation =
    ingredients.length > 0
      ? await generateProductExplanation({
          productName: product.name,
          score: score?.score ?? product.baseScore ?? null,
          color: score?.color ?? ((product.scoreColor as "green" | "yellow" | "red" | null) ?? null),
          profile,
          ingredients: ingredients.map((ingredient) => ({
            name: ingredient.name,
            riskLevel: ingredient.riskLevel,
            riskScore: ingredient.riskScore,
            category: ingredient.category,
            source: ingredient.source,
            description: ingredient.description,
            reviewBucket: ingredient.reviewBucket,
            concerns: Array.isArray(ingredient.concerns)
              ? ingredient.concerns.filter(
                  (concern): concern is string => typeof concern === "string"
                )
              : [],
          })),
        })
      : null;

  return (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="mb-4 text-2xl font-bold">{product.name}</h1>
      <div className="mb-4">
        <span className="rounded bg-green-200 px-3 py-1">
          Score: {score?.score ?? product.baseScore ?? "N/A"}
        </span>
      </div>

      <div className="mb-6 rounded bg-gray-100 p-4">
        <h2 className="mb-2 font-semibold">AI Explanation</h2>
        {!explanation ? (
          <p>No ingredient list was available, so an explanation could not be generated.</p>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            {explanation.personalizationNote && (
              <p className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {explanation.personalizationNote}
              </p>
            )}
            <p>{explanation.summary}</p>
            <p>{explanation.scoreContext}</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded bg-neutral-50 p-3">
                <p className="font-medium text-gray-900">What is driving this</p>
                <div className="mt-2 space-y-2">
                  {explanation.reasons.map((reason) => (
                    <p key={reason} className="rounded bg-white p-2 text-gray-700">
                      {reason}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <p className="font-medium text-gray-900">Tradeoffs</p>
                {explanation.tradeoffs.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {explanation.tradeoffs.map((tradeoff) => (
                      <p key={tradeoff} className="rounded bg-white p-2 text-gray-700">
                        {tradeoff}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded bg-white p-2 text-gray-600">
                    No major tradeoff stands out beyond the flagged ingredients shown here.
                  </p>
                )}
              </div>
            </div>
            {explanation.allergyAlerts.length > 0 && (
              <div className="space-y-2">
                {explanation.allergyAlerts.map((alert) => (
                  <p key={alert} className="rounded bg-amber-50 p-3 text-amber-800">
                    {alert}
                  </p>
                ))}
              </div>
            )}
            {explanation.flaggedIngredients.length > 0 && (
              <div className="space-y-2">
                {explanation.flaggedIngredients.map((ingredient) => (
                  <div key={ingredient.name} className="rounded bg-white p-3">
                    <p className="font-medium text-gray-900">
                      {ingredient.name} • {ingredient.cautionLevel}
                    </p>
                    <p className="mt-1">{ingredient.reason}</p>
                  </div>
                ))}
              </div>
            )}
            <p>
              <span className="font-medium text-gray-900">Recommendation:</span>{" "}
              {explanation.recommendation}
            </p>
            {explanation.audienceNotes.length > 0 && (
              <div className="space-y-2">
                {explanation.audienceNotes.map((note) => (
                  <div key={note.focus} className="rounded bg-rose-50 p-3">
                    <p className="font-medium text-gray-900">{note.label}</p>
                    <p className="mt-1 text-gray-700">{note.summary}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {explanation.confidenceNote} Source: {explanation.source}.
            </p>
          </div>
        )}
      </div>

      <h3 className="mb-2 font-semibold">Ingredients</h3>
      {product.ingredients.length === 0 ? (
        <div className="rounded bg-gray-50 p-4 text-sm text-gray-600">
          No ingredient list was available from the imported dataset for this product yet, so it
          can be shown in the app but cannot be scored in detail.
        </div>
      ) : (
        <ul className="space-y-2">
          {product.ingredients.map((item) => (
            <li key={item.ingredient.id} className="border-b pb-3">
              <div className="flex justify-between gap-4 pb-1">
                <span>{item.ingredient.name}</span>
                <span className="text-sm text-gray-500">{item.ingredient.riskLevel}</span>
              </div>
              <details className="mt-2 rounded bg-gray-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-700">
                  More ingredient info
                </summary>
                <div className="mt-3 space-y-2 text-gray-600">
                  <p>
                    <span className="font-medium text-gray-800">Category:</span>{" "}
                    {item.ingredient.category || "Unknown"}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Source:</span>{" "}
                    {item.ingredient.source || "Unknown"}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Review bucket:</span>{" "}
                    {item.ingredient.reviewBucket}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Aliases:</span>{" "}
                    {item.ingredient.aliases.length
                      ? item.ingredient.aliases.map((alias) => alias.alias).join(", ")
                      : "None"}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Concerns:</span>{" "}
                    {Array.isArray(item.ingredient.concerns) && item.ingredient.concerns.length
                      ? item.ingredient.concerns.join(", ")
                      : "None listed"}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800">Description:</span>{" "}
                    {item.ingredient.description || "No description available yet."}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
