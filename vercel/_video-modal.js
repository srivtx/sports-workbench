// Video modal — opens the YouTube demo in a styled overlay.
// Intercepts clicks on any <a href="#demo"> (the hero "Watch it work" button).
// Self-contained: injects its own CSS and DOM. No framework dependency.
(function () {
  var VIDEO_ID = "yvgCG33Antc";
  var EMBED = "https://www.youtube.com/embed/" + VIDEO_ID + "?autoplay=1&rel=0&modestbranding=1";

  var CSS = `
    .vm-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(5,5,5,.88);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; opacity: 0; transition: opacity .2s ease;
    }
    .vm-backdrop.open { opacity: 1; }
    .vm-panel {
      width: 100%; max-width: 960px;
      background: #0B0B10;
      border: 1px solid rgba(182,255,60,.25);
      border-radius: 16px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 24px 80px rgba(0,0,0,.6), 0 0 60px rgba(182,255,60,.07);
      overflow: hidden;
      transform: translateY(12px) scale(.98);
      transition: transform .22s cubic-bezier(.2,.9,.3,1.2);
    }
    .vm-backdrop.open .vm-panel { transform: translateY(0) scale(1); }
    .vm-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.07);
    }
    .vm-title {
      font-family: ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;
      font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
      color: rgba(237,237,239,.5);
      display: flex; align-items: center; gap: 8px;
    }
    .vm-dot { width: 7px; height: 7px; border-radius: 50%; background: #B6FF3C;
      box-shadow: 0 0 8px rgba(182,255,60,.6); }
    .vm-close {
      background: none; border: 1px solid rgba(255,255,255,.12); border-radius: 8px;
      color: rgba(237,237,239,.6); font-size: 16px; line-height: 1;
      width: 30px; height: 30px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s;
      font-family: ui-monospace,monospace;
    }
    .vm-close:hover {
      color: #B6FF3C; border-color: rgba(182,255,60,.4);
      background: rgba(182,255,60,.06);
    }
    .vm-body { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; }
    .vm-body iframe {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    }
    .vm-foot {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-top: 1px solid rgba(255,255,255,.07);
      font-family: ui-monospace,monospace; font-size: 11px;
      color: rgba(237,237,239,.35);
    }
    .vm-foot a { color: #5EE6FF; text-decoration: none; }
    .vm-foot a:hover { text-decoration: underline; }
    body.vm-locked { overflow: hidden; }
  `;

  var styleEl = null;
  var backdrop = null;
  var closeTimer = null;

  function injectCSS() {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  function build() {
    backdrop = document.createElement("div");
    backdrop.className = "vm-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "sports-workbench demo video");
    backdrop.innerHTML =
      '<div class="vm-panel">' +
        '<div class="vm-head">' +
          '<span class="vm-title"><span class="vm-dot"></span>watch · sports-workbench demo</span>' +
          '<button class="vm-close" aria-label="Close video">×</button>' +
        '</div>' +
        '<div class="vm-body"><iframe id="vm-frame" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="sports-workbench demo"></iframe></div>' +
        '<div class="vm-foot"><span>esc to close</span><a href="https://youtu.be/' + VIDEO_ID + '" target="_blank" rel="noreferrer">open on youtube ↗</a></div>' +
      '</div>';

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector(".vm-close").addEventListener("click", close);
    document.body.appendChild(backdrop);
  }

  function open() {
    injectCSS();
    if (!backdrop) build();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    backdrop.style.display = "flex";
    var frame = backdrop.querySelector("#vm-frame");
    frame.src = EMBED; // set src only when opening — stops playback on close
    document.body.classList.add("vm-locked");
    void backdrop.offsetWidth; // force reflow so the fade-in transition replays
    backdrop.classList.add("open");
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!backdrop) return;
    backdrop.classList.remove("open");
    document.body.classList.remove("vm-locked");
    document.removeEventListener("keydown", onKey);
    closeTimer = setTimeout(function () {
      closeTimer = null;
      backdrop.querySelector("#vm-frame").src = ""; // kill the video so audio stops
      backdrop.style.display = "none"; // remove from hit-testing so the page is clickable again
    }, 200);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  // Intercept "Watch it work" clicks
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#demo"]');
    if (!a) return;
    e.preventDefault();
    open();
  });
})();
