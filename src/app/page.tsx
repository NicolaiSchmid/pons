"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Dashboard } from "../components/Dashboard";

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signIn } = useAuthActions();

	// Debug
	console.log("Auth state:", { isAuthenticated, isLoading });

	const handleFacebookSignIn = () => {
		void signIn("facebook");
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
					className="flex items-center gap-3 rounded-lg bg-[#1877F2] px-6 py-3 font-semibold text-white transition hover:bg-[#166FE5]"
					onClick={handleFacebookSignIn}
					type="button"
				>
					<svg
						aria-hidden="true"
						className="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
					</svg>
					Continue with Facebook
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
