import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";

export default function BlogLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<Navbar active="blog" />
			{children}
		</>
	);
}
