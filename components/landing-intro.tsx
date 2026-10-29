/**
 * Pantalla de entrada de la portada («cortina»): sobre el fondo marfil se dibuja el isotipo, entran el nombre,
 * la frase y «Un producto de Clikium», y la capa sube como una cortina dejando ver la portada.
 * Es HTML + CSS (.lp-intro en globals.css) más un script en línea mínimo (INTRO_SCRIPT, en el <head> de app/layout.tsx):
 * se ve antes de que cargue la app y se retira sola, así nunca queda pegada. Se muestra en cada carga de la portada
 * (no al volver a ella sin recargar) y se salta con un clic o una tecla.
 */

// Va en el <head> del layout raíz y no aquí: React no ejecuta un <script> que se crea al navegar sin recargar (y lo
// advierte en consola). Solo actúa al cargar la portada; el clic se escucha en el documento porque la capa aún no existe.
export const INTRO_SCRIPT = `try{if(location.pathname==='/'){var d=document.documentElement;d.dataset.intro='play';var s=function(){if(d.dataset.intro!=='play')return;d.dataset.intro='skip';window.dispatchEvent(new Event('aurabook-intro-skip'))};document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#lp-intro'))s()});window.addEventListener('keydown',s,{once:true})}}catch(e){}`;

export function LandingIntro() {
  return (
    <div className="lp-intro" id="lp-intro" aria-hidden="true">
      <div className="lp-intro-inner">
        <svg className="lp-intro-mark" viewBox="0 0 64 64" width="64" height="64" focusable="false">
          <path d="M32 10 A22 22 0 1 0 51.05 21" pathLength={1} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          <circle cx="43" cy="12.95" r="4.5" fill="currentColor" />
        </svg>
        <p className="lp-intro-name">AURA<span>BOOK</span></p>
        <p className="lp-intro-phrase">
          <span className="lp-intro-line"><span>De emprendedores,</span></span>
          <span className="lp-intro-line"><span>para negocios que crecen.</span></span>
        </p>
        <p className="lp-intro-by">Un producto de Clikium</p>
        <span className="lp-intro-bar"><span /></span>
      </div>
    </div>
  );
}
