import React from "react";

export function usePersistenBooleanState(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
  const [state, setState] = React.useState<boolean>(() => {
    const storedValue = localStorage.getItem(key);
    return storedValue !== null ? storedValue === 'true' : defaultValue;
  });

  const setPersistedState = (value: boolean) => {
    setState(value);
    localStorage.setItem(key, value.toString());
  };

  return [state, setPersistedState];
}
