import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ExplanationProfile } from "@/lib/aiExplanation";

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export async function getViewerExplanationProfile(): Promise<ExplanationProfile | null> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user?.profile) {
    return null;
  }

  return {
    skinType: user.profile.skinType,
    preferences: normalizeStringArray(user.profile.preferences),
    allergies: normalizeStringArray(user.profile.allergies),
  };
}
