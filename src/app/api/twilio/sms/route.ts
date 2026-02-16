import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
	throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexHttpClient(convexUrl);

/**
 * Twilio SMS Webhook — auto-captures Meta/WhatsApp verification codes.
 *
 * When Meta sends an OTP to a Twilio number, Twilio forwards it here.
 * We extract the 6-digit code and store it on the account so the
 * autoVerifyAndRegister action can pick it up.
 *
 * POST body (form-encoded from Twilio):
 *   To=+14155552671&From=+1234567890&Body=Your WhatsApp code is 123-456
 *
 * We respond with empty TwiML to prevent Twilio from sending an auto-reply.
 *
 * @see https://www.twilio.com/docs/messaging/guides/webhook-request
 */
export async function POST(request: NextRequest) {
	const body = await request.text();
	const params = new URLSearchParams(body);

	const to = params.get("To"); // Our Twilio number (E.164)
	const from = params.get("From");
	const smsBody = params.get("Body") ?? "";

	console.log("[twilio:sms] Incoming SMS", {
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
		// We need to find an account with this phone number in code_requested state.
		// The phone number from Twilio is the "To" field.
		// We search by phone number since phoneNumberId isn't set yet for Twilio numbers
		// that are still in the registration flow.
		await convex.action(api.twilioConnect.captureVerificationCode, {
			phoneNumber: to,
			code,
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
