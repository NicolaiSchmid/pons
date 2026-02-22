"use client";

import { useAction, useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TemplatePicker, type TemplatePickerResult } from "./TemplatePicker";

/** Normalize phone input to E.164 (basic). */
const normalizePhone = (raw: string): string => {
	const digits = raw.replace(/[^\d+]/g, "");
	return digits.startsWith("+") ? digits : `+${digits}`;
};

interface ComposeDialogProps {
	accountId: Id<"accounts">;
}

export function ComposeDialog({ accountId }: ComposeDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	// State
	const [phone, setPhone] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Convex
	const getOrCreateContact = useMutation(api.contacts.getOrCreate);
	const getOrCreateConversation = useMutation(api.conversations.getOrCreate);
	const sendTemplateMessage = useAction(api.whatsapp.sendTemplateMessageUI);

	// Reset state when dialog closes
	useEffect(() => {
		if (!open) {
			setPhone("");
			setError(null);
			setSending(false);
		}
	}, [open]);

	const handleSend = async (result: TemplatePickerResult) => {
		if (!phone.trim()) return;

		setSending(true);
		setError(null);

		try {
			const normalized = normalizePhone(phone);
			const waId = normalized.replace(/^\+/, "");

			// 1. Get or create contact
			const contactId = await getOrCreateContact({
				accountId,
				waId,
				phone: normalized,
			});

			// 2. Get or create conversation
			const conversationId = await getOrCreateConversation({
				accountId,
				contactId,
			});

			// 3. Send template
			await sendTemplateMessage({
				accountId,
				conversationId,
				to: normalized,
				templateName: result.template.name,
				templateLanguage: result.template.language,
				components: result.components,
			});

			// 4. Navigate to the new conversation
			setOpen(false);
			router.push(`/dashboard/${accountId}/${conversationId}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send message");
		} finally {
			setSending(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button
					className="h-8 gap-1.5 bg-pons-green text-pons-green-foreground hover:bg-pons-green-bright"
					size="sm"
				>
					<Plus className="h-3.5 w-3.5" />
					<span className="hidden lg:inline">New</span>
				</Button>
			</DialogTrigger>

			<DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="font-display">New Conversation</DialogTitle>
					<DialogDescription>
						Send a template message to start a conversation.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 overflow-y-auto">
					{/* Phone number */}
					<div className="space-y-2">
						<Label htmlFor="compose-phone">Phone number</Label>
						<Input
							autoFocus
							id="compose-phone"
							onChange={(e) => setPhone(e.target.value)}
							placeholder="+49 151 1234 5678"
							type="tel"
							value={phone}
						/>
						<p className="text-muted-foreground text-xs">
							International format with country code
						</p>
					</div>

					{/* Template picker with variables + preview + send */}
					{open && (
						<TemplatePicker
							accountId={accountId}
							error={error}
							onSend={handleSend}
							sending={sending}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
