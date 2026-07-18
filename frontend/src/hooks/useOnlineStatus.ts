import { useEffect, useState } from "react";

/** Tracks connectivity via the browser's online/offline events. */
export function useOnlineStatus(): boolean {
  // Assume online for the initial (server-rendered) value — corrected on
  // mount from navigator.onLine, then kept live by the event listeners.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // navigator.onLine isn't available during SSR, and reading it in the
    // useState initializer would risk a hydration mismatch if the page
    // happens to load while already offline — correcting here, after mount,
    // is the standard pattern for browser-only APIs like this one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
