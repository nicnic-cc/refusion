import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Styled tooltip around an existing control, so its own markup and classes
// stay untouched (TooltipButton would restyle it as a Button).
export function WithTooltip({
  label,
  render,
  children,
  side,
}: {
  label: ReactNode;
  render: ReactElement;
  children?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
