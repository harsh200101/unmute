import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { mentors as mentorsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import RatingStars from '../components/ui/RatingStars.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import MentorProfileCard from '../components/ui/profile-card.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate } from '../lib/format.js';

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
        <h1 className="text-xl font-semibold text-foreground">Mentor not found</h1>
        <Link to="/mentors" className="inline-block mt-4 underline text-primary">Browse all mentors</Link>
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
      {/* Hero — themed glass profile card with brand-indigo accents. */}
      <MentorProfileCard
        mentor={mentor}
        onBook={onBook}
        canBook={!isSelf}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardBody>
              <h2 className="font-semibold text-foreground">About</h2>
              <p className="mt-2 text-muted-foreground leading-relaxed whitespace-pre-wrap">{mentor.bio}</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Reviews ({reviews.total})</h2>
              </div>
              {reviews.items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>
              ) : (
                <div className="mt-4 divide-y divide-border">
                  {reviews.items.map((rv) => (
                    <div key={rv.uuid} className="py-4 first:pt-0">
                      <div className="flex items-start gap-3">
                        <Avatar src={rv.reviewer.avatar_url} name={rv.reviewer.full_name} size={36} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">
                              {rv.reviewer.full_name}
                            </p>
                            <span className="text-xs text-muted-foreground">{formatDate(rv.created_at)}</span>
                          </div>
                          <RatingStars value={rv.rating} showNumber={false} />
                          {rv.body && (
                            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{rv.body}</p>
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
          {mentor.video_intro_url && (
            <Card>
              <CardBody>
                <h3 className="font-semibold text-foreground">Video intro</h3>
                <video
                  className="mt-2 w-full rounded-lg bg-muted"
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
