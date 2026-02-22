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
 * Brand colors for OG images — "Petal × Verdigris" identity.
 * Raw hex values — CSS variables aren't available in ImageResponse.
 *
 * Derived from the Pons design system (oklch tokens in globals.css).
 * Light-mode palette: warm copper-cream background, petal pink accent.
 */
export const OG_COLORS = {
	/** Warm cream background — oklch(0.988 0.004 75) */
	background: "#FCF9F5",
	/** Gradient layers for depth on light background */
	gradient: {
		/** Base warm cream */
		base: "#FCF9F5",
		/** Pink glow — bottom left — subtle petal wash */
		pinkGlow: "#F8EEF0",
		/** Cool cream tint — top right */
		coolTint: "#F5F2ED",
		/** Center warmth */
		center: "#FAF7F2",
	},
	/** Primary text — warm charcoal — oklch(0.18 0.012 55) */
	foreground: "#2A2520",
	/** Muted text — oklch(0.50 0.010 65) */
	muted: "#7B756E",
	/** Border — oklch(0.905 0.007 78) */
	border: "#E1DBCF",
	/** Pons petal pink accent — oklch(0.60 0.15 5) */
	accent: "#C94A6E",
	/** Pons accent dimmed — oklch(0.50 0.12 5) */
	accentDim: "#9C3555",
	/** Accent foreground — white text on pink */
	accentForeground: "#FDFBFA",
} as const;
