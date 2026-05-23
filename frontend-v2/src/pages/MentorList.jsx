import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import MentorCard from '../components/MentorCard.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';

export default function MentorList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tiers, setTiers] = useState([]);
  const [tags, setTags] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters mirror URL state so they're shareable + back-button friendly.
  const q = searchParams.get('q') || '';
  const tier = searchParams.get('tier') || '';
  const tag = searchParams.get('tag') || '';
  const [qInput, setQInput] = useState(q);

  // Debounced effect on q
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (qInput) next.set('q', qInput);
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Load filter options
  useEffect(() => {
    let cancelled = false;
    Promise.all([catalog.tiers(), catalog.tags()])
      .then(([t, g]) => { if (!cancelled) { setTiers(t.items); setTags(g.items); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load mentors when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    mentorsApi.list({ q, tier, tag, limit: 30 })
      .then((r) => { if (!cancelled) setItems(r.items || []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q, tier, tag]);

  function setFilter(k, v) {
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v); else next.delete(k);
    setSearchParams(next, { replace: true });
  }

  const activeFilterCount = useMemo(() =>
    [q, tier, tag].filter(Boolean).length, [q, tier, tag]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Find a mentor</h1>
        <p className="text-slate-600 mt-1">Verified experts. Pay only for the minutes you talk.</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search by name, headline, or bio…"
            className="pl-9"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => setFilter('tier', e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
        >
          <option value="">All prices</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.name}>
              {t.display_name} · ₹{(t.per_minute_paise / 100).toFixed(0)}/min
            </option>
          ))}
        </select>
        <select
          value={tag}
          onChange={(e) => setFilter('tag', e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
        >
          <option value="">All topics</option>
          {tags.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.display_name} ({t.kind})
            </option>
          ))}
        </select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="md" onClick={() => { setQInput(''); setSearchParams({}); }}>
            Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner className="h-8 w-8" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          No mentors match your filters yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((it) => <MentorCard key={it.profile_uuid} item={it} />)}
        </div>
      )}
    </div>
  );
}
