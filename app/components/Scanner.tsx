"use client";

import { useState } from "react";

export default function Scanner() {
    const [image, setImage] = useState<File | null>(null);
    const [status, setStatus] = useState("");
    const [parsedIngredients, setParsedIngredients] = useState<string[]>([]);
    const [matchedIngredients, setMatchedIngredients] = useState<
      { name: string; riskLevel: string; riskScore: number }[]
    >([]);

    const handleUpload = async () => {
        if (!image) return;

        setStatus("Scanning ingredient label...");
        setParsedIngredients([]);
        setMatchedIngredients([]);

        const formData = new FormData();
        formData.append("file", image);

        const res = await fetch("/api/scans/upload", {
            method: "POST",
            body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || "OCR failed.");
            return;
        }

        setParsedIngredients(Array.isArray(data.parsedIngredients) ? data.parsedIngredients : []);
        setMatchedIngredients(Array.isArray(data.matchedIngredients) ? data.matchedIngredients : []);
        setStatus(
            data.text
                ? `Detected ${Array.isArray(data.parsedIngredients) ? data.parsedIngredients.length : 0} ingredient candidates.`
                : "No text found."
        );
    };

    return (
        <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center transition hover:border-rose-400 hover:bg-rose-50">
                <span className="text-sm font-medium text-neutral-700">
                    Upload ingredient label
                </span>
                <span className="mt-1 text-xs text-neutral-500">
                    PNG, JPG, or WEBP
                </span>

                <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setImage(e.target.files?.[0] || null)}
                />
            </label>

            {image && (
                <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                    Selected: <span className="font-medium">{image.name}</span>
                </div>
            )}

            <button
                onClick={handleUpload}
                className="w-full rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
                Scan Product
            </button>

            {status && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {status}
                </div>
            )}

            {parsedIngredients.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Parsed Ingredients</h3>
                    <p className="mt-1 text-xs text-neutral-500">
                        OCR extracted these ingredient candidates from the image.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {parsedIngredients.map((ingredient) => (
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

            {matchedIngredients.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Matched Ingredients</h3>
                    <div className="mt-3 space-y-2">
                        {matchedIngredients.map((ingredient) => (
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
        </div>
    );
}
