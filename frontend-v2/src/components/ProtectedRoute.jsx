import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { PageSpinner } from './ui/Spinner.jsx';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (role && user.role !== role && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export function PublicOnly({ children }) {
  // For login/register pages: if already signed in, bounce to dashboard.
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
