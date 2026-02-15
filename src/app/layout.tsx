import "@/styles/globals.css";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";

import { ConvexClientProvider } from "./ConvexClientProvider";

export const metadata: Metadata = {
	metadataBase: new URL("https://pons.chat"),
	title: "Pons — WhatsApp Business API Bridge",
	description:
		"WhatsApp in your terminal. Messages in your AI. Bridge the WhatsApp Business Cloud API to any MCP-compatible client.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
	openGraph: {
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"WhatsApp in your terminal. Messages in your AI. Send and receive messages from Claude, Cursor, or your own tools.",
		url: "https://pons.chat",
		siteName: "Pons",
		type: "website",
		// Image auto-injected by opengraph-image.tsx
	},
	twitter: {
		card: "summary_large_image",
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"WhatsApp in your terminal. Messages in your AI. Open-source bridge with MCP support.",
		// Image auto-injected by twitter-image.tsx
	},
	alternates: {
		canonical: "https://pons.chat",
	},
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
});

const sora = Sora({
	subsets: ["latin"],
	variable: "--font-sora",
	weight: ["400", "500", "600", "700"],
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<ConvexAuthNextjsServerProvider>
			<html
				className={`dark ${geist.variable} ${geistMono.variable} ${sora.variable}`}
				lang="en"
			>
				<body>
					<ConvexClientProvider>{children}</ConvexClientProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
