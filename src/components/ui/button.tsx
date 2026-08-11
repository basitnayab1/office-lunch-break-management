import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "secondary" | "ghost" | "success";
type Size = "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] shadow-[0_10px_24px_rgba(15,106,90,0.28)]",
  danger:
    "bg-[var(--danger)] text-white hover:brightness-95 shadow-[0_10px_24px_rgba(180,35,24,0.25)]",
  secondary:
    "bg-white text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--bg)]",
  ghost: "bg-transparent text-[var(--ink-muted)] hover:bg-black/5",
  success:
    "bg-[var(--ok)] text-white hover:brightness-95 shadow-[0_10px_24px_rgba(22,121,76,0.25)]",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
  xl: "h-20 px-8 text-xl font-semibold rounded-[22px] tracking-wide",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
