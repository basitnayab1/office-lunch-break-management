"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/actions/notifications";
import { createClient } from "@/lib/supabase/client";
import { formatOfficeDateTime } from "@/lib/time/timezone";
import type { AppNotification, Employee } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function notifyBrowser(notification: AppNotification) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
    return;
  }
  if (Notification.permission !== "granted") return;
  try {
    new Notification(notification.title, {
      body: notification.body,
      tag: notification.id,
    });
  } catch {
    // Browser notification is best-effort only.
  }
}

export function NotificationCenter({
  employee,
  initialNotifications,
  timezone,
}: {
  employee: Employee;
  initialNotifications: AppNotification[];
  timezone: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [, startTransition] = useTransition();

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      startTransition(async () => {
        setNotifications(await getMyNotifications());
      });
    };

    const channel = supabase
      .channel(`notifications-${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${employee.id}`,
        },
        (payload) => {
          const notification = payload.new as AppNotification;
          setNotifications((current) => [notification, ...current].slice(0, 20));
          toast(notification.title, { description: notification.body });
          notifyBrowser(notification);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: "audience=eq.admin",
        },
        (payload) => {
          if (employee.role !== "admin") return;
          const notification = payload.new as AppNotification;
          setNotifications((current) => [notification, ...current].slice(0, 20));
          toast(notification.title, { description: notification.body });
          notifyBrowser(notification);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee.id, employee.role]);

  function readOne(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      setNotifications(await getMyNotifications());
    });
  }

  function readAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setNotifications(await getMyNotifications());
    });
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative h-12 w-12 rounded-full border border-[var(--line)] bg-white text-xl shadow-[var(--shadow)] transition hover:scale-105"
        aria-label="Notifications"
      >
        !
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-14 right-0 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_22px_60px_rgba(35,29,20,0.18)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="font-semibold">Notifications</p>
              <p className="text-xs text-[var(--ink-muted)]">
                {unreadCount} unread
              </p>
            </div>
            <Button variant="ghost" onClick={readAll} disabled={!unreadCount}>
              Read all
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => readOne(notification.id)}
                  className={cn(
                    "block w-full border-b border-[var(--line)] px-4 py-3 text-left transition hover:bg-black/5",
                    !notification.read_at && "bg-[var(--brand-soft)]/70"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{notification.title}</p>
                    {!notification.read_at ? <Badge tone="brand">New</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    {formatOfficeDateTime(notification.created_at, timezone)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

