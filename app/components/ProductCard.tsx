// app/components/ProductCard.tsx

import Link from "next/link"

// ProductCard component to display a product's name, base score, and a link to view details
export default function ProductCard({ product }: any) {
    // Container for the product card with styling and content
    return (
        <div className="bg-white p-4 rounded shadow mb-3">
            <h3 className="font-semibold">{product.name}</h3>
            {/* Display the product's base score in a small font and gray color */}
            <div className="mt-2 text-sm text-gray-600">
                Score: {product.baseScore}
            </div>
            {/* Link to the product details page with the product ID as a parameter */}
            <Link href={`/products/${product.id}`}>
                <button className="mt-3 text-blue-500">
                    View Details →
                </button>
            </Link>
        </div>
    )
}
