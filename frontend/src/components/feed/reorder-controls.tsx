import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  EllipsisVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TranslationKey } from "@/lib/i18n";
import type { Move } from "@/lib/reorder";

interface ReorderControlsProps {
  index: number;
  count: number;
  onMove: (move: Move) => void;
  t: (key: TranslationKey) => string;
}

const buttonClass =
  "rounded p-1.5 hover:bg-accent disabled:pointer-events-none disabled:opacity-30 sm:p-1";

// Disabled buttons get no pointer events, so a wrapper opens the tooltip.
function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      {disabled ? (
        <TooltipTrigger render={<span className="inline-flex" />}>
          <button
            type="button"
            disabled
            className={buttonClass}
            aria-label={label}
          >
            {children}
          </button>
        </TooltipTrigger>
      ) : (
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onClick}
              className={buttonClass}
              aria-label={label}
            />
          }
        >
          {children}
        </TooltipTrigger>
      )}
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ReorderControls({
  index,
  count,
  onMove,
  t,
}: ReorderControlsProps) {
  const atTop = index === 0;
  const atBottom = index === count - 1;

  return (
    <div className="flex shrink-0 items-center">
      <ReorderButton
        label={t("feeds.reorder.moveUp")}
        disabled={atTop}
        onClick={() => onMove("up")}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </ReorderButton>
      <ReorderButton
        label={t("feeds.reorder.moveDown")}
        disabled={atBottom}
        onClick={() => onMove("down")}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </ReorderButton>
      {count < 2 ? (
        <ReorderButton label={t("feeds.reorder.move")} disabled>
          <EllipsisVertical className="h-3.5 w-3.5" />
        </ReorderButton>
      ) : (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={t("feeds.reorder.move")}
                    />
                  }
                />
              }
            >
              <EllipsisVertical className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("feeds.reorder.move")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem disabled={atTop} onClick={() => onMove("top")}>
              <ArrowUpToLine className="mr-2 h-4 w-4" />
              {t("feeds.reorder.moveTop")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={atBottom}
              onClick={() => onMove("bottom")}
            >
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              {t("feeds.reorder.moveBottom")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
