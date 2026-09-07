import { RequireAuth } from "@/components/RequireAuth";
import { DashboardShell } from "@/components/shell/DashboardShell";

/**
 * Everything in this group assumes a signed-in seller with a live shop, and every
 * screen inside it now reads the real API — the dashboard included. The gate is
 * what this file adds: an account without an approved shop is sent to its
 * application instead of being shown a console it cannot use.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth requireLiveShop>
      <DashboardShell>{children}</DashboardShell>
    </RequireAuth>
  );
}
