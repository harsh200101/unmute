import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Logo from './Logo.jsx';

/* -------------------------------------------------------------------------- */
/* Reusable two-column auth shell.                                            */
/*   - Left:  form (title, description, optional extra fields, email,         */
/*            password, Google CTA, footer link).                             */
/*   - Right: hero panel (image if provided, otherwise a brand gradient with  */
/*            a tagline + optional testimonial cards).                        */
/* Used by both Register and Login. Animations live in index.css.             */
/* -------------------------------------------------------------------------- */

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
  );
}

function GlassInputWrapper({ children }) {
  return (
    <div className="rounded-2xl border border-input bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-ring focus-within:bg-ring/10">
      {children}
    </div>
  );
}

function TestimonialCard({ testimonial, delay }) {
  return (
    <div className={`animate-testimonial ${delay} flex items-start gap-3 rounded-3xl bg-card/40 backdrop-blur-xl border border-border p-5 w-64 shadow-floaty`}>
      {testimonial.avatarSrc && (
        <img src={testimonial.avatarSrc} className="h-10 w-10 object-cover rounded-2xl" alt="" />
      )}
      <div className="text-sm leading-snug">
        <p className="font-medium text-foreground">{testimonial.name}</p>
        {testimonial.handle && (
          <p className="text-muted-foreground text-xs">{testimonial.handle}</p>
        )}
        <p className="mt-1 text-foreground/80">{testimonial.text}</p>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {'signin'|'signup'} [props.mode]              - tweaks footer + hides remember-me on signup
 * @param {React.ReactNode} [props.extraFields]         - rendered above the email field (e.g. full-name input on signup)
 * @param {string} [props.submitLabel]
 * @param {string} [props.bottomText]                   - e.g. "Already have an account?"
 * @param {string} [props.bottomLinkText]               - e.g. "Sign in"
 * @param {string} [props.bottomLinkTo]                 - react-router path
 * @param {string} [props.heroImageSrc]                 - optional cover image for right column
 * @param {string} [props.heroTagline]                  - shown over gradient if no image
 * @param {Array<{avatarSrc?:string,name:string,handle?:string,text:string}>} [props.testimonials]
 * @param {(e: React.FormEvent) => void} [props.onSubmit]
 * @param {() => void} [props.onGoogleSignIn]
 * @param {() => void} [props.onResetPassword]
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 */
export default function SignInPage({
  title = <span className="font-light tracking-tight">Welcome</span>,
  description = 'Access your account and continue your journey with us.',
  mode = 'signin',
  extraFields = null,
  submitLabel,
  bottomText,
  bottomLinkText,
  bottomLinkTo,
  heroImageSrc,
  heroTagline = 'Calm conversations. Real people. No labels.',
  testimonials = [],
  onSubmit,
  onGoogleSignIn,
  onResetPassword,
  loading = false,
  error = null,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === 'signup';
  const finalSubmitLabel = submitLabel ?? (isSignup ? 'Create account' : 'Sign in');

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col md:flex-row w-full">
      {/* ------------------------------- Left ------------------------------- */}
      <section className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <Link
              to="/"
              aria-label="unmute — home"
              className="animate-element flex items-center gap-2 text-foreground font-semibold tracking-tight"
            >
              <Logo size={36} />
              <span>unmute</span>
            </Link>
            <h1 className="animate-element animate-delay-100 text-3xl md:text-4xl font-semibold leading-tight text-foreground">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-muted-foreground">
              {description}
            </p>

            <form className="space-y-5" onSubmit={onSubmit} noValidate>
              {extraFields && (
                <div className="animate-element animate-delay-300">{extraFields}</div>
              )}

              <div className={`animate-element ${extraFields ? 'animate-delay-400' : 'animate-delay-300'}`}>
                <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                  Email address
                </label>
                <GlassInputWrapper>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-foreground placeholder:text-muted-foreground"
                  />
                </GlassInputWrapper>
              </div>

              <div className={`animate-element ${extraFields ? 'animate-delay-500' : 'animate-delay-400'}`}>
                <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                  Password
                </label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      minLength={isSignup ? 8 : undefined}
                      required
                      placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                      className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                      ) : (
                        <Eye className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              {!isSignup && (
                <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                    <span className="text-foreground/90">Keep me signed in</span>
                  </label>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onResetPassword?.(); }}
                    className="hover:underline text-primary transition-colors"
                  >
                    Reset password
                  </a>
                </div>
              )}

              {error && (
                <p className="animate-element text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="animate-element animate-delay-600 w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed py-4 font-medium transition-colors shadow-elev"
              >
                {loading ? 'Please wait…' : finalSubmitLabel}
              </button>
            </form>

            <div className="animate-element animate-delay-700 relative flex items-center justify-center">
              <span className="w-full border-t border-border"></span>
              <span className="px-4 text-xs uppercase tracking-wide text-muted-foreground bg-background absolute">
                Or continue with
              </span>
            </div>

            <button
              type="button"
              onClick={onGoogleSignIn}
              className="animate-element animate-delay-800 w-full flex items-center justify-center gap-3 border border-border rounded-2xl py-4 text-foreground hover:bg-muted transition-colors"
            >
              <GoogleIcon />
              <span className="text-sm font-medium">Continue with Google</span>
            </button>

            {bottomText && bottomLinkText && bottomLinkTo && (
              <p className="animate-element animate-delay-900 text-center text-sm text-muted-foreground">
                {bottomText}{' '}
                <Link to={bottomLinkTo} className="text-primary hover:underline transition-colors">
                  {bottomLinkText}
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------- Right ------------------------------ */}
      <section className="hidden md:block flex-1 relative p-4">
        <div
          className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center overflow-hidden"
          style={
            heroImageSrc
              ? { backgroundImage: `url(${heroImageSrc})` }
              : {
                  backgroundImage:
                    'linear-gradient(135deg, #4338ca 0%, #6366f1 45%, #a5b4fc 100%)',
                }
          }
        >
          {!heroImageSrc && (
            <div className="absolute inset-0 flex items-end p-10">
              <div className="text-white max-w-sm">
                <p className="text-2xl md:text-3xl font-semibold leading-snug drop-shadow-sm">
                  {heroTagline}
                </p>
                <p className="mt-3 text-sm text-white/80">
                  unmute connects you with peer mentors for honest, judgement-free conversations.
                </p>
              </div>
            </div>
          )}
        </div>

        {testimonials.length > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center">
            <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
            {testimonials[1] && (
              <div className="hidden xl:flex">
                <TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" />
              </div>
            )}
            {testimonials[2] && (
              <div className="hidden 2xl:flex">
                <TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
