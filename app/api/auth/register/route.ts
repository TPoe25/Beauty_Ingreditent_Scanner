import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDatabaseErrorMessage } from "@/lib/databaseErrors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const parsed = registerSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json(
        { error: "A valid email and password with at least 8 characters is required." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        profile: {
          create: {
            skinType: null,
            preferences: [],
            allergies: [],
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    return Response.json({
      user,
    });
  } catch (error) {
    console.error("REGISTER_ROUTE_ERROR", error);
    const databaseMessage = getDatabaseErrorMessage(error);

    if (databaseMessage) {
      return Response.json({ error: databaseMessage }, { status: 503 });
    }

    return Response.json({ error: "Unable to create account." }, { status: 500 });
  }
}
