"use client";

// Animaciones de la portada (Motion). Carga reducida: LazyMotion + domAnimation y componentes `m`.
// Con «reducir movimiento» activado en el sistema, todo aparece sin desplazamientos ni zoom.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LazyMotion, MotionConfig, domAnimation, m, useReducedMotion, useScroll, useSpring, useTransform,
  type Variants,
} from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

// Mientras se ve la pantalla de entrada (components/landing-intro.tsx), la portada espera para animarse.
const IntroReady = createContext(true);

/** Momento en que el contenido de la cortina empieza a retirarse (.lp-intro-inner, 1,65 s en el CSS). */
const INTRO_MS = 1650;
const INTRO_REDUCED_MS = 1000;

export function LandingMotion({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const intro = document.getElementById("lp-intro");
    // Al terminar de subir, la cortina queda retirada: si se vuelve a la portada sin recargar, no se repite.
    const done = (e: AnimationEvent) => { if (e.target === intro && /^lp-(curtain|intro-fade)/.test(e.animationName)) html.dataset.intro = "done"; };
    intro?.addEventListener("animationend", done);
    const cleanup = () => intro?.removeEventListener("animationend", done);
    const go = () => setReady(true);
    if (html.dataset.intro !== "play") { go(); return cleanup; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // La cortina (CSS) corre desde que se pinta la página, no desde que React hidrata: se descuenta lo ya transcurrido.
    const t = window.setTimeout(go, Math.max(0, (reduced ? INTRO_REDUCED_MS : INTRO_MS) - performance.now()));
    window.addEventListener("aurabook-intro-skip", go, { once: true });
    return () => { cleanup(); window.clearTimeout(t); window.removeEventListener("aurabook-intro-skip", go); };
  }, []);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <IntroReady.Provider value={ready}>{children}</IntroReady.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

// ─── Aparición al cargar y al entrar en pantalla ───

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
// Portada (al cargar): solo sube, sin desvanecerse. La cortina ya la tapa, y un texto con opacidad 0 no cuenta
// como pintado para Google (LCP): así el título y la bajada se pintan desde el primer momento.
const itemOnLoad: Variants = {
  hidden: { y: 22 },
  show: { y: 0, transition: { duration: 0.7, ease: EASE } },
};
const OnLoadReveal = createContext(false);

/** Contenedor que anima a sus `RevealItem` en cascada: al cargar (`onLoad`) o al entrar en pantalla. */
export function Reveal({ children, className, as = "div", onLoad = false }: {
  children: ReactNode; className?: string; as?: "div" | "ol" | "ul" | "section"; onLoad?: boolean;
}) {
  const Tag = m[as];
  const ready = useContext(IntroReady);
  const trigger = onLoad
    ? { animate: ready ? "show" : "hidden" }
    : { whileInView: "show", viewport: { once: true, margin: "0px 0px -12% 0px" } };
  return (
    <Tag className={className} variants={container} initial="hidden" {...trigger}>
      <OnLoadReveal.Provider value={onLoad}>{children}</OnLoadReveal.Provider>
    </Tag>
  );
}

export function RevealItem({ children, className, as = "div" }: {
  children: ReactNode; className?: string; as?: "div" | "li" | "ul" | "p" | "h1" | "h2" | "span";
}) {
  const Tag = m[as];
  const onLoad = useContext(OnLoadReveal);
  return <Tag className={className} variants={onLoad ? itemOnLoad : item}>{children}</Tag>;
}

// ─── Portada: teléfono con leve parallax y aviso que aparece después ───

export function HeroPhone({ children, toast }: { children: ReactNode; toast: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const ready = useContext(IntroReady);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  // Capa externa: parallax con el scroll. Capa interna: entrada al cargar.
  return (
    <m.div ref={ref} className="lp-phone-wrap" style={{ y }}>
      <m.div className="lp-phone-enter" initial={{ opacity: 0, y: 40 }} animate={ready ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}>
        {children}
        <m.div className="lp-toast" initial={{ opacity: 0, scale: 0.85, y: 8 }} animate={ready ? { opacity: 1, scale: 1, y: 0 } : undefined}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 1.1 }}>
          {toast}
        </m.div>
      </m.div>
    </m.div>
  );
}

// ─── Scroll zoom: la vista del producto se acerca hasta ocupar la pantalla ───

/**
 * Sección de 220vh con un bloque fijo (sticky). Mientras se recorre, el título sube y se desvanece
 * y la ventana del producto pasa de 62 % a 100 % de escala, con esquinas cada vez más rectas.
 */
export function ScrollZoom({ heading, background, children }: {
  heading: ReactNode; background?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  const scale = useTransform(progress, [0, 0.75], reduce ? [1, 1] : [0.62, 1]);
  const radius = useTransform(progress, [0, 0.75], reduce ? [18, 18] : [28, 14]);
  const shadow = useTransform(progress, [0, 0.75], [0.1, 0.22]);
  const boxShadow = useTransform(shadow, (a) => `0 40px 90px rgba(24, 25, 28, ${a})`);
  const headingY = useTransform(progress, [0, 0.4], reduce ? [0, 0] : [0, -60]);
  const headingOpacity = useTransform(progress, [0, 0.35], [1, reduce ? 1 : 0]);
  // Fondo (foto): se acerca, se desenfoca y se desvanece mientras sube la página de reservas.
  const bgScale = useTransform(progress, [0, 0.8], reduce ? [1, 1] : [1.04, 1.32]);
  const bgOpacity = useTransform(progress, [0.08, 0.7], [1, reduce ? 1 : 0]);
  const bgBlur = useTransform(progress, [0.05, 0.6], reduce ? [0, 0] : [0, 10]);
  const filter = useTransform(bgBlur, (b) => `blur(${b}px)`);

  return (
    <section ref={ref} className={`lp-zoom${background ? " has-photo" : ""}`} aria-label="Así se ve tu página de reservas">
      <div className="lp-zoom-sticky">
        {background && (
          <m.div className="lp-zoom-bg" aria-hidden="true" style={{ scale: bgScale, opacity: bgOpacity, filter }}>
            {background}
          </m.div>
        )}
        <m.div className="lp-zoom-heading" style={{ y: headingY, opacity: headingOpacity }}>{heading}</m.div>
        <m.div className="lp-zoom-frame" style={{ scale, borderRadius: radius, boxShadow }}>
          {children}
        </m.div>
      </div>
    </section>
  );
}

// ─── Agenda: las citas aparecen una tras otra al entrar en pantalla ───

export function PopIn({ children, className, index = 0 }: { children?: ReactNode; className?: string; index?: number }) {
  return (
    <m.span className={className} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.15 + index * 0.08 }}>
      {children}
    </m.span>
  );
}

// ─── Foto que se revela al entrar en pantalla (marco que se abre + leve desplazamiento interno) ───

export function RevealImage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const innerScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1.18, 1.02]);
  return (
    <m.div ref={ref} className={className}
      initial={{ clipPath: reduce ? "inset(0% 0% 0% 0% round 18px)" : "inset(10% 8% 10% 8% round 28px)", opacity: 0.4 }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0% round 18px)", opacity: 1 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 1.1, ease: EASE }}>
      <m.div className="lp-photo-inner" style={{ scale: innerScale }}>{children}</m.div>
    </m.div>
  );
}

// ─── Galería horizontal: en escritorio avanza de lado con el scroll; en celular se desliza con el dedo ───

export function HorizontalGallery({ header, children }: { header: ReactNode; children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [distance, setDistance] = useState(0);
  const [pinned, setPinned] = useState(false);

  // Distancia a recorrer = ancho de la fila − ancho visible. Solo se fija en pantallas anchas.
  useEffect(() => {
    const measure = () => {
      const wide = window.matchMedia("(min-width: 900px)").matches && !reduce;
      setPinned(wide);
      const el = track.current;
      setDistance(wide && el ? Math.max(0, el.scrollWidth - el.clientWidth) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [reduce]);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -distance]);

  return (
    <section ref={section} className={`lp-gallery${pinned ? " pinned" : ""}`}
      style={pinned ? { height: `calc(100vh + ${distance}px)` } : undefined}>
      <div className="lp-gallery-sticky">
        <div className="lp-gallery-header">{header}</div>
        <div className="lp-gallery-viewport" ref={track}>
          <m.div className="lp-gallery-track" style={pinned ? { x } : undefined}>{children}</m.div>
        </div>
      </div>
    </section>
  );
}

// ─── Cierre: el isotipo se dibuja al entrar en pantalla y gira lento con el scroll ───

export function FinalHalo() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-25, 20]);
  const draw = { once: true, margin: "0px 0px -10% 0px" } as const;
  return (
    <m.div ref={ref} className="lp-final-halo" aria-hidden="true" style={{ rotate }}>
      <svg viewBox="0 0 64 64" focusable="false">
        <m.path d="M32 10 A22 22 0 1 0 51.05 21" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }} whileInView={{ pathLength: 1 }} viewport={draw}
          transition={{ duration: 1.6, ease: EASE }} />
        <m.circle cx="43" cy="12.95" r="4.5" fill="currentColor"
          initial={{ scale: reduce ? 1 : 0 }} whileInView={{ scale: 1 }} viewport={draw}
          transition={{ type: "spring", stiffness: 300, damping: 16, delay: reduce ? 0 : 1.3 }} />
      </svg>
    </m.div>
  );
}
