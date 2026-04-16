import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export default async function AuthNav() {
  const session = await auth();
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return (
      <div className="relative z-20 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:border-amber-300 hover:bg-amber-50"
        >
          Continue as Guest
        </Link>
        <Link
          href="/signup"
          className="inline-flex cursor-pointer rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100"
        >
          Create Account
        </Link>
        <Link
          href="/login"
          className="inline-flex cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:border-rose-300 hover:bg-rose-50"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="relative z-20 flex items-center gap-3">
      <span className="hidden text-sm text-neutral-500 md:inline">{userEmail}</span>
      <Link
        href="/dashboard#profile-settings"
        className="inline-flex cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:border-rose-300 hover:bg-rose-50"
      >
        Profile
      </Link>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="cursor-pointer rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Sign Out
        </button>
      </form>
    </div>
  );
}
