import { useEffect, useMemo, useState } from "react";
import { A_AssetTiny } from "src/packages/core-sdk/types";

export function useFilteredAssets<T extends A_AssetTiny>(assets: T[] | undefined) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 100);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filtered = useMemo(() => {
    if (!assets) return [];
    if (!debouncedSearchTerm.trim()) return assets;
    const search = debouncedSearchTerm.toLocaleLowerCase();
    return assets.filter((a) => {
      const { name, "unit-name": unitName } = a.params;
      return (
        name?.toLocaleLowerCase()?.includes(search) ||
        unitName?.toLocaleLowerCase()?.includes(search)
      );
    });
  }, [debouncedSearchTerm, assets]);

  const searchStatus = useMemo(() => {
    if (!assets) return "";
    if (!debouncedSearchTerm.trim()) return `${assets.length} assets`;
    if (filtered.length === 0) return `No assets matching "${debouncedSearchTerm}"`;
    return `Showing ${filtered.length} of ${assets.length}`;
  }, [assets, debouncedSearchTerm, filtered.length]);

  return { searchTerm, setSearchTerm, filtered, searchStatus };
}
