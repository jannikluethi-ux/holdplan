import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-3 transition-colors data-[state=checked]:bg-accent data-[state=checked]:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-foreground shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-foreground" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
