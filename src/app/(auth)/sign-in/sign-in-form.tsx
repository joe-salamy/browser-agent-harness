"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await signIn("credentials", {
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            redirect: false,
          });
          if (result?.error) {
            setError("Invalid email or password.");
            return;
          }
          router.push(searchParams.get("callbackUrl") ?? "/workspaces");
          router.refresh();
        });
      }}
    >
      <label>
        Email
        <input className="input" name="email" type="email" defaultValue="demo@example.com" required />
      </label>
      <label>
        Password
        <input className="input" name="password" type="password" defaultValue="demo-password" required />
      </label>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <button className="btn" type="submit" disabled={isPending}>{isPending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
