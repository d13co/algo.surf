import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "src/lib/utils"

// shadcn/ui's Resizable, on react-resizable-panels v4.

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return <ResizablePrimitive.Group data-slot="resizable-panel-group" className={cn("h-full w-full", className)} {...props} />
}

function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

/**
 * The handle between two panels: a gutter, as wide as the gap it stands in for, with a hairline
 * down its middle that lights up when hovered, dragged or focused. In a vertical group (one
 * stacking its panels) the separator's own aria-orientation is horizontal.
 */
function ResizableHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative flex shrink-0 items-center justify-center outline-none",
        "w-3 aria-[orientation=horizontal]:h-3 aria-[orientation=horizontal]:w-auto",
        "after:absolute after:rounded-full after:bg-transparent after:transition-colors",
        "after:inset-y-1 after:w-0.5 aria-[orientation=horizontal]:after:inset-x-1 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:h-0.5 aria-[orientation=horizontal]:after:w-auto",
        "data-[separator=hover]:after:bg-primary/50 focus-visible:after:bg-primary data-[separator=active]:after:bg-primary",
        className
      )}
      {...props}
    />
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
