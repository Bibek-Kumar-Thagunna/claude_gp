import { DashboardShell } from "@/components/shell/DashboardShell";
import { RequireAuth } from "@/components/RequireAuth";

/**
 * Everything in this route group is staff-only. The gate sits here rather than on
 * each page so a new screen is behind sign-in by default instead of by remembering.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DashboardShell>{children}</DashboardShell>
    </RequireAuth>
  );
}
