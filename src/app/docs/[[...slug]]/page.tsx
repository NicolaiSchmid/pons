import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { source } from "@/lib/source";

export default async function Page(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;

	return (
		<DocsPage full={page.data.full} toc={page.data.toc}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<MDX />
			</DocsBody>
		</DocsPage>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	return {
		title: `${page.data.title} — Pons Docs`,
		description: page.data.description,
		alternates: {
			canonical: `https://pons.chat${page.url}`,
		},
		openGraph: {
			title: `${page.data.title} — Pons Docs`,
			description: page.data.description,
			url: `https://pons.chat${page.url}`,
			type: "article",
			images: [
				{
					url: `/api/og?title=${encodeURIComponent(`${page.data.title} — Pons Docs`)}&subtitle=${encodeURIComponent(page.data.description ?? "Documentation for Pons.")}`,
					width: 1200,
					height: 630,
					alt: `${page.data.title} — Pons Docs`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: `${page.data.title} — Pons Docs`,
			description: page.data.description,
			images: [
				`/api/og?title=${encodeURIComponent(`${page.data.title} — Pons Docs`)}&subtitle=${encodeURIComponent(page.data.description ?? "Documentation for Pons.")}`,
			],
		},
	};
}
