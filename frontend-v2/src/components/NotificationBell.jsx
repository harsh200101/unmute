import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notifications as notifApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { relativeTime } from '../lib/format.js';

const POLL_MS = 30_000;

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Periodic unread-count fetch (only when logged in)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await notifApi.unreadCount();
        if (!cancelled) setUnread(r.unread || 0);
      } catch (_) { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  // Load list when opening
  async function openDropdown() {
    setOpen(true);
    setLoading(true);
    try {
      const r = await notifApi.list({ limit: 10 });
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
        className="relative p-2 rounded-md hover:bg-slate-100 text-slate-700"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-lg z-40">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-slate-600 hover:text-slate-900 underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <Item n={n} onRead={() => markRead(n.id)} onClose={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ n, onRead, onClose }) {
  const unread = !n.read_at;
  const body = (
    <>
      <p className={`text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
        {n.title}
      </p>
      {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
      <p className="text-[11px] text-slate-400 mt-1">{relativeTime(n.created_at)}</p>
    </>
  );
  const cls = `block px-4 py-3 hover:bg-slate-50 transition-colors ${unread ? 'bg-blue-50/30' : ''}`;
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
