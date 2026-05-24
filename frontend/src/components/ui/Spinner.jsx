import LumaSpin from './luma-spin.jsx';

/* -------------------------------------------------------------------------- */
/* Spinner / PageSpinner — app-wide loading indicators.                       */
/* The actual visual is delegated to <LumaSpin> so every existing call site   */
/* (~22 files) upgrades automatically. We preserve the old `className` API   */
/* (`h-6 w-6`, `h-8 w-8`, ...) by translating Tailwind height utilities into  */
/* pixel sizes for the underlying luma-spin.                                  */
/* -------------------------------------------------------------------------- */

// Map common Tailwind `h-N` utilities to pixel sizes (rem * 16).
const TW_HEIGHT_TO_PX = {
  3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
  9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80, 24: 96,
};

function parseSizeFromClassName(className) {
  if (!className) return null;
  const match = className.match(/h-(\d+)/);
  if (!match) return null;
  return TW_HEIGHT_TO_PX[Number(match[1])] ?? null;
}

export default function Spinner({ className = 'h-6 w-6', size }) {
  const resolvedSize = size ?? parseSizeFromClassName(className) ?? 24;
  return <LumaSpin size={resolvedSize} />;
}

export function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LumaSpin size={48} />
    </div>
  );
}
