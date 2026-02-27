import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsPageClient } from "./page-client";

/**
 * Server Component: preloads account + members data and passes to client.
 * Eliminates the settings loading spinner on first render.
 */
export default async function SettingsPage({
	params,
}: {
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;
	const token = await convexAuthNextjsToken();
	const typedAccountId = accountId as Id<"accounts">;

	const [preloadedAccount, preloadedMembers, preloadedWebhookTargets] =
		await Promise.all([
			preloadQuery(api.accounts.get, { accountId: typedAccountId }, { token }),
			preloadQuery(
				api.accounts.listMembers,
				{ accountId: typedAccountId },
				{ token },
			),
			preloadQuery(
				api.webhookTargets.listByAccount,
				{ accountId: typedAccountId },
				{ token },
			),
		]);

	return (
		<SettingsPageClient
			accountId={typedAccountId}
			preloadedAccount={preloadedAccount}
			preloadedMembers={preloadedMembers}
			preloadedWebhookTargets={preloadedWebhookTargets}
		/>
	);
}
