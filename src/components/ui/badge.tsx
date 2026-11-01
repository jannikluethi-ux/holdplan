import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]",
  {
    variants: {
      variant: {
        default: "bg-surface-3 text-muted",
        ok: "bg-ok/15 text-ok",
        warn: "bg-warn/15 text-warn",
        fail: "bg-fail/15 text-fail",
        accent: "bg-accent/15 text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
