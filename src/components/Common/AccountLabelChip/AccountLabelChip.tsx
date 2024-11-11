import React from 'react';
import {Chip, Tooltip,} from "@mui/material";

interface AccountLabelChipProps {
  label: string;
  size?: "small" | "medium";
  color?: "success" | "default";
  variant?: "outlined" | "filled"
}

export default function AccountLabelChip({ label, color = "default", variant = "outlined", size = "small" }: AccountLabelChipProps): JSX.Element {
  return <Tooltip title={`This account is labelled in the algo.surf address book as: ${label}`}>
    <Chip color={color} variant={variant} label={`${label}`} size={size}></Chip>
  </Tooltip>
}
