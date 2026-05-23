import clsx from 'clsx';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:opacity-60',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:cursor-not-allowed',
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
