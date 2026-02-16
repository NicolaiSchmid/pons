import type { NextRequest } from "next/server";
import { generateBlogOGImage, generateOGImage } from "@/lib/og";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const title = searchParams.get("title");
	const subtitle = searchParams.get("subtitle");
	const cover = searchParams.get("cover");

	// Blog OG: cover image background + title overlay
	if (cover) {
		return generateBlogOGImage({
			title: title ?? "Pons Blog",
			subtitle: subtitle ?? undefined,
			coverPath: cover,
		});
	}

	// Default OG: branded gradient background
	return generateOGImage({
		title: title ?? "WhatsApp Business\nAPI Bridge",
		subtitle:
			subtitle ??
			"Open-source bridge for the WhatsApp Cloud API.\nConnect AI agents via MCP.",
	});
}
