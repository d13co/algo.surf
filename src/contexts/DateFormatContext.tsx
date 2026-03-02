import React, { createContext, useContext, useState, useCallback } from "react";

export type DateFormat = "relative" | "local" | "utc" | "epoch" | "block";

export const niceNames: Record<DateFormat, string> = {
  relative: "Relative",
  local: "Local",
  utc: "UTC",
  epoch: "Unix Epoch",
  block: "Block",
};

export const nextFormat: Record<DateFormat, DateFormat> = {
  relative: "local",
  local: "utc",
  utc: "epoch",
  epoch: "block",
  block: "relative",
};

const STORAGE_KEY = "dateFormat";
const FORMATS: DateFormat[] = ["relative", "local", "utc", "epoch", "block"];

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
  setFormat: (f: DateFormat) => void;
}>({
  format: "relative",
  cycle: () => {},
  setFormat: () => {},
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

  const updateFormat = useCallback((f: DateFormat) => {
    setFormat(f);
    localStorage.setItem(STORAGE_KEY, f);
  }, []);

  return (
    <DateFormatContext.Provider value={{ format, cycle, setFormat: updateFormat }}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat() {
  return useContext(DateFormatContext);
}
