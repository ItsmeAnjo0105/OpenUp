import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import heroPsychologist from '../assets/hero-psychologist.png';

// Small inline line-icon helper -- no icon library per the landing page spec.
// Every icon below is a hand-drawn 24x24 stroke path.
function Icon({ children, className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  chat: <><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.2-3.6A7.96 7.96 0 0 1 4 12Z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 7V4M9 4h6" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /><path d="M9 16.5c1 .8 5 .8 6 0" /></>,
  chart: <><path d="M4 20V10M9.5 20V6M15 20v-7M20.5 20V4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
  check: <><path d="M4 12.5 9 17 20 6" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
  people: <><circle cx="8.5" cy="8" r="3" /><circle cx="16" cy="9" r="2.5" /><path d="M3 20c.5-3.5 3-5.5 5.5-5.5S13.5 16.5 14 20M14.5 20c.3-2.5 1.8-4 3.8-4s3.2 1.3 3.7 4" /></>,
  badge: <><path d="M12 3 14 6 17.5 6.5 16 10 17.5 13.5 14 14 12 17 10 14 6.5 13.5 8 10 6.5 6.5 10 6Z" /><path d="M9 14.5 8 21l4-2 4 2-1-6.5" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.4 3.3M6.5 6.7C4.5 8 3 9.9 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8" /><path d="M9.9 10a3 3 0 0 0 4.1 4.1" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  shieldCheck: <><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" /><path d="M8.5 12.2 11 14.5 15.5 10" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  phone: <><path d="M6 3h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2.2 2C11.8 19.5 4.5 12.2 4 6.2A2 2 0 0 1 6 3Z" /></>,
  menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
  close: <><path d="M5 5l14 14M19 5 5 19" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  droplet: <><path d="M12 3s7 7.5 7 12.5A7 7 0 1 1 5 15.5C5 10.5 12 3 12 3Z" /></>,
  shield: <><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 11h6M9 15h4" /></>,
  heart: <><path d="M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.7 5.5C19.5 15.9 12 20.5 12 20.5Z" /></>,
  star: <><path d="M12 3.5 14.3 9l5.9.5-4.5 3.8 1.4 5.8L12 15.9l-5.1 3.2 1.4-5.8-4.5-3.8L9.7 9 12 3.5Z" /></>,
  brain: <><path d="M9 4.5a3 3 0 0 0-3 3v.3A3 3 0 0 0 4.5 10a3 3 0 0 0 1 5.6 3 3 0 0 0 3.2 3.9A3 3 0 0 0 11.5 21V7.5A3 3 0 0 0 9 4.5Z" /><path d="M15 4.5a3 3 0 0 1 3 3v.3a3 3 0 0 1 1.5 2.2 3 3 0 0 1-1 5.6 3 3 0 0 1-3.2 3.9 3 3 0 0 1-2.8 1.5V7.5a3 3 0 0 1 2.5-3Z" /></>,
};

function SvgIcon({ name, className }) {
  return <Icon className={className}>{ICONS[name]}</Icon>;
}

// A real, verified-live 3D illustration from Microsoft's open-source (MIT
// licensed) Fluent Emoji set -- not hand-drawn, not an inline SVG, and not a
// guessed URL: every `path` used below was checked with a live HTTP request
// against this CDN before being wired in here.
const EMOJI_3D_BASE = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets';
function Emoji3D({ path, className = '', rotate }) {
  const src = `${EMOJI_3D_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return (
    <img
      src={src}
      alt=""
      draggable="false"
      className={className}
      style={rotate ? { '--pop-rotate': rotate } : undefined}
    />
  );
}

// ---- Scroll interactivity, driven by JS rather than CSS scroll-timelines
// (animation-timeline: view()/scroll() has spotty browser support, which left
// every "scroll reveal" silently inert on some browsers). IntersectionObserver
// and scroll-position math both work everywhere.
//
// These always run, regardless of the system's prefers-reduced-motion setting
// -- this is a project showcase page built specifically to demonstrate these
// effects, so they shouldn't silently disable themselves. ----

// One-time "has this scrolled into view" flag, for fade/rise/swing reveals.
function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [isIn, setIsIn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsIn(true); obs.unobserve(el); } },
      { threshold, rootMargin: '0px 0px -10% 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, ref]);
  return [ref, isIn];
}

// Continuous 0..1 progress of an element crossing the viewport (0 = just
// entering from the bottom, 1 = fully scrolled past the top). Used for the
// trust cube's rotation and the decorative parallax circles.
function useScrollProgress(ref, neutral = 0) {
  const [progress, setProgress] = useState(neutral);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = null;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const p = (vh - rect.top) / (vh + rect.height);
      setProgress(Math.min(1, Math.max(0, p)));
      raf = null;
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [neutral, ref]);
  return progress;
}

// 0..1 progress of an element scrolling OUT past the top of the viewport
// (0 = top of element at top of viewport, 1 = scrolled past its own height).
// Used for the hero's tilt-back-and-fade exit.
function useExitProgress(ref) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = null;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const p = -rect.top / rect.height;
      setProgress(Math.min(1, Math.max(0, p)));
      raf = null;
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
  return progress;
}

// Whole-document scroll progress, for the navbar's progress bar.
function useDocScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = null;
    const measure = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(1, Math.max(0, scrollTop / height)) : 0);
      raf = null;
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return progress;
}

// Wraps a block with a fade + 3D rise (or swing/zoom variant) that plays once
// it scrolls into view.
function Reveal({ children, variant, className = '', delay = 0 }) {
  const [ref, isIn] = useInView();
  const variantClass = variant ? `lp-${variant}` : '';
  return (
    <div
      ref={ref}
      className={`lp-reveal-js ${variantClass} ${isIn ? 'is-in' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// Every card on the page: tilts toward the cursor and zooms in on hover, with
// a snappy follow while the mouse moves and a springy settle back on leave.
// Driven imperatively (direct style writes, not React state) so it tracks the
// cursor at full frame rate with zero re-render overhead.
function TiltCard({ children, className = '' }) {
  const ref = useRef(null);

  const handleMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * 16;
    const ry = (px - 0.5) * 16;
    ref.current.style.transition = 'transform 90ms linear';
    ref.current.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.06) translateY(-10px)`;
  };
  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transition = 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    ref.current.style.transform = '';
  };

  return (
    <div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave} className={`lp-tilt-card ${className}`}>
      {children}
    </div>
  );
}

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#about', label: 'About Us' },
  { href: '#features', label: 'Features' },
  { href: '#contact', label: 'Contact Us' },
];

const FEATURES = [
  { icon: 'chat', title: 'Anonymous Chat', desc: 'Reach out and talk without sharing who you are.' },
  { icon: 'calendar', title: 'Counseling Sessions', desc: 'Book one-on-one or group sessions with a licensed psychologist.' },
  { icon: 'bot', title: 'AI Crisis Companion', desc: 'Support in Bisaya, Filipino, or English, that escalates to a psychologist when it matters.' },
  { icon: 'chart', title: 'Mood Tracker', desc: 'Log how you feel and notice patterns over time.' },
  { icon: 'mic', title: 'Voice Journal', desc: 'Speak freely -- get a transcript plus emotional indicators.' },
  { icon: 'check', title: 'Mental Health Check-in', desc: 'A quick, regular check-in to stay aware of how you’re doing.' },
  { icon: 'book', title: 'Wellness Resources', desc: 'Guides and material to support your mental wellness journey.' },
  { icon: 'people', title: 'Community Support', desc: 'Connect with others navigating similar experiences.' },
];

const STEPS = [
  { n: '01', title: 'Create your account', desc: 'Sign up as a resident of your barangay in a few minutes.' },
  { n: '02', title: 'Check in with yourself', desc: 'Log your mood, do a check-in, or speak into your voice journal.' },
  { n: '03', title: 'Reach the right support', desc: 'Talk to the AI Crisis Companion, join a group session, or book a verified psychologist -- using Care Credits if your LGU provides them.' },
];

const TRUST_CARDS = [
  { icon: 'shield', title: 'Verified psychologists', desc: 'Every psychologist submits a professional license that an administrator reviews before they can offer services.' },
  { icon: 'chat', title: 'Anonymity by design', desc: 'Anonymous mode lets you reach out without the fear of being judged.' },
  { icon: 'chart', title: 'Privacy for the community', desc: 'LGUs only see anonymized, aggregated data. Individual identities, messages, and session content are never exposed.' },
  { icon: 'clipboard', title: 'Consent and data protection', desc: 'Built around the Data Privacy Act of 2012 (RA 10173), with consent asked before any data is shared.' },
];

const FAQS = [
  { q: 'Is OpenUp free to use?', a: 'When your LGU funds Care Credits, counseling sessions can be free to residents. Without that funding, sessions may carry a fee set by the psychologist.' },
  { q: 'How do I create an account?', a: 'Tap "Get Started," choose your barangay, and fill in your details. You’ll be ready to check in or reach out right away.' },
  { q: 'Is my information private?', a: 'Yes. Your personal check-ins and conversations are yours. LGUs only see anonymized, aggregated trends -- never your name attached to your records.' },
  { q: 'Can OpenUp diagnose me or replace therapy?', a: 'No. OpenUp offers supportive guidance and a way to reach a licensed psychologist. It does not diagnose, treat, or replace professional care.' },
  { q: 'What if I am in crisis right now?', a: 'The AI Crisis Companion can connect you to an available psychologist and show you crisis hotlines. If you are in immediate danger, please call 911.' },
  { q: 'How can I contact support?', a: 'Reach our team at [SUPPORT EMAIL] or [PHONE NUMBER].' },
];

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const heroRef = useRef(null);
  const aboutRef = useRef(null);
  const trustRef = useRef(null);
  const cubeWrapRef = useRef(null);
  const ctaRef = useRef(null);

  const handleHeroMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ rx: -(py - 0.5) * 12, ry: (px - 0.5) * 16 });
  };
  const handleHeroMouseLeave = () => setTilt({ rx: 0, ry: 0 });

  const docProgress = useDocScrollProgress();
  const heroExit = useExitProgress(heroRef);
  const aboutParallax = useScrollProgress(aboutRef, 0.5);
  const trustParallax = useScrollProgress(trustRef, 0.5);
  const ctaParallax = useScrollProgress(ctaRef, 0.5);

  // Trust cube: a continuous 360deg auto-spin, nudged by scroll position and
  // by cursor hover -- all three combined into one transform, written
  // directly to the DOM every frame (not React state) so it's perfectly
  // smooth instead of fighting a per-render tilt/scroll value.
  const cubeInnerRef = useRef(null);
  const cubeMotion = useRef({ auto: 0, tiltRx: 0, tiltRy: 0 });

  useEffect(() => {
    const SPIN_MS = 14000; // one full lap every 14s
    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = now - last;
      last = now;
      cubeMotion.current.auto = (cubeMotion.current.auto + (dt / SPIN_MS) * 360) % 360;

      let scrollSpin = 0;
      if (cubeWrapRef.current) {
        const rect = cubeWrapRef.current.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
        scrollSpin = (p - 0.5) * 180;
      }

      if (cubeInnerRef.current) {
        const { auto, tiltRx, tiltRy } = cubeMotion.current;
        cubeInnerRef.current.style.transform =
          `rotateX(${-18 + tiltRx}deg) rotateY(${auto + scrollSpin + tiltRy}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleCubeMouseMove = (e) => {
    if (!cubeWrapRef.current) return;
    const rect = cubeWrapRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    cubeMotion.current.tiltRx = -(py - 0.5) * 20;
    cubeMotion.current.tiltRy = (px - 0.5) * 30;
  };
  const handleCubeMouseLeave = () => {
    cubeMotion.current.tiltRx = 0;
    cubeMotion.current.tiltRy = 0;
  };

  return (
    <div className="min-h-screen bg-white text-slate-700" style={{ fontFamily: "'Figtree', sans-serif" }}>
      {/* ===== Navbar ===== */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <nav className="max-w-7xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <a href="#home" className="text-2xl font-extrabold text-teal-700 tracking-tight">OpenUp</a>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-teal-700 transition-colors">
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-teal-700 px-4 py-2 rounded-full hover:bg-teal-50 transition-colors">
              Login
            </Link>
            <Link to="/signup" className="lp-btn-lift text-sm font-semibold bg-teal-700 text-white px-5 py-2.5 rounded-full hover:bg-teal-800 transition-colors">
              Sign Up
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden text-slate-700 p-2"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <SvgIcon name={menuOpen ? 'close' : 'menu'} className="w-6 h-6" />
          </button>
        </nav>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-100 px-6 py-4 space-y-3 bg-white">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-slate-600">
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <Link to="/login" className="flex-1 text-center text-sm font-semibold text-teal-700 border border-teal-200 px-4 py-2.5 rounded-full">Login</Link>
              <Link to="/signup" className="flex-1 text-center text-sm font-semibold bg-teal-700 text-white px-4 py-2.5 rounded-full">Sign Up</Link>
            </div>
          </div>
        )}

        {/* Scroll progress bar along the navbar's bottom edge */}
        <div className="h-[3px] bg-teal-700 lp-progress" style={{ transform: `scaleX(${docProgress})` }} aria-hidden="true" />
      </header>

      <main>
        {/* ===== Hero ===== */}
        <section
          id="home"
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="relative overflow-hidden"
        >
          {/* Parallax blurred circles (mouse-driven) */}
          <div
            aria-hidden="true"
            className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-teal-200/40 blur-3xl pointer-events-none"
            style={{ transform: `translate3d(${tilt.ry * 2}px, ${-tilt.rx * 2}px, 0)` }}
          />
          <div
            aria-hidden="true"
            className="absolute top-20 -right-24 w-[28rem] h-[28rem] rounded-full bg-teal-100/60 blur-3xl pointer-events-none"
            style={{ transform: `translate3d(${-tilt.ry * 1.6}px, ${tilt.rx * 1.6}px, 0)` }}
          />

          <div
            className="max-w-7xl mx-auto px-6 sm:px-8 pt-16 sm:pt-24 pb-24 grid lg:grid-cols-2 gap-14 items-center relative"
            style={{
              opacity: 1 - heroExit * 1.4,
              transform: `perspective(1200px) rotateX(${heroExit * 10}deg) translateY(${-heroExit * 60}px)`,
            }}
          >
            <div>
              <span className="inline-block text-xs font-semibold tracking-wide uppercase bg-teal-50 text-teal-700 px-3.5 py-1.5 rounded-full">
                Mental wellness for Cebu City communities
              </span>
              <h1 className="mt-5 font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-slate-900">
                Your journey to better mental wellness starts here.
              </h1>
              <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-lg">
                OpenUp connects residents to licensed psychologists, anonymous support,
                and wellness tools -- backed by their local government.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link to="/signup" className="lp-btn-lift bg-teal-700 text-white px-7 py-3.5 rounded-full font-semibold hover:bg-teal-800 transition-colors">
                  Get Started
                </Link>
                <a href="#features" className="lp-btn-lift border border-teal-200 text-teal-700 px-7 py-3.5 rounded-full font-semibold hover:bg-teal-50 transition-colors">
                  Explore Features
                </a>
              </div>
            </div>

            {/* 3D hero stage -- every floating piece below is a bob-animation
                wrapper (.lp-float-*) around a hover-pop wrapper (.lp-pop), so
                the idle float and the hover lift/zoom/tilt/glow never fight
                over the same transform. The brain/heart/faces/star/seedling
                illustrations are real assets from Microsoft's open-source
                Fluent Emoji 3D set (MIT licensed), verified live before use.
                The psychologist figure is the illustration provided directly
                for this hero (src/assets/hero-psychologist.png). */}
            <div className="lp-hero-wrap relative h-[480px] hidden lg:block" aria-hidden="true">
              <div className="lp-hero-rig relative w-full h-full" style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}>
                {/* back plate */}
                <div
                  className="absolute inset-10 rounded-[32px] bg-gradient-to-br from-teal-50 to-teal-100"
                  style={{ transform: 'translateZ(-90px)' }}
                />

                {/* floating heart badge, top-left */}
                <div className="lp-float-e absolute left-8 top-0 w-12 h-12" style={{ transform: 'translateZ(150px)' }}>
                  <div className="lp-pop w-full h-full rounded-full bg-white shadow-lg flex items-center justify-center" style={{ '--pop-rotate': '-8deg' }}>
                    <Emoji3D path="Red heart/3D/red_heart_3d.png" className="w-7 h-7" />
                  </div>
                </div>

                {/* beaming face, upper-left */}
                <div className="lp-float-a absolute left-0 top-20 w-16 h-16" style={{ transform: 'translateZ(130px)' }}>
                  <Emoji3D path="Beaming face with smiling eyes/3D/beaming_face_with_smiling_eyes_3d.png" className="lp-pop w-full h-full drop-shadow-xl" rotate="-6deg" />
                </div>

                {/* mood tracker card */}
                <div className="lp-float-a absolute left-20 top-6 w-52" style={{ transform: 'translateZ(20px)' }}>
                  <div className="lp-pop bg-white rounded-2xl shadow-xl p-4" style={{ '--pop-rotate': '-2deg' }}>
                    <p className="text-xs font-semibold text-slate-500 mb-2">This week’s mood</p>
                    <div className="flex items-end gap-1.5 h-16">
                      {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
                        <span key={i} className="flex-1 rounded-full bg-teal-600/80" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* brain illustration, top-right */}
                <div className="lp-float-c absolute right-2 top-0 w-16 h-16" style={{ transform: 'translateZ(145px)' }}>
                  <Emoji3D path="Brain/3D/brain_3d.png" className="lp-pop w-full h-full drop-shadow-xl" rotate="7deg" />
                </div>

                {/* licensed psychologist card, with the provided character
                    illustration above it (already carries its own chat-bubble
                    and heart accents, so no separate speech-bubble icon here) */}
                <div className="lp-float-e absolute right-2 top-8 w-56 flex flex-col items-center" style={{ transform: 'translateZ(90px)' }}>
                  <img
                    src={heroPsychologist}
                    alt="Licensed psychologist"
                    draggable="false"
                    className="lp-pop w-full h-auto -mb-5 drop-shadow-xl"
                    style={{ '--pop-rotate': '2deg' }}
                  />
                  <div className="lp-pop relative z-10 w-40 bg-white rounded-2xl shadow-xl p-3" style={{ '--pop-rotate': '2deg' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">Licensed Psychologist</p>
                        <p className="text-[10px] text-slate-500 leading-tight">Available for your support</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* motivational sticky note, upper-right */}
                <div className="lp-float-f absolute right-0 top-40 w-32" style={{ transform: 'translateZ(170px)' }}>
                  <div className="lp-pop bg-amber-50 rounded-xl shadow-xl p-3 rotate-2" style={{ '--pop-rotate': '0deg' }}>
                    <SvgIcon name="heart" className="w-3.5 h-3.5 text-rose-400 mb-1" />
                    <p className="text-[10px] font-semibold text-slate-600 leading-snug">Small steps make big changes.</p>
                  </div>
                </div>

                {/* star accent */}
                <div className="lp-float-c absolute right-28 top-44 w-9 h-9" style={{ transform: 'translateZ(140px)' }}>
                  <Emoji3D path="Star/3D/star_3d.png" className="lp-pop w-full h-full drop-shadow-md" rotate="14deg" />
                </div>

                {/* anonymous chat card */}
                <div className="lp-float-b absolute left-16 bottom-10 w-48" style={{ transform: 'translateZ(80px)' }}>
                  <div className="lp-pop bg-white rounded-2xl shadow-xl p-4" style={{ '--pop-rotate': '3deg' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <SvgIcon name="chat" className="w-4 h-4 text-teal-700" />
                      <p className="text-xs font-semibold text-slate-700">Anonymous Chat</p>
                    </div>
                    <p className="text-[11px] text-slate-500">You’re not alone in this. I’m here to listen.</p>
                  </div>
                </div>

                {/* counseling session card */}
                <div className="lp-float-c absolute right-10 bottom-16 w-52" style={{ transform: 'translateZ(110px)' }}>
                  <div className="lp-pop bg-white rounded-2xl shadow-xl p-4" style={{ '--pop-rotate': '-3deg' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <SvgIcon name="calendar" className="w-4 h-4 text-teal-700" />
                      <p className="text-xs font-semibold text-slate-700">Counseling session</p>
                    </div>
                    <p className="text-[11px] text-slate-500">Tomorrow, 2:00 PM</p>
                  </div>
                </div>

                {/* speech-bubble dots accent, bottom-center */}
                <div className="lp-float-d absolute left-52 bottom-12 w-12 h-12" style={{ transform: 'translateZ(100px)' }}>
                  <Emoji3D path="Speech balloon/3D/speech_balloon_3d.png" className="lp-pop w-full h-full drop-shadow-lg" rotate="-5deg" />
                </div>

                {/* brain in a circle, bottom-left */}
                <div className="lp-float-a absolute left-20 bottom-0 w-20 h-20" style={{ transform: 'translateZ(120px)' }}>
                  <div className="lp-pop w-full h-full rounded-full bg-teal-50 shadow-lg flex items-center justify-center p-3" style={{ '--pop-rotate': '-4deg' }}>
                    <Emoji3D path="Brain/3D/brain_3d.png" className="w-full h-full" />
                  </div>
                </div>

                {/* pensive face, bottom-right-center */}
                <div className="lp-float-b absolute right-28 bottom-2 w-16 h-16" style={{ transform: 'translateZ(95px)' }}>
                  <Emoji3D path="Pensive face/3D/pensive_face_3d.png" className="lp-pop w-full h-full drop-shadow-xl" rotate="9deg" />
                </div>

                {/* seedling, bottom-right corner */}
                <div className="lp-float-f absolute right-0 bottom-0 w-12 h-12" style={{ transform: 'translateZ(135px)' }}>
                  <Emoji3D path="Seedling/3D/seedling_3d.png" className="lp-pop w-full h-full drop-shadow-lg" rotate="-10deg" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== About Us ===== */}
        <section id="about" ref={aboutRef} className="relative overflow-hidden py-24 bg-teal-50/40">
          <div
            aria-hidden="true"
            className="absolute -top-10 -left-16 w-72 h-72 rounded-full bg-teal-200/40 blur-3xl pointer-events-none"
            style={{ transform: `translateY(${140 - aboutParallax * 280}px)` }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-teal-100/60 blur-3xl pointer-events-none"
            style={{ transform: `translateY(${-140 + aboutParallax * 280}px)` }}
          />

          <div className="max-w-7xl mx-auto px-6 sm:px-8 relative">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wide uppercase text-teal-700">About Us</p>
              <h2 className="mt-3 font-extrabold text-3xl sm:text-4xl text-slate-900">Why OpenUp exists</h2>
              <p className="mt-5 text-slate-600 leading-relaxed">
                Stigma, cost, distance, and a shortage of mental health professionals keep
                many Cebu City residents from getting support. Under RA 11036, local
                government units are responsible for delivering mental health services to
                their communities -- but most don’t yet have the digital tools to do it.
                OpenUp is built to close that gap.
              </p>
            </Reveal>

            <div className="mt-14 grid sm:grid-cols-3 gap-6">
              {[
                { icon: 'people', title: 'Residents', desc: 'A private, judgment-free way to check in, talk, and get support from licensed professionals.' },
                { icon: 'badge', title: 'Licensed psychologists', desc: 'A platform to reach residents who need support, with verified credentials and clear records.' },
                { icon: 'shieldCheck', title: 'Local government units', desc: 'Anonymized, aggregated insight into community wellness, to guide local mental health programs.' },
              ].map((c, i) => (
                <Reveal key={c.title} delay={i * 80}>
                  <TiltCard className="bg-white rounded-[20px] shadow-sm p-7">
                    <span className="inline-flex w-12 h-12 rounded-xl bg-teal-50 text-teal-700 items-center justify-center">
                      <SvgIcon name={c.icon} className="w-6 h-6" />
                    </span>
                    <h3 className="mt-4 font-bold text-lg text-slate-900">{c.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{c.desc}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Features ===== */}
        <section id="features" className="py-24">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <Reveal className="max-w-xl mx-auto text-center">
              <p className="text-xs font-semibold tracking-wide uppercase text-teal-700">Features</p>
              <h2 className="mt-3 font-extrabold text-3xl sm:text-4xl text-slate-900">Everything you need, in one place</h2>
            </Reveal>

            <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 70}>
                  <TiltCard className="bg-white border border-slate-100 rounded-[20px] shadow-sm p-6">
                    <span className="inline-flex w-11 h-11 rounded-xl bg-teal-50 text-teal-700 items-center justify-center">
                      <SvgIcon name={f.icon} className="w-5 h-5" />
                    </span>
                    <h3 className="mt-4 font-bold text-slate-900">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-600">{f.desc}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-8 bg-teal-900 text-teal-50 rounded-[20px] p-6 sm:p-7 text-sm leading-relaxed">
              <span className="font-bold text-white">For LGUs: </span>
              an anonymized barangay heatmap, auto-generated accomplishment reports, Care
              Credits, and funding analytics -- all in one dashboard.
            </Reveal>
          </div>
        </section>

        {/* ===== How It Works ===== */}
        <section id="how-it-works" className="py-24 bg-teal-50/40">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <Reveal className="max-w-xl mx-auto text-center">
              <p className="text-xs font-semibold tracking-wide uppercase text-teal-700">How It Works</p>
              <h2 className="mt-3 font-extrabold text-3xl sm:text-4xl text-slate-900">Three simple steps</h2>
            </Reveal>

            <div className="mt-14 grid sm:grid-cols-3 gap-8">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} variant={i % 2 === 0 ? 'swing-left' : 'swing-right'}>
                  <TiltCard className="bg-white rounded-[20px] shadow-sm p-7 h-full">
                    <span className="font-extrabold text-3xl text-teal-700/30">{s.n}</span>
                    <h3 className="mt-3 font-bold text-lg text-slate-900">{s.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Trust and Safety ===== */}
        <section id="trust" ref={trustRef} className="relative overflow-hidden py-24 bg-teal-900 text-white">
          <div
            aria-hidden="true"
            className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-teal-700/30 blur-3xl pointer-events-none"
            style={{ transform: `translateY(${-140 + trustParallax * 280}px)` }}
          />
          <div className="max-w-7xl mx-auto px-6 sm:px-8 grid lg:grid-cols-2 gap-16 items-center relative">
            {/* 3D cube: a real box, not flat cards -- resting at an angle so two
                faces are always in view, and rotating further as you scroll
                through the section (driven by scroll position, not CSS timelines). */}
            <div
              ref={cubeWrapRef}
              onMouseMove={handleCubeMouseMove}
              onMouseLeave={handleCubeMouseLeave}
              className="flex justify-center cursor-pointer"
              style={{ perspective: '1200px' }}
              aria-hidden="true"
            >
              <div
                ref={cubeInnerRef}
                className="relative w-[200px] h-[200px]"
                style={{ transformStyle: 'preserve-3d', transform: 'rotateX(-18deg) rotateY(0deg)' }}
              >
                {[
                  { label: 'Verified', icon: 'shield', bg: '#0f766e', rot: 0 },
                  { label: 'Anonymous', icon: 'chat', bg: '#0d9488', rot: 90 },
                  { label: 'Private', icon: 'lock', bg: '#134e4a', rot: 180 },
                  { label: 'Consent', icon: 'clipboard', bg: '#115e59', rot: 270 },
                ].map((face) => (
                  <div
                    key={face.label}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white font-bold text-base border border-white/10"
                    style={{
                      background: face.bg,
                      transform: `rotateY(${face.rot}deg) translateZ(100px)`,
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <SvgIcon name={face.icon} className="w-7 h-7 text-teal-100" />
                    {face.label}
                  </div>
                ))}
                {/* top cap, to read as a real box rather than four flat cards */}
                <div
                  className="absolute inset-0 border border-white/10"
                  style={{ background: '#0a5048', transform: 'rotateX(90deg) translateZ(100px)', backfaceVisibility: 'hidden' }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wide uppercase text-teal-300">Trust &amp; Safety</p>
              <h2 className="mt-3 font-extrabold text-3xl sm:text-4xl text-white">Built to be safe, private, and credible</h2>

              <div className="mt-8 grid sm:grid-cols-2 gap-5">
                {TRUST_CARDS.map((c, i) => (
                  <Reveal key={c.title} delay={i * 80}>
                    <TiltCard className="bg-teal-800/60 border border-teal-700/60 rounded-[20px] p-5">
                      <span className="inline-flex w-10 h-10 rounded-xl bg-teal-700/60 text-teal-100 items-center justify-center">
                        <SvgIcon name={c.icon} className="w-5 h-5" />
                      </span>
                      <h3 className="mt-3 font-bold text-sm text-white">{c.title}</h3>
                      <p className="mt-1.5 text-xs text-teal-100/80">{c.desc}</p>
                    </TiltCard>
                  </Reveal>
                ))}
              </div>

              <p className="mt-6 text-xs text-teal-100/70 leading-relaxed">
                OpenUp offers supportive guidance only. It does not provide diagnosis,
                treatment, or emergency intervention. If you are in immediate danger, call 911.
              </p>
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section id="faq" className="py-24 bg-teal-50/40">
          <div className="max-w-3xl mx-auto px-6 sm:px-8">
            <Reveal className="text-center">
              <p className="text-xs font-semibold tracking-wide uppercase text-teal-700">FAQ</p>
              <h2 className="mt-3 font-extrabold text-3xl sm:text-4xl text-slate-900">Common questions</h2>
            </Reveal>

            <Reveal className="mt-12 space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="group bg-white rounded-2xl shadow-sm p-5 open:shadow-md transition-shadow">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-slate-900">
                    {f.q}
                    <SvgIcon name="chevron" className="w-5 h-5 text-teal-700 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ===== Final CTA ===== */}
        <section ref={ctaRef} className="relative overflow-hidden py-24 bg-teal-900 text-white">
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-20 w-80 h-80 rounded-full bg-teal-700/40 blur-3xl pointer-events-none"
            style={{ transform: `translateY(${140 - ctaParallax * 280}px)` }}
          />
          <Reveal variant="cta-zoom" className="max-w-3xl mx-auto px-6 sm:px-8 text-center relative">
            <h2 className="font-extrabold text-3xl sm:text-4xl">Ready to get started?</h2>
            <p className="mt-4 text-teal-100">
              Create your account and start your journey to better mental wellness today.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link to="/signup" className="lp-btn-lift bg-white text-teal-800 px-7 py-3.5 rounded-full font-semibold hover:bg-teal-50 transition-colors">
                Create Your Account
              </Link>
              <a href="#features" className="lp-btn-lift border border-white/40 text-white px-7 py-3.5 rounded-full font-semibold hover:bg-white/10 transition-colors">
                Explore Our Services
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer id="contact" className="bg-white border-t border-slate-100 py-14">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 grid sm:grid-cols-3 gap-10">
          <div>
            <span className="text-xl font-extrabold text-teal-700">OpenUp</span>
            <p className="mt-3 text-sm text-slate-500 max-w-xs">
              A mental wellness and freelance counseling support platform built for Cebu
              City residents, psychologists, and local government units.
            </p>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-900">Quick Links</p>
            <div className="mt-3 space-y-2">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="block text-sm text-slate-500 hover:text-teal-700">{l.label}</a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-900">Contact</p>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <p className="flex items-center gap-2"><SvgIcon name="mail" className="w-4 h-4 text-teal-700" /> [SUPPORT EMAIL]</p>
              <p className="flex items-center gap-2"><SvgIcon name="phone" className="w-4 h-4 text-teal-700" /> [PHONE NUMBER]</p>
            </div>
            <div className="mt-4 flex gap-4 text-sm text-slate-500">
              <a href="#" className="hover:text-teal-700">Privacy Policy</a>
              <a href="#" className="hover:text-teal-700">Terms</a>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 sm:px-8 mt-10 pt-6 border-t border-slate-100 text-xs text-slate-400">
          &copy; {new Date().getFullYear()} University of Cebu - Main Campus, College of Computer Studies.
        </div>
      </footer>
    </div>
  );
}

export default Landing;
