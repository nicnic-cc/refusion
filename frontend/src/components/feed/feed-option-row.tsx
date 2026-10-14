import type { ReactNode } from "react";

// Two cells of the dialog form grid (label+description, control); the parent
// supplies the grid. `fill` is for text inputs, which stretch to the cell.
export function FeedOptionRow({
  label,
  labelId,
  htmlFor,
  description,
  fill,
  children,
}: {
  label: string;
  labelId?: string;
  htmlFor?: string;
  description?: string;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className="-mb-2 min-w-0 sm:mb-0">
        <label
          id={labelId}
          htmlFor={htmlFor}
          className="block text-sm font-medium"
        >
          {label}
        </label>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div
        className={
          fill
            ? "flex min-w-0 items-center gap-2 justify-self-stretch"
            : "min-w-0 justify-self-start sm:justify-self-end"
        }
      >
        {children}
      </div>
    </>
  );
}
