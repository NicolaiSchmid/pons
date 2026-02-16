import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { source } from "@/lib/source";

const BASE_URL = "https://pons.chat";

export default function sitemap(): MetadataRoute.Sitemap {
	const staticPages: MetadataRoute.Sitemap = [
		{
			url: BASE_URL,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${BASE_URL}/blog`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
	];

	const docsPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
		url: `${BASE_URL}${page.url}`,
		lastModified: new Date(),
		changeFrequency: "monthly" as const,
		priority: page.url === "/docs" ? 0.9 : 0.7,
	}));

	const blogPages: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
		url: `${BASE_URL}/blog/${post.slug}`,
		lastModified: new Date(post.date),
		changeFrequency: "monthly" as const,
		priority: 0.8,
	}));

	return [...staticPages, ...docsPages, ...blogPages];
}
