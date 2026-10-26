/**
 * Pantalla de entrada de la portada: isotipo que se dibuja, frase y «Un producto de Clikium».
 * Es solo HTML + CSS (.lp-intro en globals.css): se ve antes de que cargue JavaScript y se retira sola,
 * así nunca puede quedar pegada. Se muestra una vez por sesión del navegador.
 */
const SKIP_SCRIPT =
  "try{sessionStorage.getItem('aurabook-intro')?document.documentElement.dataset.intro='off':sessionStorage.setItem('aurabook-intro','1')}catch(e){}";

export function LandingIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP_SCRIPT }} />
      <div className="lp-intro" aria-hidden="true">
        <div className="lp-intro-inner">
          <svg className="lp-intro-mark" viewBox="0 0 64 64" width="56" height="56" focusable="false">
            <path d="M32 10 A22 22 0 1 0 51.05 21" pathLength={1} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <circle cx="43" cy="12.95" r="4.5" fill="currentColor" />
          </svg>
          <p className="lp-intro-name">AURA<span>BOOK</span></p>
          <p className="lp-intro-phrase">De emprendedores, para negocios que crecen.</p>
          <p className="lp-intro-by">Un producto de Clikium</p>
          <span className="lp-intro-bar"><span /></span>
        </div>
      </div>
    </>
  );
}
