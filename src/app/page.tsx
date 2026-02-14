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
				<h1 className="font-extrabold text-5xl tracking-tight sm:text-6xl">
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
							className="rounded-full bg-slate-700 px-8 py-3 font-semibold transition hover:bg-slate-600"
							onClick={() => void signOut()}
							type="button"
						>
							Sign out
						</button>
					</div>
				) : (
					<div className="w-full max-w-sm">
						<div className="mb-6 flex rounded-lg bg-slate-800 p-1">
							<button
								className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition ${
									authMode === "signIn"
										? "bg-emerald-500 text-white"
										: "text-slate-400 hover:text-white"
								}`}
								onClick={() => setAuthMode("signIn")}
								type="button"
							>
								Sign In
							</button>
							<button
								className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition ${
									authMode === "signUp"
										? "bg-emerald-500 text-white"
										: "text-slate-400 hover:text-white"
								}`}
								onClick={() => setAuthMode("signUp")}
								type="button"
							>
								Sign Up
							</button>
						</div>

						<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
							<input
								className="rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Email"
								required
								type="email"
								value={email}
							/>
							<input
								className="rounded-lg bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
								minLength={8}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Password"
								required
								type="password"
								value={password}
							/>
							{error && <p className="text-red-400 text-sm">{error}</p>}
							<button
								className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold transition hover:bg-emerald-600 disabled:opacity-50"
								disabled={loading}
								type="submit"
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

				<div className="mt-8 flex gap-4 text-slate-500 text-sm">
					<a
						className="hover:text-slate-300"
						href="https://github.com/NicolaiSchmid/pons"
						rel="noopener noreferrer"
						target="_blank"
					>
						GitHub
					</a>
					<span>·</span>
					<a
						className="hover:text-slate-300"
						href="https://developers.facebook.com/docs/whatsapp/cloud-api"
						rel="noopener noreferrer"
						target="_blank"
					>
						WhatsApp Cloud API Docs
					</a>
				</div>
			</div>
		</main>
	);
}
