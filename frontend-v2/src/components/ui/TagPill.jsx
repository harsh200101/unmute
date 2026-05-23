import clsx from 'clsx';

export default function TagPill({ children, kind = 'neutral', size = 'sm', className }) {
  const palette = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    expertise: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    industry: 'bg-sky-50 text-sky-700 border-sky-200',
    info: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const sz = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={clsx('inline-flex items-center rounded-full border font-medium', palette[kind] || palette.neutral, sz, className)}>
      {children}
    </span>
  );
}
