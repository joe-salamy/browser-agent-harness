import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="container" style={{ padding: "48px 0" }}>
      <section className="card" style={{ maxWidth: 520 }}>
        <h1>Sign in</h1>
        <p className="muted">
          Use the seeded demo account or any configured credentials user.
        </p>
        <Suspense>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
