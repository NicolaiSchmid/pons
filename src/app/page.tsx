"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useState } from "react";

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn("password", {
        email,
        password,
        flow: authMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="text-white">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="container flex flex-col items-center justify-center gap-8 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          <span className="text-emerald-400">Pons</span>
        </h1>
        <p className="max-w-md text-center text-lg text-slate-300">
          Open-source WhatsApp Business Cloud API bridge with MCP support
        </p>

        {isAuthenticated ? (
          <div className="flex flex-col items-center gap-6">
            <div className="rounded-lg bg-slate-800 p-6 text-center">
              <p className="text-lg text-slate-300">
                You&apos;re signed in! Dashboard coming soon.
              </p>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded-full bg-slate-700 px-8 py-3 font-semibold transition hover:bg-slate-600"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <div className="mb-6 flex rounded-lg bg-slate-800 p-1">
              <button
                onClick={() => setAuthMode("signIn")}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                  authMode === "signIn"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthMode("signUp")}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                  authMode === "signUp"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
              />
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {loading
                  ? "Loading..."
                  : authMode === "signIn"
                    ? "Sign In"
                    : "Sign Up"}
              </button>
            </form>
          </div>
        )}

        <div className="mt-8 flex gap-4 text-sm text-slate-500">
          <a
            href="https://github.com/NicolaiSchmid/pons"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300"
          >
            GitHub
          </a>
          <span>·</span>
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300"
          >
            WhatsApp Cloud API Docs
          </a>
        </div>
      </div>
    </main>
  );
}
