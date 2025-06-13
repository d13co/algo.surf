import { useCallback } from "react";
import { IconButton } from "@mui/material";
import Link from "../Common/Links/Link";
import { useSearchParams } from "react-router-dom";
import { theme, shadedWarningClr, nfdColor } from "../../../../theme/index";
import CloseIcon from "@mui/icons-material/Close";
import "./Dym.scss";
import { ShortcutOutlined } from "@mui/icons-material";
import { ellipseString } from "../../../../packages/core-sdk/utils";
import LinkToAccount from "../Common/Links/LinkToAccount";

interface DymProps {
  nfd: string;
  accounts: string[];
}

const warningColor = theme.palette.warning.main;

export default function DymNFD({ nfd, accounts }: DymProps): JSX.Element {
  const [_, setSearchParams] = useSearchParams();

  const dismiss = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return (
    <div
      className="dymnfd"
      style={{
        backgroundColor: shadedWarningClr,
        borderLeftColor: nfdColor,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="padbottom nfd">{nfd} has multiple verified addresses.</div>
        <div className="padbottom grey">You may be looking for:</div>
        {accounts.map((account, i) => (
          <div className="acct"><LinkToAccount noNFD={true} key={`acc${i}`} address={account} /></div>
        ))}
      </div>
      <IconButton onClick={dismiss}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}