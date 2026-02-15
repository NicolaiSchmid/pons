"use client";

import { SidebarTrigger } from "fumadocs-ui/components/sidebar/base";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Menu, Search } from "lucide-react";
import { Navbar } from "./Navbar";

export function DocsNavbar() {
	const { setOpenSearch } = useSearchContext();

	return (
		<Navbar
			active="docs"
			leftChildren={
				<SidebarTrigger className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground md:hidden">
					<Menu className="h-4 w-4" />
				</SidebarTrigger>
			}
		>
			<button
				aria-label="Open Search"
				className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground md:hidden"
				onClick={() => setOpenSearch(true)}
				type="button"
			>
				<Search className="h-4 w-4" />
			</button>
		</Navbar>
	);
}
