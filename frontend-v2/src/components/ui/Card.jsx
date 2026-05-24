import clsx from 'clsx';

export default function Card({ className, children, interactive = false }) {
  return (
    <div className={clsx(
      'bg-card text-card-foreground border border-border rounded-2xl shadow-soft',
      interactive && 'transition-all hover:shadow-elev hover:border-ring/40 cursor-pointer',
      className,
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return <div className={clsx('px-5 sm:px-6 py-4 border-b border-border', className)}>{children}</div>;
}

export function CardBody({ children, className }) {
  return <div className={clsx('px-5 sm:px-6 py-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }) {
  return <div className={clsx('px-5 sm:px-6 py-4 border-t border-border bg-muted/40 rounded-b-2xl', className)}>{children}</div>;
}
