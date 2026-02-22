import crypto from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
	throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexHttpClient(convexUrl);

/**
 * Validate Twilio's request signature to ensure the request actually
 * came from Twilio and wasn't forged.
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(
	authToken: string,
	signature: string,
	url: string,
	params: Record<string, string>,
): boolean {
	// Build the data string: URL + sorted param key/value pairs concatenated
	const sortedKeys = Object.keys(params).sort();
	let data = url;
	for (const key of sortedKeys) {
		data += key + params[key];
	}

	const expected = crypto
		.createHmac("sha1", authToken)
		.update(data, "utf-8")
		.digest("base64");

	// Timing-safe comparison to prevent timing attacks
	if (signature.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Twilio SMS Webhook — auto-captures Meta/WhatsApp verification codes.
 *
 * When Meta sends an OTP to a Twilio number, Twilio forwards it here.
 * We extract the 6-digit code and store it on the account so the
 * autoVerifyAndRegister action can pick it up.
 *
 * Security:
 *  1. Validates Twilio's X-Twilio-Signature header (HMAC-SHA1)
 *  2. Passes a shared webhook secret to Convex for defense-in-depth
 *
 * POST body (form-encoded from Twilio):
 *   To=+14155552671&From=+1234567890&Body=Your WhatsApp code is 123-456
 *
 * We respond with empty TwiML to prevent Twilio from sending an auto-reply.
 *
 * @see https://www.twilio.com/docs/messaging/guides/webhook-request
 */
export async function POST(request: NextRequest) {
	const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
	const webhookSecret = process.env.TWILIO_WEBHOOK_SECRET;

	if (!twilioAuthToken || !webhookSecret) {
		console.error(
			"[twilio:sms] TWILIO_AUTH_TOKEN or TWILIO_WEBHOOK_SECRET not set",
		);
		return twimlResponse();
	}

	// Verify Twilio's request signature
	const twilioSignature = request.headers.get("x-twilio-signature");
	if (!twilioSignature) {
		console.error("[twilio:sms] Missing X-Twilio-Signature header — rejecting");
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const body = await request.text();
	const params = new URLSearchParams(body);
	const paramsObj: Record<string, string> = {};
	for (const [key, value] of params.entries()) {
		paramsObj[key] = value;
	}

	// Reconstruct the full URL Twilio used to call us
	const requestUrl =
		process.env.TWILIO_SMS_WEBHOOK_URL ?? request.nextUrl.toString();

	if (
		!validateTwilioSignature(
			twilioAuthToken,
			twilioSignature,
			requestUrl,
			paramsObj,
		)
	) {
		console.error("[twilio:sms] Invalid Twilio signature — rejecting");
		return new NextResponse("Forbidden", { status: 403 });
	}

	const to = params.get("To"); // Our Twilio number (E.164)
	const from = params.get("From");
	const smsBody = params.get("Body") ?? "";

	console.log("[twilio:sms] Incoming SMS (signature verified)", {
		to,
		from,
		bodyPreview: smsBody.slice(0, 50),
	});

	if (!to) {
		return twimlResponse();
	}

	// Extract 6-digit code from the SMS body
	// Meta sends: "Your WhatsApp Business account verification code is 123-456."
	// or sometimes: "<#> Your WhatsApp code is 123-456. ..."
	const codeMatch = smsBody.match(/\b(\d{3})-?(\d{3})\b/);
	if (!codeMatch?.[1] || !codeMatch[2]) {
		console.log("[twilio:sms] No verification code found in message");
		return twimlResponse();
	}

	const code = `${codeMatch[1]}${codeMatch[2]}`;
	console.log("[twilio:sms] Extracted code", {
		code: `${code.slice(0, 3)}***`,
	});

	// Find the account that owns this phone number and is waiting for a code
	try {
		await convex.action(api.twilioConnect.captureVerificationCode, {
			phoneNumber: to,
			code,
			webhookSecret,
		});
		console.log("[twilio:sms] ✓ Code stored on account");
	} catch (error) {
		console.error("[twilio:sms] ✗ Failed to store code", {
			error: String(error),
		});
	}

	return twimlResponse();
}

/** Return empty TwiML to suppress Twilio auto-reply */
function twimlResponse() {
	return new NextResponse(
		'<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
		{
			status: 200,
			headers: { "Content-Type": "text/xml" },
		},
	);
}
