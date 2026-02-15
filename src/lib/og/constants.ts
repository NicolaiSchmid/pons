/**
 * Open Graph image configuration constants.
 *
 * Standard OG image dimensions and shared configuration
 * used across all OG image generation.
 */

/** Standard OG image dimensions (recommended by most platforms) */
export const OG_IMAGE_SIZE = {
	width: 1200,
	height: 630,
} as const;

/** Content type for generated images */
export const OG_CONTENT_TYPE = "image/png" as const;

/**
 * Brand colors for OG images.
 * Raw hex values — CSS variables aren't available in ImageResponse.
 *
 * Derived from the Pons design system (oklch tokens in globals.css).
 */
export const OG_COLORS = {
	/** Deep dark background — oklch(0.1 0.005 260) */
	background: "#151719",
	/** Gradient layers */
	gradient: {
		/** Base layer */
		base: "#141618",
		/** Green glow — bottom left */
		greenGlow: "#0f1f17",
		/** Cool tint — top right */
		coolTint: "#151a20",
		/** Center depth */
		center: "#111315",
	},
	/** Primary text — oklch(0.95 0 0) */
	foreground: "#F0F0F0",
	/** Muted text — oklch(0.55 0 0) */
	muted: "#838383",
	/** Pons green accent — oklch(0.72 0.17 160) */
	green: "#25D366",
	/** Pons green dimmed */
	greenDim: "#1a9e4a",
} as const;
