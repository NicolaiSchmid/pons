import { NextResponse } from "next/server";

/**
 * Facebook Data Deletion Request Callback.
 *
 * Called by Meta when a user requests deletion of their data.
 * Must return a JSON response with a confirmation code and a URL
 * where the user can check the status of their deletion request.
 *
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export async function POST() {
	// TODO: Implement actual data deletion logic
	const confirmationCode = crypto.randomUUID();

	return NextResponse.json({
		url: `https://pons.chat/privacy`,
		confirmation_code: confirmationCode,
	});
}
