let loading: Promise<void> | null = null;

/** Load only after a customer opens the address picker, never on ordinary browsing. */
export function loadGoogleMaps(browserKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps needs a browser"));
  if ("google" in window && window.google?.maps) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const host = window as Window & { __gopasalGoogleMapsReady?: () => void };
    const script = document.createElement("script");
    host.__gopasalGoogleMapsReady = () => {
      delete host.__gopasalGoogleMapsReady;
      resolve();
    };
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: browserKey,
      v: "weekly",
      loading: "async",
      libraries: "places",
      callback: "__gopasalGoogleMapsReady",
      region: "NP",
    })}`;
    script.onerror = () => {
      delete host.__gopasalGoogleMapsReady;
      script.remove();
      loading = null;
      reject(new Error("Google Maps could not load. Use your current GPS location instead."));
    };
    document.head.appendChild(script);
  });
  return loading;
}
