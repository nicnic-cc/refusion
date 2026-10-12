import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TipPayload {
  tip: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  popupClassName?: string;
}

const handle = TooltipPrimitive.createHandle<TipPayload>();

// One popup serves every icon, so a page of icons builds no per-icon tooltip
// state. Rendered once in RootLayout.
export function SharedTooltipRoot() {
  return (
    <TooltipPrimitive.Root handle={handle}>
      {({ payload }) =>
        payload && (
          <TooltipContent side={payload.side} className={payload.popupClassName}>
            {payload.tip}
          </TooltipContent>
        )
      }
    </TooltipPrimitive.Root>
  );
}

type SharedTooltipTriggerProps = Omit<
  TooltipPrimitive.Trigger.Props<TipPayload>,
  "handle" | "payload"
> &
  TipPayload;

// Drop-in for TooltipTrigger + TooltipContent: the content rides along as the
// trigger's payload and the shared popup shows it.
export function SharedTooltipTrigger({
  tip,
  side,
  popupClassName,
  ...props
}: SharedTooltipTriggerProps) {
  return (
    <TooltipTrigger
      handle={handle}
      payload={{ tip, side, popupClassName }}
      {...props}
    />
  );
}
