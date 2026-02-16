import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { OG_COLORS, OG_CONTENT_TYPE, OG_IMAGE_SIZE } from "./constants";

// Use module-relative path for reliability in Vercel serverless
// template.tsx is at src/lib/og/template.tsx → 3 levels up to project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../../..");

export type OGImageProps = {
	/** Main headline text */
	title: string;
	/** Subtitle below title (defaults to tagline) */
	subtitle?: string;
};

/**
 * Generates an Open Graph image with Pons branding.
 *
 * Design: Dark background with layered green glow gradients,
 * MessageSquare icon top-left, green "pons.chat" pill top-right,
 * Sora display font for headline, Geist Sans for body.
 *
 * NOTE: Uses Node.js runtime (not Edge) to read local font files.
 */
export async function generateOGImage({
	title,
	subtitle = "WhatsApp in your terminal. Messages in your AI.",
}: OGImageProps): Promise<ImageResponse> {
	const [displayFont, bodyFont] = await Promise.all([
		readFile(join(projectRoot, "public/og-font-sora-semibold.ttf")),
		readFile(join(projectRoot, "public/og-font-geist-regular.ttf")),
	]);

	// Truncate title if too long
	const maxLen = 80;
	const displayTitle =
		title.length > maxLen ? `${title.slice(0, maxLen - 3)}...` : title;

	return new ImageResponse(
		<div
			style={{
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				backgroundColor: OG_COLORS.gradient.base,
				backgroundImage: `radial-gradient(ellipse 140% 100% at -15% 110%, ${OG_COLORS.gradient.greenGlow} 0%, transparent 65%), radial-gradient(ellipse 120% 80% at 115% -15%, ${OG_COLORS.gradient.coolTint} 0%, transparent 55%), radial-gradient(ellipse 100% 80% at 50% 50%, ${OG_COLORS.gradient.center} 0%, transparent 80%)`,
				padding: "60px 80px",
				fontFamily: "Geist",
			}}
		>
			{/* Header: icon + domain pill */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: "100%",
				}}
			>
				{/* MessageSquare icon in green-tinted box */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "16px",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: "56px",
							height: "56px",
							borderRadius: "14px",
							backgroundColor: "rgba(37, 211, 102, 0.12)",
							border: "1px solid rgba(37, 211, 102, 0.2)",
						}}
					>
						{/* Inline SVG — MessageSquare from Lucide */}
						<svg
							fill="none"
							height="28"
							stroke={OG_COLORS.green}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
							width="28"
						>
							<title>Pons</title>
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
					</div>
					<span
						style={{
							fontSize: "28px",
							fontWeight: 600,
							fontFamily: "Sora",
							color: OG_COLORS.foreground,
							letterSpacing: "-0.02em",
						}}
					>
						Pons
					</span>
				</div>

				{/* Domain pill */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						backgroundColor: OG_COLORS.green,
						padding: "10px 22px",
						borderRadius: "9999px",
						fontSize: "20px",
						fontWeight: 600,
						fontFamily: "Sora",
						color: "#0a0a0a",
						letterSpacing: "-0.01em",
					}}
				>
					pons.chat
				</div>
			</div>

			{/* Main content — vertically centered */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					flex: 1,
					gap: "20px",
				}}
			>
				{/* Title */}
				<div
					style={{
						fontSize: "58px",
						fontWeight: 600,
						fontFamily: "Sora",
						color: OG_COLORS.foreground,
						lineHeight: 1.15,
						letterSpacing: "-0.03em",
						maxWidth: "950px",
					}}
				>
					{displayTitle}
				</div>

				{/* Subtitle */}
				<div
					style={{
						fontSize: "26px",
						fontFamily: "Geist",
						color: OG_COLORS.muted,
						lineHeight: 1.4,
						maxWidth: "700px",
					}}
				>
					{subtitle}
				</div>
			</div>

			{/* Bottom: tech pills */}
			<div
				style={{
					display: "flex",
					gap: "12px",
				}}
			>
				{["MCP Protocol", "Open Source", "WhatsApp Cloud API"].map((label) => (
					<div
						key={label}
						style={{
							display: "flex",
							alignItems: "center",
							padding: "8px 16px",
							borderRadius: "9999px",
							backgroundColor: "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
							fontSize: "16px",
							color: OG_COLORS.muted,
							fontFamily: "Geist",
						}}
					>
						{label}
					</div>
				))}
			</div>
		</div>,
		{
			...OG_IMAGE_SIZE,
			fonts: [
				{
					name: "Sora",
					data: displayFont,
					style: "normal",
					weight: 600,
				},
				{
					name: "Geist",
					data: bodyFont,
					style: "normal",
					weight: 400,
				},
			],
		},
	);
}

/**
 * Generates an Open Graph image for blog posts.
 *
 * Design: Uses the pre-rendered cover image as a full-bleed background,
 * overlays a dark gradient for text readability, renders the post title
 * in Sora display font with Pons branding.
 */
export type BlogOGImageProps = {
	/** Blog post title */
	title: string;
	/** Optional subtitle / description */
	subtitle?: string;
	/** Path to the cover image in public/ (e.g. "/blog/my-post.png") */
	coverPath: string;
};

export async function generateBlogOGImage({
	title,
	subtitle,
	coverPath,
}: BlogOGImageProps): Promise<ImageResponse> {
	const [displayFont, bodyFont, coverImage] = await Promise.all([
		readFile(join(projectRoot, "public/og-font-sora-semibold.ttf")),
		readFile(join(projectRoot, "public/og-font-geist-regular.ttf")),
		readFile(join(projectRoot, `public${coverPath}`)),
	]);

	// Convert cover image to base64 data URL
	const coverBase64 = `data:image/png;base64,${coverImage.toString("base64")}`;

	// Truncate title if too long
	const maxLen = 90;
	const displayTitle =
		title.length > maxLen ? `${title.slice(0, maxLen - 3)}...` : title;

	return new ImageResponse(
		<div
			style={{
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
			{/* Cover image background — full bleed */}
			{/* biome-ignore lint/a11y/useAltText: OG image, not user-facing */}
			<img
				src={coverBase64}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					objectFit: "cover",
				}}
			/>

			{/* Dark gradient overlay for text readability */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					display: "flex",
					backgroundImage:
						"linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.55) 40%, rgba(0, 0, 0, 0.25) 70%, rgba(0, 0, 0, 0.15) 100%)",
				}}
			/>

			{/* Content layer */}
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					height: "100%",
					width: "100%",
					padding: "48px 64px",
				}}
			>
				{/* Header: Pons branding + domain pill */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						width: "100%",
					}}
				>
					{/* Pons icon + name */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "14px",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: "48px",
								height: "48px",
								borderRadius: "12px",
								backgroundColor: "rgba(37, 211, 102, 0.15)",
								border: "1px solid rgba(37, 211, 102, 0.25)",
							}}
						>
							<svg
								fill="none"
								height="24"
								stroke={OG_COLORS.green}
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
								viewBox="0 0 24 24"
								width="24"
							>
								<title>Pons</title>
								<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
							</svg>
						</div>
						<span
							style={{
								fontSize: "24px",
								fontWeight: 600,
								fontFamily: "Sora",
								color: "#ffffff",
								letterSpacing: "-0.02em",
							}}
						>
							Pons
						</span>
					</div>

					{/* Blog pill */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								padding: "8px 18px",
								borderRadius: "9999px",
								backgroundColor: "rgba(255, 255, 255, 0.1)",
								border: "1px solid rgba(255, 255, 255, 0.15)",
								fontSize: "17px",
								fontFamily: "Geist",
								color: "rgba(255, 255, 255, 0.8)",
							}}
						>
							pons.chat/blog
						</div>
					</div>
				</div>

				{/* Bottom: Title + subtitle */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "14px",
					}}
				>
					{/* Title */}
					<div
						style={{
							fontSize: "52px",
							fontWeight: 600,
							fontFamily: "Sora",
							color: "#ffffff",
							lineHeight: 1.15,
							letterSpacing: "-0.03em",
							maxWidth: "1000px",
							textShadow: "0 2px 20px rgba(0, 0, 0, 0.5)",
						}}
					>
						{displayTitle}
					</div>

					{/* Subtitle */}
					{subtitle && (
						<div
							style={{
								fontSize: "22px",
								fontFamily: "Geist",
								color: "rgba(255, 255, 255, 0.7)",
								lineHeight: 1.4,
								maxWidth: "800px",
								textShadow: "0 1px 10px rgba(0, 0, 0, 0.4)",
							}}
						>
							{subtitle}
						</div>
					)}
				</div>
			</div>
		</div>,
		{
			...OG_IMAGE_SIZE,
			fonts: [
				{
					name: "Sora",
					data: displayFont,
					style: "normal",
					weight: 600,
				},
				{
					name: "Geist",
					data: bodyFont,
					style: "normal",
					weight: 400,
				},
			],
		},
	);
}

/** Re-export size and content type for opengraph-image.tsx files */
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;
