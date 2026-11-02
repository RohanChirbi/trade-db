"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, Badge } from "./ui";

export type Me = {
  uid: number;
  username: string;
  role: "TRADER" | "COMPLIANCE";
  strategyId: number | null;
  strategy: { strategy_id: number; name: string; strategy_type: string; assigned_capital: string } | null;
};

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

const LINKS: { href: string; label: string; roles: Me["role"][] }[] = [
  { href: "/", label: "Overview", roles: ["TRADER", "COMPLIANCE"] },
  { href: "/schema", label: "Schema", roles: ["TRADER", "COMPLIANCE"] },
  { href: "/orders", label: "Orders", roles: ["TRADER", "COMPLIANCE"] },
  { href: "/positions", label: "Positions & P&L", roles: ["TRADER", "COMPLIANCE"] },
  { href: "/analytics", label: "Analytics", roles: ["TRADER", "COMPLIANCE"] },
  { href: "/surveillance", label: "Surveillance", roles: ["COMPLIANCE"] },
  { href: "/alerts", label: "Alert review", roles: ["COMPLIANCE"] },
  { href: "/queries", label: "Queries Q1–Q20", roles: ["COMPLIANCE"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (isLogin) return;
    api<Me>("/api/me").then(setMe).catch(() => router.replace("/login"));
  }, [isLogin, router, pathname]);

  if (isLogin) return <>{children}</>;
  const allowed = me ? LINKS.filter((l) => l.roles.includes(me.role)) : [];
  const blocked = me && !allowed.some((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)));

  return (
    <MeContext.Provider value={me}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">TD</span>
            Trade DB
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {allowed.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href}
                  className={`rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          {me && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-700">{me.username}</span>
              <Badge value={me.role} />
              {me.strategy && <span className="hidden text-xs text-slate-500 md:inline">{me.strategy.name}</span>}
              <button className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
                onClick={async () => {
                  await api("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 bg-slate-50">
        {blocked ? (
          <div className="mx-auto max-w-xl px-6 py-16 text-center">
            <h1 className="text-lg font-semibold text-slate-900">Not available for the {me.role.toLowerCase()} role</h1>
            <p className="mt-2 text-sm text-slate-500">This page is restricted. The API enforces the same rule and returns 403.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </MeContext.Provider>
  );
}
