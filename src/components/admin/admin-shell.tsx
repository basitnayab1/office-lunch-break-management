"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { changeMyPassword, logout } from "@/actions/auth";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/actions/notifications";
import { updateMyAdminProfile } from "@/actions/employees";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BiteStationBrand } from "@/components/brand/bite-station-logo";
import type { AppNotification } from "@/types/database";

const links = [
  { href: "/admin", label: "Dashboard", icon: "layout", exact: true },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
  { href: "/admin/employees", label: "Employees", icon: "users" },
  { href: "/admin/history", label: "Break Records", icon: "records" },
  { href: "/admin/reports", label: "Reports", icon: "chart" },
  { href: "/admin/notifications", label: "Notifications", icon: "bell" },
  { href: "/admin/audit", label: "Audit Logs", icon: "shield" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
  { href: "/admin/sheets", label: "Google Sheets", icon: "sheet" },
];

type IconName =
  | "layout"
  | "calendar"
  | "users"
  | "records"
  | "chart"
  | "bell"
  | "shield"
  | "settings"
  | "sheet"
  | "menu"
  | "search"
  | "chevron"
  | "clock"
  | "check";

function getSafeTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Asia/Karachi";
  }
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className: cn("h-5 w-5", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    layout: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    calendar: (
      <>
        <path d="M8 2v4M16 2v4M3 10h18" />
        <rect x="3" y="5" width="18" height="16" rx="2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    records: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-7" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />,
    settings: (
      <>
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.08V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.36.69.6 1 .3.3.69.47 1.08.47H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" />
      </>
    ),
    sheet: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
    chevron: <path d="M6 9l6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export function AdminShell({
  children,
  officeName,
  adminName,
  adminProfileImageUrl,
  timezone,
  initialNotifications,
}: {
  children: React.ReactNode;
  officeName: string;
  adminName: string;
  adminProfileImageUrl: string | null;
  timezone: string;
  initialNotifications: AppNotification[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const profileFileRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [currentOfficeName, setCurrentOfficeName] = useState(officeName);
  const [profileName, setProfileName] = useState(adminName);
  const [profileImageUrl, setProfileImageUrl] = useState(adminProfileImageUrl ?? "");
  const [profileDraftName, setProfileDraftName] = useState(adminName);
  const [profileDraftFileName, setProfileDraftFileName] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const firstName = profileName.split(" ")[0] || "Admin";
  const initials = profileName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  const safeTimezone = getSafeTimezone(timezone);
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );
  const officeDateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const officeTimeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const officeLocationLabel = "Techno Ai Lahore";
  const fullOfficeDate = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const officeDay = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      day: "numeric",
    }).format(now)
  );
  const calendarDays = useMemo(() => {
    const year = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: safeTimezone,
        year: "numeric",
      }).format(now)
    );
    const month = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: safeTimezone,
        month: "numeric",
      }).format(now)
    );
    const first = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      firstWeekday: first.getUTCDay(),
      days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    };
  }, [now, safeTimezone]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    setCurrentOfficeName(officeName);
  }, [officeName]);

  useEffect(() => {
    function onOfficeSettingsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ officeName?: string }>).detail;
      const nextOfficeName = detail?.officeName?.trim();
      if (nextOfficeName) setCurrentOfficeName(nextOfficeName);
    }

    window.addEventListener("office-settings-updated", onOfficeSettingsUpdated);
    return () => {
      window.removeEventListener("office-settings-updated", onOfficeSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    setProfileName(adminName);
    setProfileDraftName(adminName);
  }, [adminName]);

  useEffect(() => {
    const imageUrl = adminProfileImageUrl ?? "";
    setProfileImageUrl(imageUrl);
  }, [adminProfileImageUrl]);

  function readNotification(id: string) {
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (result.success) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read_at: new Date().toISOString() } : item
          )
        );
      }
    });
  }

  function readAllNotifications() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.success) {
        const readAt = new Date().toISOString();
        setNotifications((current) =>
          current.map((item) => ({ ...item, read_at: item.read_at ?? readAt }))
        );
      }
    });
  }

  function Avatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const sizes = {
      sm: "h-10 w-10 text-sm",
      md: "h-11 w-11 text-sm",
      lg: "h-16 w-16 text-lg",
    };
    const image = profileImageUrl.trim();

    return (
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--brand)] font-bold text-white",
          sizes[size]
        )}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={profileName}
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          initials
        )}
        {size !== "lg" ? (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#13b981]" />
        ) : null}
      </span>
    );
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    const formData = new FormData();
    formData.set("full_name", profileDraftName);
    const file = profileFileRef.current?.files?.[0];
    if (file) formData.set("profile_image_file", file);

    startTransition(async () => {
      const result = await updateMyAdminProfile(formData);
      if (!result.success || !result.data) {
        setProfileError(result.success ? "Unable to update profile." : result.error);
        return;
      }
      setProfileName(result.data.full_name);
      setProfileImageUrl(result.data.profile_image_url ?? "");
      setProfileDraftName(result.data.full_name);
      setProfileDraftFileName("");
      if (profileFileRef.current) profileFileRef.current.value = "";
      setProfileMessage(result.message ?? "Profile updated.");
      setProfileEditorOpen(false);
    });
  }

  function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    startTransition(async () => {
      const result = await changeMyPassword(passwordForm);
      if (!result.success) {
        setPasswordError(result.error);
        return;
      }
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordMessage(result.message ?? "Password changed.");
    });
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-[var(--bg)] lg:grid",
        sidebarCollapsed ? "lg:grid-cols-[92px_1fr]" : "lg:grid-cols-[300px_1fr]"
      )}
    >
      <aside
        className={cn(
          "border-b border-[var(--line)] bg-white lg:border-b-0 lg:border-r",
          mobileOpen ? "block" : "hidden lg:block"
        )}
      >
        <div className="sticky top-0 flex h-screen max-h-screen flex-col px-4 py-6">
          <div className={cn("px-2 pb-7", sidebarCollapsed && "px-0 text-center")}>
            {sidebarCollapsed ? (
              <BiteStationBrand logoSize={42} priority />
            ) : (
              <BiteStationBrand logoSize={58} priority />
            )}
          </div>

          <button
            className={cn(
              "mb-4 flex h-14 w-full items-center justify-between border-b border-[var(--line)] px-4 pb-5 text-left",
              sidebarCollapsed && "justify-center px-0"
            )}
            title={currentOfficeName}
          >
            <span className="flex items-center gap-3 text-base font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)]">
                <Icon name="layout" className="h-4 w-4" />
              </span>
              {!sidebarCollapsed ? currentOfficeName : null}
            </span>
          </button>

          <nav className="flex flex-1 flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-[8px] px-4 text-[15px] font-semibold transition",
                  sidebarCollapsed && "justify-center px-0",
                  isActive(link.href, link.exact)
                    ? "bg-[var(--brand)] text-white shadow-[0_12px_24px_rgba(0,121,95,0.22)]"
                    : "text-[var(--ink)] hover:bg-[#f2f6f5]"
                )}
                title={sidebarCollapsed ? link.label : undefined}
              >
                <Icon name={link.icon as IconName} className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed ? link.label : null}
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-[8px] border border-[var(--line)] bg-white p-3">
            <button
              className={cn(
                "flex w-full items-center gap-3 text-left",
                sidebarCollapsed && "justify-center"
              )}
              onClick={async () => {
                await logout();
                router.push("/admin/login");
                router.refresh();
              }}
            >
              <Avatar />
              {!sidebarCollapsed ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{firstName}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">Admin</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 -rotate-90" />
                </>
              ) : null}
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-wrap items-center gap-4 xl:flex-nowrap">
            <Button
              variant="secondary"
              className="h-12 w-12 rounded-[10px] px-0 lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Open navigation"
            >
              <Icon name="menu" />
            </Button>
            <button
              className="hidden h-12 w-12 place-items-center rounded-[10px] border border-[var(--line)] bg-white text-[var(--ink)] shadow-[var(--shadow)] transition hover:bg-[#f7f9fb] lg:grid"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-[240px] flex-1">
              <h1 className="text-2xl font-bold leading-tight tracking-normal">
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-[var(--ink-muted)]">
                Here&apos;s what is happening with your team today.
              </p>
            </div>
            <form
              action="/admin/employees"
              className="hidden h-12 min-w-[320px] max-w-[390px] flex-1 items-center gap-3 rounded-[10px] border border-[var(--line)] bg-white px-4 shadow-[var(--shadow)] xl:flex"
            >
              <Icon name="search" className="h-5 w-5 text-[var(--ink-muted)]" />
              <input
                ref={searchRef}
                name="q"
                placeholder="Search employees, breaks..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <span className="rounded-md bg-[#f4f6f8] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)]">
                Ctrl K
              </span>
            </form>
            <div className="relative hidden min-w-[210px] border-l border-[var(--line)] pl-5 lg:block">
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left"
                onClick={() => {
                  setCalendarOpen((open) => !open);
                  setNotificationsOpen(false);
                  setProfileOpen(false);
                }}
                aria-expanded={calendarOpen}
                aria-label="Open calendar"
              >
                <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--line)] bg-white text-[var(--ink)]">
                  <Icon name="calendar" className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{officeLocationLabel}</span>
                  <span className="block text-xs text-[var(--ink-muted)]">
                    {officeDateLabel} · {officeTimeLabel}
                  </span>
                </span>
              </button>
              {calendarOpen ? (
                <div className="absolute right-0 top-14 w-80 rounded-[12px] border border-[var(--line)] bg-white p-4 shadow-[0_18px_40px_rgba(20,32,51,0.14)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{fullOfficeDate}</p>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        {officeLocationLabel}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-[var(--brand-soft)] px-3 py-2 text-right text-[var(--brand-dark)]">
                      <p className="text-xs font-semibold uppercase">Now</p>
                      <p className="font-semibold">{officeTimeLabel}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--ink-muted)]">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                      <span key={`${day}-${index}`} className="py-1">
                        {day}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
                    {Array.from({ length: calendarDays.firstWeekday }).map((_, index) => (
                      <span key={`blank-${index}`} />
                    ))}
                    {calendarDays.days.map((day) => (
                      <span
                        key={day}
                        className={cn(
                          "grid h-8 place-items-center rounded-[8px]",
                          day === officeDay
                            ? "bg-[var(--brand)] font-semibold text-white"
                            : "text-[var(--ink)]"
                        )}
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                  <Link
                    href="/admin/schedule"
                    className="mt-4 flex h-10 items-center justify-center rounded-[8px] bg-[var(--brand)] text-sm font-semibold text-white"
                    onClick={() => setCalendarOpen(false)}
                  >
                    Open schedule
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                className="relative grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] shadow-[var(--shadow)] transition hover:bg-[#f7f9fb]"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setCalendarOpen(false);
                  setProfileOpen(false);
                }}
                aria-expanded={notificationsOpen}
                aria-label="Open notifications"
              >
                <Icon name="bell" />
                {unreadNotifications > 0 ? (
                  <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-white">
                    {unreadNotifications}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-14 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-[12px] border border-[var(--line)] bg-white shadow-[0_18px_40px_rgba(20,32,51,0.14)]">
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                    <div>
                      <p className="font-semibold">Notifications</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {unreadNotifications} unread
                      </p>
                    </div>
                    <button
                      className="rounded-[8px] px-3 py-2 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={readAllNotifications}
                      disabled={unreadNotifications === 0}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">
                        No notifications yet.
                      </p>
                    ) : (
                      notifications.slice(0, 8).map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={cn(
                            "block w-full border-b border-[var(--line)] px-4 py-3 text-left transition hover:bg-[#f7f9fb]",
                            !notification.read_at && "bg-[var(--brand-soft)]/55"
                          )}
                          onClick={() => readNotification(notification.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{notification.title}</p>
                            {notification.read_at ? (
                              <Icon
                                name="check"
                                className="mt-0.5 h-4 w-4 text-[var(--ok)]"
                              />
                            ) : (
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-muted)]">
                            {notification.body}
                          </p>
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            {new Intl.DateTimeFormat("en-US", {
                              timeZone: safeTimezone,
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(notification.created_at))}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                  <Link
                    href="/admin/notifications"
                    className="flex h-11 items-center justify-center text-sm font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)]"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View all notifications
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                className="flex h-12 items-center gap-2 rounded-full bg-white pl-1 pr-3 text-sm font-bold text-[var(--ink)] shadow-[var(--shadow)] ring-1 ring-[var(--line)] transition hover:bg-[#f7f9fb]"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setNotificationsOpen(false);
                  setCalendarOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-label="Open profile menu"
              >
                <Avatar size="sm" />
                <Icon
                  name="chevron"
                  className={cn(
                    "h-4 w-4 text-[var(--ink-muted)] transition",
                    profileOpen && "rotate-180"
                  )}
                />
              </button>
              {profileOpen ? (
                <div className="absolute right-0 top-14 w-[min(260px,calc(100vw-32px))] rounded-[12px] border border-[var(--line)] bg-white p-3 shadow-[0_18px_40px_rgba(20,32,51,0.14)]">
                  <div className="flex items-center gap-3 border-b border-[var(--line)] px-2 pb-3">
                    <Avatar size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{profileName}</p>
                      <p className="text-xs text-[var(--ink-muted)]">Admin</p>
                    </div>
                  </div>
                  <button
                    className="mt-3 flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-semibold text-[var(--ink)] transition hover:bg-[#f7f9fb]"
                    onClick={() => {
                      setProfileEditorOpen(true);
                      setProfileOpen(false);
                      setProfileError(null);
                      setProfileMessage(null);
                      setPasswordError(null);
                      setPasswordMessage(null);
                    }}
                  >
                    <Icon name="users" className="h-4 w-4 text-[var(--ink-muted)]" />
                    Profile
                  </button>
                  <button
                    className="flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-semibold text-[var(--ink)] transition hover:bg-[#f7f9fb]"
                    onClick={() => {
                      setProfileOpen(false);
                      router.push("/admin/settings");
                    }}
                  >
                    <Icon name="settings" className="h-4 w-4 text-[var(--ink-muted)]" />
                    Settings
                  </button>
                  <button
                    className="flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                    onClick={async () => {
                      await logout();
                      router.push("/admin/login");
                      router.refresh();
                    }}
                  >
                    <Icon name="chevron" className="h-4 w-4 rotate-90" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {profileEditorOpen ? (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 px-4 py-6">
            <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(20,32,51,0.24)]">
              <div className="space-y-5">
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar size="lg" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{profileName}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        Admin profile settings
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full text-xl text-[var(--ink-muted)] transition hover:bg-[#f7f9fb]"
                    onClick={() => setProfileEditorOpen(false)}
                    aria-label="Close profile settings"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-[var(--ink-muted)]">
                      Display name
                    </span>
                    <input
                      value={profileDraftName}
                      onChange={(event) => setProfileDraftName(event.target.value)}
                      className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-[var(--ink-muted)]">
                      Upload profile picture
                    </span>
                    <input
                      ref={profileFileRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setProfileDraftFileName(
                          event.target.files?.[0]?.name ?? ""
                        )
                      }
                      className="mt-1 block w-full text-sm text-[var(--ink-muted)] file:mr-3 file:h-9 file:rounded-[8px] file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:text-sm file:font-semibold file:text-[var(--brand-dark)]"
                    />
                    {profileDraftFileName ? (
                      <span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">
                        Selected: {profileDraftFileName}
                      </span>
                    ) : null}
                  </label>
                  {profileError ? (
                    <p className="text-xs font-semibold text-[var(--danger)]">
                      {profileError}
                    </p>
                  ) : null}
                  {profileMessage ? (
                    <p className="text-xs font-semibold text-[var(--ok)]">
                      {profileMessage}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    className="h-10 rounded-[8px] bg-[var(--brand)] text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                  >
                    Save profile
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-[8px] border border-[var(--line)] text-sm font-semibold text-[var(--ink)] transition hover:bg-[#f7f9fb]"
                    onClick={() => {
                      setProfileDraftName(profileName);
                      setProfileDraftFileName("");
                      if (profileFileRef.current) profileFileRef.current.value = "";
                      setProfileError(null);
                      setProfileMessage(null);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </form>
              <form
                onSubmit={savePassword}
                className="space-y-3 border-t border-[var(--line)] pt-4"
              >
                <div>
                  <p className="font-semibold">Change password</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Use your current admin password before saving a new one.
                  </p>
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: event.target.value,
                    })
                  }
                  placeholder="Current password"
                  className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: event.target.value,
                    })
                  }
                  placeholder="New password"
                  className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: event.target.value,
                    })
                  }
                  placeholder="Confirm new password"
                  className="h-10 w-full rounded-[8px] border border-[var(--line)] px-3 text-sm outline-none focus:border-[var(--brand)]"
                  required
                />
                {passwordError ? (
                  <p className="text-xs font-semibold text-[var(--danger)]">
                    {passwordError}
                  </p>
                ) : null}
                {passwordMessage ? (
                  <p className="text-xs font-semibold text-[var(--ok)]">
                    {passwordMessage}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="h-10 w-full rounded-[8px] bg-[var(--ink)] text-sm font-semibold text-white transition hover:bg-black"
                >
                  Change password
                </button>
              </form>
              </div>
            </div>
          </div>
        ) : null}
        <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
