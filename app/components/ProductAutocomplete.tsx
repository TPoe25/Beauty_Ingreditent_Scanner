"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  baseScore?: number | null;
  scoreColor?: string | null;
  ingredientCount?: number;
  flaggedIngredientCount?: number;
  ingredientPreview?: string[];
};

type ProductAutocompleteProps = {
  label: string;
  placeholder: string;
  helperText?: string;
  onSelect?: (product: ProductOption) => void;
  navigateOnSelect?: boolean;
  selectedLabel?: string;
  selectedId?: string;
};

export default function ProductAutocomplete({
  label,
  placeholder,
  helperText,
  onSelect,
  navigateOnSelect = false,
  selectedLabel,
  selectedId,
}: ProductAutocompleteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(trimmedQuery)}`
        );
        const data = await response.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (product: ProductOption) => {
    setQuery(product.name);
    setOpen(false);
    onSelect?.(product);

    if (navigateOnSelect) {
      router.push(`/products/${product.id}`);
    }
  };

  const badgeClasses = (color?: string | null) => {
    switch (color) {
      case "green":
        return "border-emerald-200 bg-emerald-100 text-emerald-700";
      case "yellow":
        return "border-amber-200 bg-amber-100 text-amber-700";
      case "red":
        return "border-rose-200 bg-rose-100 text-rose-700";
      default:
        return "border-neutral-200 bg-neutral-100 text-neutral-600";
    }
  };

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-neutral-700">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-rose-400 focus:bg-white"
      />

      {helperText && <p className="mt-2 text-sm text-neutral-500">{helperText}</p>}

      {selectedLabel && (
        <p className="mt-2 text-sm text-neutral-600">
          Selected: <span className="font-medium text-neutral-900">{selectedLabel}</span>
        </p>
      )}

      {selectedId && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
          <span className="font-medium text-neutral-800">ID</span>
          <code className="rounded bg-white px-2 py-0.5 text-[11px] text-neutral-700">
            {selectedId}
          </code>
        </div>
      )}

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-neutral-500">Searching products...</div>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className="block w-full rounded-xl px-3 py-3 text-left transition hover:bg-neutral-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-neutral-900">{product.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {product.brand || "No brand"} • Score {product.baseScore ?? "N/A"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                      {product.category && (
                        <span className="rounded-full bg-neutral-100 px-2 py-1">
                          {product.category}
                        </span>
                      )}
                      <span className="rounded-full bg-neutral-100 px-2 py-1">
                        {product.ingredientCount ?? 0} ingredients
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-1">
                        {product.flaggedIngredientCount ?? 0} flagged
                      </span>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${badgeClasses(
                      product.scoreColor
                    )}`}
                  >
                    {product.scoreColor || "n/a"}
                  </span>
                </div>
                {product.ingredientPreview && product.ingredientPreview.length > 0 && (
                  <div className="mt-2 text-xs text-neutral-600">
                    Ingredients: {product.ingredientPreview.join(", ")}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
