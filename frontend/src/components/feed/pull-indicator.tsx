import { ArrowDown, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePullStore } from "@/store/pull";

const STATUS_HEIGHT_PX = 36;

interface PullIndicatorProps {
  // The sidebar pane also shows runs no pane started.
  pane: "sidebar" | "list";
  distance: number;
  armed: boolean;
  // Names what a release checks; without it the text says "all feeds".
  scopeName?: string;
  className?: string;
}

export function PullIndicator({
  pane,
  distance,
  armed,
  scopeName,
  className,
}: PullIndicatorProps) {
  const { t } = useI18n();
  const runPane = usePullStore((s) => s.pane);
  const runPhase = usePullStore((s) => s.phase);
  const mine = runPane === pane || (pane === "sidebar" && runPane === null);
  const phase = mine ? runPhase : "idle";
  const done = usePullStore((s) => s.done);
  const total = usePullStore((s) => s.total);
  const newItems = usePullStore((s) => s.newItems);

  const busy = phase === "starting" || phase === "running";
  const showingStatus = phase !== "idle";
  const pulling = !showingStatus && distance > 0;
  const height = showingStatus ? STATUS_HEIGHT_PX : distance;

  let content: React.ReactNode = null;
  if (busy) {
    content = (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        {total > 1
          ? t("pull.progress", { done, total })
          : t("pull.checking")}
      </>
    );
  } else if (phase === "result") {
    content =
      newItems > 0
        ? t(newItems === 1 ? "pull.newArticles.one" : "pull.newArticles.other", {
            count: newItems,
          })
        : t("pull.nothingNew");
  } else if (pulling) {
    content = (
      <>
        <ArrowDown
          className={cn("h-4 w-4 transition-transform", armed && "rotate-180")}
        />
        {armed
          ? scopeName
            ? t("pull.releaseScope", { name: scopeName })
            : t("pull.release")
          : t("pull.hint")}
      </>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ height }}
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 overflow-hidden text-xs text-muted-foreground",
        !pulling && "transition-[height] duration-200",
        className,
      )}
    >
      {content}
    </div>
  );
}
