import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { notifications as notifApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { relativeTime } from '../lib/format.js';

// Poll cadence for the unread-count badge.
//   - 60s is comfortably below "feels stale" for a notification bell.
//   - We also pause polling entirely when the tab is hidden and re-fetch
//     once on visibility change, so a backgrounded tab makes ZERO requests.
//   - And refetch on window focus, so coming back from another app feels
//     instant without needing a tight interval.
const POLL_MS = 60_000;

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Outside-click / tap close
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Periodic unread-count fetch — visibility-aware so hidden tabs are silent.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let intervalId = null;

    const tick = async () => {
      if (document.hidden) return; // skip while tab is in background
      try {
        const r = await notifApi.unreadCount();
        if (!cancelled) setUnread(r.unread || 0);
      } catch (_) { /* ignore */ }
    };

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (document.hidden) { stop(); } else { tick(); start(); }
    };
    const onFocus = () => tick();

    tick();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  // Load list when opening
  async function openDropdown() {
    setOpen(true);
    setLoading(true);
    try {
      const r = await notifApi.list({ limit: 15 });
      setItems(r.items || []);
      setUnread(r.unread || 0);
    } catch (_) { /* ignore */ } finally { setLoading(false); }
  }

  async function markRead(id) {
    try {
      await notifApi.markRead(id);
      setItems((cur) => cur.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnread((n) => Math.max(0, n - 1));
    } catch (_) {}
  }

  async function markAll() {
    try {
      await notifApi.markAllRead();
      setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnread(0);
    } catch (_) {}
  }

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="relative p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop to dismiss cleanly on outside tap and focus UI */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Notification container: centered with horizontal margins on mobile, absolute dropdown on desktop */}
          <div className="fixed sm:absolute left-3 right-3 max-w-md mx-auto sm:mx-0 sm:left-auto sm:right-0 top-[calc(3.5rem+env(safe-area-inset-top,0px)+8px)] sm:top-full mt-0 sm:mt-2 sm:w-84 sm:max-w-sm bg-card border border-border text-card-foreground rounded-2xl sm:rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                {unread > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded-full">
                    {unread} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                {unread > 0 && (
                  <button onClick={markAll} className="text-xs text-primary hover:underline font-medium">
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="sm:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Close notifications"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="max-h-[min(65vh,480px)] sm:max-h-96 overflow-y-auto overscroll-contain">
              {loading ? (
                <p className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</p>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground">
                  <Bell className="mx-auto mb-2 opacity-30" size={24} />
                  <p className="text-sm">No notifications yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((n) => (
                    <li key={n.id}>
                      <Item n={n} onRead={() => markRead(n.id)} onClose={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ n, onRead, onClose }) {
  const unread = !n.read_at;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm leading-snug ${unread ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
          {n.title}
        </p>
        {unread && (
          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
        )}
      </div>
      {n.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{n.body}</p>}
      <p className="text-[10px] text-muted-foreground/80 mt-1.5">{relativeTime(n.created_at)}</p>
    </>
  );
  const cls = `block px-4 py-3 hover:bg-muted/50 transition-colors ${unread ? 'bg-primary/5' : ''}`;
  if (n.link_url) {
    return (
      <Link to={n.link_url} className={cls} onClick={() => { onRead(); onClose(); }}>
        {body}
      </Link>
    );
  }
  return (
    <div className={cls} onClick={onRead}>
      {body}
    </div>
  );
}
