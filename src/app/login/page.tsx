"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  const field =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="text-lg font-semibold tracking-tight">Draftroom</h1>
        <p className="mb-6 mt-1 text-[12.5px] text-neutral-500">
          Operator sign-in. Accounts are created by an admin with{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            npm run operator
          </code>
          .
        </p>

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Email
        </label>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${field} mb-4`}
        />

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Password
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${field} mb-4`}
        />

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
