import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, IndianRupee, Tag as TagIcon, X as XIcon, Sparkles } from 'lucide-react';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import MentorCard from '../components/MentorCard.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';
import StaggeredDropdown from '../components/ui/staggered-dropdown.jsx';
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

  // Build the dropdown items lists. Each first row is a "clear" option that
  // resets the filter to empty; everything else is one button per option.
  const selectedTier = tiers.find((t) => t.name === tier);
  const selectedTag  = tags.find((t) => t.slug === tag);

  const tierItems = useMemo(() => [
    { type: 'button', onClick: () => setFilter('tier', ''), label: 'All prices', icon: XIcon },
    { type: 'divider' },
    ...tiers.map((t) => ({
      type: 'button',
      onClick: () => setFilter('tier', t.name),
      label: `${t.display_name} · ₹${(t.per_minute_paise / 100).toFixed(0)}/min`,
      icon: IndianRupee,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tiers]);

  const tagItems = useMemo(() => [
    { type: 'button', onClick: () => setFilter('tag', ''), label: 'All topics', icon: XIcon },
    { type: 'divider' },
    ...tags.map((t) => ({
      type: 'button',
      onClick: () => setFilter('tag', t.slug),
      label: `${t.display_name}${t.kind === 'expertise' ? '' : ` (${t.kind})`}`,
      icon: TagIcon,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tags]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* ----- Hero ----- */}
      <header className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-medium">
          <Sparkles size={12} /> Verified mentors only
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Find someone who <span className="bg-gradient-to-br from-brand-600 to-brand-800 dark:from-brand-400 dark:to-brand-200 bg-clip-text text-transparent">gets it</span>.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Verified mentors, peer guides, and coaches. Pay only for the minutes you talk.
        </p>
      </header>

      {/* ----- Filter bar (lifted card) ----- */}
      <div className="bg-card border border-border rounded-2xl shadow-soft p-3 sm:p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search by name, headline, or bio…"
              className="pl-9"
            />
          </div>

          <StaggeredDropdown
            label={selectedTier ? selectedTier.display_name : 'All prices'}
            variant="outline"
            align="left"
            items={tierItems}
          />

          <StaggeredDropdown
            label={selectedTag ? selectedTag.display_name : 'All topics'}
            variant="outline"
            align="left"
            items={tagItems}
          />

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="md" onClick={() => { setQInput(''); setSearchParams({}); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ----- Results count ----- */}
      {!loading && (
        <p className="text-sm text-muted-foreground mb-4">
          {items.length === 0
            ? 'No matches yet'
            : `${items.length} ${items.length === 1 ? 'mentor' : 'mentors'} ${activeFilterCount > 0 ? 'match' : 'available'}`}
        </p>
      )}

      {/* ----- Results grid ----- */}
      {loading ? (
        <div className="py-20 flex justify-center"><Spinner className="h-8 w-8" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-muted text-muted-foreground mb-3">
            <Search size={20} />
          </div>
          <h2 className="text-base font-semibold text-foreground">No mentors match your filters</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try clearing a filter or searching for a different topic.
          </p>
          {activeFilterCount > 0 && (
            <Button
              variant="secondary"
              size="md"
              className="mt-4"
              onClick={() => { setQInput(''); setSearchParams({}); }}
            >
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {items.map((it) => <MentorCard key={it.profile_uuid} item={it} />)}
        </div>
      )}
    </div>
  );
}
