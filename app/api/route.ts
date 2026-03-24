// app/api/compare/route.ts

import { prisma } from "@/lib/prisma"
import { calculateScore } from "@/lib/scoring"

export async function POST(req: Request) {
    const { a, b } = await req.json()

    const productA = await prisma.product.findUnique({
        where: { id: a },
        include: { ingredients: { include: { ingredient: true } } }
    })

    const productB = await prisma.product.findUnique({
        where: { id: b },
        include: { ingredients: { include: { ingredient: true } } }
    })

    const scoreA = calculateScore(
        productA.ingredients.map(i => i.ingredient)
    )

    const scoreB = calculateScore(
        productB.ingredients.map(i => i.ingredient)
    )

    return Response.json({
        better: scoreA.score > scoreB.score ? "Product A" : "Product B",
        scoreA,
        scoreB
    })
}
