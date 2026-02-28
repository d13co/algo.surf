import React from "react";
import { cn } from "src/lib/utils";

export type ChipVariant = "default" | "success" | "warning" | "tinyman";

const variantClasses: Record<ChipVariant, string> = {
  default:  "border-yellow-500 text-yellow-500",
  success:  "border-primary text-primary",
  warning:  "border-yellow-500 text-yellow-500",
  tinyman:  "bg-[#f1fe68] text-[#0e0b1c] border-transparent",
};

export function Chip({
  children,
  className,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: ChipVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs border rounded px-2.5 py-0.5",
        variantClasses[variant],
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </span>
  );
}

export function BadgesRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap mt-2 mb-4", className)}>
      {children}
    </div>
  );
}
