// app/compare/page.tsx

"use client"

import { useState } from "react"

export default function ComparePage() {
    const [a, setA] = useState("")
    const [b, setB] = useState("")
    const [result, setResult] = useState<any>(null)

    const compare = async () => {
        const res = await fetch("/api/compare", {
            method: "POST",
            body: JSON.stringify({ a, b })
        })

        const data = await res.json()
        setResult(data)
    }

    return (
        <div className="p-10 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Compare Products</h1>

            <input
                placeholder="Product A ID"
                onChange={(e) => setA(e.target.value)}
                className="border p-2 w-full mb-2"
            />

            <input
                placeholder="Product B ID"
                onChange={(e) => setB(e.target.value)}
                className="border p-2 w-full mb-4"
            />

            <button
                onClick={compare}
                className="bg-blue-500 text-white px-4 py-2 rounded"
            >
                Compare
            </button>

            {result && (
                <div className="mt-6 bg-white p-4 shadow rounded">
                    <p>Better Choice: {result.better}</p>
                </div>
            )}
        </div>
    )
}
