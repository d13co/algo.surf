import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { cn } from "src/lib/utils";

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  noStyle?: boolean;
}

export default function Link({
  href,
  noStyle,
  children,
  className,
  ...props
}: LinkProps) {
  const isExternal =
    href.startsWith("http") || href.startsWith("mailto");

  const linkClasses = cn(
    !noStyle && "text-primary hover:underline",
    noStyle && "text-inherit no-underline",
    className
  );

  if (isExternal) {
    return (
      <a href={href} className={linkClasses} {...props}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={href} className={linkClasses} {...props}>
      {children}
    </RouterLink>
  );
}
