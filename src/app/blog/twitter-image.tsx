import { contentType, generateOGImage, size } from "@/lib/og";

export { size, contentType };
export const runtime = "nodejs";
export const alt = "Pons Blog — WhatsApp + MCP guides";

export default async function BlogTwitterImage() {
	return generateOGImage({
		title: "Pons Blog",
		subtitle:
			"Guides, tutorials, and engineering notes for WhatsApp Business API and MCP tooling.",
	});
}
