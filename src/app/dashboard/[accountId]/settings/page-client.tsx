"use client";

import type { Preloaded } from "convex/react";
import { AccountSettingsPreloaded } from "@/components/AccountSettings";
import type { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function SettingsPageClient({
	accountId,
	preloadedAccount,
	preloadedMembers,
	preloadedWebhookTargets,
}: {
	accountId: Id<"accounts">;
	preloadedAccount: Preloaded<typeof api.accounts.get>;
	preloadedMembers: Preloaded<typeof api.accounts.listMembers>;
	preloadedWebhookTargets: Preloaded<typeof api.webhookTargets.listByAccount>;
}) {
	return (
		<AccountSettingsPreloaded
			accountId={accountId}
			preloadedAccount={preloadedAccount}
			preloadedMembers={preloadedMembers}
			preloadedWebhookTargets={preloadedWebhookTargets}
		/>
	);
}
