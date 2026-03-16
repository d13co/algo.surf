import React, { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import Copyable from "src/components/v2/Copyable";
import JsonViewer from "src/components/v2/JsonViewer";
import OpenInMenu from "src/components/v2/OpenInMenu";
import { PageType } from "@d13co/open-in";

interface RecordPageHeaderProps {
  label: string;
  id: React.ReactNode;
  copyValue: string | number;
  truncate?: boolean;
  jsonViewer: {
    obj: () => any;
    filename?: string;
    title?: string;
  };
  openIn?: {
    pageType: PageType;
    id: string | undefined;
  };
  /** Extra elements rendered between the title group and the action buttons (e.g. Block's prev/next nav) */
  children?: React.ReactNode;
  /** Whether to apply sm:flex-nowrap (default true) */
  nowrap?: boolean;
}

export default function RecordPageHeader({
  label,
  id,
  copyValue,
  truncate,
  jsonViewer,
  openIn,
  children,
  nowrap = true,
}: RecordPageHeaderProps): JSX.Element {
  const copyRef = useRef<HTMLSpanElement>(null);

  useHotkeys("c", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    copyRef.current?.querySelector("button")?.click();
  });

  return (
    <div className={`flex flex-wrap ${nowrap ? "sm:flex-nowrap " : ""}items-center justify-between gap-2 text-xl`}>
      <div className="group flex items-center gap-2 min-w-0">
        <span className="shrink-0">{label}</span>
        <span className={truncate ? "truncate min-w-0" : ""}>{id}</span>
        <span ref={copyRef} className="-translate-y-[1px]">
          <Copyable className="opacity-60 group-hover:opacity-100" value={copyValue} />
        </span>
      </div>
      {children}
      <div className={`flex items-center gap-2.5 shrink-0 ${children ? "ml-auto md:ml-0" : "ml-auto"}`}>
        <JsonViewer {...jsonViewer} />
        {openIn && <OpenInMenu pageType={openIn.pageType} id={openIn.id as string} />}
      </div>
    </div>
  );
}
