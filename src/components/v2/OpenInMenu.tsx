import * as React from "react";
import { openInNetwork } from "src/packages/core-sdk/constants";
import { getOpenInEntries, PageType } from "@d13co/open-in";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "src/components/v2/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";

export default function OpenInMenu({
  pageType,
  id,
}: {
  pageType: PageType;
  id: string;
}): JSX.Element {
  const options = React.useMemo(() => {
    return getOpenInEntries(openInNetwork, pageType, {
      excludeSiteNames: ["Algo Surf"],
    }).map((option) => {
      const url = option.getUrl(openInNetwork, pageType, id);
      return { name: option.siteName, url };
    });
  }, [pageType, id]);

  const [open, setOpen] = React.useState(false);

  const onHotkey = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useHotkeys("o", onHotkey);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border text-primary hover:bg-primary/10"
        >
          <span><span className="underline">O</span>pen In...</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52 bg-background border-border text-primary">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.name}
            className="cursor-pointer focus:bg-primary/10 focus:text-primary"
            onSelect={(e) => {
              // prevent menu close on ctrl/meta click
            }}
            asChild
          >
            <a
              href={option.url}
              rel="noopener noreferrer"
              className="block w-full no-underline text-inherit"
            >
              {option.name}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
