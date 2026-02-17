"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Clock,
	MessageSquare,
	RefreshCw,
	Settings,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

export default function AccountPage() {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;
	const accounts = useQuery(api.accounts.list);
	const retryFromFailed = useMutation(api.accounts.retryFromFailed);
	const [retrying, setRetrying] = useState(false);

	const account = accounts?.find((a) => a?._id === accountId);

	if (!accounts) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</div>
		);
	}

	if (!account) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-8">
				<p className="font-medium text-foreground text-sm">Account not found</p>
				<Link className="text-pons-green text-sm underline" href="/dashboard">
					Go back
				</Link>
			</div>
		);
	}

	const isUsable = USABLE_STATUSES.has(account.status);

	if (isUsable) {
		// Account works, but no conversation selected
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-8">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
					<MessageSquare className="h-5 w-5 text-muted-foreground" />
				</div>
				<div className="text-center">
					<p className="font-medium text-foreground text-sm">
						No conversation selected
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						Select a conversation from the sidebar
					</p>
				</div>
			</div>
		);
	}

	// Non-usable account — show status banner
	const handleRetry = async () => {
		setRetrying(true);
		try {
			await retryFromFailed({ accountId });
		} catch {
			// Error surfaces via reactive query
		} finally {
			setRetrying(false);
		}
	};

	if (account.status === "failed") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
					<XCircle className="h-6 w-6 text-destructive" />
				</div>
				<div className="text-center">
					<p className="font-display font-semibold text-foreground">
						Setup Failed
					</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						{account.failedError ?? "An error occurred during setup."}
					</p>
					{account.failedAtStep && (
						<p className="mt-1 text-muted-foreground text-xs">
							Failed at:{" "}
							<span className="font-mono">
								{account.failedAtStep.replace(/_/g, " ")}
							</span>
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						className="gap-1.5 bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={retrying}
						onClick={handleRetry}
						size="sm"
					>
						{retrying ? (
							<RefreshCw className="h-3.5 w-3.5 animate-spin" />
						) : (
							<RefreshCw className="h-3.5 w-3.5" />
						)}
						Retry
					</Button>
					<Link href={`/dashboard/${accountId}/settings`}>
						<Button className="gap-1.5" size="sm" variant="outline">
							<Settings className="h-3.5 w-3.5" />
							Details
						</Button>
					</Link>
				</div>
			</div>
		);
	}

	if (account.status === "name_declined") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
					<XCircle className="h-6 w-6 text-destructive" />
				</div>
				<div className="text-center">
					<p className="font-display font-semibold text-foreground">
						Display Name Declined
					</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						Meta rejected the display name{" "}
						<span className="font-medium text-foreground">
							&ldquo;{account.displayName}&rdquo;
						</span>
						. You&apos;ll need to submit a new name via{" "}
						<a
							className="text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
							href="https://business.facebook.com/settings/whatsapp-business-accounts"
							rel="noopener noreferrer"
							target="_blank"
						>
							Meta Business Suite
						</a>
						.
					</p>
				</div>
				<Link href={`/dashboard/${accountId}/settings`}>
					<Button className="gap-1.5" size="sm" variant="outline">
						<Settings className="h-3.5 w-3.5" />
						View Details
					</Button>
				</Link>
			</div>
		);
	}

	// In-progress states
	const IN_PROGRESS_LABELS: Record<string, string> = {
		adding_number: "Adding phone number to your WABA...",
		code_requested: "Verification code sent — waiting for entry",
		verifying_code: "Verifying your code...",
		registering: "Registering with WhatsApp...",
	};

	const progressLabel =
		IN_PROGRESS_LABELS[account.status] ?? "Setting up your account...";

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
				<Clock className="h-6 w-6 animate-pulse text-yellow-400" />
			</div>
			<div className="text-center">
				<p className="font-display font-semibold text-foreground">
					Setup in Progress
				</p>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">
					{progressLabel}
				</p>
			</div>
			<Link href={`/dashboard/${accountId}/settings`}>
				<Button className="gap-1.5" size="sm" variant="outline">
					<Settings className="h-3.5 w-3.5" />
					View Details
				</Button>
			</Link>
		</div>
	);
}
