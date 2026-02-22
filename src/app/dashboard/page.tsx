import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

/**
 * /dashboard — Server-side redirect hub.
 *
 * Fetches accounts on the server and redirects immediately:
 * - Has accounts → redirect to the first active one
 * - No accounts  → redirect to /dashboard/setup
 *
 * No spinner needed — the redirect happens before any HTML is sent.
 */
export default async function DashboardIndex() {
	const token = await convexAuthNextjsToken();
	const accounts = await fetchQuery(api.accounts.list, {}, { token });

	if (accounts.length === 0) {
		redirect("/dashboard/setup");
	}

	// Prefer active accounts, fall back to first
	const active = accounts.find((a) => a && USABLE_STATUSES.has(a.status));
	const first = active ?? accounts[0];
	if (first) {
		redirect(`/dashboard/${first._id}`);
	}

	// Fallback (shouldn't happen if accounts.length > 0)
	redirect("/dashboard/setup");
}
