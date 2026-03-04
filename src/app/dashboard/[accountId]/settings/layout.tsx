import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsLayoutClient } from "./settings-layout-client";

export default async function SettingsLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ accountId: string }>;
}) {
	const { accountId } = await params;

	return (
		<SettingsLayoutClient accountId={accountId as Id<"accounts">}>
			{children}
		</SettingsLayoutClient>
	);
}
