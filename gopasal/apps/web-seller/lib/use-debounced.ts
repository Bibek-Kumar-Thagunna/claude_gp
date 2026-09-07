"use client";

import * as React from "react";

/**
 * A value that lags behind, so a search box can drive a request.
 *
 * Now that `q` reaches SQL, every keystroke would otherwise be a round trip; the
 * screens that use this keep the raw value bound to the input (so typing stays
 * instant) and pass the debounced one to the loader.
 *
 * The timer is reset on every change and cleared on unmount, so the last value
 * typed is the only one that ever settles. `delay` is deliberately short — long
 * enough to swallow a burst of typing, short enough that a seller who pauses does
 * not wonder whether the page is working.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
