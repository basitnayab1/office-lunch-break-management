"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BiteStationBrand } from "@/components/brand/bite-station-logo";

const links = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/history", label: "Break Records" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/sheets", label: "Google Sheets" },
];

export function AdminShell({
  children,
  officeName,
  adminName,
}: {
  children: React.ReactNode;
  officeName: string;
  adminName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={cn(
          "border-b border-[var(--line)] bg-[rgba(255,253,248,0.96)] lg:border-b-0 lg:border-r",
          mobileOpen ? "block" : "hidden lg:block"
        )}
      >
        <div className="sticky top-0 flex h-full max-h-screen flex-col px-4 py-5">
          <div className="px-2 pb-6">
            <BiteStationBrand logoSize={44} />
            <p className="mt-2 text-[11px] text-[var(--ink-muted)]">Admin Panel</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">
              {officeName}
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">{adminName}</p>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive(link.href, link.exact)
                    ? "bg-[var(--brand)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-black/5 hover:text-[var(--ink)]"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 space-y-2 border-t border-[var(--line)] pt-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await logout();
                router.push("/admin/login");
                router.refresh();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(255,253,248,0.9)] px-4 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0">
            <BiteStationBrand logoSize={36} />
            <p className="mt-1 truncate text-sm font-medium">{officeName}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? "Close" : "Menu"}
          </Button>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
      </div>
    </div>
  );
}
