import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { cn } from "src/lib/utils";
import { useRoundHref } from "src/hooks/useRound";

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  noStyle?: boolean;
  /**
   * On a page showing a past round (`?round=`), internal links carry it, so
   * accounts, apps and assets they lead to show that round too. False to
   * link to the latest state.
   */
  keepRound?: boolean;
}

export default function Link({
  href,
  noStyle,
  keepRound = true,
  children,
  className,
  ...props
}: LinkProps) {
  const roundHref = useRoundHref();

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
    <RouterLink
      to={keepRound ? roundHref(href) : href}
      className={linkClasses}
      {...props}
    >
      {children}
    </RouterLink>
  );
}
