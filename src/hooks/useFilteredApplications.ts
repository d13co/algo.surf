import { useEffect, useMemo, useState } from "react";

interface HasAppId {
  id: bigint;
}

export function useFilteredApplications<T extends HasAppId>(
  applications: T[] | undefined,
  resolvedNames?: Map<number, string>,
) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 100);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filtered = useMemo(() => {
    if (!applications) return [];
    if (!debouncedSearchTerm.trim()) return applications;
    const search = debouncedSearchTerm.toLocaleLowerCase();
    return applications.filter((a) => {
      const id = Number(a.id);
      if (String(id).includes(search)) return true;
      const name = resolvedNames?.get(id);
      if (name?.toLocaleLowerCase()?.includes(search)) return true;
      return false;
    });
  }, [debouncedSearchTerm, applications, resolvedNames]);

  const searchStatus = useMemo(() => {
    if (!applications) return "";
    if (!debouncedSearchTerm.trim()) return `${applications.length} applications`;
    if (filtered.length === 0) return `No applications matching "${debouncedSearchTerm}"`;
    return `Showing ${filtered.length} of ${applications.length}`;
  }, [applications, debouncedSearchTerm, filtered.length]);

  return { searchTerm, setSearchTerm, filtered, searchStatus };
}
