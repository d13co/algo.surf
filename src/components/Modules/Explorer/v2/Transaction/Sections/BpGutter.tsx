import React from "react";
import { cn } from "src/lib/utils";

/**
 * A line's breakpoint gutter and the cell beside it (its hit count or line
 * number) as one click target, spanning those two columns of the line's grid.
 * Hovering the line (its row is a `group/row`) shows a faint dot where the
 * breakpoint goes, so the gutter can be found before it is hovered itself.
 * The cell beside the dot is the button's content, which its label hides
 * from screen readers and its title from the row's tooltip, so `hits` and
 * `note` say again what that cell and the row told.
 */
export function BpGutter({ on, label, hits, note, onClick, small, focusable, className, children }: {
  on: boolean;
  label: string;
  /** How often the line ran, the cell's hit count: told in the label and the tooltip. */
  hits?: number;
  /** For the tooltip, before what a click does: what the row's own tooltip says of the line. */
  note?: string;
  onClick: () => void;
  /** A smaller dot, for the denser rows. */
  small?: boolean;
  /** In the tab order; the debugger's own gutters are not, as F9 sets one from the keyboard. */
  focusable?: boolean;
  /** For the cell beside the dot. */
  className?: string;
  children?: React.ReactNode;
}) {
  const ran = hits === undefined ? undefined : hits ? `Ran ${hits} ${hits === 1 ? "time" : "times"}` : "Never ran";
  const click = on ? "Click to remove the breakpoint" : "Click for a breakpoint here";
  return (
    <button
      type="button"
      tabIndex={focusable ? undefined : -1}
      aria-label={ran ? `${label} (${ran.toLowerCase()})` : label}
      title={[note, ran && `${ran}.`, click].filter(Boolean).join("\n")}
      className="group col-span-2 grid cursor-pointer grid-cols-subgrid items-center"
      onClick={onClick}
      // A double-click toggles twice, and must not also run to the line as the row's double-click does.
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* The gutter's own hover wins over the line's (`!`): both variants weigh the same. */}
      <span className="flex items-center justify-center">
        <span className={cn("rounded-full", small ? "h-2 w-2" : "h-2.5 w-2.5", on ? "bg-red-500" : "group-hover/row:bg-red-500/15 group-hover:bg-red-500/50!")} />
      </span>
      <span className={className}>{children}</span>
    </button>
  );
}
