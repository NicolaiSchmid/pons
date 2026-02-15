import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type NextRequest, NextResponse } from "next/server";
import { createMcpServer } from "../../../lib/mcp-server";

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
export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, Authorization, Mcp-Session-Id",
		},
	});
}
