import React, { useState, useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import { Tooltip } from "@mui/material";

const copyTitle = "Click to copy";
const copyState = <ContentCopyOutlinedIcon fontSize="inherit" />;

const checkmarkTitle = "Copied";
const checkmarkState = <CheckOutlinedIcon color="success" fontSize="inherit" />;

export default function Copyable({ value, style }: { value: string | number, style?: any }): JSX.Element {
  const [icon, setIcon] = useState(copyState);
  const [title, setTitle] = useState(copyTitle);

  const copy = useCallback(() => {
    setIcon(checkmarkState);
    setTitle(checkmarkTitle);

    navigator.clipboard.writeText(String(value));

    setTimeout(() => {
      setIcon(copyState);
      setTitle(copyTitle);
    }, 2_000);
  }, [value]);

  return <Tooltip title={title}>
    <IconButton aria-label="copy" size="small" className="success" style={style} onClick={copy} sx={{paddingTop: 0, paddingBottom: 0}}>
      {icon}
    </IconButton>
  </Tooltip>;
}
