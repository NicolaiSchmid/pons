"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Dashboard } from "../components/Dashboard";

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signIn } = useAuthActions();

	// Debug
	console.log("Auth state:", { isAuthenticated, isLoading });

	const handleGoogleSignIn = () => {
		void signIn("google");
	};

	if (isLoading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
				<div className="text-white">Loading...</div>
			</main>
		);
	}

	if (isAuthenticated) {
		return <Dashboard />;
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

				<button
					className="flex items-center gap-3 rounded-lg bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-slate-100"
					onClick={handleGoogleSignIn}
					type="button"
				>
					<svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
					</svg>
					Continue with Google
				</button>

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
