import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Linkedin, MapPin, Calendar } from 'lucide-react';
import { mentors as mentorsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TagPill from '../components/ui/TagPill.jsx';
import RatingStars from '../components/ui/RatingStars.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatPerMinute, formatDate } from '../lib/format.js';

export default function MentorProfile() {
  const { uuid } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mentor, setMentor] = useState(null);
  const [reviews, setReviews] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setNotFound(false);
    Promise.all([mentorsApi.byUuid(uuid), mentorsApi.reviews(uuid)])
      .then(([m, r]) => {
        if (cancelled) return;
        setMentor(m.mentor);
        setReviews(r);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.response?.status === 404) setNotFound(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uuid]);

  if (loading) return <PageSpinner />;
  if (notFound || !mentor) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Mentor not found</h1>
        <Link to="/mentors" className="inline-block mt-4 underline">Browse all mentors</Link>
      </div>
    );
  }

  const onBook = () => {
    if (!user) navigate(`/login?next=/mentors/${uuid}`);
    else navigate(`/book/${uuid}`);
  };

  const isSelf = user?.id === mentor.user.id;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Card>
        <CardBody className="!p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <Avatar src={mentor.user.avatar_url} name={mentor.user.full_name} size={96} />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{mentor.user.full_name}</h1>
                  <p className="text-slate-700 mt-1">{mentor.headline}</p>
                  <div className="mt-2 flex items-center gap-3 text-sm text-slate-500 flex-wrap">
                    <RatingStars value={Number(mentor.rating_avg) || 0} count={mentor.rating_count} size="md" />
                    {mentor.user.location_city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} />{mentor.user.location_city}
                      </span>
                    )}
                    {mentor.years_experience > 0 && <span>· {mentor.years_experience}+ years exp.</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900">
                    {formatPerMinute(mentor.pricing_tier?.per_minute_paise)}
                  </div>
                  <div className="text-xs text-slate-500">{mentor.pricing_tier?.display_name}</div>
                  {!isSelf && (
                    <Button className="mt-3" size="lg" onClick={onBook}>
                      <Calendar size={16} className="mr-1" /> Book a session
                    </Button>
                  )}
                </div>
              </div>
              {mentor.tags?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {mentor.tags.map((t) => (
                    <TagPill key={t.id} kind={t.kind}>{t.display_name}</TagPill>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardBody>
              <h2 className="font-semibold text-slate-900">About</h2>
              <p className="mt-2 text-slate-700 leading-relaxed whitespace-pre-wrap">{mentor.bio}</p>
              {mentor.linkedin_url && (
                <a
                  href={mentor.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 underline"
                >
                  <Linkedin size={14} /> LinkedIn
                </a>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Reviews ({reviews.total})</h2>
              </div>
              {reviews.items.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No reviews yet.</p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100">
                  {reviews.items.map((rv) => (
                    <div key={rv.uuid} className="py-4 first:pt-0">
                      <div className="flex items-start gap-3">
                        <Avatar src={rv.reviewer.avatar_url} name={rv.reviewer.full_name} size={36} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-900">
                              {rv.reviewer.full_name}
                            </p>
                            <span className="text-xs text-slate-500">{formatDate(rv.created_at)}</span>
                          </div>
                          <RatingStars value={rv.rating} showNumber={false} />
                          {rv.body && (
                            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{rv.body}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardBody>
              <h3 className="font-semibold text-slate-900">Languages</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(mentor.languages || []).map((l) => (
                  <TagPill key={l} kind="neutral">{l.toUpperCase()}</TagPill>
                ))}
              </div>
            </CardBody>
          </Card>
          {mentor.video_intro_url && (
            <Card>
              <CardBody>
                <h3 className="font-semibold text-slate-900">Video intro</h3>
                <video
                  className="mt-2 w-full rounded-lg bg-slate-100"
                  src={mentor.video_intro_url}
                  controls
                  preload="metadata"
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
