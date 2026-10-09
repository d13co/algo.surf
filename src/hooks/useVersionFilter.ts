import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { parseVersionFilter, VersionFilter, withVersionFilter } from "src/utils/versionFilter";

/**
 * The version filter in the URL (see versionFilter); undefined where there is
 * none. `objects`: whether the page lists several objects, so `object` applies.
 */
export function useVersionFilter(objects: boolean): VersionFilter | undefined {
  const [searchParams] = useSearchParams();
  const signature = [searchParams.get("object"), ...searchParams.getAll("field")].join("\n");
  // searchParams is a new object on any query change; signature is the part that matters.
  return useMemo(() => parseVersionFilter(searchParams, objects), [signature, objects]);
}

/** Links to this page with another version filter (or none), keeping the rest of its query. */
export function useVersionFilterHref(): (filter: VersionFilter | undefined) => string {
  const { pathname, search } = useLocation();
  return useCallback((filter: VersionFilter | undefined) => withVersionFilter(`${pathname}${search}`, filter), [pathname, search]);
}
