"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the [accountId] route segment.
 * Catches preloadQuery failures (expired token, backend errors, invalid account ID)
 * and renders a user-friendly retry UI instead of the default Next.js error page.
 */
export default function AccountError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="flex max-w-sm flex-col items-center gap-4 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
					<AlertTriangle className="h-5 w-5 text-destructive" />
				</div>
				<div>
					<h2 className="font-display font-semibold text-base text-foreground">
						Something went wrong
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{error.message || "Failed to load account data. Please try again."}
					</p>
				</div>
				<Button
					className="gap-1.5"
					onClick={reset}
					size="sm"
					variant="secondary"
				>
					<RotateCcw className="h-3.5 w-3.5" />
					Try again
				</Button>
			</div>
		</div>
	);
}
