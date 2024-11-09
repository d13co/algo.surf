import React from 'react';
import {Tooltip,Chip} from "@mui/material";
import "./TxnTypeChip.scss";

interface TxnTypeChipProps {
  type: string;
  count: number;
  parentType?: string;
  className?: string;
}

const map = {
  appl: ["app", "application"],
  axfer: ["asset", "asset transfer"],
  afrz: ["freeze", "asset freeze"],
  acfg: ["asset cfg", "asset configuration"],
  pay: ["algo", "algo payment"],
  stpf: ["state proof", "state proof"],
  keyreg: ["keyreg", "key registration"],
}

export default function TxnTypeChip({ type, count, parentType="block" }: TxnTypeChipProps): JSX.Element {
  const [typeToShow, longTypeToShow] = map[type] ?? [type];
  const longDescription = `This ${parentType} has ${count} ${longTypeToShow} transactions`
  return <Tooltip title={longDescription}>
    <Chip color="primary" variant="outlined" key={`txt-${type}`} size="small" label={`${count} ${typeToShow}`} />
  </Tooltip>;
}
