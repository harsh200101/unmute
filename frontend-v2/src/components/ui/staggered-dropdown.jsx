import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* StaggeredDropdown — small action menu.                                     */
/* Opens with a vertical scale + staggered item fade-in (framer-motion).      */
/* Closes on outside click and Escape.                                        */
/*                                                                            */
/* Usage:                                                                     */
/*   <StaggeredDropdown                                                       */
/*     trigger={<Avatar … />}              // any React node                  */
/*     items={[                                                               */
/*       { type: 'link',   to: '/me', label: 'Profile', icon: User },         */
/*       { type: 'divider' },                                                 */
/*       { type: 'button', onClick: handleSignOut, label: 'Sign out',         */
/*         icon: LogOut, variant: 'destructive' },                            */
/*     ]}                                                                     */
/*   />                                                                       */
/* -------------------------------------------------------------------------- */

const wrapperVariants = {
  open:   { scaleY: 1, transition: { when: 'beforeChildren', staggerChildren: 0.06 } },
  closed: { scaleY: 0, transition: { when: 'afterChildren',  staggerChildren: 0.06 } },
};
const itemVariants = {
  open:   { opacity: 1, y: 0,   transition: { when: 'beforeChildren' } },
  closed: { opacity: 0, y: -10, transition: { when: 'afterChildren' } },
};
const iconVariants = {
  open:   { scale: 1, y: 0 },
  closed: { scale: 0, y: -5 },
};
const chevronVariants = {
  open:   { rotate: 180 },
  closed: { rotate: 0 },
};

/**
 * @param {object}                                            props
 * @param {React.ReactNode}                                   [props.trigger]      - custom trigger node; falls back to a labelled button
 * @param {string}                                            [props.label]        - text shown on the default trigger
 * @param {Array<{
 *   type?: 'link' | 'button' | 'divider',
 *   to?: string,
 *   onClick?: () => void,
 *   label?: string,
 *   icon?: React.ComponentType<{size?: number}>,
 *   variant?: 'default' | 'destructive',
 *   header?: boolean        // non-clickable header row (e.g. shows the user's name)
 * }>}                                                        props.items
 * @param {'left' | 'right' | 'center'}                       [props.align]        - where the menu pops (default 'right')
 * @param {string}                                            [props.menuClassName]
 * @param {string}                                            [props.triggerClassName]
 */
export default function StaggeredDropdown({
  trigger,
  label = 'Menu',
  items = [],
  align = 'right',
  // Default-trigger style variant. Ignored when `trigger` is supplied.
  // Mirrors our Button variants so the dropdown blends with surrounding CTAs.
  variant = 'primary',
  size = 'md',
  menuClassName,
  triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const alignClasses = {
    right:  'right-0',
    left:   'left-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <motion.div
      ref={rootRef}
      animate={open ? 'open' : 'closed'}
      className="relative inline-block"
    >
      {trigger ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn('rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', triggerClassName)}
        >
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.98]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            {
              sm: 'px-3 py-1.5 text-sm',
              md: 'px-4 py-2 text-sm',
              lg: 'px-5 py-3 text-base',
            }[size] || 'px-4 py-2 text-sm',
            {
              primary:   'bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft',
              secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-muted shadow-soft',
              ghost:     'bg-transparent text-foreground hover:bg-muted',
              outline:   'bg-transparent text-foreground border border-input hover:bg-accent hover:text-accent-foreground',
            }[variant],
            triggerClassName
          )}
        >
          <span>{label}</span>
          <motion.span variants={chevronVariants} className="inline-flex">
            <ChevronDown size={16} />
          </motion.span>
        </button>
      )}

      <motion.ul
        initial={wrapperVariants.closed}
        variants={wrapperVariants}
        role="menu"
        style={{ originY: 'top' }}
        className={cn(
          'flex flex-col gap-1 p-2 rounded-xl bg-popover text-popover-foreground border border-border shadow-xl',
          // Cap the visible menu height — long item lists (e.g. 20+ mentor
          // topics) used to spill below the viewport. Internal scroll kicks
          // in once we hit ~70% of viewport height. `overscroll-contain`
          // stops the page from scrolling along with the menu wheel.
          'absolute top-[calc(100%+8px)] min-w-[12rem] max-w-[18rem] max-h-[min(70vh,420px)] z-50',
          'overflow-y-auto overscroll-contain',
          alignClasses[align],
          menuClassName
        )}
      >
        {items.map((item, i) => {
          if (item.type === 'divider') {
            return <li key={`d-${i}`} role="separator" className="my-1 -mx-2 h-px bg-border" />;
          }
          if (item.header) {
            return (
              <li
                key={`h-${i}`}
                className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground select-none"
              >
                {item.label}
              </li>
            );
          }
          return (
            <Item key={`i-${i}`} item={item} closeMenu={() => setOpen(false)} />
          );
        })}
      </motion.ul>
    </motion.div>
  );
}

function Item({ item, closeMenu }) {
  const Icon = item.icon;
  const destructive = item.variant === 'destructive';
  const baseClasses = cn(
    'flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors text-left',
    destructive
      ? 'text-destructive hover:bg-destructive/10'
      : 'text-foreground hover:bg-accent hover:text-accent-foreground'
  );

  const inner = (
    <>
      {Icon && (
        <motion.span variants={iconVariants} className="inline-flex">
          <Icon size={16} />
        </motion.span>
      )}
      <span>{item.label}</span>
    </>
  );

  if (item.type === 'link' && item.to) {
    return (
      <motion.li variants={itemVariants} role="none">
        <Link to={item.to} role="menuitem" onClick={closeMenu} className={baseClasses}>
          {inner}
        </Link>
      </motion.li>
    );
  }

  return (
    <motion.li variants={itemVariants} role="none">
      <button
        type="button"
        role="menuitem"
        onClick={() => { closeMenu(); item.onClick?.(); }}
        className={baseClasses}
      >
        {inner}
      </button>
    </motion.li>
  );
}
