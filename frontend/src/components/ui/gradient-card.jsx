/* -------------------------------------------------------------------------- */
/* GradientCard — skewed gradient panel + dark-glass content overlay.         */
/* Adapted from a generic skew-card snippet. On hover the gradient panel      */
/* straightens out and the content slides left, revealing the gradient on     */
/* the right edge. Two soft blobs animate around the card frame.              */
/*                                                                            */
/* The card is intentionally "dark UI" in both light and dark theme — that's  */
/* the visual identity of this block. The page bg around it still respects    */
/* the theme tokens.                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} props.desc
 * @param {string} props.gradientFrom       - hex/rgb start colour
 * @param {string} props.gradientTo         - hex/rgb end colour
 * @param {React.ReactNode} [props.icon]    - rendered in a glass badge in the corner
 * @param {string|number}   [props.step]    - shown as a big numeric badge (for "step N" cards)
 * @param {React.ReactNode} [props.cta]     - optional CTA node (e.g. a Link)
 * @param {string}          [props.className]
 */
export default function GradientCard({
  title,
  desc,
  gradientFrom,
  gradientTo,
  icon,
  step,
  cta,
  className = '',
}) {
  const gradientBg = `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`;

  return (
    <div
      className={`group relative w-full sm:w-[300px] h-[360px] sm:h-[400px] mx-auto transition-all duration-500 ${className}`}
    >
      {/* Skewed gradient panel (sharp) */}
      <span
        aria-hidden
        className="absolute top-0 left-[40px] w-1/2 h-full rounded-2xl transform skew-x-[12deg] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[16px] group-hover:w-[calc(100%-72px)]"
        style={{ background: gradientBg }}
      />
      {/* Skewed gradient panel (blurred glow underlayer) */}
      <span
        aria-hidden
        className="absolute top-0 left-[40px] w-1/2 h-full rounded-2xl transform skew-x-[12deg] blur-[36px] opacity-70 transition-all duration-500 group-hover:skew-x-0 group-hover:left-[16px] group-hover:w-[calc(100%-72px)]"
        style={{ background: gradientBg }}
      />

      {/* Floating blobs that bloom on hover */}
      <span aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <span className="absolute top-0 left-0 w-0 h-0 rounded-full opacity-0 bg-white/15 backdrop-blur-md shadow-soft transition-all duration-500 gc-blob group-hover:top-[-40px] group-hover:left-[40px] group-hover:w-[90px] group-hover:h-[90px] group-hover:opacity-100" />
        <span className="absolute bottom-0 right-0 w-0 h-0 rounded-full opacity-0 bg-white/15 backdrop-blur-md shadow-soft transition-all duration-500 gc-blob gc-blob--delay group-hover:bottom-[-40px] group-hover:right-[40px] group-hover:w-[90px] group-hover:h-[90px] group-hover:opacity-100" />
      </span>

      {/* Content surface — dark glass over the gradient */}
      <div className="relative z-20 left-0 mx-2 sm:mx-0 px-7 py-6 sm:px-9 sm:py-8 h-full flex flex-col bg-white/5 dark:bg-black/30 backdrop-blur-xl border border-white/10 shadow-floaty rounded-2xl text-white transition-all duration-500 group-hover:-translate-x-2">
        {/* Top row: step number OR icon badge */}
        <div className="flex items-start justify-between mb-4">
          {step != null && (
            <span className="text-5xl font-bold tracking-tight text-white/90 leading-none">
              {String(step).padStart(2, '0')}
            </span>
          )}
          {icon && (
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/15 border border-white/20 text-white backdrop-blur-md">
              {icon}
            </span>
          )}
        </div>

        <h3 className="text-xl sm:text-2xl font-semibold leading-tight">{title}</h3>
        <p className="mt-3 text-sm sm:text-base text-white/85 leading-relaxed flex-1">
          {desc}
        </p>

        {cta && <div className="mt-4">{cta}</div>}
      </div>

      {/* Local CSS — blob keyframes scoped to this component family. */}
      <style>{`
        @keyframes gc-blob {
          0%, 100% { transform: translateY(8px); }
          50%      { transform: translateY(-8px); }
        }
        .gc-blob          { animation: gc-blob 2.6s ease-in-out infinite; }
        .gc-blob--delay   { animation-delay: -1.3s; }
      `}</style>
    </div>
  );
}
