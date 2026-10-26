"use client";

// Animaciones de la portada (Motion). Carga reducida: LazyMotion + domAnimation y componentes `m`.
// Con «reducir movimiento» activado en el sistema, todo aparece sin desplazamientos ni zoom.

import { useRef, type ReactNode } from "react";
import {
  LazyMotion, MotionConfig, domAnimation, m, useReducedMotion, useScroll, useSpring, useTransform,
  type Variants,
} from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function LandingMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
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

/** Contenedor que anima a sus `RevealItem` en cascada: al cargar (`onLoad`) o al entrar en pantalla. */
export function Reveal({ children, className, as = "div", onLoad = false }: {
  children: ReactNode; className?: string; as?: "div" | "ol" | "ul" | "section"; onLoad?: boolean;
}) {
  const Tag = m[as];
  const trigger = onLoad
    ? { animate: "show" }
    : { whileInView: "show", viewport: { once: true, margin: "0px 0px -12% 0px" } };
  return (
    <Tag className={className} variants={container} initial="hidden" {...trigger}>
      {children}
    </Tag>
  );
}

export function RevealItem({ children, className, as = "div" }: {
  children: ReactNode; className?: string; as?: "div" | "li" | "p" | "h1" | "h2" | "span";
}) {
  const Tag = m[as];
  return <Tag className={className} variants={item}>{children}</Tag>;
}

// ─── Portada: teléfono con leve parallax y aviso que aparece después ───

export function HeroPhone({ children, toast }: { children: ReactNode; toast: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  // Capa externa: parallax con el scroll. Capa interna: entrada al cargar.
  return (
    <m.div ref={ref} className="lp-phone-wrap" style={{ y }}>
      <m.div className="lp-phone-enter" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}>
        {children}
        <m.div className="lp-toast" initial={{ opacity: 0, scale: 0.85, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
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
export function ScrollZoom({ heading, children }: { heading: ReactNode; children: ReactNode }) {
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

  return (
    <section ref={ref} className="lp-zoom" aria-label="Así se ve tu página de reservas">
      <div className="lp-zoom-sticky">
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
