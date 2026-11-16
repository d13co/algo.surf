import { useEffect, useState } from "react";

/** Below md (768px): phones, where some panels are left out and pickers open full screen. */
const NARROW = "(max-width: 767px)";

/** Whether the viewport is below md, kept up to date as it resizes. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}
