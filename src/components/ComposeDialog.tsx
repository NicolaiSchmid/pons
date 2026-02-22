"use client";

import { useAction, useMutation } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	FileText,
	Loader2,
	Plus,
	Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Template } from "../../convex/whatsapp";

// ── Helpers ──

/** Match `{{1}}`, `{{name}}`, `{{city}}`, etc. */
const VAR_PATTERN = /\{\{(\w+)\}\}/g;

/** A variable with its key and the component type it belongs to. */
type TemplateVariable = { key: string; componentType: string };

/** Extract variables from all text components, tracking which component they belong to. */
const extractVariables = (template: Template): TemplateVariable[] => {
	const seen = new Set<string>();
	const result: TemplateVariable[] = [];
	for (const c of template.components) {
		if (!c.text) continue;
		const compType = c.type.toLowerCase();
		for (const m of c.text.matchAll(VAR_PATTERN)) {
			const key = m[1];
			if (key && !seen.has(key)) {
				seen.add(key);
				result.push({ key, componentType: compType });
			}
		}
	}
	return result;
};

/**
 * Build the Meta API `components` array from variables and their values.
 * Groups parameters by component type (header, body, etc.).
 * Named params (e.g. {{name}}) get a `parameter_name` field;
 * numeric params (e.g. {{1}}) are positional only.
 */
const buildMetaComponents = (
	variables: TemplateVariable[],
	values: Record<string, string>,
): Array<Record<string, unknown>> => {
	const grouped = new Map<string, Array<Record<string, string>>>();
	for (const v of variables) {
		const params = grouped.get(v.componentType) ?? [];
		const isNamed = !/^\d+$/.test(v.key);
		const param: Record<string, string> = {
			type: "text",
			text: values[v.key]?.trim() ?? "",
		};
		if (isNamed) {
			param.parameter_name = v.key;
		}
		params.push(param);
		grouped.set(v.componentType, params);
	}
	return [...grouped.entries()].map(([type, parameters]) => ({
		type,
		parameters,
	}));
};

/** Replace `{{key}}` placeholders with provided values for preview. */
const renderPreview = (text: string, values: Record<string, string>): string =>
	text.replace(VAR_PATTERN, (match, key: string) => {
		const val = values[key]?.trim();
		return val || match;
	});

/** Normalize phone input to E.164 (basic). */
const normalizePhone = (raw: string): string => {
	const digits = raw.replace(/[^\d+]/g, "");
	return digits.startsWith("+") ? digits : `+${digits}`;
};

// ── Component ──

interface ComposeDialogProps {
	accountId: Id<"accounts">;
}

export function ComposeDialog({ accountId }: ComposeDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	// State
	const [phone, setPhone] = useState("");
	const [templates, setTemplates] = useState<Template[] | null>(null);
	const [templatesLoading, setTemplatesLoading] = useState(false);
	const [templatesError, setTemplatesError] = useState<string | null>(null);
	const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
		null,
	);
	const [variableValues, setVariableValues] = useState<Record<string, string>>(
		{},
	);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Convex
	const fetchTemplates = useAction(api.whatsapp.fetchTemplatesUI);
	const getOrCreateContact = useMutation(api.contacts.getOrCreate);
	const getOrCreateConversation = useMutation(api.conversations.getOrCreate);
	const sendTemplateMessage = useAction(api.whatsapp.sendTemplateMessageUI);

	// Derived
	const approvedTemplates = useMemo(
		() => templates?.filter((t) => t.status === "approved") ?? [],
		[templates],
	);

	const variables = useMemo(
		() => (selectedTemplate ? extractVariables(selectedTemplate) : []),
		[selectedTemplate],
	);

	const bodyText = useMemo(() => {
		if (!selectedTemplate) return "";
		const body = selectedTemplate.components.find(
			(c) => c.type === "BODY" || c.type === "body",
		);
		return body?.text ?? "";
	}, [selectedTemplate]);

	const previewText = useMemo(
		() => renderPreview(bodyText, variableValues),
		[bodyText, variableValues],
	);

	const isValid = useMemo(() => {
		if (!phone.trim()) return false;
		if (!selectedTemplate) return false;
		// All variables must be filled
		return variables.every((v) => variableValues[v.key]?.trim());
	}, [phone, selectedTemplate, variables, variableValues]);

	// Load templates when dialog opens
	const loadTemplates = useCallback(() => {
		setTemplatesLoading(true);
		setTemplatesError(null);
		fetchTemplates({ accountId })
			.then(setTemplates)
			.catch((err) =>
				setTemplatesError(
					err instanceof Error ? err.message : "Failed to load templates",
				),
			)
			.finally(() => setTemplatesLoading(false));
	}, [fetchTemplates, accountId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: load on open
	useEffect(() => {
		if (open && !templates) {
			loadTemplates();
		}
	}, [open]);

	// Reset state when dialog closes
	useEffect(() => {
		if (!open) {
			setPhone("");
			setSelectedTemplate(null);
			setVariableValues({});
			setError(null);
			setSending(false);
		}
	}, [open]);

	// Reset variable values when template changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset vars on template change
	useEffect(() => {
		setVariableValues({});
	}, [selectedTemplate]);

	const handleSend = async () => {
		if (!selectedTemplate || !isValid) return;

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

			// 3. Build components array for Meta API (grouped by component type)
			const metaComponents =
				variables.length > 0
					? buildMetaComponents(variables, variableValues)
					: undefined;

			// 4. Send template
			await sendTemplateMessage({
				accountId,
				conversationId,
				to: normalized,
				templateName: selectedTemplate.name,
				templateLanguage: selectedTemplate.language,
				components: metaComponents,
			});

			// 5. Navigate to the new conversation
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

					{/* Template picker */}
					<div className="space-y-2">
						<Label>Template</Label>
						{templatesLoading ? (
							<div className="flex items-center gap-2 py-3">
								<Loader2 className="h-4 w-4 animate-spin text-pons-green" />
								<span className="text-muted-foreground text-sm">
									Loading templates...
								</span>
							</div>
						) : templatesError ? (
							<div className="flex items-center gap-2 py-3">
								<AlertTriangle className="h-4 w-4 text-destructive" />
								<span className="text-destructive text-sm">
									{templatesError}
								</span>
								<Button
									className="ml-auto"
									onClick={loadTemplates}
									size="sm"
									variant="ghost"
								>
									Retry
								</Button>
							</div>
						) : approvedTemplates.length === 0 ? (
							<p className="py-3 text-muted-foreground text-sm">
								No approved templates.{" "}
								<a
									className="text-pons-green underline hover:text-pons-green-bright"
									href="https://business.facebook.com/latest/whatsapp_manager/message_templates"
									rel="noopener noreferrer"
									target="_blank"
								>
									Create one in Meta
								</a>
							</p>
						) : (
							<div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
								{approvedTemplates.map((t) => {
									const isSelected = selectedTemplate?.id === t.id;
									const body = t.components.find(
										(c) => c.type === "BODY" || c.type === "body",
									);
									return (
										<button
											className={cn(
												"flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition",
												isSelected
													? "bg-pons-green/10 ring-1 ring-pons-green/30"
													: "hover:bg-muted/50",
											)}
											key={t.id}
											onClick={() => setSelectedTemplate(t)}
											type="button"
										>
											<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
												{isSelected ? (
													<CheckCircle2 className="h-3.5 w-3.5 text-pons-green" />
												) : (
													<FileText className="h-3 w-3 text-muted-foreground" />
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-foreground text-sm">
													{t.name}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													{t.language} ·{" "}
													{body?.text?.slice(0, 80) ?? "No body text"}
												</p>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* Variable inputs */}
					{selectedTemplate && variables.length > 0 && (
						<div className="space-y-3">
							<Label>Template variables</Label>
							{variables.map((v) => (
								<div className="space-y-1" key={v.key}>
									<Label
										className="text-muted-foreground text-xs"
										htmlFor={`var-${v.key}`}
									>
										{`{{${v.key}}}`}
									</Label>
									<Input
										id={`var-${v.key}`}
										onChange={(e) =>
											setVariableValues((prev) => ({
												...prev,
												[v.key]: e.target.value,
											}))
										}
										placeholder={`Value for {{${v.key}}}`}
										value={variableValues[v.key] ?? ""}
									/>
								</div>
							))}
						</div>
					)}

					{/* Preview */}
					{selectedTemplate && bodyText && (
						<div className="space-y-1.5">
							<Label className="text-muted-foreground text-xs">Preview</Label>
							<div className="rounded-md border bg-muted/30 p-3">
								<p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
									{previewText}
								</p>
							</div>
						</div>
					)}

					{/* Error */}
					{error && (
						<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						className="gap-2 bg-pons-green text-pons-green-foreground hover:bg-pons-green-bright"
						disabled={!isValid || sending}
						onClick={handleSend}
					>
						{sending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
						Send Template
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
