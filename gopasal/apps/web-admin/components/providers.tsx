"use client";

import * as React from "react";
import type { Lang } from "@/lib/i18n";
import type { PermissionId } from "@/lib/rbac";
import { useAuth } from "@/components/auth-provider";

type LangCtx = { lang: Lang; setLang: (lang: Lang) => void };

const LanguageContext = React.createContext<LangCtx | null>(null);

export function useLang() {
  const context = React.useContext(LanguageContext);
  if (!context) throw new Error("useLang must be used within AdminProvider");
  return context;
}

type AdminCtx = {
  /** Default-deny check over the API-resolved platform permission list. */
  can: (permission: PermissionId) => boolean;
};

const AdminContext = React.createContext<AdminCtx | null>(null);

export function useAdmin() {
  const context = React.useContext(AdminContext);
  if (!context) throw new Error("useAdmin must be used within AdminProvider");
  return context;
}

export function useCan(): (permission: PermissionId) => boolean {
  return useAdmin().can;
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  const [lang, setLangState] = React.useState<Lang>("en");

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("gp-admin-lang");
      if (saved === "en" || saved === "np") setLangState(saved);
    } catch {
      // Language persistence is optional; authentication and data never depend on it.
    }
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem("gp-admin-lang", next);
    } catch {
      // Keep the selected language for this session when storage is unavailable.
    }
  }, []);

  const can = React.useCallback(
    (permission: PermissionId) => hasPermission(permission),
    [hasPermission],
  );

  const langValue = React.useMemo(() => ({ lang, setLang }), [lang, setLang]);
  const adminValue = React.useMemo(() => ({ can }), [can]);

  return (
    <LanguageContext.Provider value={langValue}>
      <AdminContext.Provider value={adminValue}>{children}</AdminContext.Provider>
    </LanguageContext.Provider>
  );
}
