import { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import api from './api/client.js';

function Landing() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api
      .get('/readyz', { baseURL: '' })
      .then((r) => setHealth(r.data))
      .catch((e) => setHealth({ ok: false, error: e.message }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-6">
        <header>
          <h1 className="text-4xl font-bold text-slate-900">unmute v2</h1>
          <p className="text-slate-600 mt-2">
            Phase 0 scaffold. See <code>docs/v2-spec.md</code> for the full design.
          </p>
        </header>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Backend reachability
          </h2>
          {health === null ? (
            <p className="mt-2 text-slate-500">Checking…</p>
          ) : health.ok ? (
            <p className="mt-2 text-emerald-600">
              ✓ Backend up · DB {health.db ? 'reachable' : 'not reachable'}
            </p>
          ) : (
            <p className="mt-2 text-rose-600">✗ Backend unreachable: {health.error}</p>
          )}
        </section>

        <nav className="text-sm text-slate-600 space-x-4">
          <Link to="/about" className="underline">About</Link>
          <a
            href="https://github.com"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Repo
          </a>
        </nav>
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl">
        <h1 className="text-3xl font-bold">About</h1>
        <p className="mt-2 text-slate-600">
          unmute is a 1-on-1 paid mentoring marketplace with per-minute billing during video
          calls. The v2 rebuild is documented in <code>docs/v2-spec.md</code>.
        </p>
        <Link to="/" className="text-blue-600 underline mt-4 inline-block">
          ← back
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/about" element={<About />} />
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-slate-500">404</p>
          </div>
        }
      />
    </Routes>
  );
}
