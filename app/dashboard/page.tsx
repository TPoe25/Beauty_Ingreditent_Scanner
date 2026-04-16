import { auth } from "@/lib/auth";
import Link from "next/link";
import ProfileSettings from "../components/ProfileSettings";
import Scanner from "../components/Scanner";
import SearchBar from "../components/SearchBar";
import { prisma } from "@/lib/prisma";

async function getDashboardProfile(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user?.profile) {
    return null;
  }

  return {
    skinType: user.profile.skinType ?? null,
    preferences: Array.isArray(user.profile.preferences)
      ? user.profile.preferences.filter((value): value is string => typeof value === "string")
      : [],
    allergies: Array.isArray(user.profile.allergies)
      ? user.profile.allergies.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export default async function Dashboard() {
  const session = await auth();
  const email = session?.user?.email;
  const isGuest = !email;
  const profile = email ? await getDashboardProfile(email) : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-rose-50/40">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-rose-600">
              Dashboard
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
              InciSight
            </h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
              Search products, scan ingredient labels, and get AI-powered
              insights in one place.
            </p>
            <p className="mt-3 text-sm text-neutral-500">
              {isGuest ? "Guest mode" : `Signed in as ${email}`}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-neutral-500">Status</p>
            <p className="font-semibold text-neutral-900">
              {isGuest ? "Guest features enabled" : "Personalized features enabled"}
            </p>
          </div>
        </div>

        {isGuest && (
          <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-700">
                  Guest Mode
                </p>
                <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                  You can browse, scan, and compare without an account
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-neutral-700">
                  Sign in or create an account if you want saved profile settings, allergy alerts,
                  and explanation notes personalized to your skin type and preferences.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup?callbackUrl=/dashboard"
                  className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Create Account
                </Link>
                <Link
                  href="/login?callbackUrl=/dashboard"
                  className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:border-rose-300 hover:bg-rose-50"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-neutral-900">
              Search Products
            </h2>
            <SearchBar />
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-neutral-900">
              Scan Ingredient Label
            </h2>
            <Scanner />
          </section>
        </div>

        {!isGuest ? (
          <div className="mt-6" id="profile-settings">
            <ProfileSettings initialProfile={profile} />
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-500">Profile Settings</p>
            <h2 className="mt-2 text-xl font-semibold text-neutral-900">
              Save your preferences with an account
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Guest mode is great for quick checks, but your skin type, allergies, and preferences
              are only saved when you sign in.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/signup?callbackUrl=/dashboard"
                className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Create Account
              </Link>
              <Link
                href="/login?callbackUrl=/dashboard"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:border-rose-300 hover:bg-rose-50"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Fast Check</p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">
              Red / Yellow / Green
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Instant product scoring for easier decision-making.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">AI Explanation</p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">
              {isGuest ? "Understand why" : "Understand why for you"}
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              {isGuest
                ? "Clear ingredient summaries are available in guest mode, with personalized notes unlocked after sign-in."
                : "Clear ingredient summaries tuned to your saved profile."}
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Compare</p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">
              Better product choices
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Compare similar products side by side before buying.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
