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

/** Forwards its ref, so it can be a Radix `asChild` child (a menu item). */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, noStyle, keepRound = true, children, className, ...props },
  ref,
) {
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
      <a ref={ref} href={href} className={linkClasses} {...props}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink
      ref={ref}
      to={keepRound ? roundHref(href) : href}
      className={linkClasses}
      {...props}
    >
      {children}
    </RouterLink>
  );
});

export default Link;
