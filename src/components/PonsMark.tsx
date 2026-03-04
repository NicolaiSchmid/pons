import { cn } from "@/lib/utils";

export function PonsMark({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("shrink-0", className)}
			fill="none"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect
				fill="rgb(253 242 248)"
				height="20"
				rx="6"
				stroke="rgb(251 207 232)"
				strokeWidth="1"
				width="20"
				x="2"
				y="2"
			/>
			<path
				d="M7.75 9.75C7.75 9.06 8.31 8.5 9 8.5H15C15.69 8.5 16.25 9.06 16.25 9.75V13.5C16.25 14.19 15.69 14.75 15 14.75H11.63L9.42 16.42C9.01 16.73 8.42 16.44 8.42 15.93V14.75H9C8.31 14.75 7.75 14.19 7.75 13.5V9.75Z"
				stroke="rgb(236 72 153)"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.6"
			/>
		</svg>
	);
}
