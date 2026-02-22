/**
 * Shared Meta Graph API fetch helper.
 *
 * Centralizes:
 * - Base URL constant (eliminates duplication across 5 files)
 * - Authorization via Bearer header (secure default)
 * - Optional `tokenInBody` for endpoints that require `access_token` in the JSON body
 * - Consistent JSON error parsing with actionable hints
 *
 * Binary media downloads are intentionally excluded — they bypass JSON parsing
 * and have different error semantics.
 */

const META_API_VERSION = "v22.0";

/** Meta Graph API base URL. Single source of truth. */
export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Error types ──

/** Structured Meta Graph API error response. */
export type MetaApiError = {
	message: string;
	type?: string;
	code: number;
	error_subcode?: number;
	error_data?: { details?: string };
	fbtrace_id?: string;
};

/** Error thrown when a Meta API call fails with a structured error body. */
export class MetaApiRequestError extends Error {
	readonly meta: MetaApiError;
	readonly httpStatus: number;

	constructor(message: string, meta: MetaApiError, httpStatus: number) {
		super(message);
		this.name = "MetaApiRequestError";
		this.meta = meta;
		this.httpStatus = httpStatus;
	}
}

// ── Error formatting ──

/**
 * Build an actionable error message from a Meta API error.
 * Detects well-known error codes and appends remediation hints.
 */
export const formatMetaError = (error: MetaApiError | undefined): string => {
	if (!error) return "Unknown Meta API error";

	const base = `Meta API error #${error.code}${error.error_subcode ? ` (subcode ${error.error_subcode})` : ""}: ${error.message}`;

	// #133010 — Phone number not registered with Cloud API
	if (
		error.error_subcode === 133010 ||
		error.message.includes("not registered")
	) {
		return `${base}\n\nThe WhatsApp phone number is not registered with the Cloud API. Register it first:\n1. Go to pons.chat and complete the phone registration flow, OR\n2. Call POST /{phone_number_id}/register with messaging_product=whatsapp and a 6-digit pin.`;
	}

	// #131030 — Recipient phone number not on WhatsApp
	if (error.error_subcode === 131030) {
		return `${base}\n\nThe recipient phone number is not a valid WhatsApp user.`;
	}

	// #132000 — Template not found / not approved
	if (error.code === 132000 || error.error_subcode === 2388093) {
		return `${base}\n\nThe template was not found or is not approved. Check the template name and language code.`;
	}

	return base;
};

// ── Fetch helper ──

type MetaFetchOptions<TBody = Record<string, unknown>> = {
	/** HTTP method. Defaults to GET. */
	method?: "GET" | "POST" | "DELETE";
	/** JSON body for POST/DELETE. Ignored for GET. */
	body?: TBody;
	/**
	 * When true, puts the token in the JSON body as `access_token`
	 * instead of the Authorization header.
	 * Required by some Meta endpoints (subscribed_apps, register, verify_code, etc.).
	 */
	tokenInBody?: boolean;
};

type MetaErrorEnvelope = {
	error?: MetaApiError;
};

/**
 * Typed fetch for Meta Graph API JSON endpoints.
 *
 * @param path - URL path appended to META_API_BASE, or a full URL (for pagination `next` cursors)
 * @param token - OAuth access token
 * @param options - method, body, tokenInBody
 * @returns Parsed JSON response of type T
 * @throws MetaApiRequestError on non-2xx responses with structured error bodies
 * @throws Error on non-2xx responses without parseable error bodies
 */
export async function metaFetch<T>(
	path: string,
	token: string,
	options: MetaFetchOptions = {},
): Promise<T> {
	const { method = "GET", body, tokenInBody = false } = options;

	// Support both relative paths and full URLs (pagination cursors)
	const url = path.startsWith("https://") ? path : `${META_API_BASE}/${path}`;

	const headers: Record<string, string> = {};

	// Auth: Bearer header by default, unless caller opts into body token
	if (!tokenInBody) {
		headers.Authorization = `Bearer ${token}`;
	}

	let fetchBody: string | undefined;

	if (method !== "GET" && body !== undefined) {
		headers["Content-Type"] = "application/json";
		const payload = tokenInBody ? { ...body, access_token: token } : body;
		fetchBody = JSON.stringify(payload);
	} else if (method !== "GET" && tokenInBody) {
		// POST with no body but tokenInBody — send token alone
		headers["Content-Type"] = "application/json";
		fetchBody = JSON.stringify({ access_token: token });
	}

	const response = await fetch(url, {
		method,
		headers,
		body: fetchBody,
	});

	const data = (await response.json()) as T & MetaErrorEnvelope;

	if (!response.ok) {
		const errorBody = data as MetaErrorEnvelope;
		if (errorBody.error) {
			throw new MetaApiRequestError(
				formatMetaError(errorBody.error),
				errorBody.error,
				response.status,
			);
		}
		throw new Error(
			`Meta API request failed: ${response.status} ${response.statusText}`,
		);
	}

	return data;
}
