import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Inbox, ArrowLeft } from 'lucide-react';
import { notifications as notifApi } from '../api/endpoints.js';
import Button from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { relativeTime } from '../lib/format.js';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [listRes, countRes] = await Promise.all([
          notifApi.list({ limit: 50 }),
          notifApi.unreadCount(),
        ]);
        if (!cancelled) {
          setItems(listRes.items || []);
          setUnreadCount(countRes.unread || 0);
        }
      } catch (_) {
        // Handled silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleMarkRead(id) {
    try {
      await notifApi.markRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (_) {}
  }

  async function handleMarkAll() {
    try {
      await notifApi.markAllRead();
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (_) {}
  }

  const displayedItems = filter === 'unread' ? items.filter((n) => !n.read_at) : items;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back to dashboard */}
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-soft mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Bell size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAll} className="gap-1.5">
                <CheckCheck size={16} />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-card border border-border rounded-2xl shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
              <Inbox size={24} />
            </div>
            <h3 className="text-base font-semibold text-foreground">No notifications</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === 'unread' ? 'You have no unread notifications.' : 'Notifications about bookings and meetings will appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayedItems.map((n) => {
              const unread = !n.read_at;
              const content = (
                <div className="p-4 sm:p-5 flex items-start gap-4">
                  <div
                    className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                      unread ? 'bg-primary' : 'bg-transparent'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${unread ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                        {n.title}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {n.body}
                      </p>
                    )}
                  </div>
                </div>
              );

              return (
                <div
                  key={n.id}
                  className={`transition-colors hover:bg-muted/50 ${unread ? 'bg-primary/5' : ''}`}
                  onClick={() => unread && handleMarkRead(n.id)}
                >
                  {n.link_url ? (
                    <Link to={n.link_url} className="block">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
