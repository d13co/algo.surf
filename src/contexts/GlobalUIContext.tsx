import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

interface LoaderState {
  count: number;
  message: string;
}

interface SnackbarState {
  show: boolean;
  message: string;
  severity: string;
}

interface GlobalUI {
  loader: LoaderState;
  showLoader: (message: string) => void;
  hideLoader: () => void;
  snackbar: SnackbarState;
  showSnack: (opts: { severity: string; message: string }) => void;
  hideSnack: () => void;
}

const GlobalUIContext = createContext<GlobalUI>(null!);

export function GlobalUIProvider({ children }: { children: React.ReactNode }) {
  const [loader, setLoader] = useState<LoaderState>({ count: 0, message: "" });
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    show: false,
    message: "",
    severity: "info",
  });

  const showLoader = useCallback(
    (message: string) =>
      setLoader((s) => ({ count: s.count + 1, message })),
    [],
  );
  const hideLoader = useCallback(
    () => setLoader((s) => ({ count: s.count - 1, message: s.message })),
    [],
  );
  const showSnack = useCallback(
    (opts: { severity: string; message: string }) =>
      setSnackbar({ show: true, ...opts }),
    [],
  );
  const hideSnack = useCallback(
    () => setSnackbar((s) => ({ ...s, show: false, message: "" })),
    [],
  );

  const value = useMemo(
    () => ({ loader, showLoader, hideLoader, snackbar, showSnack, hideSnack }),
    [loader, showLoader, hideLoader, snackbar, showSnack, hideSnack],
  );

  return (
    <GlobalUIContext.Provider value={value}>
      {children}
    </GlobalUIContext.Provider>
  );
}

export function useGlobalUI() {
  return useContext(GlobalUIContext);
}
