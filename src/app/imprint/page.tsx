import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
	title: "Imprint — Pons",
	description: "Legal notice (Impressum) for Pons.",
};

export default function ImprintPage() {
	return (
		<>
			<Navbar />
			<main className="mx-auto max-w-3xl px-4 py-16">
				<article className="prose max-w-none prose-headings:font-display prose-a:text-pons-accent prose-headings:tracking-tight prose-a:no-underline hover:prose-a:underline">
					<h1>Imprint</h1>

					<p>
						<strong>Nicolai Schmid</strong>
						<br />
						Viertelkamp 44
						<br />
						23611 Bad Schwartau
						<br />
						Germany
					</p>

					<h3>Contact</h3>
					<p>
						Email: <a href="mailto:hello@pons.chat">hello@pons.chat</a>
					</p>

					<h3>Responsible for content</h3>
					<p>
						Nicolai Schmid
						<br />
						Viertelkamp 44
						<br />
						23611 Bad Schwartau
						<br />
						Germany
					</p>
				</article>
			</main>
		</>
	);
}
