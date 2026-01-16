import React from "react";
import NumberFormat, { NumberFormatProps } from "react-number-format";
import Copyable from "../Copyable/Copyable";
import "./NumberFormatCopy.scss";

interface NumberFormatCopyProps extends NumberFormatProps {
  copySize?: "s" | "m";
  copyButtonSize?: "small" | "medium";
  copyPosition?: "left" | "right";
  dimmable?: boolean;
}

export default function NumberFormatCopy({
  copySize,
  copyButtonSize = "small",
  copyPosition = "right",
  dimmable = true,
  value,
  ...numberFormatProps
}: NumberFormatCopyProps): JSX.Element {
  const copyable = (
    <Copyable
      className={dimmable ? "dim" : undefined}
      style={{marginLeft: copyPosition === "left" ? "-4px" : "6px", marginRight: copyPosition === "right" ? "-4px" : "6px"}}
      size={copySize}
      buttonSize={copyButtonSize}
      value={value as string | number}
    />
  );

  return (
    <span className={dimmable ? "dimparent" : undefined}>
      {copyPosition === "left" && copyable}
      <NumberFormat value={value} {...numberFormatProps} />
      {copyPosition === "right" && copyable}
    </span>
  );
}
