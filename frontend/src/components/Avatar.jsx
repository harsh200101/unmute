import clsx from 'clsx';

export default function Avatar({ src, name = '?', size = 40, className }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx('rounded-full object-cover bg-slate-200 border border-slate-200', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={clsx('rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center font-medium border border-slate-200', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
