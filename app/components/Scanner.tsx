// app/components/Scanner.tsx

"use client"

// This component allows users to upload an image of a product, which will then be sent to the backend for processing. The backend will extract the ingredients from the image and return them to the frontend for display.
import { useState } from "react"

// Scanner component to display a scanner for users to upload images of products
export default function Scanner() {
    const [image, setImage] = useState<File | null>(null)

    // Function to handle image upload and sending it to the backend for processing
    const handleUpload = async () => {
        if (!image) return

        // Send the image to the backend for processing using the API endpoint "/api/scans/upload"
        // Replace "/api/scans/upload" with the actual API endpoint in your backend code. The backend will handle the image processing and return the extracted ingredients.
        const formData = new FormData()
        formData.append("file", image)

        // Send the image to the backend for processing using the API endpoint "/api/scans/upload"
        // Replace "/api/scans/upload" with the actual API endpoint in your backend code. The backend will handle the image processing and return the extracted ingredients.
        const res = await fetch("/api/scans/upload", {
            method: "POST",
            body: formData
        })

        // Handle the response from the backend
        const data = await res.json()
        console.log(data)
    }
    // Render the scanner component with an image upload field and a scan button
    return (
        <div className="bg-white p-6 rounded shadow">
            <input
                type="file"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
            />

            {/* Button to trigger the image upload and processing */}
            <button
                onClick={handleUpload}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
            >
                Scan Product
            </button>
        </div>
    )
}
