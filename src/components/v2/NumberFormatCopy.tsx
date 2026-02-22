import React from "react";
import NumberFormat, { NumberFormatProps } from "react-number-format";
import Copyable from "src/components/v2/Copyable";

interface NumberFormatCopyProps extends NumberFormatProps {
  copySize?: "s" | "m";
  copyPosition?: "left" | "right";
  copyStyle?: React.CSSProperties;
  dimmable?: boolean;
  showSign?: boolean;
}

export default function NumberFormatCopy({
  copySize,
  copyPosition = "right",
  dimmable = true,
  showSign = false,
  copyStyle = undefined,
  value,
  ...numberFormatProps
}: NumberFormatCopyProps): JSX.Element {
  const copyable = (
    <Copyable
      className={dimmable ? "opacity-60 group-hover:opacity-100" : undefined}
      style={{
        marginLeft: copyPosition === "left" ? "-4px" : undefined,
        marginRight: copyPosition === "right" ? "-4px" : undefined,
        ...copyStyle,
      }}
      size={copySize}
      value={value as string | number}
    />
  );

  return (
    <span className={dimmable ? "group inline-flex items-center" : "inline-flex items-center"}>
      {copyPosition === "left" && copyable}
      {showSign && Number(value) > 0 ? "+" : ""}
      <NumberFormat value={value} {...numberFormatProps} />
      {copyPosition === "right" && copyable}
    </span>
  );
}
