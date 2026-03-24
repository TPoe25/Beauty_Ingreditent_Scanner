// This function handles the POST request to upload an image and extract the ingredients using Google Cloud Vision API. It takes the uploaded image file as input and returns the extracted text.
export function normalizeIngredientName(name: string) {
  return name.trim().toLowerCase().replace(/\.$/, "")
}
