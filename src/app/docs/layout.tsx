import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<RootProvider
			theme={{
				enabled: true,
				defaultTheme: "dark",
			}}
		>
			<DocsLayout
				links={[
					{
						text: "GitHub",
						url: "https://github.com/NicolaiSchmid/pons",
					},
				]}
				nav={{
					title: "Pons",
					url: "/",
				}}
				tree={source.getPageTree()}
			>
				{children}
			</DocsLayout>
		</RootProvider>
	);
}
