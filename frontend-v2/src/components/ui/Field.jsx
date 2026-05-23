import clsx from 'clsx';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const Input = forwardRef(function Input({ className, error, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2',
        // Dark variants
        'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
        error
          ? 'border-rose-400 focus:ring-rose-400/30 dark:border-rose-500'
          : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:focus:border-brand-500',
        className
      )}
      {...rest}
    />
  );
});

export function Label({ children, htmlFor, className }) {
  return (
    <label htmlFor={htmlFor} className={clsx('block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1', className)}>
      {children}
    </label>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-rose-600">{children}</p>;
}

// Password input with a show/hide eye toggle. Falls through every prop the
// stock <Input> accepts (value, onChange, autoComplete, etc.).
export const PasswordInput = forwardRef(function PasswordInput(
  { className, error, ...rest }, ref
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? 'text' : 'password'}
        error={error}
        className={clsx('pr-10', className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
});

export function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
