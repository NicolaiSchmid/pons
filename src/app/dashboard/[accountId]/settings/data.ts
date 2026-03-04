import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function loadSettingsData(accountId: Id<"accounts">) {
	const token = await convexAuthNextjsToken();

	const [preloadedAccount, preloadedMembers, preloadedWebhookTargets] =
		await Promise.all([
			preloadQuery(api.accounts.get, { accountId }, { token }),
			preloadQuery(api.accounts.listMembers, { accountId }, { token }),
			preloadQuery(api.webhookTargets.listByAccount, { accountId }, { token }),
		]);

	return { preloadedAccount, preloadedMembers, preloadedWebhookTargets };
}
