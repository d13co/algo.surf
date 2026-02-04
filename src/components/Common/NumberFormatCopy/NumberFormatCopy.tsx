import React from "react";
import NumberFormat, { NumberFormatProps } from "react-number-format";
import Copyable from "../Copyable/Copyable";
import "./NumberFormatCopy.scss";

interface NumberFormatCopyProps extends NumberFormatProps {
  copySize?: "s" | "m";
  copyButtonSize?: "small" | "medium";
  copyPosition?: "left" | "right";
  copyStyle?: React.CSSProperties;
  dimmable?: boolean;
  showSign?: boolean;
}

export default function NumberFormatCopy({
  copySize,
  copyButtonSize = "small",
  copyPosition = "right",
  dimmable = true,
  showSign = false,
  copyStyle = undefined,
  value,
  ...numberFormatProps
}: NumberFormatCopyProps): JSX.Element {
  const copyable = (
    <Copyable
      className={dimmable ? "dim" : undefined}
      style={{marginLeft: copyPosition === "left" ? "-4px" : "6px", marginRight: copyPosition === "right" ? "-4px" : "6px", ...copyStyle}}
      size={copySize}
      buttonSize={copyButtonSize}
      value={value as string | number}
    />
  );

  return (
    <span className={dimmable ? "dimparent" : undefined}>
      {copyPosition === "left" && copyable}
      { showSign && Number(value) > 0 ? "+" : "" }
      <NumberFormat value={value} {...numberFormatProps} />
      {copyPosition === "right" && copyable}
    </span>
  );
}
