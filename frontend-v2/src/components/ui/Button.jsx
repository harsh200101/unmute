import clsx from 'clsx';

const VARIANTS = {
  primary:   'bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-900 border border-slate-200 shadow-soft hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60',
  ghost:     'bg-transparent text-slate-700 hover:bg-slate-100',
  danger:    'bg-rose-600 text-white shadow-soft hover:bg-rose-700 disabled:bg-rose-300',
  outline:   'bg-transparent text-brand-700 border border-brand-200 hover:bg-brand-50',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export default function Button({
  variant = 'primary', size = 'md', className, loading, disabled,
  type = 'button', children, ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150',
        'focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        VARIANTS[variant], SIZES[size], className
      )}
      {...rest}
    >
      {loading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
