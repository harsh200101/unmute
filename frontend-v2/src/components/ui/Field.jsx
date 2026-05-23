import clsx from 'clsx';
import { forwardRef } from 'react';

export const Input = forwardRef(function Input({ className, error, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2',
        error
          ? 'border-rose-400 focus:ring-rose-400/30'
          : 'border-slate-300 focus:border-slate-500 focus:ring-slate-300/40',
        className
      )}
      {...rest}
    />
  );
});

export function Label({ children, htmlFor, className }) {
  return (
    <label htmlFor={htmlFor} className={clsx('block text-sm font-medium text-slate-700 mb-1', className)}>
      {children}
    </label>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-rose-600">{children}</p>;
}

export function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
