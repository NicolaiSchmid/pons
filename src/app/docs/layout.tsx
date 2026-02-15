import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { DocsNavbar } from "@/components/DocsNavbar";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<RootProvider
			theme={{
				enabled: false,
				defaultTheme: "dark",
			}}
		>
			<DocsLayout
				nav={{
					component: <DocsNavbar />,
				}}
				tree={source.getPageTree()}
			>
				{children}
			</DocsLayout>
		</RootProvider>
	);
}
