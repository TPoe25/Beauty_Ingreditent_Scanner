import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="mb-4 text-2xl font-bold">{product.name}</h1>
      <div className="mb-4">
        <span className="rounded bg-green-200 px-3 py-1">Score: {product.baseScore ?? "N/A"}</span>
      </div>

      <div className="mb-6 rounded bg-gray-100 p-4">
        <h2 className="mb-2 font-semibold">AI Explanation</h2>
        <p>AI insights are generated on demand from the ingredient list.</p>
      </div>

      <h3 className="mb-2 font-semibold">Ingredients</h3>
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
    </div>
  );
}
