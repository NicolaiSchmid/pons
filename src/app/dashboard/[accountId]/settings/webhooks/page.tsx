import { AccountSettingsPreloaded } from "@/components/AccountSettings";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { loadSettingsData } from "../data";

export default async function WebhooksSettingsPage({
	params,
}: {
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;
	const typedAccountId = accountId as Id<"accounts">;
	const { preloadedAccount, preloadedMembers, preloadedWebhookTargets } =
		await loadSettingsData(typedAccountId);

	return (
		<AccountSettingsPreloaded
			accountId={typedAccountId}
			preloadedAccount={preloadedAccount}
			preloadedMembers={preloadedMembers}
			preloadedWebhookTargets={preloadedWebhookTargets}
			section="webhooks"
		/>
	);
}
