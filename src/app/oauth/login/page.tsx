"use client";

import { Loader2, ShieldEllipsis } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function FacebookIcon() {
	return (
		<svg
			aria-hidden="true"
			className="h-4 w-4"
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
		</svg>
	);
}

export default function OAuthLoginPage() {
	const [loading, setLoading] = useState(false);

	const handleSignIn = () => {
		setLoading(true);
		void authClient.signIn.social({
			provider: "facebook",
			callbackURL:
				typeof window === "undefined" ? "/oauth/login" : window.location.href,
		});
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,255,143,0.12),_transparent_35%),linear-gradient(180deg,_rgba(10,12,16,1),_rgba(7,8,11,1))] px-6 py-16">
			<div className="w-full max-w-md rounded-3xl border border-white/10 bg-background/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
				<div className="mb-8 space-y-3">
					<div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-pons-accent/20 bg-pons-accent/10 text-pons-accent">
						<ShieldEllipsis className="h-5 w-5" />
					</div>
					<div className="space-y-2">
						<h1 className="font-display text-2xl text-foreground">
							Authorize Pons MCP
						</h1>
						<p className="text-muted-foreground text-sm leading-6">
							Sign in with Facebook to continue the MCP OAuth flow for your
							WhatsApp workspace.
						</p>
					</div>
				</div>

				<Button
					className="h-11 w-full gap-2 rounded-xl bg-[#1877F2] font-medium text-white hover:bg-[#166FE5]"
					disabled={loading}
					onClick={handleSignIn}
				>
					{loading ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<FacebookIcon />
					)}
					Continue with Facebook
				</Button>

				<p className="mt-4 text-muted-foreground text-xs leading-5">
					API keys still work unchanged. This page is only used for OAuth
					dynamic client registration.
				</p>
			</div>
		</main>
	);
}
