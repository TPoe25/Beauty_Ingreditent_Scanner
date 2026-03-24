// app/products/[id]/page.tsx

// This is the product detail page. It fetches the product data from the API and displays it.
async function getProduct(id: string) {
    const res = await fetch(`http://localhost:3000/api/products/${id}`, {
        cache: "no-store"
    })
    return res.json()
}

// The ProductPage component fetches the product data and renders it on the page. It displays the product name, base score, AI explanation, and a list of ingredients with their risk levels.
export default async function ProductPage({ params }: any) {
    const product = await getProduct(params.id)
    // In a real app, you'd want to handle loading and error states here
    return (
        <div className="p-10 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">{product.name}</h1>
            {/* Base score is the original score from the database before AI adjustments */}
            <div className="mb-4">
                <span className="px-3 py-1 rounded bg-green-200">
                    Score: {product.baseScore}
                </span>
            </div>

            {/* Risk levels are calculated based on the AI score */}
            {/* AI EXPLANATION */}
            <div className="bg-gray-100 p-4 rounded mb-6">
                <h2 className="font-semibold mb-2">AI Explanation</h2>
                <p>{product.aiExplanation || "Loading AI insights..."}</p>
            </div>

            {/* Ingredients are displayed with their risk levels */}
            <h3 className="font-semibold mb-2">Ingredients</h3>
            <ul className="space-y-2">
                {/* Fetch and display ingredient data from the API */}
                {product.ingredients.map((i: any) => (
                    <li
                        key={i.ingredient.id}
                        className="flex justify-between border-b pb-1"
                    >
                        <span>{i.ingredient.name}</span>
                        <span className="text-sm text-gray-500">
                            {i.ingredient.riskLevel}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
