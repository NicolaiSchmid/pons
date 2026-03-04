import { redirect } from "next/navigation";

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
	redirect(`/dashboard/${accountId}/settings/general`);
}
