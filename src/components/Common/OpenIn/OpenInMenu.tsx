import * as React from "react";
import { Dropdown } from "@mui/base/Dropdown";
import { Menu, MenuListboxSlotProps } from "@mui/base/Menu";
import { MenuButton as BaseMenuButton } from "@mui/base/MenuButton";
import { MenuItem as BaseMenuItem } from "@mui/base/MenuItem";
import { network } from "../../../packages/core-sdk/constants";
import { getOpenInOptions } from "./OpenIn";
import { PageType } from "./OpenInBase";
import { CssTransition } from "@mui/base/Transitions";
import { styled } from "@mui/system";
import { alpha } from "@mui/material/styles";
import { PopupContext } from "@mui/base/Unstable_Popup";
import { useHotkeys } from "react-hotkeys-hook";

export default function OpenInMenu({
  pageType,
  id,
}: {
  pageType: PageType;
  id: string;
}): JSX.Element {
  const options = React.useMemo(() => {
    return getOpenInOptions(network, pageType, ['Algo Surf']).map((option) => {
      const url = option.getUrl(network, pageType, id);
      return { name: option.siteName, url };
    });
  }, [pageType, id]);

  // Dropdown open/close state
  const [open, setOpen] = React.useState(false);

  const onHotkey = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useHotkeys("o", onHotkey);

  return (
    <Dropdown
      open={open}
      onOpenChange={(_event, nextOpen) => setOpen(nextOpen)}
    >
      <MenuButton>
        <span className="underline">O</span>pen In...
      </MenuButton>
      <Menu slots={{ listbox: AnimatedListbox }}>
        {options.map((option) => (
          <MenuItem
            key={option.name}
            onClick={(e) => {
              // Only trigger anchor click if not mouse event (keyboard activation)
              if (e.detail === 0) {
                const anchor = e.currentTarget.querySelector("a");
                if (anchor) anchor.click();
              }
              setOpen(false);
            }}
          >
            <a
              href={option.url}
              rel="noopener noreferrer"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                color: "inherit",
                textDecoration: "none",
                padding: 0,
                margin: 0,
              }}
              tabIndex={-1}
            >
              {option.name}
            </a>
          </MenuItem>
        ))}
      </Menu>
    </Dropdown>
  );
}

const Listbox = styled("ul")(
  ({ theme }) => `
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 0.875rem;
  box-sizing: border-box;
  padding: 6px;
  margin: 10px 0;
  min-width: 200px;
  border-radius: 12px;
  overflow: auto;
  outline: 0px;
  background: ${theme.palette.background.default};
  border: 1px solid ${alpha(theme.palette.primary.main, 0.5)};
  color: ${theme.palette.primary.main};
  z-index: 1;

  .closed & {
    opacity: 0;
    transform: scale(0.95, 0.8);
    transition: opacity 200ms ease-in, transform 200ms ease-in;
  }
  
  .open & {
    opacity: 1;
    transform: scale(1, 1);
    transition: opacity 100ms ease-out, transform 100ms cubic-bezier(0.43, 0.29, 0.37, 1.48);
  }

  .placement-top & {
    transform-origin: bottom;
  }

  .placement-bottom & {
    transform-origin: top;
  }
  `,
);

const AnimatedListbox = React.forwardRef(function AnimatedListbox(
  props: MenuListboxSlotProps,
  ref: React.ForwardedRef<HTMLUListElement>,
) {
  const { ownerState, ...other } = props;
  const popupContext = React.useContext(PopupContext);

  if (popupContext == null) {
    throw new Error(
      "The `AnimatedListbox` component cannot be rendered outside a `Popup` component",
    );
  }

  const verticalPlacement = popupContext.placement.split("-")[0];

  return (
    <CssTransition
      className={`placement-${verticalPlacement}`}
      enterClassName="open"
      exitClassName="closed"
    >
      <Listbox {...other} ref={ref} />
    </CssTransition>
  );
});

const MenuItem = styled(BaseMenuItem)(
  ({ theme }) => `
  list-style: none;
  padding: 8px;
  border-radius: 8px;
  cursor: default;
  user-select: none;

  &:last-of-type {
    border-bottom: none;
  }

  &:focus {
    outline: 1px solid ${theme.palette.primary.main};
    background-color: ${theme.palette.background.default};
    color: ${theme.palette.primary.main};
  }
  `,
);

const MenuButton = styled(BaseMenuButton)(
  ({ theme }) => `
  font-weight: 500;
  font-size: 0.875rem;
  line-height: 1.8;
  padding: 5px 15px;
  border-radius: 10px;
  transition: all 150ms ease;
  cursor: pointer;
  background: ${theme.palette.background.default};
  border: 1px solid ${alpha(theme.palette.primary.main, 0.5)};
  color: ${theme.palette.primary.main};
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

  &:hover {
    background: ${alpha(theme.palette.primary.main, 0.08)};
    border-color: ${theme.palette.primary.main};
    color: ${theme.palette.primary.main};
  }

  &:active {
    background: ${alpha(theme.palette.primary.main, 0.16)};
  }

  &:focus-visible {
    box-shadow: 0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)};
    outline: none;
  }
`,
);
