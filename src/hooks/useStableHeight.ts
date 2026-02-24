import { useRef, useState, useLayoutEffect } from "react";

export function useStableHeight(shouldCapture: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState<number>();

  useLayoutEffect(() => {
    if (ref.current && shouldCapture) {
      setMinHeight(ref.current.offsetHeight);
    }
  }, [shouldCapture]);

  return { ref, style: minHeight ? { minHeight } : undefined };
}
