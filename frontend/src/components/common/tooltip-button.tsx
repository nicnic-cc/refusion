import type { MouseEvent, ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { SharedTooltipTrigger } from "@/components/common/shared-tooltip";
import { cn } from "@/lib/utils";

type TooltipButtonProps = VariantProps<typeof buttonVariants> & {
  label: string;
  // Shown after the label in the tooltip; not part of the aria-label. Main key
  // only (the ? dialog lists alternatives); none on article-row hover buttons,
  // since keys act on the selected article, not the hovered row.
  shortcut?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pressed?: boolean;
  // Renders an external link styled as a button; ignored while disabled.
  href?: string;
  side?: "top" | "bottom" | "left" | "right";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
};

// Icon-only button whose label shows as a styled tooltip and the aria-label,
// replacing the native title attribute.
export function TooltipButton({
  label,
  shortcut,
  children,
  className,
  disabled,
  pressed,
  href,
  side,
  onClick,
  variant = "outline",
  size = "icon-sm",
}: TooltipButtonProps) {
  const control = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={onClick}
    />
  ) : (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(className, pressed && "bg-accent text-accent-foreground")}
      onClick={onClick}
    />
  );

  const tip = (
    <>
      {label}
      {shortcut && (
        <kbd className="ml-2 font-mono text-[11px] opacity-70">{shortcut}</kbd>
      )}
    </>
  );

  return disabled ? (
    // Disabled buttons get no pointer events, so a wrapper opens the tooltip.
    <SharedTooltipTrigger
      tip={tip}
      side={side}
      render={<span className="inline-flex" />}
    >
      <Button
        variant={variant}
        size={size}
        disabled
        aria-label={label}
        className={className}
      >
        {children}
      </Button>
    </SharedTooltipTrigger>
  ) : (
    <SharedTooltipTrigger tip={tip} side={side} render={control}>
      {children}
    </SharedTooltipTrigger>
  );
}
