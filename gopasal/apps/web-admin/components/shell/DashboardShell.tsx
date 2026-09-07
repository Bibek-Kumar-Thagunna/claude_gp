"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** App shell: fixed sidebar on desktop, slide-over drawer on mobile. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen lg:pl-[var(--gp-sidebar-w)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--gp-sidebar-w)] border-r border-ink-100 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-ink-100 bg-white lg:hidden"
              initial={{ x: reduce ? 0 : -300 }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : -300 }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="absolute right-3 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Topbar onOpenMenu={() => setMenuOpen(true)} />

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 md:py-8 2xl:max-w-[1600px]">
        {children}
      </main>
    </div>
  );
}

export default DashboardShell;
