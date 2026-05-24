import React, {
  useState, useRef, useEffect, forwardRef,
  useImperativeHandle, useMemo, useCallback, Children,
} from 'react';
import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';
import {
  ArrowRight, Mail, Lock, Eye, EyeOff, ArrowLeft,
  X, AlertCircle, CheckCircle2,
} from 'lucide-react';
import LumaSpin from './luma-spin.jsx';
import { AnimatePresence, motion, useInView } from 'framer-motion';

/* ============================================================================
 * Two-step glass-style sign-in shell.
 * Wizard order: email → password → success → caller navigates away.
 *
 * Props
 *   logo, brandName             — branding shown top-left
 *   onLogin({email, password})  — must throw on bad creds; resolved => success
 *   onGoogleSignIn()            — fires the Google OAuth handoff
 *   onSuccess()                 — called once the success state has been shown
 *   onForgotPassword()          — invoked when user taps the reset link
 * ==========================================================================*/

// ----------------------------- TextLoop ------------------------------------
function TextLoop({
  children, className, interval = 1.2,
  transition = { duration: 0.3 }, variants,
  onIndexChange, stopOnEnd = false,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = Children.toArray(children);
  useEffect(() => {
    const intervalMs = interval * 1000;
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        if (stopOnEnd && current === items.length - 1) {
          clearInterval(timer);
          return current;
        }
        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, stopOnEnd]);
  const motionVariants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit:    { y: -20, opacity: 0 },
  };
  return (
    <div className={cn('relative inline-block whitespace-nowrap', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          initial="initial" animate="animate" exit="exit"
          transition={transition}
          variants={variants || motionVariants}
        >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ----------------------------- BlurFade ------------------------------------
function BlurFade({
  children, className, variant,
  duration = 0.4, delay = 0, yOffset = 6,
  inView = true, inViewMargin = '-50px', blur = '6px',
}) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const defaultVariants = {
    hidden:  { y: yOffset,  opacity: 0, filter: `blur(${blur})` },
    visible: { y: -yOffset, opacity: 1, filter: 'blur(0px)' },
  };
  const combinedVariants = variant || defaultVariants;
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      exit="hidden"
      variants={combinedVariants}
      transition={{ delay: 0.04 + delay, duration, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ----------------------------- GlassButton ---------------------------------
const glassButtonVariants = cva(
  'relative isolate all-unset cursor-pointer rounded-full transition-all',
  {
    variants: {
      size: {
        default: 'text-base font-medium',
        sm: 'text-sm font-medium',
        lg: 'text-lg font-medium',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { size: 'default' },
  }
);
const glassButtonTextVariants = cva(
  'glass-button-text relative block select-none tracking-tighter',
  {
    variants: {
      size: {
        default: 'px-6 py-3.5',
        sm: 'px-4 py-2',
        lg: 'px-8 py-4',
        icon: 'flex h-10 w-10 items-center justify-center',
      },
    },
    defaultVariants: { size: 'default' },
  }
);
const GlassButton = forwardRef(function GlassButton(
  { className, children, size, contentClassName, onClick, ...props },
  ref
) {
  const handleWrapperClick = (e) => {
    const button = e.currentTarget.querySelector('button');
    if (button && e.target !== button) button.click();
  };
  return (
    <div
      className={cn('glass-button-wrap cursor-pointer rounded-full relative', className)}
      onClick={handleWrapperClick}
    >
      <button
        className={cn('glass-button relative z-10', glassButtonVariants({ size }))}
        ref={ref}
        onClick={onClick}
        {...props}
      >
        <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>
          {children}
        </span>
      </button>
      <div className="glass-button-shadow rounded-full pointer-events-none" />
    </div>
  );
});

// ----------------------------- GradientBackground --------------------------
function GradientBackground() {
  return (
    <>
      <style>{`
        @keyframes float1 { 0% { transform: translate(0, 0); } 50% { transform: translate(-10px, 10px); } 100% { transform: translate(0, 0); } }
        @keyframes float2 { 0% { transform: translate(0, 0); } 50% { transform: translate(10px, -10px); } 100% { transform: translate(0, 0); } }
      `}</style>
      <svg
        width="100%" height="100%" viewBox="0 0 800 600" fill="none"
        xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"
        className="absolute top-0 left-0 w-full h-full"
      >
        <defs>
          <linearGradient id="rev_grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   style={{ stopColor: 'var(--color-primary)',  stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-chart-3)',  stopOpacity: 0.6 }} />
          </linearGradient>
          <linearGradient id="rev_grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   style={{ stopColor: 'var(--color-chart-4)',   stopOpacity: 0.9 }} />
            <stop offset="50%"  style={{ stopColor: 'var(--color-secondary)', stopOpacity: 0.7 }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-chart-1)',   stopOpacity: 0.6 }} />
          </linearGradient>
          <radialGradient id="rev_grad3" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   style={{ stopColor: 'var(--color-destructive)', stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-chart-5)',    stopOpacity: 0.4 }} />
          </radialGradient>
          <filter id="rev_blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="35"/></filter>
          <filter id="rev_blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25"/></filter>
          <filter id="rev_blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45"/></filter>
        </defs>
        <g style={{ animation: 'float1 20s ease-in-out infinite' }}>
          <ellipse cx="200" cy="500" rx="250" ry="180" fill="url(#rev_grad1)" filter="url(#rev_blur1)" transform="rotate(-30 200 500)" />
          <rect    x="500" y="100" width="300" height="250" rx="80" fill="url(#rev_grad2)" filter="url(#rev_blur2)" transform="rotate(15 650 225)" />
        </g>
        <g style={{ animation: 'float2 25s ease-in-out infinite' }}>
          <circle  cx="650" cy="450" r="150" fill="url(#rev_grad3)" filter="url(#rev_blur3)" opacity="0.7" />
          <ellipse cx="50"  cy="150" rx="180" ry="120" fill="var(--color-accent)" filter="url(#rev_blur2)" opacity="0.8" />
        </g>
      </svg>
    </>
  );
}

// ----------------------------- Google icon ---------------------------------
function GoogleIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-6 h-6">
      <g fillRule="evenodd" fill="none">
        <g fillRule="nonzero" transform="translate(3, 2)">
          <path fill="#4285F4" d="M57.8123233,30.1515267 C57.8123233,27.7263183 57.6155321,25.9565533 57.1896408,24.1212666 L29.4960833,24.1212666 L29.4960833,35.0674653 L45.7515771,35.0674653 C45.4239683,37.7877475 43.6542033,41.8844383 39.7213169,44.6372555 L39.6661883,45.0037254 L48.4223791,51.7870338 L49.0290201,51.8475849 C54.6004021,46.7020943 57.8123233,39.1313952 57.8123233,30.1515267"/>
          <path fill="#34A853" d="M29.4960833,58.9921667 C37.4599129,58.9921667 44.1456164,56.3701671 49.0290201,51.8475849 L39.7213169,44.6372555 C37.2305867,46.3742596 33.887622,47.5868638 29.4960833,47.5868638 C21.6960582,47.5868638 15.0758763,42.4415991 12.7159637,35.3297782 L12.3700541,35.3591501 L3.26524241,42.4054492 L3.14617358,42.736447 C7.9965904,52.3717589 17.959737,58.9921667 29.4960833,58.9921667"/>
          <path fill="#FBBC05" d="M12.7159637,35.3297782 C12.0932812,33.4944915 11.7329116,31.5279353 11.7329116,29.4960833 C11.7329116,27.4640054 12.0932812,25.4976752 12.6832029,23.6623884 L12.6667095,23.2715173 L3.44779955,16.1120237 L3.14617358,16.2554937 C1.14708246,20.2539019 0,24.7439491 0,29.4960833 C0,34.2482175 1.14708246,38.7380388 3.14617358,42.736447 L12.7159637,35.3297782"/>
          <path fill="#EB4335" d="M29.4960833,11.4050769 C35.0347044,11.4050769 38.7707997,13.7975244 40.9011602,15.7968415 L49.2255853,7.66898166 C44.1130815,2.91684746 37.4599129,0 29.4960833,0 C17.959737,0 7.9965904,6.62018183 3.14617358,16.2554937 L12.6832029,23.6623884 C15.0758763,16.5505675 21.6960582,11.4050769 29.4960833,11.4050769"/>
        </g>
      </g>
    </svg>
  );
}

// ============================================================================
// MAIN
// ============================================================================
export const SignInAuthComponent = ({
  logo = null,
  brandName = 'unmute',
  onLogin,
  onGoogleSignIn,
  onSuccess,
  onForgotPassword,
  onCreateAccount,     // tapped on the "New here? Create an account" link
}) => {
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [authStep, setAuthStep]           = useState('email'); // email → password
  const [modalStatus, setModalStatus]     = useState('closed'); // closed|loading|error|success
  const [modalErrorMessage, setModalErrorMessage] = useState('');

  const isEmailValid    = /\S+@\S+\.\S+/.test(email);
  const isPasswordValid = password.length >= 1;

  const passwordInputRef = useRef(null);

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (modalStatus !== 'closed' || authStep !== 'password' || !isPasswordValid) return;
    setModalStatus('loading');
    try {
      await onLogin?.({ email: email.trim(), password });
      setModalStatus('success');
      setTimeout(() => { onSuccess?.(); }, 900);
    } catch (ex) {
      setModalErrorMessage(
        ex?.response?.data?.error || ex?.message || 'Sign-in failed.'
      );
      setModalStatus('error');
    }
  };

  const handleProgressStep = () => {
    if (authStep === 'email' && isEmailValid) setAuthStep('password');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (authStep === 'email') handleProgressStep();
    }
  };

  const handleGoBack = () => {
    if (authStep === 'password') {
      setAuthStep('email');
      setPassword('');
    }
  };

  const closeModal = () => { setModalStatus('closed'); setModalErrorMessage(''); };

  useEffect(() => {
    if (authStep === 'password') setTimeout(() => passwordInputRef.current?.focus(), 500);
  }, [authStep]);

  // -------------------------- Modal --------------------------
  const Modal = () => (
    <AnimatePresence>
      {modalStatus !== 'closed' && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="relative bg-card/90 border-4 border-border rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-4 mx-2 text-center"
          >
            {(modalStatus === 'error' || modalStatus === 'success') && (
              <button
                onClick={closeModal}
                className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            {modalStatus === 'error' && (
              <>
                <AlertCircle className="w-12 h-12 text-destructive" />
                <p className="text-lg font-medium text-foreground">{modalErrorMessage}</p>
                <GlassButton onClick={closeModal} size="sm" className="mt-4">Try again</GlassButton>
              </>
            )}
            {modalStatus === 'loading' && (
              <TextLoop interval={1.2} stopOnEnd>
                {[
                  { message: 'Signing you in…',    icon: <LumaSpin size={56} /> },
                  { message: 'Catching you up…',   icon: <LumaSpin size={56} /> },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-4">
                    {step.icon}
                    <p className="text-lg font-medium text-foreground">{step.message}</p>
                  </div>
                ))}
              </TextLoop>
            )}
            {modalStatus === 'success' && (
              <div className="flex flex-col items-center gap-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <p className="text-lg font-medium text-foreground">Welcome back!</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // -------------------------- Render --------------------------
  return (
    <div className="bg-background min-h-screen w-screen flex flex-col">
      {/* Component-scoped CSS: glass input/button surfaces + autofill killer. */}
      <style>{`
        input[type="password"]::-ms-reveal, input[type="password"]::-ms-clear { display: none !important; }
        input[type="password"]::-webkit-credentials-auto-fill-button, input[type="password"]::-webkit-strong-password-auto-fill-button { display: none !important; }
        input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active { -webkit-box-shadow: 0 0 0 30px transparent inset !important; -webkit-text-fill-color: var(--foreground) !important; background-color: transparent !important; background-clip: content-box !important; transition: background-color 5000s ease-in-out 0s !important; color: var(--foreground) !important; caret-color: var(--foreground) !important; }
        input:autofill { background-color: transparent !important; background-clip: content-box !important; -webkit-text-fill-color: var(--foreground) !important; color: var(--foreground) !important; }
        @property --angle-1 { syntax: "<angle>"; inherits: false; initial-value: -75deg; }
        @property --angle-2 { syntax: "<angle>"; inherits: false; initial-value: -45deg; }
        .glass-button-wrap { --anim-time: 400ms; --anim-ease: cubic-bezier(0.25, 1, 0.5, 1); --border-width: clamp(1px, 0.0625em, 4px); position: relative; z-index: 2; transform-style: preserve-3d; transition: transform var(--anim-time) var(--anim-ease); }
        .glass-button-wrap:has(.glass-button:active) { transform: rotateX(25deg); }
        .glass-button-shadow { --shadow-cutoff-fix: 2em; position: absolute; width: calc(100% + var(--shadow-cutoff-fix)); height: calc(100% + var(--shadow-cutoff-fix)); top: calc(0% - var(--shadow-cutoff-fix) / 2); left: calc(0% - var(--shadow-cutoff-fix) / 2); filter: blur(clamp(2px, 0.125em, 12px)); transition: filter var(--anim-time) var(--anim-ease); pointer-events: none; z-index: 0; }
        .glass-button-shadow::after { content: ""; position: absolute; inset: 0; border-radius: 9999px; background: linear-gradient(180deg, oklch(from var(--foreground) l c h / 20%), oklch(from var(--foreground) l c h / 10%)); width: calc(100% - var(--shadow-cutoff-fix) - 0.25em); height: calc(100% - var(--shadow-cutoff-fix) - 0.25em); top: calc(var(--shadow-cutoff-fix) - 0.5em); left: calc(var(--shadow-cutoff-fix) - 0.875em); padding: 0.125em; box-sizing: border-box; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; transition: all var(--anim-time) var(--anim-ease); opacity: 1; }
        .glass-button { -webkit-tap-highlight-color: transparent; backdrop-filter: blur(clamp(1px, 0.125em, 4px)); transition: all var(--anim-time) var(--anim-ease); background: linear-gradient(-75deg, oklch(from var(--background) l c h / 5%), oklch(from var(--background) l c h / 20%), oklch(from var(--background) l c h / 5%)); box-shadow: inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%), inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%), 0 0.25em 0.125em -0.125em oklch(from var(--foreground) l c h / 20%), 0 0 0.1em 0.25em inset oklch(from var(--background) l c h / 20%), 0 0 0 0 oklch(from var(--background) l c h); }
        .glass-button:hover { transform: scale(0.975); backdrop-filter: blur(0.01em); box-shadow: inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%), inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%), 0 0.15em 0.05em -0.1em oklch(from var(--foreground) l c h / 25%), 0 0 0.05em 0.1em inset oklch(from var(--background) l c h / 50%), 0 0 0 0 oklch(from var(--background) l c h); }
        .glass-button-text { color: oklch(from var(--foreground) l c h / 90%); text-shadow: 0em 0.25em 0.05em oklch(from var(--foreground) l c h / 10%); transition: all var(--anim-time) var(--anim-ease); }
        .glass-button:hover .glass-button-text { text-shadow: 0.025em 0.025em 0.025em oklch(from var(--foreground) l c h / 12%); }
        .glass-button-text::after { content: ""; display: block; position: absolute; width: calc(100% - var(--border-width)); height: calc(100% - var(--border-width)); top: calc(0% + var(--border-width) / 2); left: calc(0% + var(--border-width) / 2); box-sizing: border-box; border-radius: 9999px; overflow: clip; background: linear-gradient(var(--angle-2), transparent 0%, oklch(from var(--background) l c h / 50%) 40% 50%, transparent 55%); z-index: 3; mix-blend-mode: screen; pointer-events: none; background-size: 200% 200%; background-position: 0% 50%; transition: background-position calc(var(--anim-time) * 1.25) var(--anim-ease), --angle-2 calc(var(--anim-time) * 1.25) var(--anim-ease); }
        .glass-button:hover .glass-button-text::after { background-position: 25% 50%; }
        .glass-button:active .glass-button-text::after { background-position: 50% 15%; --angle-2: -15deg; }
        .glass-button::after { content: ""; position: absolute; z-index: 1; inset: 0; border-radius: 9999px; width: calc(100% + var(--border-width)); height: calc(100% + var(--border-width)); top: calc(0% - var(--border-width) / 2); left: calc(0% - var(--border-width) / 2); padding: var(--border-width); box-sizing: border-box; background: conic-gradient(from var(--angle-1) at 50% 50%, oklch(from var(--foreground) l c h / 50%) 0%, transparent 5% 40%, oklch(from var(--foreground) l c h / 50%) 50%, transparent 60% 95%, oklch(from var(--foreground) l c h / 50%) 100%), linear-gradient(180deg, oklch(from var(--background) l c h / 50%), oklch(from var(--background) l c h / 50%)); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; transition: all var(--anim-time) var(--anim-ease), --angle-1 500ms ease; box-shadow: inset 0 0 0 calc(var(--border-width) / 2) oklch(from var(--background) l c h / 50%); pointer-events: none; }
        .glass-button:hover::after { --angle-1: -125deg; }
        .glass-button:active::after { --angle-1: -75deg; }
        .glass-button-wrap:has(.glass-button:hover) .glass-button-shadow { filter: blur(clamp(2px, 0.0625em, 6px)); }
        .glass-button-wrap:has(.glass-button:hover) .glass-button-shadow::after { top: calc(var(--shadow-cutoff-fix) - 0.875em); opacity: 1; }
        .glass-button-wrap:has(.glass-button:active) .glass-button-shadow { filter: blur(clamp(2px, 0.125em, 12px)); }
        .glass-button-wrap:has(.glass-button:active) .glass-button-shadow::after { top: calc(var(--shadow-cutoff-fix) - 0.5em); opacity: 0.75; }
        .glass-button-wrap:has(.glass-button:active) .glass-button-text { text-shadow: 0.025em 0.25em 0.05em oklch(from var(--foreground) l c h / 12%); }
        .glass-button-wrap:has(.glass-button:active) .glass-button { box-shadow: inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%), inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%), 0 0.125em 0.125em -0.125em oklch(from var(--foreground) l c h / 20%), 0 0 0.1em 0.25em inset oklch(from var(--background) l c h / 20%), 0 0.225em 0.05em 0 oklch(from var(--foreground) l c h / 5%), 0 0.25em 0 0 oklch(from var(--background) l c h / 75%), inset 0 0.25em 0.05em 0 oklch(from var(--foreground) l c h / 15%); }
        @media (hover: none) and (pointer: coarse) { .glass-button::after, .glass-button:hover::after, .glass-button:active::after { --angle-1: -75deg; } .glass-button .glass-button-text::after, .glass-button:active .glass-button-text::after { --angle-2: -45deg; } }
        .glass-input-wrap { position: relative; z-index: 2; transform-style: preserve-3d; border-radius: 9999px; }
        .glass-input { display: flex; position: relative; width: 100%; align-items: center; gap: 0.5rem; border-radius: 9999px; padding: 0.25rem; -webkit-tap-highlight-color: transparent; backdrop-filter: blur(clamp(1px, 0.125em, 4px)); transition: all 400ms cubic-bezier(0.25, 1, 0.5, 1); background: linear-gradient(-75deg, oklch(from var(--background) l c h / 5%), oklch(from var(--background) l c h / 20%), oklch(from var(--background) l c h / 5%)); box-shadow: inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%), inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%), 0 0.25em 0.125em -0.125em oklch(from var(--foreground) l c h / 20%), 0 0 0.1em 0.25em inset oklch(from var(--background) l c h / 20%), 0 0 0 0 oklch(from var(--background) l c h); }
        .glass-input-wrap:focus-within .glass-input { backdrop-filter: blur(0.01em); box-shadow: inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%), inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%), 0 0.15em 0.05em -0.1em oklch(from var(--foreground) l c h / 25%), 0 0 0.05em 0.1em inset oklch(from var(--background) l c h / 50%), 0 0 0 0 oklch(from var(--background) l c h); }
        .glass-input::after { content: ""; position: absolute; z-index: 1; inset: 0; border-radius: 9999px; width: calc(100% + clamp(1px, 0.0625em, 4px)); height: calc(100% + clamp(1px, 0.0625em, 4px)); top: calc(0% - clamp(1px, 0.0625em, 4px) / 2); left: calc(0% - clamp(1px, 0.0625em, 4px) / 2); padding: clamp(1px, 0.0625em, 4px); box-sizing: border-box; background: conic-gradient(from var(--angle-1) at 50% 50%, oklch(from var(--foreground) l c h / 50%) 0%, transparent 5% 40%, oklch(from var(--foreground) l c h / 50%) 50%, transparent 60% 95%, oklch(from var(--foreground) l c h / 50%) 100%), linear-gradient(180deg, oklch(from var(--background) l c h / 50%), oklch(from var(--background) l c h / 50%)); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; transition: all 400ms cubic-bezier(0.25, 1, 0.5, 1), --angle-1 500ms ease; box-shadow: inset 0 0 0 calc(clamp(1px, 0.0625em, 4px) / 2) oklch(from var(--background) l c h / 50%); pointer-events: none; }
        .glass-input-wrap:focus-within .glass-input::after { --angle-1: -125deg; }
        .glass-input-text-area { position: absolute; inset: 0; border-radius: 9999px; pointer-events: none; }
        .glass-input-text-area::after { content: ""; display: block; position: absolute; width: calc(100% - clamp(1px, 0.0625em, 4px)); height: calc(100% - clamp(1px, 0.0625em, 4px)); top: calc(0% + clamp(1px, 0.0625em, 4px) / 2); left: calc(0% + clamp(1px, 0.0625em, 4px) / 2); box-sizing: border-box; border-radius: 9999px; overflow: clip; background: linear-gradient(var(--angle-2), transparent 0%, oklch(from var(--background) l c h / 50%) 40% 50%, transparent 55%); z-index: 3; mix-blend-mode: screen; pointer-events: none; background-size: 200% 200%; background-position: 0% 50%; transition: background-position calc(400ms * 1.25) cubic-bezier(0.25, 1, 0.5, 1), --angle-2 calc(400ms * 1.25) cubic-bezier(0.25, 1, 0.5, 1); }
        .glass-input-wrap:focus-within .glass-input-text-area::after { background-position: 25% 50%; }
      `}</style>

      <Modal />

      <div className={cn('fixed top-4 left-4 z-20 flex items-center gap-2', 'md:left-1/2 md:-translate-x-1/2')}>
        {logo}
        <h1 className="text-base font-bold text-foreground">{brandName}</h1>
      </div>

      <div className={cn('flex w-full flex-1 h-full items-center justify-center bg-card', 'relative overflow-hidden')}>
        <div className="absolute inset-0 z-0"><GradientBackground /></div>

        <fieldset
          disabled={modalStatus !== 'closed'}
          className="relative z-10 flex flex-col items-center gap-8 w-[280px] mx-auto p-4"
        >
          {/* ----- Step titles ----- */}
          <AnimatePresence mode="wait">
            {authStep === 'email' && (
              <motion.div key="email-title" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="w-full flex flex-col items-center gap-4">
                <BlurFade delay={0.25 * 1} className="w-full">
                  <div className="text-center">
                    <p className="font-serif font-light text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground whitespace-nowrap">
                      Welcome back
                    </p>
                  </div>
                </BlurFade>
                <BlurFade delay={0.25 * 2}>
                  <p className="text-sm font-medium text-muted-foreground">Sign in to continue.</p>
                </BlurFade>
                {onGoogleSignIn && (
                  <>
                    <BlurFade delay={0.25 * 3}>
                      <div className="flex items-center justify-center w-full">
                        <GlassButton type="button" onClick={onGoogleSignIn} contentClassName="flex items-center justify-center gap-2" size="sm">
                          <GoogleIcon />
                          <span className="font-semibold text-foreground">Continue with Google</span>
                        </GlassButton>
                      </div>
                    </BlurFade>
                    <BlurFade delay={0.25 * 4} className="w-[300px]">
                      <div className="flex items-center w-full gap-2 py-2">
                        <hr className="w-full border-border" />
                        <span className="text-xs font-semibold text-muted-foreground">OR</span>
                        <hr className="w-full border-border" />
                      </div>
                    </BlurFade>
                  </>
                )}
                {onCreateAccount && (
                  <BlurFade delay={0.25 * 5}>
                    <p className="text-sm text-muted-foreground">
                      New here?{' '}
                      <button
                        type="button"
                        onClick={onCreateAccount}
                        className="font-semibold text-foreground hover:underline transition-colors"
                      >
                        Create an account
                      </button>
                    </p>
                  </BlurFade>
                )}
              </motion.div>
            )}
            {authStep === 'password' && (
              <motion.div key="password-title" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="w-full flex flex-col items-center text-center gap-4">
                <BlurFade delay={0} className="w-full">
                  <div className="text-center">
                    <p className="font-serif font-light text-4xl sm:text-5xl tracking-tight text-foreground whitespace-nowrap">
                      Enter your password
                    </p>
                  </div>
                </BlurFade>
                <BlurFade delay={0.25 * 1}>
                  <p className="text-sm font-medium text-muted-foreground truncate max-w-[260px]">{email}</p>
                </BlurFade>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ----- Form ----- */}
          <form onSubmit={handleFinalSubmit} className="w-[300px] space-y-6">
            {/* EMAIL STEP */}
            <AnimatePresence>
              {authStep === 'email' && (
                <BlurFade key="email-field" className="w-full">
                  <div className="relative w-full">
                    <AnimatePresence>
                      {email.length > 0 && (
                        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className="absolute -top-6 left-4 z-10">
                          <label className="text-xs text-muted-foreground font-semibold">Email</label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="glass-input-wrap w-full">
                      <div className="glass-input">
                        <span className="glass-input-text-area" />
                        <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-10 pl-2">
                          <Mail className="h-5 w-5 text-foreground/80 flex-shrink-0" />
                        </div>
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="relative z-10 h-full w-0 flex-grow bg-transparent text-foreground placeholder:text-foreground/60 focus:outline-none"
                        />
                        <div className={cn('relative z-10 flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out', isEmailValid ? 'w-10 pr-1' : 'w-0')}>
                          <GlassButton type="button" onClick={handleProgressStep} size="icon" aria-label="Continue" contentClassName="text-foreground/80 hover:text-foreground">
                            <ArrowRight className="w-5 h-5" />
                          </GlassButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </BlurFade>
              )}
            </AnimatePresence>

            {/* PASSWORD STEP */}
            <AnimatePresence>
              {authStep === 'password' && (
                <BlurFade key="password-field" className="w-full">
                  <div className="relative w-full">
                    <AnimatePresence>
                      {password.length > 0 && (
                        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className="absolute -top-6 left-4 z-10">
                          <label className="text-xs text-muted-foreground font-semibold">Password</label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="glass-input-wrap w-full">
                      <div className="glass-input">
                        <span className="glass-input-text-area" />
                        <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-10 pl-2">
                          {password.length > 0 ? (
                            <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)} className="text-foreground/80 hover:text-foreground transition-colors p-2 rounded-full">
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          ) : (
                            <Lock className="h-5 w-5 text-foreground/80 flex-shrink-0" />
                          )}
                        </div>
                        <input
                          ref={passwordInputRef}
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="relative z-10 h-full w-0 flex-grow bg-transparent text-foreground placeholder:text-foreground/60 focus:outline-none"
                        />
                        <div className={cn('relative z-10 flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out', isPasswordValid ? 'w-10 pr-1' : 'w-0')}>
                          <GlassButton type="submit" size="icon" aria-label="Sign in" contentClassName="text-foreground/80 hover:text-foreground">
                            <ArrowRight className="w-5 h-5" />
                          </GlassButton>
                        </div>
                      </div>
                    </div>
                  </div>
                  <BlurFade inView delay={0.2}>
                    <div className="mt-4 flex items-center justify-between">
                      <button type="button" onClick={handleGoBack} className="flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Go back
                      </button>
                      {onForgotPassword && (
                        <button
                          type="button"
                          onClick={onForgotPassword}
                          className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                  </BlurFade>
                </BlurFade>
              )}
            </AnimatePresence>
          </form>
        </fieldset>
      </div>
    </div>
  );
};
