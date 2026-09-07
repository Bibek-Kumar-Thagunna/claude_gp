"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/** Non-blocking connectivity banner. Slides in when the browser goes offline. */
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
          className="fixed inset-x-3 bottom-3 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-float"
        >
          <WifiOff className="h-5 w-5 shrink-0 text-[#F6A609]" />
          <div className="text-sm">
            <p className="font-semibold">You’re offline</p>
            <p className="text-white/70">We’ll reconnect automatically. Your cart is safe.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineWatcher;
