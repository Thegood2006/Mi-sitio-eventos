/* ══════════════════════════════════════════════════════════════
   THEY GOOD TV — PATCH v2
   • Elimina el mensaje "CANAL ANTI-IFRAME"
   • Carga TODOS los canales/páginas en iframe con máximo bloqueo de ads
   • Solo usa video nativo para .m3u8 / .mp4 directos
   • Inyecta CSS killer de anuncios + intercepta popups/redirecciones
══════════════════════════════════════════════════════════════ */

/* ── 1. SOBREESCRIBIR window.open GLOBALMENTE ────────────────
   Bloquea cualquier apertura de ventana antes de que ocurra     */
(function() {
  const _open = window.open.bind(window);
  window.open = function(url, ...args) {
    if (!url || url === 'about:blank') return _open(url, ...args);
    const bad = /ad[s]?|track|click|pop|banner|promo|sponsor|affiliate|doubleclick|googlesyn|adnxs|pubmatic|openx|rubicon|casale|taboola|outbrain|mgid|exoclick|trafficjunky|adsterra|propellerads|popcash|popads|hilltopads|adcash/i;
    if (bad.test(url)) return { closed: true, close(){}, focus(){}, document:{ write(){}, close(){} } };
    // Bloquar también cualquier ventana que no sea la misma origen
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) return { closed: true, close(){}, focus(){}, document:{ write(){}, close(){} } };
    } catch(e) {}
    return { closed: true, close(){}, focus(){}, document:{ write(){}, close(){} } };
  };
})();

/* ── 2. CSS DE BLOQUEO DE ADS (inyectado en iframes) ────────── */
function getAdKillerCSS() {
  return `
    /* Elementos de anuncios conocidos */
    [id*="ad"],[id*="banner"],[id*="popup"],[id*="overlay"],[id*="modal"],
    [id*="advertisement"],[id*="sponsor"],[id*="promo"],
    [class*="ad-"],[class*="ads-"],[class*="-ad"],[class*="-ads"],
    [class*="banner"],[class*="popup"],[class*="overlay"],[class*="modal"],
    [class*="sponsor"],[class*="promo"],[class*="advertisement"],
    [class*="interstitial"],[class*="preroll"],[class*="vast"],
    [class*="ima-"],[class*="adsense"],[class*="google-ad"],
    [class*="dfp-"],[class*="pubads"],[class*="taboola"],
    [class*="outbrain"],[class*="mgid"],[class*="propeller"],
    [class*="exo"],[class*="adsterra"],[class*="popcash"],
    /* iframes de ads */
    iframe[src*="ads"],iframe[src*="track"],iframe[src*="doubleclick"],
    iframe[src*="googlesyndication"],iframe[src*="adnxs"],
    iframe[src*="rubiconproject"],iframe[src*="pubmatic"],
    /* divs con z-index altísimo (típico de overlays de ads) */
    div[style*="z-index: 2147483647"],
    div[style*="z-index:2147483647"],
    div[style*="z-index: 999999"],
    div[style*="position: fixed"][style*="top: 0"],
    /* Links de tracking */
    a[href*="click"],a[href*="track"],a[href*="ad."],
    /* Scripts de ads */
    script[src*="ads"],script[src*="doubleclick"],script[src*="googletag"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
      position: absolute !important;
      left: -9999px !important;
    }

    /* Asegurar que el video ocupe toda la pantalla */
    video {
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100% !important;
      object-fit: contain !important;
    }

    /* Bloquear scroll del body para que no haya contenido extra */
    body { overflow: hidden !important; }

    /* Ocultar header/footer/nav de sitios de canales */
    header, footer, nav, .header, .footer, .nav,
    .navbar, .topbar, .sidebar, .menu, .cookie,
    [class*="cookie"],[class*="gdpr"],[class*="consent"],
    [id*="cookie"],[id*="gdpr"],[id*="consent"] {
      display: none !important;
    }
  `;
}

/* ── 3. loadStream REEMPLAZADO ───────────────────────────────── */
window.loadStream = function(url, tipo) {
  if (!url || url.trim() === '' || url.startsWith('TU_LINK')) {
    mostrarErrorVideo('⚠️ Este canal no tiene link asignado todavía.');
    return;
  }

  currentLink = url;

  // Destruir HLS anterior
  if (window._hls) { window._hls.destroy(); window._hls = null; }

  const container = document.getElementById('videoContainer');

  // Detectar tipo de stream
  const esM3U8 = url.includes('.m3u8') || url.includes('chunklist') ||
                 url.includes('playlist.m3u') || tipo === 'm3u8';
  const esMp4  = !esM3U8 && (url.endsWith('.mp4') || url.includes('.mp4?') || tipo === 'mp4');

  // Todo lo que NO sea m3u8/mp4 va como iframe (incluye RCN, canales web, embeds)
  const esIframe = !esM3U8 && !esMp4;

  if (esIframe) {
    crearIframeConAdBlock(container, url);
    return;
  }

  /* ── VIDEO NATIVO ── */
  container.innerHTML = '';
  const video = crearVideoElement();
  const castInd = crearCastIndicator();
  container.appendChild(video);
  container.appendChild(castInd);

  video.addEventListener('timeupdate', actualizarBarraTV);
  video.addEventListener('pause', () => { const b = document.getElementById('tvPlayPauseBtn'); if(b) b.innerHTML='<i class="fa-solid fa-play"></i>'; });
  video.addEventListener('play',  () => { const b = document.getElementById('tvPlayPauseBtn'); if(b) b.innerHTML='<i class="fa-solid fa-pause"></i>'; });

  if (esM3U8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
    window._hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
    window._hls.loadSource(url);
    window._hls.attachMedia(video);
    window._hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { video.muted = true; video.play(); }));
    window._hls.on(Hls.Events.ERROR, (e, d) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) window._hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) window._hls.recoverMediaError();
        else window._hls.destroy();
      }
    });
    return;
  }
  if (esM3U8 && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => { video.muted = true; video.play(); }));
    return;
  }
  video.src = url;
  video.play().catch(() => { video.muted = true; video.play(); });
};

/* ── 4. IFRAME CON MÁXIMO BLOQUEO ───────────────────────────── */
window.crearIframeConAdBlock = function(container, url) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#000;overflow:hidden;';

  /* ── IFRAME PRINCIPAL ── */
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; camera; microphone');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  // Sin allow-popups ni allow-top-navigation = no puede abrir ventanas ni redirigir
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#000;';

  /* ── INYECCIÓN CSS + BLOQUEO JS EN IFRAME ── */
  iframe.addEventListener('load', () => {
    try {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument || win?.document;

      if (doc && doc.head) {
        // Inyectar CSS killer
        const style = doc.createElement('style');
        style.textContent = getAdKillerCSS();
        doc.head.appendChild(style);

        // Bloquar window.open dentro del iframe
        try { win.open = () => ({ closed: true, close(){}, focus(){} }); } catch(e) {}

        // Bloquar location redirect
        try {
          Object.defineProperty(win, 'location', {
            get: () => win.location,
            set: (v) => { /* bloquear */ },
            configurable: true
          });
        } catch(e) {}

        // Eliminar elementos de ads que ya existan
        const adSelectors = [
          '[id*="ad"]','[class*="popup"]','[class*="overlay"]',
          '[class*="banner"]','[class*="interstitial"]',
          'div[style*="z-index: 2147483647"]',
          'div[style*="position: fixed"]'
        ];
        adSelectors.forEach(sel => {
          try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch(e) {}
        });

        // MutationObserver para eliminar ads dinámicos
        const observer = new MutationObserver((mutations) => {
          mutations.forEach(m => {
            m.addedNodes.forEach(node => {
              if (node.nodeType !== 1) return;
              const el = node;
              const isAd = /ad|popup|overlay|banner|interstitial|sponsor/i.test(
                (el.id || '') + (el.className || '')
              );
              const isHighZ = el.style && parseInt(el.style.zIndex) > 9000;
              const isFixedTop = el.style && el.style.position === 'fixed' &&
                                 (el.style.top === '0px' || el.style.top === '0');
              if (isAd || isHighZ || isFixedTop) {
                try { el.remove(); } catch(e) {}
              }
            });
          });
        });
        observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
      }
    } catch(e) {
      // Cross-origin: el sandbox ya bloquea popups y redirecciones, es suficiente
      console.log('THEY GOOD TV: iframe cross-origin, sandbox activo');
    }
  });

  /* ── CAPAS BLOQUEADORAS DE CLICS en esquinas/bordes ── */
  // Zonas típicas donde van los banners en sitios de streaming
  const zonas = [
    'top:0;left:0;right:0;height:60px',          // banner top
    'bottom:0;left:0;right:0;height:70px',        // banner bottom
    'top:60px;bottom:70px;left:0;width:90px',     // barra izquierda
    'top:60px;bottom:70px;right:0;width:90px',    // barra derecha
  ];
  zonas.forEach(style => {
    const trap = document.createElement('div');
    trap.style.cssText = `position:absolute;${style};z-index:15;background:transparent;cursor:default;`;
    trap.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); });
    trap.addEventListener('mousedown', e => e.preventDefault());
    trap.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    wrapper.appendChild(trap);
  });

  /* ── ESCUDO CENTRAL: capa invisible sobre todo el iframe ──
     Solo permite clics en la zona del video (centro 70%)
     Bloquea bordes donde suelen aparecer los ads          */
  const shieldTop    = document.createElement('div');
  const shieldBottom = document.createElement('div');
  const shieldLeft   = document.createElement('div');
  const shieldRight  = document.createElement('div');

  [shieldTop, shieldBottom, shieldLeft, shieldRight].forEach(s => {
    s.style.cssText = 'position:absolute;z-index:20;background:rgba(0,0,0,0.001);cursor:default;pointer-events:all;';
    s.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); });
    s.addEventListener('mousedown', e => e.preventDefault());
  });

  // Dimensiones del escudo de bordes
  shieldTop.style.cssText    += 'top:0;left:0;right:0;height:55px;';
  shieldBottom.style.cssText += 'bottom:0;left:0;right:0;height:65px;';
  shieldLeft.style.cssText   += 'top:55px;bottom:65px;left:0;width:75px;';
  shieldRight.style.cssText  += 'top:55px;bottom:65px;right:0;width:75px;';

  /* ── BADGE "AD SHIELD ON" ── */
  const badge = document.createElement('div');
  badge.style.cssText = `
    position:absolute;top:8px;right:8px;z-index:50;
    background:rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.15);
    color:#aaa;font-family:Roboto,sans-serif;font-size:11px;font-weight:600;
    padding:4px 10px;border-radius:20px;pointer-events:none;
    display:flex;align-items:center;gap:6px;letter-spacing:0.3px;
  `;
  badge.innerHTML = '<span style="width:6px;height:6px;background:#00c864;border-radius:50%;display:inline-block;"></span> AD SHIELD';

  /* ── CAST INDICATOR ── */
  const castInd = crearCastIndicator();

  /* ── ENSAMBLAR ── */
  wrapper.appendChild(iframe);
  wrapper.appendChild(shieldTop);
  wrapper.appendChild(shieldBottom);
  wrapper.appendChild(shieldLeft);
  wrapper.appendChild(shieldRight);
  wrapper.appendChild(badge);
  wrapper.appendChild(castInd);
  container.appendChild(wrapper);
};

/* ── 5. INTERCEPTAR postMessage (redirecciones vía mensaje) ──── */
window.addEventListener('message', e => {
  if (!e.data || typeof e.data !== 'string') return;
  if (/open|redirect|navigate|popup|click|ad/i.test(e.data)) {
    e.stopImmediatePropagation();
  }
}, true);

/* ── 6. BLOQUEAR APERTURA DE NUEVAS VENTANAS POR EVENTOS ─────── */
document.addEventListener('click', e => {
  const target = e.target;
  if (!target) return;
  // Si el click viene de dentro de un iframe, no podemos hacer nada
  // Pero bloqueamos cualquier <a target="_blank"> que apunte a ads
  const a = target.closest('a[href]');
  if (a) {
    const href = a.getAttribute('href') || '';
    const bad = /ad[s]?|track|click|pop|banner|promo|sponsor|affiliate|doubleclick/i;
    if (bad.test(href)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}, true);

/* ── 7. Función de error visual ─────────────────────────────── */
window.mostrarErrorVideo = function(msg) {
  const c = document.getElementById('videoContainer');
  if (!c) return;
  c.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      min-height:300px;background:#111;color:#888;
      font-family:Roboto,sans-serif;font-size:14px;
      text-align:center;padding:24px;flex-direction:column;gap:12px;
    ">
      <i class="fa-solid fa-circle-exclamation" style="font-size:2.5rem;color:#ff4444;"></i>
      <span>${msg}</span>
    </div>`;
};

console.log('THEY GOOD TV Patch v2 cargado ✓');
