"use client";

import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const SCOPE_LABELS: Record<string, string> = {
	read: "Read conversations and messages",
	write: "Update conversations and react to messages",
	send: "Send WhatsApp messages and templates",
	"messages:read": "Read message history",
	"messages:write": "Send messages and reactions",
	"conversations:read": "List conversation state",
	"templates:read": "Read template catalog",
	offline_access: "Keep the client signed in with refresh tokens",
	openid: "Confirm your identity with OpenID Connect",
	profile: "Read your profile name and avatar",
	email: "Read your email address",
};

export default function OAuthConsentPage() {
	const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const { clientId, consentCode, scopes } = useMemo(() => {
		if (typeof window === "undefined") {
			return {
				clientId: null,
				consentCode: null,
				scopes: [] as string[],
			};
		}

		const params = new URLSearchParams(window.location.search);
		return {
			clientId: params.get("client_id"),
			consentCode: params.get("consent_code"),
			scopes: (params.get("scope") ?? "")
				.split(" ")
				.map((scope) => scope.trim())
				.filter((scope) => scope.length > 0),
		};
	}, []);

	const submitConsent = async (accept: boolean) => {
		if (!consentCode) {
			setError("Consent request is missing a consent code.");
			return;
		}

		setSubmitting(accept ? "approve" : "deny");
		setError(null);

		try {
			const response = await fetch("/api/auth/oauth2/consent", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({
					accept,
					consent_code: consentCode,
				}),
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					message?: string;
					error?: string;
				} | null;
				throw new Error(
					body?.message ?? body?.error ?? "Unable to complete consent flow.",
				);
			}

			const result = (await response.json()) as {
				redirect?: boolean;
				url?: string;
			};

			if (result.redirect && result.url) {
				window.location.assign(result.url);
				return;
			}

			throw new Error("Consent completed without a redirect target.");
		} catch (submitError) {
			setSubmitting(null);
			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to complete consent flow.",
			);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(124,255,143,0.12),_transparent_35%),linear-gradient(180deg,_rgba(10,12,16,1),_rgba(7,8,11,1))] px-6 py-16">
			<div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-background/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
				<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-3">
						<div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-pons-accent/20 bg-pons-accent/10 text-pons-accent">
							<ShieldCheck className="h-5 w-5" />
						</div>
						<div className="space-y-2">
							<h1 className="font-display text-2xl text-foreground">
								Grant MCP access
							</h1>
							<p className="max-w-xl text-muted-foreground text-sm leading-6">
								Review the scopes requested by this MCP client before issuing an
								OAuth access token for your Pons workspace.
							</p>
						</div>
					</div>

					{clientId ? (
						<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
							<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
								Client
							</p>
							<p className="mt-1 break-all font-mono text-foreground text-xs">
								{clientId}
							</p>
						</div>
					) : null}
				</div>

				<div className="space-y-3">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Requested Scopes
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						{scopes.length > 0 ? (
							scopes.map((scope) => (
								<div
									className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
									key={scope}
								>
									<p className="font-mono text-foreground text-sm">{scope}</p>
									<p className="mt-1 text-muted-foreground text-xs leading-5">
										{SCOPE_LABELS[scope] ?? "Requested by the client"}
									</p>
								</div>
							))
						) : (
							<div className="rounded-2xl border border-white/10 border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
								No scopes were attached to this request.
							</div>
						)}
					</div>
				</div>

				{error ? (
					<div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
						{error}
					</div>
				) : null}

				<div className="mt-8 flex flex-col gap-3 sm:flex-row">
					<Button
						className="h-11 flex-1 gap-2 rounded-xl bg-pons-accent text-black hover:bg-pons-accent/90"
						disabled={submitting !== null}
						onClick={() => void submitConsent(true)}
					>
						{submitting === "approve" ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<CheckCircle2 className="h-4 w-4" />
						)}
						Approve access
					</Button>
					<Button
						className="h-11 flex-1 gap-2 rounded-xl"
						disabled={submitting !== null}
						onClick={() => void submitConsent(false)}
						variant="outline"
					>
						{submitting === "deny" ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<XCircle className="h-4 w-4" />
						)}
						Deny access
					</Button>
				</div>
			</div>
		</main>
	);
}
