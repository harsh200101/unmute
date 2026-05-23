export default function Spinner({ className = 'h-6 w-6' }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
