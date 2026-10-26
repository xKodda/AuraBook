/**
 * Pantalla de entrada de la portada («cortina»): sobre el fondo marfil se dibuja el isotipo, entran el nombre,
 * la frase y «Un producto de Clikium», y la capa sube como una cortina dejando ver la portada.
 * Es HTML + CSS (.lp-intro en globals.css) más un script en línea mínimo: se ve antes de que cargue la app y se retira sola, así nunca
 * queda pegada. Se muestra en cada carga de la página (no al volver a la portada sin recargar) y se salta
 * con un clic o una tecla.
 */
const SCRIPT = `try{var d=document.documentElement;d.dataset.intro='play';var s=function(){if(d.dataset.intro!=='play')return;d.dataset.intro='skip';window.dispatchEvent(new Event('aurabook-intro-skip'))};document.getElementById('lp-intro').addEventListener('click',s);window.addEventListener('keydown',s,{once:true})}catch(e){}`;

export function LandingIntro() {
  return (
    <>
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
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
