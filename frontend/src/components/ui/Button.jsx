import clsx from 'clsx';

// Variants are expressed in semantic design tokens (see index.css + tailwind
// config). They re-skin automatically when the `.dark` class flips on <html>.
const VARIANTS = {
  primary:   'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 active:bg-primary/80 disabled:opacity-60',
  secondary: 'bg-secondary text-secondary-foreground border border-border shadow-soft hover:bg-muted disabled:opacity-60',
  ghost:     'bg-transparent text-foreground hover:bg-muted',
  danger:    'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90 disabled:opacity-60',
  outline:   'bg-transparent text-foreground border border-input hover:bg-accent hover:text-accent-foreground',
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
        'focus:outline-none focus:ring-4 focus:ring-ring/30 disabled:cursor-not-allowed',
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
