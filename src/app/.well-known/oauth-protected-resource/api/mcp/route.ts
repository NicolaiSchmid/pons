import { NextResponse } from "next/server";
import {
	getAuthIssuerUrl,
	getMcpResourceUrl,
	MCP_RESOURCE_SCOPES,
} from "@/lib/mcp-oauth";

export async function GET(request: Request) {
	const origin = new URL(request.url).origin;

	return NextResponse.json(
		{
			resource: getMcpResourceUrl(origin),
			authorization_servers: [getAuthIssuerUrl(origin)],
			scopes_supported: [...MCP_RESOURCE_SCOPES],
			bearer_methods_supported: ["header"],
		},
		{
			headers: {
				"Cache-Control":
					"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
			},
		},
	);
}
