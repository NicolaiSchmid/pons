import { preloadAuthQuery, requireAuthenticatedUser } from "@/lib/auth-server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function loadSettingsData(accountId: Id<"accounts">) {
	await requireAuthenticatedUser("/");

	const [preloadedAccount, preloadedMembers, preloadedWebhookTargets] =
		await Promise.all([
			preloadAuthQuery(api.accounts.get, { accountId }),
			preloadAuthQuery(api.accounts.listMembers, { accountId }),
			preloadAuthQuery(api.webhookTargets.listByAccount, { accountId }),
		]);

	return { preloadedAccount, preloadedMembers, preloadedWebhookTargets };
}
