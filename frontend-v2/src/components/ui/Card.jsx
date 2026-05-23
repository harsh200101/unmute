import clsx from 'clsx';

export default function Card({ className, children }) {
  return (
    <div className={clsx('bg-white border border-slate-200 rounded-xl shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return <div className={clsx('px-6 py-4 border-b border-slate-200', className)}>{children}</div>;
}

export function CardBody({ children, className }) {
  return <div className={clsx('px-6 py-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }) {
  return <div className={clsx('px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-xl', className)}>{children}</div>;
}
