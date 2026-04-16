import Link from "next/link";
import AuthSubmitButton from "./AuthSubmitButton";

type SignUpFormProps = {
  callbackUrl: string;
  error: string | null;
  action: (formData: FormData) => Promise<void>;
};

export default function SignUpForm({ callbackUrl, error, action }: SignUpFormProps) {
  return (
    <main className="min-h-[calc(100vh-140px)] bg-gradient-to-b from-amber-50 via-white to-rose-50 px-6 py-16">
      <div className="relative z-10 mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-600">
          Create Account
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">
          Set up your profile
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Create an account to save your skin preferences, allergies, and personalized ingredient explanations.
        </p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-800">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-800">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-800">Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
              placeholder="Repeat your password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <AuthSubmitButton idleLabel="Create Account" pendingLabel="Creating account..." />
        </form>

        <Link
          href="/dashboard"
          className="mt-3 block w-full cursor-pointer rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-center text-sm font-semibold text-neutral-900 transition hover:border-amber-300 hover:bg-amber-50"
        >
          Continue as Guest
        </Link>

        <div className="mt-6 text-sm text-neutral-500">
          Already have an account?{" "}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-rose-600 hover:text-rose-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
