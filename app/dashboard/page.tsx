// app/dashboard/page.tsx

import Scanner from "../components/Scanner"
import SearchBar from "../components/SearchBar"

// Dashboard component to display a scanner for users to scan products and a search bar to search for products
export default function Dashboard() {
  return (
    <div className="p-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        Beauty Scanner Dashboard
      </h1>

      {/* Display a scanner for users to scan products */}
      <div className="mb-6">
        <SearchBar />
      </div>
      {/* Display a scanner for users to scan products */}
      <Scanner />
    </div>
  )
}
