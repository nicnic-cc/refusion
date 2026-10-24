import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  apiErrorMessage,
  feedFilterAPI,
  globalFilterAPI,
  groupFilterAPI,
} from "@/lib/api";
import type {
  Feed,
  FeedFilter,
  FilterAction,
  FilterJoin,
  FilterOperator,
  FilterPreview,
  FilterRule,
  FilterTrigger,
  GlobalFilter,
  GlobalPreview,
  Group,
  GroupFilter,
} from "@/lib/api";
import {
  OPERATORS,
  OPERATOR_LABELS,
  TRIGGERS,
  TRIGGER_LABELS,
  buildRule,
  isConditionComplete,
  isMediaTrigger,
  parseConditionError,
  wholeWordsApplies,
  type DraftCondition,
  type DraftRule,
} from "@/lib/feed-filter";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useDeleteFeedFilter,
  useDeleteGroupFilter,
  useSaveFeedFilter,
  useSaveGroupFilter,
} from "@/queries/feed-filters";
import {
  useDeleteGlobalFilter,
  useSaveGlobalFilter,
} from "@/queries/global-filter";

const PREVIEW_DEBOUNCE_MS = 300;

const PREVIEW_SUMMARY = {
  feed: "feedFilter.preview.summary",
  group: "groupFilter.preview.summary",
  global: "globalFilter.preview.summary",
} as const satisfies Record<FilterTarget["kind"], TranslationKey>;

interface RowError {
  index: number | null;
  message: string;
}

interface PreviewState {
  // JSON of the rule this result belongs to; a mismatch means "still loading".
  key: string | null;
  data: FilterPreview | GlobalPreview | null;
  error: RowError | null;
}

let nextConditionKey = 0;

function newCondition(): DraftCondition {
  return {
    key: ++nextConditionKey,
    trigger: "title",
    operator: "contains",
    value: "",
  };
}

function initialDraft(filter?: FilterRule): DraftRule {
  if (!filter) {
    return {
      action: "remove",
      join: "and",
      wholeWords: false,
      conditions: [newCondition()],
    };
  }
  return {
    action: filter.action,
    join: filter.join,
    wholeWords: filter.whole_words,
    conditions: filter.conditions.map((c) => ({
      ...newCondition(),
      trigger: c.trigger,
      operator: c.operator ?? "contains",
      value: c.value ?? "",
    })),
  };
}

// What the dialog edits. The global filter is Remove only.
export type FilterTarget =
  | { kind: "feed"; feed: Feed }
  | { kind: "group"; group: Group }
  | { kind: "global" };

type AnyFilter = FeedFilter | GroupFilter | GlobalFilter;

type FilterDialogProps = {
  filter?: AnyFilter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `feed` is shorthand for a feed target.
} & ({ target: FilterTarget } | { feed: Feed });

export function FilterDialog(props: FilterDialogProps) {
  const { filter, open, onOpenChange } = props;
  const target: FilterTarget =
    "target" in props ? props.target : { kind: "feed", feed: props.feed };
  const { t } = useI18n();
  const title = {
    feed: t("feedFilter.title"),
    group: t("groupFilter.title"),
    global: t("globalFilter.title"),
  }[target.kind];
  const description =
    target.kind === "feed"
      ? target.feed.name
      : target.kind === "group"
        ? target.group.name
        : t("globalFilter.description");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(var(--fork-dvh)_*_0.9_-_var(--fork-inset-y))] w-full max-w-[680px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]"
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="truncate">
            {description}
          </DialogDescription>
        </DialogHeader>
        <FilterForm
          target={target}
          filter={filter}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// The id the preview, save and delete calls take; null for the global filter.
function targetId(target: FilterTarget): number | null {
  if (target.kind === "feed") return target.feed.id;
  if (target.kind === "group") return target.group.id;
  return null;
}

function FilterForm({
  target,
  filter,
  onClose,
}: {
  target: FilterTarget;
  filter?: AnyFilter;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const saveFeed = useSaveFeedFilter();
  const deleteFeed = useDeleteFeedFilter();
  const saveGroup = useSaveGroupFilter();
  const deleteGroup = useDeleteGroupFilter();
  const saveGlobal = useSaveGlobalFilter();
  const deleteGlobal = useDeleteGlobalFilter();
  const kind = target.kind;
  const id = targetId(target);
  const saveMutation = { feed: saveFeed, group: saveGroup, global: saveGlobal }[
    kind
  ];
  const deleteMutation = {
    feed: deleteFeed,
    group: deleteGroup,
    global: deleteGlobal,
  }[kind];
  // Folder and global saves re-check many feeds, so the button says so.
  const slowSave = kind !== "feed";
  const [draft, setDraft] = useState(() => initialDraft(filter));
  const [saveError, setSaveError] = useState<RowError | null>(null);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    key: null,
    data: null,
    error: null,
  });

  const edit = (fn: (d: DraftRule) => DraftRule) => {
    setDraft(fn);
    setSaveError(null);
  };
  const editCondition = (key: number, patch: Partial<DraftCondition>) =>
    edit((d) => ({
      ...d,
      conditions: d.conditions.map((c) =>
        c.key === key ? { ...c, ...patch } : c,
      ),
    }));

  const ready = draft.conditions.every(isConditionComplete);
  const rule = useMemo(() => buildRule(draft), [draft]);
  const ruleKey = JSON.stringify(rule);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      (kind === "feed" && id !== null
        ? feedFilterAPI.preview(id, rule, controller.signal)
        : kind === "group" && id !== null
          ? groupFilterAPI.preview(id, rule, controller.signal)
          : globalFilterAPI.preview(rule, controller.signal)
      )
        .then((res) => {
          setPreview({ key: ruleKey, data: res.data ?? null, error: null });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setPreview((prev) => ({
            ...prev,
            key: ruleKey,
            error: parseConditionError(
              apiErrorMessage(err, t("feedFilter.error.requestFailed")),
            ),
          }));
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, rule, ruleKey, kind, id, t]);

  const previewCurrent = preview.key === ruleKey;
  const loading = ready && !previewCurrent;
  const previewError = ready && previewCurrent ? preview.error : null;

  const rowError = (index: number): string | null =>
    (saveError?.index === index ? saveError.message : null) ??
    (previewError?.index === index ? previewError.message : null);
  const formErrors = [saveError, previewError]
    .filter(
      (e): e is RowError =>
        e !== null && (e.index === null || e.index >= draft.conditions.length),
    )
    .map((e) => e.message);

  const handleSave = async () => {
    try {
      // Saving keeps the row's on/off state; only the switch changes it.
      const body = { ...rule, enabled: filter?.enabled ?? true };
      if (target.kind === "feed") {
        await saveFeed.mutateAsync({ feedId: target.feed.id, rule: body });
        toast.success(t("feedFilter.toast.saved"));
      } else if (target.kind === "group") {
        const res = await saveGroup.mutateAsync({
          groupId: target.group.id,
          rule: body,
        });
        toast.success(
          t("groupFilter.toast.saved", { count: res.data?.hidden_total ?? 0 }),
        );
      } else {
        const res = await saveGlobal.mutateAsync(body);
        toast.success(
          t("globalFilter.toast.saved", { count: res.data?.hidden_total ?? 0 }),
        );
      }
      onClose();
    } catch (err) {
      setSaveError(
        parseConditionError(
          apiErrorMessage(err, t("feedFilter.error.requestFailed")),
        ),
      );
    }
  };

  const handleDelete = async () => {
    try {
      if (target.kind === "feed") await deleteFeed.mutateAsync(target.feed.id);
      else if (target.kind === "group")
        await deleteGroup.mutateAsync(target.group.id);
      else await deleteGlobal.mutateAsync();
      toast.success(t("feedFilter.toast.deleted"));
      onClose();
    } catch {
      toast.error(t("feedFilter.toast.deleteFailed"));
    }
  };

  const busy = saveMutation.isPending || deleteMutation.isPending;
  const joinItems = [
    { value: "and", label: t("feedFilter.join.and") },
    { value: "or", label: t("feedFilter.join.or") },
  ];
  const triggerItems = TRIGGERS.map((v) => ({
    value: v,
    label: t(TRIGGER_LABELS[v]),
  }));
  const operatorItems = OPERATORS.map((v) => ({
    value: v,
    label: t(OPERATOR_LABELS[v]),
  }));
  const shownItems = (preview.data?.items ?? []).filter(
    (item) => !onlyHidden || item.hidden,
  );

  return (
    <>
      <div className="space-y-5 overflow-y-auto p-5">
        {kind !== "global" && (
          <Tabs
            value={draft.action}
            onValueChange={(v) =>
              edit((d) => ({ ...d, action: v as FilterAction }))
            }
          >
            <TabsList>
              <TabsTrigger value="remove">
                {t("feedFilter.action.remove")}
              </TabsTrigger>
              <TabsTrigger value="keep">
                {t("feedFilter.action.keep")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="space-y-3">
          {draft.conditions.map((c, i) => {
            const media = isMediaTrigger(c.trigger);
            const error = rowError(i);
            return (
              <div key={c.key} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-16 shrink-0 text-sm text-muted-foreground">
                    {i === 0 && t("feedFilter.if")}
                    {i === 1 && (
                      <Select
                        items={joinItems}
                        value={draft.join}
                        onValueChange={(v) =>
                          v &&
                          edit((d) => ({ ...d, join: v as FilterJoin }))
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={t("feedFilter.field.join")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {joinItems.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {i > 1 && joinItems.find((o) => o.value === draft.join)?.label}
                  </div>
                  <Select
                    items={triggerItems}
                    value={c.trigger}
                    onValueChange={(v) =>
                      v && editCondition(c.key, { trigger: v as FilterTrigger })
                    }
                  >
                    <SelectTrigger aria-label={t("feedFilter.field.trigger")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {triggerItems.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!media && (
                    <>
                      <Select
                        items={operatorItems}
                        value={c.operator}
                        onValueChange={(v) =>
                          v &&
                          editCondition(c.key, {
                            operator: v as FilterOperator,
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={t("feedFilter.field.operator")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operatorItems.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={c.value}
                        onChange={(e) =>
                          editCondition(c.key, { value: e.target.value })
                        }
                        aria-label={t("feedFilter.field.value")}
                        aria-invalid={error !== null}
                        className="h-9 min-w-32 flex-1"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </>
                  )}
                  {i > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      aria-label={t("feedFilter.removeCondition")}
                      onClick={() =>
                        edit((d) => ({
                          ...d,
                          conditions: d.conditions.filter(
                            (x) => x.key !== c.key,
                          ),
                        }))
                      }
                    >
                      <X className="text-muted-foreground" />
                    </Button>
                  ) : (
                    <span className="ml-auto size-8 max-md:size-11" />
                  )}
                </div>
                {error && (
                  <p className="pl-[72px] text-xs text-destructive">{error}</p>
                )}
              </div>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((d) => ({
                ...d,
                conditions: [...d.conditions, newCondition()],
              }))
            }
          >
            <Plus />
            {t("feedFilter.addCondition")}
          </Button>
        </div>

        <div className="space-y-2">
          <Checkbox
            checked={draft.wholeWords}
            disabled={!wholeWordsApplies(draft.conditions)}
            onChange={(wholeWords) => edit((d) => ({ ...d, wholeWords }))}
            label={t("feedFilter.wholeWords")}
          />
          <p className="text-xs text-muted-foreground">
            {t("feedFilter.caseNote")}
          </p>
        </div>

        {formErrors.map((message) => (
          <p key={message} className="text-xs text-destructive">
            {message}
          </p>
        ))}

        <div className="space-y-2 border-t pt-4">
          {!ready ? (
            <p className="text-[13px] text-muted-foreground">
              {t("feedFilter.preview.incomplete")}
            </p>
          ) : (
            preview.data &&
            !previewError && (
              <div
                className={cn(
                  "space-y-2 transition-opacity",
                  loading && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">
                    {t(
                      PREVIEW_SUMMARY[kind],
                      {
                        hidden: preview.data.hidden,
                        checked: preview.data.checked,
                      },
                    )}
                  </p>
                  <Checkbox
                    checked={onlyHidden}
                    onChange={setOnlyHidden}
                    label={t("feedFilter.preview.onlyRemoved")}
                  />
                </div>
                {"global_hidden" in preview.data &&
                  preview.data.global_hidden > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("feedFilter.preview.globalHidden", {
                        count: preview.data.global_hidden,
                      })}
                    </p>
                  )}
                <ul className="max-h-56 divide-y divide-border/50 overflow-y-auto rounded-md border">
                  {shownItems.length === 0 && (
                    <li className="px-3 py-2 text-xs text-muted-foreground">
                      {t("feedFilter.preview.none")}
                    </li>
                  )}
                  {shownItems.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-[13px]",
                        item.hidden &&
                          "text-muted-foreground line-through opacity-60",
                        "global_hidden" in item &&
                          item.global_hidden &&
                          "text-muted-foreground opacity-60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.title || t("feedFilter.preview.untitled")}
                      </span>
                      {"feed_name" in item && (
                        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                          {item.feed_name}
                        </span>
                      )}
                      {"global_hidden" in item && item.global_hidden && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t("feedFilter.preview.globalHiddenTag")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
        {filter ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 />
            {t("feedFilter.delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!ready || busy} onClick={handleSave}>
            {slowSave && saveMutation.isPending
              ? t("globalFilter.applying")
              : t("feedFilter.save")}
          </Button>
        </div>
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("feedFilter.deleteConfirm.title")}</DialogTitle>
            <DialogDescription>
              {target.kind === "feed"
                ? t("feedFilter.deleteConfirm.description", {
                    name: target.feed.name,
                  })
                : target.kind === "group"
                  ? t("groupFilter.deleteConfirm.description", {
                      name: target.group.name,
                    })
                  : t("globalFilter.deleteConfirm.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t("common.deleting")
                : t("feedFilter.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// No ui/checkbox in the shadcn set; a native input keeps keyboard and a11y.
function Checkbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex w-fit items-center gap-2 text-[13px] max-md:min-h-11",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
