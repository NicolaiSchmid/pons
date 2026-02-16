import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

export default async function BlogPost(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const post = getPostBySlug(slug);
	if (!post) notFound();

	return (
		<main className="mx-auto max-w-3xl px-4 py-16">
			<Link
				className="text-muted-foreground text-sm transition hover:text-foreground"
				href="/blog"
			>
				&larr; All posts
			</Link>

			<article className="mt-8">
				{/* Cover image */}
				<div className="relative aspect-[1200/630] overflow-hidden rounded-xl border border-border/60">
					<Image
						alt={post.title}
						className="object-cover"
						fill
						priority
						sizes="(max-width: 768px) 100vw, 768px"
						src={`/api/og?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.description)}`}
					/>
				</div>

				<div className="mt-8">
					<time
						className="text-muted-foreground text-xs tabular-nums"
						dateTime={post.date}
					>
						{new Date(post.date).toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
					</time>

					<h1 className="mt-2 font-bold font-display text-3xl tracking-tight sm:text-4xl">
						{post.title}
					</h1>

					{post.description && (
						<p className="mt-3 text-lg text-muted-foreground">
							{post.description}
						</p>
					)}
				</div>

				<div className="prose prose-invert mt-10 max-w-none prose-code:rounded prose-pre:border prose-pre:border-white/10 prose-code:bg-white/5 prose-pre:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-headings:font-display prose-a:text-pons-green prose-headings:tracking-tight prose-a:no-underline prose-code:before:content-none prose-code:after:content-none hover:prose-a:underline">
					<MDXRemote source={post.content} />
				</div>
			</article>
		</main>
	);
}

export function generateStaticParams() {
	return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await props.params;
	const post = getPostBySlug(slug);
	if (!post) notFound();

	const ogImageUrl = `/api/og?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.description)}`;

	return {
		title: `${post.title} — Pons Blog`,
		description: post.description,
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			publishedTime: post.date,
			images: [{ url: ogImageUrl, width: 1200, height: 630 }],
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
			images: [ogImageUrl],
		},
	};
}
