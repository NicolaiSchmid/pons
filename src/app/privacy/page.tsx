import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
	title: "Privacy Policy — Pons",
	description:
		"Privacy policy for Pons, the open-source WhatsApp Business API bridge.",
};

export default function PrivacyPage() {
	return (
		<>
			<Navbar />
			<main className="mx-auto max-w-3xl px-4 py-16">
				<article className="prose max-w-none prose-headings:font-display prose-a:text-pons-accent prose-headings:tracking-tight prose-a:no-underline hover:prose-a:underline">
					<h1>Privacy Policy</h1>

					<p>
						We are <strong>Nicolai Schmid</strong> and offer{" "}
						<strong>Pons</strong> — an open-source bridge for the WhatsApp
						Business Cloud API. Pons helps businesses connect AI agents and
						developer tools to WhatsApp via the Model Context Protocol (MCP).
					</p>
					<p>
						In doing so, we necessarily process personal data — from simple
						contact data to usage data to message content. On this page we
						explain what data we process, for what purposes, which service
						providers we work with, and what rights you have under the GDPR.
					</p>
					<p>
						If you have any questions, please contact us at any time:{" "}
						<a href="mailto:privacy@pons.chat">privacy@pons.chat</a>.
					</p>

					<hr />

					<h2>1. Data protection at a glance</h2>

					<h3>General information</h3>
					<p>
						The following information provides a simple overview of what happens
						to your personal data when you visit this website and use our
						service. Personal data is any data with which you can be personally
						identified.
					</p>

					<h3>Who is responsible for data collection?</h3>
					<p>
						Data processing on this website and within the Pons application is
						carried out by:
					</p>
					<p>
						Nicolai Schmid
						<br />
						Viertelkamp 44
						<br />
						23611 Bad Schwartau
						<br />
						Germany
					</p>
					<p>
						Email: <a href="mailto:privacy@pons.chat">privacy@pons.chat</a>
					</p>

					<h3>How do we collect your data?</h3>
					<p>
						Your data is collected when you provide it to us — for example,
						during registration or when connecting a WhatsApp Business Account.
						Other data is collected automatically by our IT systems when you
						visit the website or use our services (e.g. browser type, operating
						system, time of access).
					</p>

					<h3>What do we use your data for?</h3>
					<p>
						Part of the data is collected to ensure error-free provision of the
						website and application. Other data is used to provide the
						contractual service (message bridging, API access), to respond to
						your enquiries, and to improve our product.
					</p>

					<h3>What rights do you have?</h3>
					<p>
						You have the right at any time to obtain free information about the
						origin, recipient, and purpose of your stored personal data. You
						also have the right to request rectification or deletion of this
						data. If you have given consent to data processing, you can revoke
						it at any time. You also have the right to lodge a complaint with
						the competent supervisory authority.
					</p>

					<hr />

					<h2>2. Personal data — categories overview</h2>

					<table>
						<thead>
							<tr>
								<th>Category</th>
								<th>Examples</th>
								<th>Shared with</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Profile &amp; contact details</td>
								<td>Name, email address, profile picture (from OAuth)</td>
								<td>
									Hosting (Vercel), database (Convex), auth provider
									(Facebook/Google)
								</td>
							</tr>
							<tr>
								<td>Account &amp; authentication data</td>
								<td>OAuth tokens, session IDs, login timestamps</td>
								<td>Convex, auth provider</td>
							</tr>
							<tr>
								<td>WhatsApp Business data</td>
								<td>
									WABA IDs, phone number IDs, access tokens, message content,
									media files
								</td>
								<td>Meta (WhatsApp Cloud API), Convex (storage)</td>
							</tr>
							<tr>
								<td>Device &amp; technical data</td>
								<td>Browser type, OS, referrer URL, timestamps</td>
								<td>Hosting (Vercel)</td>
							</tr>
							<tr>
								<td>API usage data</td>
								<td>API key usage, request timestamps, scopes</td>
								<td>Convex</td>
							</tr>
						</tbody>
					</table>

					<hr />

					<h2>3. Hosting</h2>

					<h3>Vercel</h3>
					<p>
						This website and backend services are hosted by Vercel. Servers are
						located in EU regions. Data processed includes request metadata,
						contact requests, and other data generated through the website.
					</p>
					<p>
						<strong>Provider:</strong> Vercel Inc., 440 N Barranca Ave #4133,
						Covina, CA 91723, USA
					</p>
					<p>
						Legal basis: Art. 6 (1) (b) GDPR (contract performance) and Art. 6
						(1) (f) GDPR (legitimate interest in secure, efficient hosting).
					</p>
					<p>
						We have concluded a data processing agreement (DPA) with Vercel.
					</p>

					<h3>Convex</h3>
					<p>
						We use Convex as our database, authentication, and file storage
						provider. All application data (user accounts, WhatsApp messages,
						media files, API keys) is stored in Convex.
					</p>
					<p>
						<strong>Provider:</strong> Convex, Inc., San Francisco, CA, USA
					</p>
					<p>
						Legal basis: Art. 6 (1) (b) GDPR (contract performance) and Art. 6
						(1) (f) GDPR (legitimate interest).
					</p>

					<hr />

					<h2>4. Authentication</h2>

					<h3>Facebook / Google OAuth</h3>
					<p>
						We use OAuth-based authentication via Facebook (Meta) or Google.
						When you sign in, we receive your name, email address, and profile
						picture from the OAuth provider. If you sign in with Facebook with
						WhatsApp Business scopes, we may also receive access to your
						WhatsApp Business Accounts and phone numbers for the purpose of
						auto-configuring the service.
					</p>
					<p>
						Legal basis: Art. 6 (1) (b) GDPR (contract performance — necessary
						to provide the service).
					</p>
					<p>
						OAuth tokens are stored securely in Convex and are used solely to
						provide the contracted service. You can revoke access at any time
						via your Facebook or Google account settings.
					</p>

					<hr />

					<h2>5. Our service — WhatsApp Business API Bridge</h2>

					<h3>Type and purpose of data processing</h3>
					<p>
						Pons is a bridge between the WhatsApp Business Cloud API and
						developer tools (via MCP). As part of this service, we process:
					</p>
					<ul>
						<li>
							WhatsApp Business Account details (WABA ID, phone number ID,
							access tokens)
						</li>
						<li>
							Message content (text messages, media files, template messages)
						</li>
						<li>Contact information (phone numbers, profile names)</li>
						<li>Conversation metadata (timestamps, message statuses)</li>
						<li>Webhook payloads from Meta</li>
					</ul>
					<p>Legal basis: Art. 6 (1) (b) GDPR (contract performance).</p>

					<h3>Message content and media</h3>
					<p>
						Messages received via WhatsApp webhooks are stored in Convex. Media
						files (images, documents, audio, video) are downloaded from Meta's
						servers (where URLs expire after 5 minutes) and stored in Convex
						file storage for persistent access.
					</p>
					<p>
						We do not use message content for training, analytics, or any
						purpose other than providing the contracted service.
					</p>

					<h3>Sensitive data</h3>
					<p>
						Messages may contain personal or sensitive data. Users are
						responsible for ensuring that their use of WhatsApp messaging
						complies with applicable data protection regulations, including
						obtaining necessary consents from message recipients.
					</p>

					<h3>API keys</h3>
					<p>
						API keys for MCP access are stored as SHA-256 hashes. The plaintext
						key is shown only once at creation time and is never stored.
					</p>

					<h3>Storage and deletion</h3>
					<p>
						Data is stored as long as your account is active. You can delete
						your account and all associated data (messages, contacts,
						conversations, media, API keys) at any time. Upon account deletion,
						all data is permanently removed.
					</p>

					<hr />

					<h2>6. Meta (WhatsApp Cloud API)</h2>
					<p>
						To send and receive WhatsApp messages, we interact with the WhatsApp
						Cloud API operated by Meta Platforms, Inc. Data transmitted to Meta
						includes message content, recipient phone numbers, and media files.
					</p>
					<p>
						Meta's data processing is governed by their own privacy policy:{" "}
						<a
							href="https://www.facebook.com/privacy/policy/"
							rel="noopener noreferrer"
							target="_blank"
						>
							https://www.facebook.com/privacy/policy/
						</a>
					</p>
					<p>
						Legal basis: Art. 6 (1) (b) GDPR (necessary to provide the service).
					</p>

					<hr />

					<h2>7. Cookies</h2>
					<p>
						Our website uses only technically necessary cookies for session
						management. We do not use tracking cookies, analytics cookies, or
						advertising cookies.
					</p>
					<p>
						Legal basis: Art. 6 (1) (f) GDPR (legitimate interest in error-free
						provision of the service).
					</p>

					<hr />

					<h2>8. Server log files</h2>
					<p>
						The hosting provider automatically collects technical data in server
						log files: browser type, operating system, referrer URL, hostname,
						and time of request. IP addresses are not stored in our logs.
					</p>
					<p>
						Legal basis: Art. 6 (1) (f) GDPR (legitimate interest in technically
						error-free operation).
					</p>

					<hr />

					<h2>9. International data transfers</h2>
					<p>
						We configure our services to process data in EU regions wherever
						possible. For services with providers based outside the EU/EEA (e.g.
						Vercel, Convex, Meta), we ensure adequate data protection through:
					</p>
					<ul>
						<li>EU Standard Contractual Clauses (SCCs)</li>
						<li>Encryption of data in transit (TLS) and at rest</li>
						<li>Minimization of personal data processed</li>
						<li>Role-based access control</li>
					</ul>

					<hr />

					<h2>10. Security</h2>
					<p>
						We take appropriate technical and organisational measures to protect
						your data, including:
					</p>
					<ul>
						<li>Encryption of data transmission via TLS</li>
						<li>Hashed storage of API keys (SHA-256)</li>
						<li>
							Webhook signature verification (HMAC-SHA256) to prevent tampering
						</li>
						<li>Role-based access control</li>
						<li>Rate limiting on API endpoints</li>
						<li>Secrets never exposed in API responses or webhook logs</li>
					</ul>

					<hr />

					<h2>11. No automated decision-making</h2>
					<p>
						We do not use automated decision-making, including profiling within
						the meaning of Art. 22 GDPR, which has legal effect on you or
						similarly significantly affects you.
					</p>

					<hr />

					<h2>12. Your rights as a data subject</h2>
					<p>You have the following rights regarding your personal data:</p>
					<ul>
						<li>
							<strong>Right to information</strong> (Art. 15 GDPR)
						</li>
						<li>
							<strong>Right to rectification</strong> (Art. 16 GDPR)
						</li>
						<li>
							<strong>Right to erasure</strong> (&ldquo;right to be
							forgotten&rdquo;, Art. 17 GDPR)
						</li>
						<li>
							<strong>Right to restriction of processing</strong> (Art. 18 GDPR)
						</li>
						<li>
							<strong>Right to data portability</strong> (Art. 20 GDPR)
						</li>
						<li>
							<strong>Right to object</strong> (Art. 21 GDPR)
						</li>
						<li>
							<strong>Right to revoke consent</strong> (Art. 7 (3) GDPR)
						</li>
					</ul>
					<p>
						To exercise your rights, please contact:{" "}
						<a href="mailto:privacy@pons.chat">privacy@pons.chat</a>
					</p>
					<p>
						You also have the right to lodge a complaint with a data protection
						supervisory authority.
					</p>

					<hr />

					<h2>13. Open source</h2>
					<p>
						Pons is open-source software. The source code is publicly available
						at{" "}
						<a
							href="https://github.com/NicolaiSchmid/pons"
							rel="noopener noreferrer"
							target="_blank"
						>
							github.com/NicolaiSchmid/pons
						</a>
						. Self-hosted instances are governed by their own operator's privacy
						policy, not this one. This privacy policy applies only to the hosted
						service at <a href="https://pons.chat">pons.chat</a>.
					</p>

					<hr />

					<h2>14. Changes to this privacy policy</h2>
					<p>
						We reserve the right to amend this privacy policy to reflect current
						legal requirements or changes to our services.
					</p>
					<p>
						<strong>Last updated:</strong> 16 February 2026
					</p>
				</article>
			</main>
		</>
	);
}
