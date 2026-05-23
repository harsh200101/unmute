import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Hi {user.full_name.split(' ')[0]} 👋</h1>
      <p className="text-slate-600">
        {!user.email_verified && (
          <span className="text-amber-700">
            Please verify your email to unlock bookings.{' '}
            <Link to="/verify-email" className="underline">Resend link</Link>
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-8">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Find a mentor</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600">
              Browse approved mentors and book a 60-minute slot. Pay only for the time you talk.
            </p>
            <Link to="/mentors" className="block mt-4">
              <Button className="w-full">Browse mentors</Button>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Your bookings</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600">Manage upcoming and past sessions.</p>
            <Link to="/bookings" className="block mt-4">
              <Button variant="secondary" className="w-full">My bookings</Button>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Wallet</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600">Top up before your call so we can charge per minute.</p>
            <Link to="/wallet" className="block mt-4">
              <Button variant="secondary" className="w-full">Open wallet</Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      {user.role === 'mentor' && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">Mentor tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-4">
            <Card><CardBody>
              <h3 className="font-semibold">Profile &amp; pricing</h3>
              <p className="text-sm text-slate-600 mt-1">Update your tier, headline, languages and categories.</p>
              <Link to="/mentor/settings" className="block mt-3">
                <Button size="sm" variant="secondary">Edit profile</Button>
              </Link>
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="font-semibold">Availability</h3>
              <p className="text-sm text-slate-600 mt-1">Set your weekly slots and one-off overrides.</p>
              <Link to="/mentor/availability" className="block mt-3">
                <Button size="sm" variant="secondary">Edit availability</Button>
              </Link>
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="font-semibold">Earnings</h3>
              <p className="text-sm text-slate-600 mt-1">View earnings and request withdrawals.</p>
              <Link to="/mentor/earnings" className="block mt-3">
                <Button size="sm" variant="secondary">View earnings</Button>
              </Link>
            </CardBody></Card>
            <Card><CardBody>
              <h3 className="font-semibold">Reviews</h3>
              <p className="text-sm text-slate-600 mt-1">See what mentees said about you.</p>
              <Link to="/mentor/reviews" className="block mt-3">
                <Button size="sm" variant="secondary">My reviews</Button>
              </Link>
            </CardBody></Card>
          </div>
        </div>
      )}

      {user.role === 'mentee' && (
        <div className="mt-10 bg-slate-900 text-white rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Want to mentor on unmute?</h2>
          <p className="mt-1 text-slate-300 max-w-2xl">
            Share what you know, set your per-minute rate, and earn 70% of every minute. Admin reviews applications within 1-2 business days.
          </p>
          <Link to="/mentor/apply" className="inline-block mt-4">
            <Button className="!bg-white !text-slate-900 hover:!bg-slate-100">Apply to mentor</Button>
          </Link>
        </div>
      )}

      {user.role === 'admin' && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">Admin</h2>
          <Link to="/admin" className="block mt-3">
            <Button>Open admin panel</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
