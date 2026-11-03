import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, ChevronLeft, ChevronRight, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { mentors as mentorsApi } from '../api/endpoints.js';
import Avatar from './Avatar.jsx';
import RatingStars from './ui/RatingStars.jsx';
import { formatPerMinute, formatNextAvailable, formatTime, isToday } from '../lib/format.js';

export default function UpcomingAvailability() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    mentorsApi.upcomingAvailability({ limit: 10, horizonDays: 7 })
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function scroll(direction) {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -320 : 320;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  }

  // If not loading and no mentors have open upcoming slots, hide component
  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className="mb-10" aria-label="Available Soonest Mentors">
      {/* Section Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1 text-xs font-semibold mb-1.5">
            <Zap size={13} className="text-emerald-600 dark:text-emerald-400 fill-emerald-500/20" />
            Book Without Waiting
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            Available Soonest
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Top mentors with confirmed slots in the next 7 days. Book directly in 1 click.
          </p>
        </div>

        {/* Carousel controls (Desktop) */}
        {items.length > 2 && (
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="p-2 rounded-full border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-soft"
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="p-2 rounded-full border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-soft"
              aria-label="Scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Carousel items container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 pt-1 scrollbar-none snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {loading ? (
          // Skeletons
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-72 sm:w-80 rounded-2xl border border-border bg-card p-5 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
              <div className="mt-4 h-6 bg-muted rounded-full w-2/3" />
              <div className="mt-4 h-9 bg-muted rounded-xl" />
            </div>
          ))
        ) : (
          items.map((mentor) => {
            const hasSlots = Array.isArray(mentor.slots) && mentor.slots.length > 0;
            const earliestSlot = mentor.next_slot_at || (hasSlots ? mentor.slots[0] : null);
            const slotIsToday = earliestSlot && isToday(earliestSlot);

            return (
              <div
                key={mentor.profile_uuid}
                className="group shrink-0 w-72 sm:w-80 rounded-2xl border border-border bg-card text-card-foreground p-5 shadow-soft hover:shadow-elev hover:border-primary/40 transition-all flex flex-col justify-between snap-start"
              >
                <div>
                  {/* Top: Avatar, Name, Price */}
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      <Avatar
                        src={mentor.avatar_url}
                        name={mentor.full_name}
                        size={52}
                        className="ring-2 ring-card shadow-soft"
                      />
                      <span
                        aria-label="Verified mentor"
                        className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500 text-white ring-2 ring-card shadow-soft"
                      >
                        <ShieldCheck size={12} />
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/mentors/${mentor.profile_uuid}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors truncate text-base block"
                        >
                          {mentor.full_name}
                        </Link>
                        <span className="shrink-0 inline-flex items-baseline gap-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                          {formatPerMinute(mentor.per_minute_paise)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {mentor.headline}
                      </p>

                      <div className="mt-1.5">
                        <RatingStars
                          value={Number(mentor.rating_avg) || 0}
                          count={mentor.rating_count}
                          size="xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Earliest slot badge */}
                  {earliestSlot && (
                    <div className="mt-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          slotIsToday
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold'
                            : 'bg-primary/10 text-primary border-primary/20'
                        }`}
                      >
                        <Clock size={12} className={slotIsToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'} />
                        Next: {formatNextAvailable(earliestSlot)}
                      </span>
                    </div>
                  )}

                  {/* Upcoming slots quick chips */}
                  {hasSlots && (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        Upcoming open slots
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mentor.slots.slice(0, 3).map((slotIso) => (
                          <button
                            key={slotIso}
                            type="button"
                            onClick={() => navigate(`/book/${mentor.profile_uuid}?slot=${encodeURIComponent(slotIso)}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-muted/60 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                            title={`Book ${formatNextAvailable(slotIso)}`}
                          >
                            <Calendar size={11} className="opacity-70" />
                            {formatTime(slotIso)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action buttons */}
                <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between gap-2">
                  <Link
                    to={`/mentors/${mentor.profile_uuid}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
                  >
                    View bio <ArrowRight size={12} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const slotParam = earliestSlot ? `?slot=${encodeURIComponent(earliestSlot)}` : '';
                      navigate(`/book/${mentor.profile_uuid}${slotParam}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-soft"
                  >
                    <Calendar size={13} />
                    Book Slot
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
