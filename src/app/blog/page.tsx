import type { Metadata } from "next";
import Image from "next/image";
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
		<main className="mx-auto max-w-4xl px-4 py-16">
			<h1 className="font-bold font-display text-3xl tracking-tight sm:text-4xl">
				Blog
			</h1>
			<p className="mt-3 text-muted-foreground">
				Guides and tutorials for WhatsApp Business API, MCP, and AI-powered
				messaging.
			</p>

			<div className="mt-12 grid gap-6 sm:grid-cols-2">
				{posts.map((post) => (
					<Link
						className="group overflow-hidden rounded-xl border border-border/60 bg-card transition hover:border-pons-green/30 hover:bg-card/80"
						href={`/blog/${post.slug}`}
						key={post.slug}
					>
						{/* Cover image — generated OG image */}
						<div className="relative aspect-[1200/630] overflow-hidden bg-background">
							<Image
								alt={post.title}
								className="object-cover transition group-hover:scale-[1.02]"
								fill
								sizes="(max-width: 640px) 100vw, 50vw"
								src={`/api/og?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.description)}`}
							/>
						</div>

						{/* Content */}
						<div className="p-4">
							<time
								className="text-muted-foreground text-xs tabular-nums"
								dateTime={post.date}
							>
								{new Date(post.date).toLocaleDateString("en-US", {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}
							</time>
							<h2 className="mt-1.5 font-display font-medium text-foreground leading-snug tracking-tight transition group-hover:text-pons-green">
								{post.title}
							</h2>
							<p className="mt-1.5 line-clamp-2 text-muted-foreground text-sm">
								{post.description}
							</p>
						</div>
					</Link>
				))}
			</div>

			{posts.length === 0 && (
				<p className="mt-12 text-muted-foreground">No posts yet.</p>
			)}
		</main>
	);
}
