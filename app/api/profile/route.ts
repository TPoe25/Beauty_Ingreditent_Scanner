import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDatabaseErrorMessage } from "@/lib/databaseErrors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const profileSchema = z.object({
  skinType: z.string().trim().max(50).nullable(),
  preferences: z.array(z.string().trim().min(1).max(50)).max(20),
  allergies: z.array(z.string().trim().min(1).max(100)).max(20),
});

function normalizeArray(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function getCurrentUser() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return null;
  }

  return prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    return Response.json({
      profile: {
        skinType: user.profile?.skinType ?? null,
        preferences: Array.isArray(user.profile?.preferences)
          ? user.profile.preferences.filter((value): value is string => typeof value === "string")
          : [],
        allergies: Array.isArray(user.profile?.allergies)
          ? user.profile.allergies.filter((value): value is string => typeof value === "string")
          : [],
      },
    });
  } catch (error) {
    console.error("PROFILE_GET_ERROR", error);
    const databaseMessage = getDatabaseErrorMessage(error);

    if (databaseMessage) {
      return Response.json({ error: databaseMessage }, { status: 503 });
    }

    return Response.json({ error: "Unable to load profile." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const parsed = profileSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json({ error: "Invalid profile payload." }, { status: 400 });
    }

    const preferences = normalizeArray(parsed.data.preferences);
    const allergies = normalizeArray(parsed.data.allergies);
    const skinType = parsed.data.skinType?.trim() ? parsed.data.skinType.trim() : null;

    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        skinType,
        preferences,
        allergies,
      },
      create: {
        userId: user.id,
        skinType,
        preferences,
        allergies,
      },
    });

    return Response.json({
      profile: {
        skinType: profile.skinType,
        preferences,
        allergies,
      },
    });
  } catch (error) {
    console.error("PROFILE_PATCH_ERROR", error);
    const databaseMessage = getDatabaseErrorMessage(error);

    if (databaseMessage) {
      return Response.json({ error: databaseMessage }, { status: 503 });
    }

    return Response.json({ error: "Unable to save profile." }, { status: 500 });
  }
}
