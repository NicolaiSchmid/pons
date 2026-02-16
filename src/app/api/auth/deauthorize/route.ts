import { NextResponse } from "next/server";

/**
 * Facebook Deauthorize Callback.
 *
 * Called by Meta when a user removes the app from their Facebook account.
 * Must return 200 to acknowledge receipt.
 *
 * @see https://developers.facebook.com/docs/facebook-login/handling-declined-permissions
 */
export async function POST() {
	// TODO: Handle user deauthorization (e.g. revoke sessions, clean up tokens)
	return NextResponse.json({ success: true });
}
