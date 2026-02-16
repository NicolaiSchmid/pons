import { fetchMutation } from "convex/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";

/**
 * Twilio Connect OAuth Callback.
 *
 * After the user authorizes via Twilio Connect, Twilio redirects here with
 * the subaccount SID as a query parameter. We save it and redirect back to
 * the app with the connection ID.
 *
 * Twilio Connect redirect URL format:
 *   GET /api/twilio/authorize?AccountSid=AC...
 *
 * @see https://www.twilio.com/docs/connect/connect-apps
 */
export async function GET(request: NextRequest) {
	const accountSid = request.nextUrl.searchParams.get("AccountSid");

	if (!accountSid) {
		console.error("[twilio:authorize] Missing AccountSid parameter");
		return NextResponse.redirect(
			new URL("/dashboard?twilio_error=missing_sid", request.url),
		);
	}

	try {
		// Save the connection — the mutation requires auth context
		// Since this is a redirect from Twilio (user's browser), the auth cookie should be present
		const connectionId = await fetchMutation(api.twilioConnect.saveConnection, {
			subaccountSid: accountSid,
		});

		console.log("[twilio:authorize] ✓ Connection saved", {
			accountSid: `${accountSid.slice(0, 8)}...`,
			connectionId,
		});

		// Redirect back to the app with success
		return NextResponse.redirect(
			new URL(`/dashboard?twilio_connected=${connectionId}`, request.url),
		);
	} catch (error) {
		console.error("[twilio:authorize] ✗ Failed to save connection", {
			error: String(error),
		});
		return NextResponse.redirect(
			new URL("/dashboard?twilio_error=save_failed", request.url),
		);
	}
}
