import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
	title: "Blog — Pons",
	description:
		"Guides, tutorials, and insights about WhatsApp Business API, MCP integration, and AI-powered messaging.",
};

export default function BlogIndex() {
	const posts = getAllPosts();

	return (
		<main className="mx-auto max-w-2xl px-4 py-16">
			<h1 className="font-bold font-display text-3xl tracking-tight sm:text-4xl">
				Blog
			</h1>
			<p className="mt-3 text-muted-foreground">
				Guides and tutorials for WhatsApp Business API, MCP, and AI-powered
				messaging.
			</p>

			<div className="mt-12 flex flex-col gap-1">
				{posts.map((post) => (
					<Link
						className="group -mx-3 flex items-baseline justify-between gap-4 rounded-lg px-3 py-3 transition hover:bg-pons-green/5"
						href={`/blog/${post.slug}`}
						key={post.slug}
					>
						<div className="min-w-0">
							<h2 className="truncate font-medium text-foreground transition group-hover:text-pons-green">
								{post.title}
							</h2>
							<p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
								{post.description}
							</p>
						</div>
						<time
							className="shrink-0 text-muted-foreground text-xs tabular-nums"
							dateTime={post.date}
						>
							{new Date(post.date).toLocaleDateString("en-US", {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</time>
					</Link>
				))}

				{posts.length === 0 && (
					<p className="text-muted-foreground">No posts yet.</p>
				)}
			</div>
		</main>
	);
}
