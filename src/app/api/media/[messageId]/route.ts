import { type NextRequest, NextResponse } from "next/server";
import { fetchAuthMutation, fetchAuthQuery, getToken } from "@/lib/auth-server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ messageId: string }> },
) {
	const { messageId } = await context.params;
	const download = request.nextUrl.searchParams.get("download") === "1";

	const token = await getToken();
	if (!token) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	await fetchAuthMutation(api.auth.ensureCurrentUser, {});

	const mediaUrl = await fetchAuthQuery(api.messages.getMediaUrl, {
		messageId: messageId as Id<"messages">,
	});

	if (!mediaUrl) {
		return new NextResponse("Not found", { status: 404 });
	}

	if (download) {
		const message = await fetchAuthQuery(api.messages.get, {
			messageId: messageId as Id<"messages">,
		});

		if (!message?.mediaId) {
			return new NextResponse("Not found", { status: 404 });
		}

		const fileResponse = await fetch(mediaUrl);
		if (!fileResponse.ok || !fileResponse.body) {
			return new NextResponse("Failed to download media", { status: 502 });
		}

		const headers = new Headers();
		headers.set("Cache-Control", "no-store");
		headers.set(
			"Content-Type",
			message.mediaMimeType ??
				fileResponse.headers.get("content-type") ??
				"application/octet-stream",
		);
		headers.set(
			"Content-Disposition",
			`attachment; filename="${sanitizeFilename(
				message.mediaFilename ?? `attachment-${messageId}`,
			)}"`,
		);

		return new NextResponse(fileResponse.body, {
			status: 200,
			headers,
		});
	}

	const response = NextResponse.redirect(mediaUrl, 307);
	response.headers.set("Cache-Control", "no-store");
	return response;
}

function sanitizeFilename(filename: string): string {
	return filename.replace(/[\r\n"\\/]/g, "_");
}
