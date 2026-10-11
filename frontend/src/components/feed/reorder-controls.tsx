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
      <button
        type="button"
        onClick={() => onMove("up")}
        disabled={atTop}
        className={buttonClass}
        aria-label={t("feeds.reorder.moveUp")}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onMove("down")}
        disabled={atBottom}
        className={buttonClass}
        aria-label={t("feeds.reorder.moveDown")}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={buttonClass}
              aria-label={t("feeds.reorder.move")}
            />
          }
          disabled={count < 2}
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
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
    </div>
  );
}
