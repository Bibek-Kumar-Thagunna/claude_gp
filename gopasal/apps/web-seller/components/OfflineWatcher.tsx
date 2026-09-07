"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Non-blocking connectivity banner. Slides in when the browser goes offline.
 *
 * It says what is true and nothing more. The line here used to read "New orders
 * will sync the moment you're back", which promised a capability GoPasal does not
 * have: there is no service worker in this app (`public/` holds icons only),
 * no IndexedDB, no request queue and no background sync, so nothing typed while
 * offline is held anywhere, and no order arrives during the gap. `navigator.onLine`
 * is the whole mechanism — this component reports connectivity and takes no part
 * in saving anything.
 */
export function OfflineWatcher() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          role="status"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed inset-x-3 bottom-3 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-2xl"
        >
          <WifiOff className="h-5 w-5 shrink-0 text-[#F6A609]" />
          <div className="text-sm">
            <p className="font-semibold">You’re offline</p>
            <p className="text-white/70">
              GoPasal can’t be reached right now. Anything you save won’t go through until you’re
              back — reconnect and try again.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
