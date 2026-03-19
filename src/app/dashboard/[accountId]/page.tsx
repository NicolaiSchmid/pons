import { preloadAuthQuery, requireAuthenticatedUser } from "@/lib/auth-server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AccountPageClient } from "./page-client";

/**
 * Server Component: preloads accounts data and passes to client.
 * Eliminates the accounts-loading spinner on the "no conversation selected" page.
 */
export default async function AccountPage({
	params,
}: {
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;
	await requireAuthenticatedUser("/");

	const preloadedAccounts = await preloadAuthQuery(api.accounts.list, {});

	return (
		<AccountPageClient
			accountId={accountId as Id<"accounts">}
			preloadedAccounts={preloadedAccounts}
		/>
	);
}
