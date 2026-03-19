import { preloadAuthQuery, requireAuthenticatedUser } from "@/lib/auth-server";
import { api } from "../../../../../convex/_generated/api";
import { KeysPageClient } from "./page-client";

/**
 * Server Component: preloads API keys data and passes to client.
 * Eliminates the keys loading spinner on first render.
 */
export default async function KeysPage() {
	await requireAuthenticatedUser("/");

	const preloadedApiKeys = await preloadAuthQuery(api.mcp.listApiKeys, {});

	return <KeysPageClient preloadedApiKeys={preloadedApiKeys} />;
}
