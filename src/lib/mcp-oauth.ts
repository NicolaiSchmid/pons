export const MCP_RESOURCE_PATH = "/api/mcp";
export const AUTH_SERVER_PATH = "/api/auth";
export const AUTH_JWKS_PATH = "/api/auth/mcp/jwks";
export const OAUTH_PROTECTED_RESOURCE_PATH =
	"/api/auth/.well-known/oauth-protected-resource";

export const MCP_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"read",
	"write",
	"send",
	"messages:read",
	"messages:write",
	"conversations:read",
	"templates:read",
] as const;

export const MCP_RESOURCE_SCOPES = [
	"read",
	"write",
	"send",
	"messages:read",
	"messages:write",
	"conversations:read",
	"templates:read",
] as const;

function getBaseUrl(origin?: string) {
	return origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://pons.chat";
}

export function getMcpResourceUrl(origin?: string) {
	return `${getBaseUrl(origin)}${MCP_RESOURCE_PATH}`;
}

export function getAuthIssuerUrl(origin?: string) {
	return getBaseUrl(origin);
}

export function getAuthJwksUrl(origin?: string) {
	return `${getBaseUrl(origin)}${AUTH_JWKS_PATH}`;
}

export function getProtectedResourceMetadataUrl(origin?: string) {
	return `${getBaseUrl(origin)}${OAUTH_PROTECTED_RESOURCE_PATH}`;
}
