/* -------------------------------------------------------------------------- */
/* Brand mark.                                                                */
/* Renders the unmute microphone+waveform image from /public/logo.png.        */
/* Drop the file there once; this component is used everywhere the logo       */
/* needs to appear (Header, Layout footer, SignInPage, favicon link, etc.).   */
/* The PNG has a transparent background so it sits cleanly on any theme.      */
/* -------------------------------------------------------------------------- */
export default function Logo({
  size = 32,
  className = '',
  alt = 'unmute',
  // Optional: when true, wraps the image in a small rounded surface so the
  // pastel colours stay legible on dark mode. Off by default.
  framed = false,
}) {
  const img = (
    <img
      src="/images/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={framed ? 'block' : `inline-block ${className}`}
      style={{ height: size, width: size }}
      // eager-load — the logo is above-the-fold on every page
      loading="eager"
      decoding="async"
    />
  );
  if (!framed) return img;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-card shadow-soft p-1 ${className}`}
      style={{ height: size + 8, width: size + 8 }}
    >
      {img}
    </span>
  );
}
