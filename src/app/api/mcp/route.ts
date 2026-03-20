import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import {
	getAuthIssuerUrl,
	getAuthJwksUrl,
	getMcpResourceUrl,
	getProtectedResourceMetadataUrl,
} from "../../../lib/mcp-oauth";
import { createMcpServer } from "../../../lib/mcp-server";

// ============================================
// Rate limiting (in-memory sliding window)
// ============================================
// Limits requests per IP to mitigate API key brute-force.
// Resets on cold start — for persistent rate limiting, use Vercel KV or similar.

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const remoteJwksCache = new Map<
	string,
	ReturnType<typeof createRemoteJWKSet>
>();

function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const entry = requestCounts.get(ip);

	if (!entry || now >= entry.resetAt) {
		requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return false;
	}

	entry.count++;
	return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function getClientIp(request: NextRequest): string {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		request.headers.get("x-real-ip") ??
		"unknown"
	);
}

type McpRequestAuth =
	| {
			readonly kind: "apiKey";
			readonly apiKey: string;
	  }
	| {
			readonly kind: "oauth";
			readonly betterAuthUserId: string;
			readonly scopes: string[];
	  };

function extractBearerToken(request: NextRequest): string | null {
	const authHeader = request.headers.get("authorization");
	if (!authHeader) return null;

	if (authHeader.startsWith("Bearer ")) {
		return authHeader.slice(7);
	}
	return authHeader;
}

function isApiKeyToken(token: string) {
	return token.startsWith("pons_");
}

function getOAuthChallengeHeaders(request: NextRequest) {
	return {
		"WWW-Authenticate": `Bearer resource_metadata="${getProtectedResourceMetadataUrl(request.nextUrl.origin)}"`,
	};
}

function unauthorizedResponse(request: NextRequest, message: string) {
	return NextResponse.json(
		{ error: message },
		{
			status: 401,
			headers: getOAuthChallengeHeaders(request),
		},
	);
}

function getRemoteJwks(jwksUrl: string) {
	const cached = remoteJwksCache.get(jwksUrl);
	if (cached) {
		return cached;
	}

	const created = createRemoteJWKSet(new URL(jwksUrl));
	remoteJwksCache.set(jwksUrl, created);
	return created;
}

async function authenticateRequest(
	request: NextRequest,
): Promise<McpRequestAuth | NextResponse> {
	const token = extractBearerToken(request);
	if (!token) {
		return unauthorizedResponse(
			request,
			"Missing bearer token. Use an API key (`Bearer pons_...`) or complete OAuth dynamic client registration.",
		);
	}

	if (isApiKeyToken(token)) {
		return {
			kind: "apiKey",
			apiKey: token,
		};
	}

	try {
		const { payload } = await jwtVerify(
			token,
			getRemoteJwks(getAuthJwksUrl(request.nextUrl.origin)),
			{
				audience: getMcpResourceUrl(request.nextUrl.origin),
				issuer: getAuthIssuerUrl(request.nextUrl.origin),
			},
		);

		if (typeof payload.sub !== "string" || payload.sub.length === 0) {
			return unauthorizedResponse(
				request,
				"OAuth access token is missing a user subject.",
			);
		}

		return {
			kind: "oauth",
			betterAuthUserId: payload.sub,
			scopes:
				typeof payload.scope === "string"
					? payload.scope.split(" ").filter((scope) => scope.length > 0)
					: [],
		};
	} catch {
		return unauthorizedResponse(request, "Invalid or expired bearer token.");
	}
}

async function handleMcp(request: NextRequest, parsedBody?: unknown) {
	const auth = await authenticateRequest(request);
	if (auth instanceof NextResponse) {
		return auth;
	}

	const mcpServer =
		auth.kind === "apiKey"
			? createMcpServer({ kind: "apiKey", apiKey: auth.apiKey })
			: createMcpServer({
					kind: "oauth",
					betterAuthUserId: auth.betterAuthUserId,
					scopes: auth.scopes,
				});

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	await mcpServer.connect(transport);

	return parsedBody === undefined
		? await transport.handleRequest(request)
		: await transport.handleRequest(request, { parsedBody });
}

// MCP endpoint - handles both GET (SSE) and POST (messages)
export async function POST(request: NextRequest) {
	if (isRateLimited(getClientIp(request))) {
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const body = await request.json();
	return await handleMcp(request, body);
}

// Handle GET for SSE connections
export async function GET(request: NextRequest) {
	if (isRateLimited(getClientIp(request))) {
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	return await handleMcp(request);
}

// Handle DELETE for session termination (if needed)
export async function DELETE(request: NextRequest) {
	const auth = await authenticateRequest(request);
	if (auth instanceof NextResponse) {
		return auth;
	}

	return NextResponse.json({ success: true });
}

// Handle OPTIONS for CORS preflight
// MCP clients (Claude Desktop, Cursor, etc.) are not browsers and don't
// need CORS. Restrict the origin to the app's own domain to prevent
// browser-based credential theft attacks.
export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin");
	const allowedOrigin =
		origin === process.env.NEXT_PUBLIC_APP_URL ? origin : null;

	return new NextResponse(null, {
		status: 204,
		headers: {
			...(allowedOrigin
				? { "Access-Control-Allow-Origin": allowedOrigin }
				: {}),
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, Authorization, Mcp-Session-Id",
		},
	});
}
