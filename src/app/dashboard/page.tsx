"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

/**
 * /dashboard — Redirect hub.
 * - If the user has accounts, redirect to the first active one.
 * - If no accounts, redirect to /dashboard/setup.
 */
export default function DashboardIndex() {
	const accounts = useQuery(api.accounts.list);
	const router = useRouter();

	useEffect(() => {
		if (accounts === undefined) return; // still loading

		if (accounts.length === 0) {
			router.replace("/dashboard/setup");
			return;
		}

		// Prefer active accounts, fall back to first
		const active = accounts.find((a) => a && USABLE_STATUSES.has(a.status));
		const first = active ?? accounts[0];
		if (first) {
			router.replace(`/dashboard/${first._id}`);
		}
	}, [accounts, router]);

	return (
		<div className="flex flex-1 items-center justify-center">
			<div className="flex flex-col items-center gap-3">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
				<p className="text-muted-foreground text-sm">Loading...</p>
			</div>
		</div>
	);
}
