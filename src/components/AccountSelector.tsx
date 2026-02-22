"use client";

import { useQuery } from "convex/react";
import { AlertCircle, Check, ChevronDown, Clock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../convex/_generated/api";

interface AccountSelectorProps {
	selectedAccountId?: string;
	onSelectAccount: (accountId: string) => void;
}

function StatusDot({ status }: { status: string }) {
	if (status === "active") {
		return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />;
	}
	if (status === "pending_name_review") {
		return <Clock className="h-3 w-3 text-yellow-600" />;
	}
	if (status === "failed" || status === "name_declined") {
		return <AlertCircle className="h-3 w-3 text-red-400" />;
	}
	// In-progress states
	return (
		<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
	);
}

export function AccountSelector({
	selectedAccountId,
	onSelectAccount,
}: AccountSelectorProps) {
	const accounts = useQuery(api.accounts.list);

	if (!accounts) {
		return <span className="text-muted-foreground text-xs">Loading...</span>;
	}

	if (accounts.length === 0) {
		return null;
	}

	const selected = accounts.find((a) => a?._id === selectedAccountId);

	// Single account — clickable to navigate to account page
	if (accounts.length === 1) {
		const account = accounts[0];
		if (!account) return null;
		return (
			<button
				className="flex cursor-pointer items-center gap-2 transition-colors hover:opacity-80"
				onClick={() => onSelectAccount(account._id)}
				type="button"
			>
				<StatusDot status={account.status} />
				<span className="font-display font-semibold text-sidebar-foreground text-sm tracking-tight">
					{account.name}
				</span>
				{account.phoneNumber && (
					<span className="font-mono text-[11px] text-muted-foreground/60">
						{account.phoneNumber}
					</span>
				)}
			</button>
		);
	}

	// Multiple accounts — dropdown
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="h-7 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
					size="sm"
					variant="ghost"
				>
					{selected && <StatusDot status={selected.status} />}
					<Phone className="h-3 w-3" />
					{selected?.name ?? "Select account"}
					<ChevronDown className="h-3 w-3 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{accounts.map((account) =>
					account ? (
						<DropdownMenuItem
							className="flex items-center justify-between"
							key={account._id}
							onClick={() => onSelectAccount(account._id)}
						>
							<div className="flex items-center gap-2">
								<StatusDot status={account.status} />
								<span className="font-medium">{account.name}</span>
								{account.phoneNumber && (
									<span className="font-mono text-muted-foreground text-xs">
										{account.phoneNumber}
									</span>
								)}
							</div>
							{selectedAccountId === account._id && (
								<Check className="h-3.5 w-3.5 text-pons-accent" />
							)}
						</DropdownMenuItem>
					) : null,
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
