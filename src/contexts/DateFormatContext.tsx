import React, { createContext, useContext, useState, useCallback } from "react";

export type DateFormat = "relative" | "local" | "utc" | "epoch";

const STORAGE_KEY = "dateFormat";
const FORMATS: DateFormat[] = ["relative", "local", "utc", "epoch"];

function getInitialFormat(): DateFormat {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (FORMATS.includes(stored as DateFormat)) {
    return stored as DateFormat;
  }
  return "relative";
}

const DateFormatContext = createContext<{
  format: DateFormat;
  cycle: () => void;
}>({
  format: "relative",
  cycle: () => {},
});

export function DateFormatProvider({ children }: { children: React.ReactNode }) {
  const [format, setFormat] = useState<DateFormat>(getInitialFormat);

  const cycle = useCallback(() => {
    setFormat((prev) => {
      const next = FORMATS[(FORMATS.indexOf(prev) + 1) % FORMATS.length];
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <DateFormatContext.Provider value={{ format, cycle }}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat() {
  return useContext(DateFormatContext);
}
