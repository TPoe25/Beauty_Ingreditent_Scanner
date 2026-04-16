import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { auth } from "@/lib/auth";
import SignUpForm from "../components/SignUpForm";
import { getDatabaseErrorMessage } from "@/lib/databaseErrors";
import { prisma } from "@/lib/prisma";

function getSignUpErrorMessage(error: string | undefined) {
  switch (error) {
    case "password_mismatch":
      return "Passwords do not match.";
    case "existing_account":
      return "An account with this email already exists.";
    case "invalid_input":
      return "A valid email and password with at least 8 characters is required.";
    case "database_unavailable":
      return "Account creation is temporarily unavailable right now. Please try again shortly.";
    default:
      return null;
  }
}

export default async function SignUpPage({
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
  const error = getSignUpErrorMessage(params.error);

  async function signUpAction(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (!email.includes("@") || password.length < 8) {
      redirect(`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}&error=invalid_input`);
    }

    if (password !== confirmPassword) {
      redirect(
        `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}&error=password_mismatch`
      );
    }

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        redirect(
          `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}&error=existing_account`
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.user.create({
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
      });
    } catch (caughtError) {
      if (getDatabaseErrorMessage(caughtError)) {
        redirect(
          `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}&error=database_unavailable`
        );
      }

      throw caughtError;
    }

    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  }

  return <SignUpForm callbackUrl={callbackUrl} error={error} action={signUpAction} />;
}
