"use client";

import { useQuery } from "convex/react";
import { Check, ChevronDown, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AccountSelectorProps {
	selectedAccountId?: Id<"accounts">;
	onSelectAccount: (accountId: Id<"accounts">) => void;
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

	// Single account — just show info
	if (accounts.length === 1) {
		if (!selectedAccountId && accounts[0]) {
			onSelectAccount(accounts[0]._id);
		}
		return (
			<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<Phone className="h-3 w-3" />
				<span>{accounts[0]?.name ?? "Account"}</span>
				{accounts[0]?.phoneNumber && (
					<>
						<span className="text-border">·</span>
						<span className="font-mono">{accounts[0].phoneNumber}</span>
					</>
				)}
			</div>
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
							<div>
								<span className="font-medium">{account.name}</span>
								{account.phoneNumber && (
									<span className="ml-2 font-mono text-muted-foreground text-xs">
										{account.phoneNumber}
									</span>
								)}
							</div>
							{selectedAccountId === account._id && (
								<Check className="h-3.5 w-3.5 text-pons-green" />
							)}
						</DropdownMenuItem>
					) : null,
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
