import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { source } from "@/lib/source";

type DocsPageData = {
	body: ComponentType;
	description?: string;
	full?: boolean;
	title?: string;
	toc?: unknown;
};

export default async function Page(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const pageData = page.data as DocsPageData;
	const MDX = pageData.body;

	return (
		<DocsPage full={pageData.full} toc={pageData.toc as any}>
			<DocsTitle>{pageData.title}</DocsTitle>
			<DocsDescription>{pageData.description}</DocsDescription>
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
	const pageData = page.data as DocsPageData;

	return {
		title: `${pageData.title} — Pons Docs`,
		description: pageData.description,
		alternates: {
			canonical: `https://pons.chat${page.url}`,
		},
		openGraph: {
			title: `${pageData.title} — Pons Docs`,
			description: pageData.description,
			url: `https://pons.chat${page.url}`,
			type: "article",
			images: [
				{
					url: `/api/og?title=${encodeURIComponent(`${pageData.title} — Pons Docs`)}&subtitle=${encodeURIComponent(pageData.description ?? "Documentation for Pons.")}`,
					width: 1200,
					height: 630,
					alt: `${pageData.title} — Pons Docs`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: `${pageData.title} — Pons Docs`,
			description: pageData.description,
			images: [
				`/api/og?title=${encodeURIComponent(`${pageData.title} — Pons Docs`)}&subtitle=${encodeURIComponent(pageData.description ?? "Documentation for Pons.")}`,
			],
		},
	};
}
