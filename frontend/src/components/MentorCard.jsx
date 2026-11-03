import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, MapPin, Languages, Briefcase, ShieldCheck, Mic, Zap, Clock, Calendar } from 'lucide-react';
import Avatar from './Avatar.jsx';
import RatingStars from './ui/RatingStars.jsx';
import { formatPerMinute, formatNextAvailable, isToday } from '../lib/format.js';
import VoiceDilemmaModal from './VoiceDilemmaModal.jsx';
import InstantConnectModal from './InstantConnectModal.jsx';

/* -------------------------------------------------------------------------- */
/* MentorCard — spotlight design.                                             */
/*   - Bigger avatar with a brand glow ring + verified shield overlay.        */
/*   - Price pill in the top-right corner (primary).                          */
/*   - 2-line headline below name + inline rating.                            */
/*   - Subtle metadata row (location · experience · languages) with icons.    */
/*   - Up to 4 tag chips + "+N" overflow.                                     */
/*   - "Online Now" badge & "⚡ Connect Now" button when is_available_now.    */
/*   - "Next: [Date/Time]" badge (highlighted emerald for Today).             */
/*   - 1-click "Book Slot" action navigating directly to booking page.        */
/*   - Quick "Ask Voice Dilemma (₹99)" button.                                */
/*   - Hover: card lifts (shadow), border picks up brand-indigo, CTA arrow    */
/*     glides into view.                                                      */
/*   - Theme-aware: all surfaces ride `bg-card`, `border-border`, etc.        */
/* -------------------------------------------------------------------------- */
export default function MentorCard({ item }) {
  const [dilemmaOpen, setDilemmaOpen] = useState(false);
  const [instantConnectOpen, setInstantConnectOpen] = useState(false);
  const navigate = useNavigate();

  const slotIsToday = item.next_slot_at && isToday(item.next_slot_at);

  return (
    <>
      <Link
        to={`/mentors/${item.profile_uuid}`}
        className="group relative block bg-card text-card-foreground border border-border rounded-2xl p-5 sm:p-6 shadow-soft hover:shadow-elev hover:border-primary/40 transition-all duration-300"
      >
        {/* Soft hover wash from the bottom-right corner. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tl from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        />

        <div className="relative">
          {/* Top row: avatar + identity + price */}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <span aria-hidden className="absolute inset-0 -m-0.5 rounded-full bg-gradient-to-br from-brand-400/40 to-brand-700/40 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              <Avatar
                src={item.avatar_url}
                name={item.full_name}
                size={72}
                className="relative ring-2 ring-card shadow-soft"
              />
              {/* Verified shield in the bottom-right of the avatar */}
              <span
                aria-label="Verified mentor"
                className="absolute -bottom-1 -right-1 inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500 text-white ring-2 ring-card shadow-soft"
              >
                <ShieldCheck size={14} />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground truncate text-base sm:text-lg">
                    {item.full_name}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {item.headline}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-baseline gap-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-sm font-semibold whitespace-nowrap">
                  {formatPerMinute(item.per_minute_paise)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <RatingStars
                  value={Number(item.rating_avg) || 0}
                  count={item.rating_count}
                  size="sm"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.is_available_now && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      Online Now
                    </span>
                  )}
                  {item.next_slot_at && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        slotIsToday
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold'
                          : 'bg-primary/10 text-primary border-primary/20'
                      }`}
                    >
                      <Clock size={12} className={slotIsToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'} />
                      Next: {formatNextAvailable(item.next_slot_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tag chips */}
          {item.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 4).map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-muted text-foreground border border-border px-2.5 py-1 text-xs font-medium"
                >
                  {t.display_name}
                </span>
              ))}
              {item.tags.length > 4 && (
                <span className="rounded-full bg-muted/50 text-muted-foreground border border-border px-2.5 py-1 text-xs font-medium">
                  +{item.tags.length - 4}
                </span>
              )}
            </div>
          )}

          {/* Middle action row: Quick actions */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/book/${item.profile_uuid}${item.next_slot_at ? `?slot=${encodeURIComponent(item.next_slot_at)}` : ''}`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-soft"
            >
              <Calendar size={12} />
              Book Slot
            </button>

            {item.is_available_now && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setInstantConnectOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-soft transition-all active:scale-95"
              >
                <Zap size={12} className="fill-current" />
                ⚡ Connect Now
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDilemmaOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition-colors"
            >
              <Mic size={12} />
              Ask Voice Dilemma (₹99)
            </button>
          </div>

          {/* Footer metadata row */}
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {item.location_city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={12} className="text-primary/70" /> {item.location_city}
              </span>
            )}
            {item.years_experience > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={12} className="text-primary/70" /> {item.years_experience}+ yrs
              </span>
            )}
            {Array.isArray(item.languages) && item.languages.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Languages size={12} className="text-primary/70" />
                {item.languages.map((l) => l.toUpperCase()).join(', ')}
              </span>
            )}

            {/* CTA — slides in on hover */}
            <span className="ml-auto inline-flex items-center gap-1 text-primary font-medium translate-x-0 group-hover:translate-x-0.5 transition-transform">
              View profile <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
      </Link>

      <VoiceDilemmaModal
        isOpen={dilemmaOpen}
        onClose={() => setDilemmaOpen(false)}
        mentor={item}
      />

      <InstantConnectModal
        isOpen={instantConnectOpen}
        onClose={() => setInstantConnectOpen(false)}
        mentor={item}
      />
    </>
  );
}
