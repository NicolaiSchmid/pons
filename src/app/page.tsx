"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import {
	ArrowRight,
	GitBranch,
	MessageSquare,
	Shield,
	Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dashboard } from "../components/Dashboard";

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signIn } = useAuthActions();

	const handleGoogleSignIn = () => {
		void signIn("google");
	};

	if (isLoading) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</main>
		);
	}

	if (isAuthenticated) {
		return <Dashboard />;
	}

	return (
		<main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-noise">
			{/* Subtle gradient orb behind content */}
			<div className="pointer-events-none absolute top-1/4 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pons-green/5 blur-[120px]" />

			<div className="relative z-10 flex flex-col items-center gap-10 px-6 py-20">
				{/* Logo mark */}
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pons-green/10 ring-1 ring-pons-green/20">
						<MessageSquare className="h-5 w-5 text-pons-green" />
					</div>
					<h1 className="font-display font-semibold text-2xl tracking-tight">
						Pons
					</h1>
				</div>

				{/* Hero */}
				<div className="flex max-w-lg flex-col items-center gap-4 text-center">
					<h2 className="font-display font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
						WhatsApp Business
						<br />
						<span className="text-pons-green">API Bridge</span>
					</h2>
					<p className="max-w-md text-base text-muted-foreground leading-relaxed">
						Open-source bridge for the WhatsApp Cloud API. Connect your AI
						agents via MCP, manage conversations, send messages.
					</p>
				</div>

				{/* CTA */}
				<div className="flex flex-col items-center gap-4">
					<Button
						className="h-11 gap-2.5 rounded-lg bg-foreground px-6 font-medium text-background hover:bg-foreground/90"
						onClick={handleGoogleSignIn}
						size="lg"
					>
						<svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
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
						<ArrowRight className="h-4 w-4" />
					</Button>

					<p className="text-muted-foreground text-xs">
						Sign in to connect your WhatsApp Business account
					</p>
				</div>

				{/* Feature pills */}
				<div className="mt-4 flex flex-wrap justify-center gap-3">
					{[
						{ icon: Zap, label: "MCP Protocol" },
						{ icon: Shield, label: "End-to-end encrypted" },
						{ icon: GitBranch, label: "Open source" },
					].map(({ icon: Icon, label }) => (
						<div
							className="flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3.5 py-1.5 text-muted-foreground text-xs backdrop-blur-sm"
							key={label}
						>
							<Icon className="h-3 w-3" />
							{label}
						</div>
					))}
				</div>

				{/* Footer links */}
				<div className="mt-6 flex items-center gap-6 text-muted-foreground text-sm">
					<a
						className="transition hover:text-foreground"
						href="https://github.com/NicolaiSchmid/pons"
						rel="noopener noreferrer"
						target="_blank"
					>
						GitHub
					</a>
					<span className="h-3 w-px bg-border" />
					<a
						className="transition hover:text-foreground"
						href="https://developers.facebook.com/docs/whatsapp/cloud-api"
						rel="noopener noreferrer"
						target="_blank"
					>
						API Docs
					</a>
				</div>
			</div>
		</main>
	);
}
