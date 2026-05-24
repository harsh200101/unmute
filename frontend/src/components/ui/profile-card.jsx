import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar, ArrowUpRight, Share2, Linkedin, MapPin, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Avatar from '../Avatar.jsx';
import RatingStars from './RatingStars.jsx';

/* -------------------------------------------------------------------------- */
/* MentorProfileCard — hero panel for the mentor detail page.                 */
/* Adapted from a generic "profile-card" snippet: kept the structural ideas  */
/* (glass card, animated blobs, gradient top bar, avatar glow, status pulse,  */
/* skill chips, dual-CTA row, hover scales) and re-skinned to brand-indigo.   */
/* All surfaces ride semantic design tokens.                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} props
 * @param {object} props.mentor             - mentor record from /api/mentors/:uuid
 * @param {() => void} props.onBook         - tap on "Book a session"
 * @param {boolean} [props.canBook]         - hides the Book CTA when viewer is the mentor themselves
 * @param {string} [props.className]
 */
export default function MentorProfileCard({ mentor, onBook, canBook = true, className }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(null);

  // The card surfaces the viewer's current local time as a subtle "now feels
  // like a fine time to chat" cue.
  const timeText = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const hour12 = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour12}:${m} ${ampm}`;
  }, []);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard rejected — silently no-op */ }
  };

  const name      = mentor.user.full_name;
  const headline  = mentor.headline;
  const bio       = mentor.bio;
  const city      = mentor.user.location_city;
  const years     = mentor.years_experience;
  const tags      = mentor.tags || [];
  const languages = mentor.languages || [];
  const priceLabel = mentor.pricing_tier?.display_name;
  const perMin     = mentor.pricing_tier?.per_minute_paise;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={cn('relative w-full', className)}
    >
      {/* ----- Soft animated background blobs (sit behind the card) ----- */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-400/15 via-primary/10 to-brand-700/15 opacity-60 blur-3xl" />
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
          className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-gradient-to-br from-brand-500/30 to-brand-700/30 blur-3xl"
        />
        <motion.div
          animate={{ rotate: [360, 0] }}
          transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
          className="absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-gradient-to-tr from-brand-300/30 to-brand-500/30 blur-3xl"
        />
      </div>

      {/* ----- Card surface ----- */}
      <div className="group relative overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-elev transition-shadow duration-500 hover:shadow-floaty">
        {/* Top gradient strip */}
        <div aria-hidden className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-400 via-primary to-brand-700" />

        {/* Subtle hover wash */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-brand-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative p-6 sm:p-8">
          {/* ----- Top row: static verified badge + viewer local time ----- */}
          <div className="mb-6 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <ShieldCheck size={14} />
              Verified mentor
            </span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock size={14} />
              <span className="text-sm font-mono">{timeText}</span>
            </div>
          </div>

          {/* ----- Identity row: avatar + name/headline + price + book ----- */}
          <div className="mb-6 flex flex-col sm:flex-row gap-6">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="relative shrink-0 mx-auto sm:mx-0"
            >
              <div aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 blur-md opacity-50" />
              <Avatar
                src={mentor.user.avatar_url}
                name={name}
                size={96}
                className="relative ring-2 ring-card shadow-xl"
              />
            </motion.div>

            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {name}
                  </h1>
                  {headline && (
                    <p className="mt-1 text-base font-medium text-primary">{headline}</p>
                  )}
                  <div className="mt-2 flex items-center justify-center sm:justify-start gap-3 text-sm text-muted-foreground flex-wrap">
                    <RatingStars value={Number(mentor.rating_avg) || 0} count={mentor.rating_count} size="md" />
                    {city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} />{city}
                      </span>
                    )}
                    {years > 0 && <span>· {years}+ yrs exp.</span>}
                  </div>
                </div>
                {perMin != null && (
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-foreground">
                      {formatPerMin(perMin)}
                    </div>
                    {priceLabel && (
                      <div className="text-xs text-muted-foreground">{priceLabel}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ----- Bio (truncated to 3 lines so the card stays compact) ----- */}
          {bio && (
            <p className="mb-6 text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {bio}
            </p>
          )}

          {/* ----- Skill chips (mentor tags) ----- */}
          {tags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {tags.slice(0, 8).map((tag, index) => (
                <motion.span
                  key={tag.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="rounded-full bg-gradient-to-r from-primary/10 to-brand-500/10 px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:border-primary/40 transition-all cursor-default"
                >
                  {tag.display_name}
                </motion.span>
              ))}
              {tags.length > 8 && (
                <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  +{tags.length - 8} more
                </span>
              )}
            </div>
          )}

          {/* ----- Dual-CTA row ----- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {canBook && (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onHoverStart={() => setHovered('book')}
                onHoverEnd={() => setHovered(null)}
              >
                <button
                  type="button"
                  onClick={onBook}
                  className="relative h-12 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-brand-700 font-semibold text-primary-foreground shadow-soft transition-shadow hover:shadow-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span className="relative z-10 inline-flex items-center justify-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Book a session
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                  <AnimatePresence>
                    {hovered === 'book' && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/10"
                      />
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <button
                type="button"
                onClick={handleShare}
                className="h-12 w-full rounded-2xl border border-border bg-card text-foreground font-semibold shadow-soft transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Share2 className="h-5 w-5" />
                  {copied ? 'Link copied!' : 'Share profile'}
                </span>
              </button>
            </motion.div>
          </div>

          {/* ----- Languages + LinkedIn footer row ----- */}
          {(languages.length > 0 || mentor.linkedin_url) && (
            <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4 border-t border-border">
              {languages.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Speaks</span>
                  <div className="flex flex-wrap gap-1.5">
                    {languages.map((l) => (
                      <span
                        key={l}
                        className="rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-xs font-medium"
                      >
                        {l.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {mentor.linkedin_url && (
                <a
                  href={mentor.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Linkedin size={14} />
                  LinkedIn
                </a>
              )}
            </div>
          )}

          {/* ----- Decorative pulsing blob in the bottom-right ----- */}
          <motion.div
            aria-hidden
            className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br from-primary/15 to-brand-700/15 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Local helper to avoid pulling format.js into this UI-only component.
function formatPerMin(paise) {
  if (paise == null) return '';
  return `₹${(paise / 100).toFixed(0)}/min`;
}
