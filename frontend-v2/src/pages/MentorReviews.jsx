import { useEffect, useState } from 'react';
import { reviews as reviewsApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Avatar from '../components/Avatar.jsx';
import RatingStars from '../components/ui/RatingStars.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate } from '../lib/format.js';

export default function MentorReviews() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    reviewsApi.received({ limit: 50 })
      .then((r) => { if (!cancelled) setItems(r.items || []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <PageSpinner />;

  const avg = items.length
    ? items.reduce((s, r) => s + r.rating, 0) / items.length
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900">My reviews</h1>
      <p className="text-slate-600 mt-1">What mentees said about you.</p>

      {items.length === 0 ? (
        <Card className="mt-6"><CardBody className="text-center py-10 text-slate-500">No reviews yet.</CardBody></Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardBody className="flex items-center gap-3">
              <RatingStars value={avg} size="lg" showNumber={false} />
              <p className="text-2xl font-bold text-slate-900">{avg.toFixed(1)}</p>
              <p className="text-sm text-slate-500">across {items.length} review{items.length !== 1 ? 's' : ''}</p>
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <h2 className="font-semibold text-slate-900">All reviews</h2>
            </CardHeader>
            <CardBody className="!p-0">
              <ul className="divide-y divide-slate-100">
                {items.map((r) => (
                  <li key={r.uuid} className={`px-6 py-4 ${r.is_hidden ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <Avatar src={r.reviewer.avatar_url} name={r.reviewer.full_name} size={36} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">
                            {r.reviewer.full_name}
                            {r.direction === 'mentor_to_mentee' && (
                              <span className="ml-2 text-xs text-slate-500">(private — you reviewed them)</span>
                            )}
                            {r.is_hidden && (
                              <span className="ml-2 text-xs text-rose-600">hidden by admin</span>
                            )}
                          </p>
                          <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
                        </div>
                        <RatingStars value={r.rating} showNumber={false} />
                        {r.body && (
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{r.body}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
