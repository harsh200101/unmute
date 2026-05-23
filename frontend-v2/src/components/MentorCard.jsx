import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import TagPill from './ui/TagPill.jsx';
import RatingStars from './ui/RatingStars.jsx';
import { formatPerMinute } from '../lib/format.js';

// Used in MentorList. Item shape comes from GET /api/mentors.items[*].
export default function MentorCard({ item }) {
  return (
    <Link
      to={`/mentors/${item.profile_uuid}`}
      className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-slate-300 transition-shadow"
    >
      <div className="flex items-start gap-4">
        <Avatar src={item.avatar_url} name={item.full_name} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-900 truncate">{item.full_name}</h3>
            <span className="shrink-0 text-sm font-semibold text-slate-900">
              {formatPerMinute(item.per_minute_paise)}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{item.headline}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <RatingStars value={Number(item.rating_avg) || 0} count={item.rating_count} />
            {item.location_city && <span>· {item.location_city}</span>}
            {item.years_experience > 0 && <span>· {item.years_experience}+ yrs</span>}
          </div>
          {item.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 5).map((t) => (
                <TagPill key={t.id} kind={t.kind}>{t.display_name}</TagPill>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
