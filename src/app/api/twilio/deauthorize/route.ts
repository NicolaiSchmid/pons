import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
	throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexHttpClient(convexUrl);

/**
 * Twilio Connect Deauthorize Webhook.
 *
 * Called by Twilio when a user disconnects their subaccount from our Connect App.
 * We mark the connection as deauthorized in our database.
 *
 * POST body (form-encoded):
 *   AccountSid=AC...&ConnectAppSid=CN...
 *
 * @see https://www.twilio.com/docs/connect/connect-apps#deauthorize
 */
export async function POST(request: NextRequest) {
	const body = await request.text();
	const params = new URLSearchParams(body);
	const accountSid = params.get("AccountSid");

	if (!accountSid) {
		console.error("[twilio:deauthorize] Missing AccountSid");
		return NextResponse.json({ error: "Missing AccountSid" }, { status: 400 });
	}

	console.log("[twilio:deauthorize] Deauthorizing", {
		accountSid: `${accountSid.slice(0, 8)}...`,
	});

	try {
		await convex.mutation(api.twilioConnect.deauthorizeConnection, {
			subaccountSid: accountSid,
		});

		console.log("[twilio:deauthorize] ✓ Connection deauthorized");
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[twilio:deauthorize] ✗ Failed", { error: String(error) });
		return NextResponse.json(
			{ error: "Failed to deauthorize" },
			{ status: 500 },
		);
	}
}
