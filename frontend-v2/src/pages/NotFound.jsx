import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center text-center px-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-500">404</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-2">Page not found</h1>
        <p className="text-slate-600 mt-2">The page you're looking for doesn't exist or was moved.</p>
        <Link to="/" className="inline-block mt-6">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}
