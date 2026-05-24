import clsx from 'clsx';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const Input = forwardRef(function Input({ className, error, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-lg border bg-card text-foreground px-3 py-2 text-sm',
        'placeholder:text-muted-foreground focus:outline-none focus:ring-2',
        error
          ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
          : 'border-input focus:border-ring focus:ring-ring/20',
        className
      )}
      {...rest}
    />
  );
});

export function Label({ children, htmlFor, className }) {
  return (
    <label htmlFor={htmlFor} className={clsx('block text-sm font-medium text-foreground mb-1', className)}>
      {children}
    </label>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
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
        className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
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
