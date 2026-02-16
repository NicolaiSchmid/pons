import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPost {
	slug: string;
	title: string;
	description: string;
	date: string;
	author: string;
	content: string;
}

export function getAllPosts(): BlogPost[] {
	if (!fs.existsSync(BLOG_DIR)) return [];

	return fs
		.readdirSync(BLOG_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((filename) => {
			const slug = filename.replace(/\.mdx$/, "");
			const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
			const { data, content } = matter(raw);

			return {
				slug,
				title: data.title ?? slug,
				description: data.description ?? "",
				date: data.date ?? "2026-01-01",
				author: data.author ?? "Nicolai Schmid",
				content,
			};
		})
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | undefined {
	const filepath = path.join(BLOG_DIR, `${slug}.mdx`);
	if (!fs.existsSync(filepath)) return undefined;

	const raw = fs.readFileSync(filepath, "utf-8");
	const { data, content } = matter(raw);

	return {
		slug,
		title: data.title ?? slug,
		description: data.description ?? "",
		date: data.date ?? "2026-01-01",
		author: data.author ?? "Nicolai Schmid",
		content,
	};
}
