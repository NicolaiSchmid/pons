import { contentType, generateOGImage, size } from "@/lib/og";

export { size, contentType };
export const runtime = "nodejs";
export const alt = "Pons Docs — Build WhatsApp AI workflows";

export default async function DocsTwitterImage() {
	return generateOGImage({
		title: "Pons Docs",
		subtitle:
			"Set up webhooks, connect MCP clients, and build reliable WhatsApp workflows with Pons.",
	});
}
