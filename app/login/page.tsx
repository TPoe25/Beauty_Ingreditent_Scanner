import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import LoginForm from "../components/LoginForm";
import { auth } from "@/lib/auth";

function getLoginErrorMessage(error: string | undefined) {
  switch (error) {
    case "invalid_credentials":
      return "Sign-in failed. Check your email and password and try again.";
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();

  if (session?.user?.email) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/dashboard";
  const error = getLoginErrorMessage(params.error);

  async function loginAction(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") || "");

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: callbackUrl,
      });
    } catch (caughtError) {
      if (caughtError instanceof AuthError) {
        redirect(
          `/login?callbackUrl=${encodeURIComponent(callbackUrl)}&error=invalid_credentials`
        );
      }

      throw caughtError;
    }
  }

  return <LoginForm callbackUrl={callbackUrl} error={error} action={loginAction} />;
}
