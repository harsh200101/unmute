import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

/* -------------------------------------------------------------------------- */
/* NavHeader — pill nav with a sliding indigo cursor.                         */
/* Drops the earlier `mix-blend-difference` trick (which produced muddy text  */
/* against non-grayscale backgrounds) in favour of an explicit two-state      */
/* colour model:                                                              */
/*                                                                            */
/*   • Default tabs       → text-foreground (readable on the card pill)       */
/*   • The hovered tab    → text-primary-foreground (readable on the cursor)  */
/*   • Cursor             → bg-primary  (brand indigo)                        */
/*   • Pill               → bg-card border-border (theme tokens)              */
/*                                                                            */
/* The parent tracks which tab the mouse is over (`hoveredIndex`) and the     */
/* tab compares its own index to flip text colour mid-transition.             */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} props
 * @param {Array<{ to: string, label: string }>} props.items
 * @param {string} [props.className]
 */
export default function NavHeader({ items = [], className = '' }) {
  const [position, setPosition] = useState({ left: 0, width: 0, opacity: 0 });
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (items.length === 0) return null;

  return (
    <ul
      className={`relative mx-auto flex w-fit rounded-full border border-border bg-card shadow-soft p-1 ${className}`}
      onMouseLeave={() => {
        setPosition((pv) => ({ ...pv, opacity: 0 }));
        setHoveredIndex(null);
      }}
    >
      {items.map((item, index) => (
        <Tab
          key={item.to}
          to={item.to}
          isHovered={hoveredIndex === index}
          onActivate={(rect) => {
            setHoveredIndex(index);
            setPosition({ width: rect.width, left: rect.left, opacity: 1 });
          }}
        >
          {item.label}
        </Tab>
      ))}
      <Cursor position={position} />
    </ul>
  );
}

function Tab({ children, to, isHovered, onActivate }) {
  const ref = useRef(null);

  const handleEnter = () => {
    if (!ref.current) return;
    const { width } = ref.current.getBoundingClientRect();
    onActivate({ width, left: ref.current.offsetLeft });
  };

  return (
    <li
      ref={ref}
      onMouseEnter={handleEnter}
      onFocus={handleEnter}
      className="relative z-10 block"
    >
      <Link
        to={to}
        className={`block px-3 py-1.5 text-xs uppercase font-medium md:px-5 md:py-2.5 md:text-sm transition-colors duration-200 ${
          isHovered ? 'text-primary-foreground' : 'text-foreground'
        }`}
      >
        {children}
      </Link>
    </li>
  );
}

function Cursor({ position }) {
  return (
    <motion.li
      aria-hidden
      animate={position}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className="absolute z-0 h-7 rounded-full bg-primary md:h-10"
    />
  );
}
