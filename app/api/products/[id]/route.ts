import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        ingredients: {
          include: {
            ingredient: {
              include: {
                aliases: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }

    return Response.json(product);
  } catch (error) {
    console.error("Product lookup failed", error);
    return Response.json({ error: "Unable to load product." }, { status: 500 });
  }
}
