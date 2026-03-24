// app/api/ai/explain/route.ts

import OpenAI from "openai"

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
    const { ingredients } = await req.json()

    const prompt = `
Analyze this ingredient list and explain safety:

${ingredients.join(", ")}

Return:
- safety summary
- flagged ingredients
- recommendation
`

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
    })

    return Response.json({
        explanation: response.choices[0].message.content
    })
}
