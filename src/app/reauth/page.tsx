"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * /reauth — Auto-triggers Facebook OAuth to refresh the session.
 *
 * Linked from token expiry warning emails. The user clicks the link,
 * lands here, and is immediately redirected to Facebook's OAuth flow.
 * After authenticating, they're sent back to "/" (the dashboard).
 */
export default function ReAuth() {
	const { signIn } = useAuthActions();
	const triggered = useRef(false);

	useEffect(() => {
		if (triggered.current) return;
		triggered.current = true;
		void signIn("facebook", { redirectTo: "/dashboard" });
	}, [signIn]);

	return (
		<main className="flex min-h-screen items-center justify-center">
			<div className="flex flex-col items-center gap-4">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pons-accent/10 ring-1 ring-pons-accent/20">
					<MessageSquare className="h-5 w-5 text-pons-accent" />
				</div>
				<div className="flex flex-col items-center gap-1.5">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-sm">
						Redirecting to Facebook...
					</p>
				</div>
			</div>
		</main>
	);
}
