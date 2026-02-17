"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface CountryCodeSelectorProps {
	/** ISO 3166-1 alpha-2 code, e.g. "US" */
	value: string;
	/** Called with the ISO code when a country is selected */
	onChange: (code: string) => void;
	/** Optional subset of ISO codes to show (e.g. from Twilio API) */
	availableCodes?: string[];
	/** Placeholder when nothing is selected */
	placeholder?: string;
	/** Additional class names for the trigger button */
	className?: string;
	/** Disabled state */
	disabled?: boolean;
}

export function CountryCodeSelector({
	value,
	onChange,
	availableCodes,
	placeholder = "Select country...",
	className,
	disabled,
}: CountryCodeSelectorProps) {
	const [open, setOpen] = useState(false);

	// Auto-detect country from browser locale when no value is set
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fire-once on mount
	useEffect(() => {
		if (value) return;

		// navigator.language gives e.g. "en-US", "de-DE", "pt-BR"
		const locale = navigator.language ?? "";
		const parts = locale.split("-");
		const regionCode =
			parts.length >= 2
				? (parts[parts.length - 1] ?? "").toUpperCase()
				: "";
		if (!regionCode || regionCode.length !== 2) return;

		// Only auto-select if it's in the available countries list
		const isAvailable = availableCodes
			? availableCodes.includes(regionCode)
			: COUNTRIES.some((c) => c.code === regionCode);

		if (isAvailable) {
			onChange(regionCode);
		}
	}, []);

	const countries = availableCodes
		? COUNTRIES.filter((c) => availableCodes.includes(c.code))
		: COUNTRIES;

	const selected = countries.find((c) => c.code === value.toUpperCase());

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"w-full justify-between font-normal",
						!selected && "text-muted-foreground",
						className,
					)}
					disabled={disabled}
					variant="outline"
				>
					{selected ? (
						<span className="flex items-center gap-2 truncate">
							<span>{selected.flag}</span>
							<span className="truncate">{selected.name}</span>
							<span className="text-muted-foreground">{selected.dial}</span>
						</span>
					) : (
						placeholder
					)}
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[--radix-popover-trigger-width] p-0"
			>
				<Command>
					<CommandInput placeholder="Search country..." />
					<CommandList>
						<CommandEmpty>No country found.</CommandEmpty>
						<CommandGroup>
							{countries.map((country) => (
								<CommandItem
									className="cursor-pointer"
									key={country.code}
									onSelect={() => {
										onChange(country.code);
										setOpen(false);
									}}
									value={`${country.name} ${country.code} ${country.dial}`}
								>
									<span className="mr-2 text-base">{country.flag}</span>
									<span className="flex-1 truncate">{country.name}</span>
									<span className="ml-2 text-muted-foreground text-xs">
										{country.dial}
									</span>
									<Check
										className={cn(
											"ml-2 size-4 shrink-0",
											value.toUpperCase() === country.code
												? "opacity-100"
												: "opacity-0",
										)}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
