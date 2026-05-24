/* -------------------------------------------------------------------------- */
/* Luma-spin loader.                                                          */
/* Two stacked squares chase each other around a rounded frame.               */
/* Keyframes + base styling live in `src/index.css` under `.luma-spin` so the */
/* component itself is pure markup. `size` (px) is passed through as a CSS    */
/* variable; the inset values inside the keyframes scale proportionally.      */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} props
 * @param {number} [props.size]       - outer box dimension in px (default 65)
 * @param {string} [props.className]  - additional classes on the wrapper
 * @param {string} [props.label]      - accessible label for screen readers
 */
export default function LumaSpin({ size = 65, className = '', label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`luma-spin ${className}`}
      style={{ '--luma-size': `${size}px` }}
    >
      <span />
      <span />
    </span>
  );
}

// Backwards-compatible default export name used by the original snippet.
export const Component = LumaSpin;
