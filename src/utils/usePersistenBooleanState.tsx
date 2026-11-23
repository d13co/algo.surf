import React from "react";

export function usePersistenBooleanState(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
  const [state, setState] = React.useState<boolean>(() => {
    // Storage can throw (site data blocked, some private modes): fall back to the default.
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue !== null ? storedValue === 'true' : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = (value: boolean) => {
    setState(value);
    try {
      localStorage.setItem(key, value.toString());
    } catch {
      // Not remembered across visits; the state still changes.
    }
  };

  return [state, setPersistedState];
}
