import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function extractKeyword(question: string) {
  const lower = question.toLowerCase();

  const knownIngredients = [
    "zinc oxide",
    "retinol",
    "glycerin",
    "salicylic acid",
    "niacinamide",
    "hyaluronic acid",
    "benzoyl peroxide",
    "titanium dioxide",
    "phenoxyethanol",
    "fragrance",
  ];

  for (const ingredient of knownIngredients) {
    if (lower.includes(ingredient)) return ingredient;
  }

  return lower.trim();
}

function shorten(text: string | null | undefined, max = 500) {
  if (!text) return "No description available.";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export async function POST(req: Request) {
  let ingredient: any = null;

  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const keyword = extractKeyword(message);

    ingredient = await prisma.ingredient.findFirst({
      where: {
        OR: [
          {
            name: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          {
            normalizedName: {
              contains: keyword.toLowerCase(),
            },
          },
        ],
      },
    });

    let context = `Ingredient requested: ${keyword}
No matching ingredient data was found in the database.`;

    if (ingredient) {
      context = `
Ingredient requested: ${keyword}
Name: ${ingredient.name}
Risk Level: ${ingredient.riskLevel}
Risk Score: ${ingredient.riskScore}
Description: ${shorten(ingredient.description, 500)}
Concerns: ${(ingredient.concerns || []).slice(0, 6).join(", ") || "None listed"}
Source: ${ingredient.source ?? "Unknown"}
Category: ${ingredient.category ?? "Unknown"}
      `.trim();
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful skincare ingredient assistant. Answer in 2 to 4 short sentences. Use only the provided database context. Summarize clearly instead of copying raw fields. If the ingredient is not found, say that clearly.",
        },
        {
          role: "user",
          content: `User question: ${message}\n\nDatabase context:\n${context}`,
        },
      ],
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "No answer was generated.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);

    const fallbackReply = ingredient
      ? `${ingredient.name} is currently marked as ${ingredient.riskLevel} risk. ${
          ingredient.description
            ? `Description: ${shorten(ingredient.description, 300)}`
            : ""
        } ${
          ingredient.concerns?.length
            ? `Concerns: ${ingredient.concerns.slice(0, 4).join(", ")}`
            : ""
        }`
      : "The AI service is unavailable right now, and no matching ingredient data was found.";

    return NextResponse.json({
      reply: fallbackReply,
      fallback: true,
    });
  }
}
