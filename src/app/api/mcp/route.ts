import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type NextRequest, NextResponse } from "next/server";
import { createMcpServer } from "../../../lib/mcp-server";

// ============================================
// Rate limiting (in-memory sliding window)
// ============================================
// Limits requests per IP to mitigate API key brute-force.
// Resets on cold start — for persistent rate limiting, use Vercel KV or similar.

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP

const requestCounts = new Map<string, { count: number; resetAt: number }>();

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

// Extract API key from Authorization header
function extractApiKey(request: NextRequest): string | null {
	const authHeader = request.headers.get("authorization");
	if (!authHeader) return null;

	// Support both "Bearer <key>" and just "<key>"
	if (authHeader.startsWith("Bearer ")) {
		return authHeader.slice(7);
	}
	return authHeader;
}

// MCP endpoint - handles both GET (SSE) and POST (messages)
export async function POST(request: NextRequest) {
	if (isRateLimited(getClientIp(request))) {
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const apiKey = extractApiKey(request);
	if (!apiKey) {
		return NextResponse.json(
			{
				error:
					"Missing API key. Set Authorization header to 'Bearer <your-api-key>'",
			},
			{ status: 401 },
		);
	}

	// Create MCP server — all auth/scope validation happens inside the gateway
	const mcpServer = createMcpServer(apiKey);

	// Create transport for this request (stateless mode)
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // Stateless mode
	});

	// Connect server to transport
	await mcpServer.connect(transport);

	// Parse body
	const body = await request.json();

	// Handle the request and get response
	const response = await transport.handleRequest(request, { parsedBody: body });

	return response;
}

// Handle GET for SSE connections
export async function GET(request: NextRequest) {
	if (isRateLimited(getClientIp(request))) {
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const apiKey = extractApiKey(request);
	if (!apiKey) {
		return NextResponse.json(
			{
				error:
					"Missing API key. Set Authorization header to 'Bearer <your-api-key>'",
			},
			{ status: 401 },
		);
	}

	// Create MCP server — all auth/scope validation happens inside the gateway
	const mcpServer = createMcpServer(apiKey);

	// Create transport for this request
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	// Connect server to transport
	await mcpServer.connect(transport);

	// Handle the request (returns SSE stream)
	const response = await transport.handleRequest(request);

	return response;
}

// Handle DELETE for session termination (if needed)
export async function DELETE(_request: NextRequest) {
	// In stateless mode, we don't track sessions, so just return success
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
