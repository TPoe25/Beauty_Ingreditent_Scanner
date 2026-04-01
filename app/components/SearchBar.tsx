"use client";

import ProductAutocomplete from "./ProductAutocomplete";

export default function SearchBar() {
  return (
    <ProductAutocomplete
      label="Search products"
      placeholder="Search product, brand, or ingredient..."
      helperText="A dropdown will show matching products you can open directly."
      navigateOnSelect
    />
  );
}
