import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* 404 page — full-screen, two animation layers behind a centered message.    */
/*   • CircleAnimation     — expanding canvas particles wash over the screen. */
/*   • CharactersAnimation — stick-figure silhouettes scroll & rotate.        */
/*   • MessageDisplay      — fades in after the wash and offers Back / Home.  */
/* Theme-aware: surfaces ride `var(--background)`/`var(--foreground)` so the  */
/* page reads cleanly in both light and dark mode. The stick SVGs are black  */
/* upstream; we flip them in dark mode via CSS filter.                        */
/* -------------------------------------------------------------------------- */

export default function NotFound() {
  return (
    <div className="w-full h-screen bg-background overflow-x-hidden flex justify-center items-center relative">
      <MessageDisplay />
      <CharactersAnimation />
      <CircleAnimation />
    </div>
  );
}

// ---------------- Message + CTAs --------------------------------------------
function MessageDisplay() {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="absolute flex flex-col justify-center items-center w-[90%] h-[90%] z-[100] pointer-events-none">
      <div
        className={`flex flex-col items-center transition-opacity duration-500 pointer-events-auto ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Text sits on top of the white wash, so it uses the inverse colour */}
        <div className="text-2xl sm:text-3xl md:text-[35px] font-semibold text-background m-[1%]">
          Page not found
        </div>
        <div className="text-5xl sm:text-7xl md:text-[80px] font-bold text-background m-[1%]">
          404
        </div>
        <div className="text-sm md:text-[15px] w-[90%] sm:w-1/2 min-w-[40%] text-center text-background m-[1%]">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-8">
          <button
            onClick={() => navigate(-1)}
            className="border-2 border-background text-background hover:bg-background hover:text-foreground transition-all duration-300 ease-in-out px-6 py-2 text-base font-medium flex items-center justify-center gap-2 hover:scale-105"
          >
            <ArrowLeft size={20} />
            Go back
          </button>
          <button
            onClick={() => navigate('/')}
            className="bg-background text-foreground hover:bg-muted transition-all duration-300 ease-in-out px-6 py-2 text-base font-medium flex items-center justify-center gap-2 hover:scale-105 border-2 border-background"
          >
            <Home size={20} />
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Stick-figure scrollers -----------------------------------
const STICK_BASE =
  'https://raw.githubusercontent.com/RicardoYare/imagenes/9ef29f5bbe075b1d1230a996d87bca313b9b6a63/sticks';
const stickFigures = [
  { top: '0%',     src: `${STICK_BASE}/stick0.svg`, transform: 'rotateZ(-90deg)', speedX: 1500 },
  { top: '10%',    src: `${STICK_BASE}/stick1.svg`, speedX: 3000, speedRotation: 2000 },
  { top: '20%',    src: `${STICK_BASE}/stick2.svg`, speedX: 5000, speedRotation: 1000 },
  { top: '25%',    src: `${STICK_BASE}/stick0.svg`, speedX: 2500, speedRotation: 1500 },
  { top: '35%',    src: `${STICK_BASE}/stick0.svg`, speedX: 2000, speedRotation:  300 },
  { bottom: '5%',  src: `${STICK_BASE}/stick3.svg`, speedX: 0 }, // static
];

function CharactersAnimation() {
  const charactersRef = useRef(null);

  useEffect(() => {
    const container = charactersRef.current;
    if (!container) return;

    container.innerHTML = '';

    stickFigures.forEach((figure, index) => {
      const stick = document.createElement('img');
      stick.classList.add('stick-figure');
      stick.style.position = 'absolute';
      stick.style.width = '18%';
      stick.style.height = '18%';
      if (figure.top)    stick.style.top    = figure.top;
      if (figure.bottom) stick.style.bottom = figure.bottom;
      stick.src = figure.src;
      stick.alt = '';
      stick.setAttribute('aria-hidden', 'true');
      if (figure.transform) stick.style.transform = figure.transform;
      container.appendChild(stick);

      // The bottom stick (index 5) is the stationary observer.
      if (index === 5) return;

      stick.animate(
        [{ left: '100%' }, { left: '-20%' }],
        { duration: figure.speedX, easing: 'linear', fill: 'forwards' }
      );

      // The first figure is already pre-rotated (lying down); no spin.
      if (index === 0) return;

      if (figure.speedRotation) {
        stick.animate(
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }],
          { duration: figure.speedRotation, iterations: Infinity, easing: 'linear' }
        );
      }
    });

    return () => { container.innerHTML = ''; };
  }, []);

  return (
    <div
      ref={charactersRef}
      className="absolute w-[99%] h-[95%] pointer-events-none stick-figures"
    >
      {/* Dark-mode invert keeps the black silhouettes readable */}
      <style>{`
        .stick-figures img.stick-figure { filter: none; }
        html.dark .stick-figures img.stick-figure { filter: invert(1); }
      `}</style>
    </div>
  );
}

// ---------------- Canvas circle wash ----------------------------------------
function CircleAnimation() {
  const canvasRef = useRef(null);
  const requestIdRef = useRef(undefined);
  const timerRef = useRef(0);
  const circulosRef = useRef([]);

  // Resolve `var(--foreground)` to an rgb() string for canvas fillStyle.
  const resolveForegroundColour = () => {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--foreground')
      .trim();
    return v || '#1e293b';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initArr = () => {
      circulosRef.current = [];
      for (let i = 0; i < 300; i++) {
        const randomX = Math.floor(
          Math.random() * ((canvas.width * 3) - (canvas.width * 1.2) + 1)
        ) + (canvas.width * 1.2);
        const randomY = Math.floor(
          Math.random() * ((canvas.height) - (canvas.height * -0.2 + 1))
        ) + (canvas.height * -0.2);
        const size = canvas.width / 1000;
        circulosRef.current.push({ x: randomX, y: randomY, size });
      }
    };

    const draw = () => {
      const context = canvas.getContext('2d');
      if (!context) return;

      timerRef.current++;
      context.setTransform(1, 0, 0, 1, 0, 0);

      const distanceX  = canvas.width / 80;
      const growthRate = canvas.width / 1000;

      // Particles ride the inverse of the page text colour — the message text
      // (which uses `text-background`) ends up readable on top.
      context.fillStyle = resolveForegroundColour();
      context.clearRect(0, 0, canvas.width, canvas.height);

      circulosRef.current.forEach((c) => {
        context.beginPath();
        if (timerRef.current < 65) {
          c.x = c.x - distanceX;
          c.size = c.size + growthRate;
        }
        if (timerRef.current > 65 && timerRef.current < 500) {
          c.x = c.x - (distanceX * 0.02);
          c.size = c.size + (growthRate * 0.2);
        }
        context.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        context.fill();
      });

      if (timerRef.current > 500) {
        if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
        return;
      }
      requestIdRef.current = requestAnimationFrame(draw);
    };

    const start = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      timerRef.current = 0;
      initArr();
      draw();
    };

    start();

    const handleResize = () => {
      if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
      const context = canvas.getContext('2d');
      if (context && context.reset) context.reset();
      start();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
