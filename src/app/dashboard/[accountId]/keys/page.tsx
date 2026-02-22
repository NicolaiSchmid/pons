import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { KeysPageClient } from "./page-client";

/**
 * Server Component: preloads API keys data and passes to client.
 * Eliminates the keys loading spinner on first render.
 */
export default async function KeysPage() {
	const token = await convexAuthNextjsToken();

	const preloadedApiKeys = await preloadQuery(
		api.mcp.listApiKeys,
		{},
		{ token },
	);

	return <KeysPageClient preloadedApiKeys={preloadedApiKeys} />;
}
