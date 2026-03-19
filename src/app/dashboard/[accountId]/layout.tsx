import { preloadAuthQuery, requireAuthenticatedUser } from "@/lib/auth-server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AccountLayoutClient } from "./layout-client";

/**
 * Server Component: preloads accounts + conversations data on the server.
 * Eliminates both the accounts and conversations loading spinners on first render.
 */
export default async function AccountLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;
	await requireAuthenticatedUser("/");

	const [preloadedAccounts, preloadedConversations] = await Promise.all([
		preloadAuthQuery(api.accounts.list, {}),
		preloadAuthQuery(api.conversations.list, {
			accountId: accountId as Id<"accounts">,
		}),
	]);

	return (
		<AccountLayoutClient
			accountId={accountId as Id<"accounts">}
			preloadedAccounts={preloadedAccounts}
			preloadedConversations={preloadedConversations}
		>
			{children}
		</AccountLayoutClient>
	);
}
