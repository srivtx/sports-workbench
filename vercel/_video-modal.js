// Video modal — opens the YouTube demo in a minimal overlay.
// Intercepts clicks on any <a href="#demo"> (the hero "Watch it work" button).
// Self-contained: injects its own CSS and DOM. No framework dependency.
(function () {
  var VIDEO_ID = "yvgCG33Antc";
  var EMBED = "https://www.youtube.com/embed/" + VIDEO_ID + "?autoplay=1&rel=0&modestbranding=1";

  var CSS = `
    .vm-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0,0,0,.9);
      display: none; align-items: center; justify-content: center;
      padding: 20px; opacity: 0; transition: opacity .18s ease;
    }
    .vm-backdrop.open { opacity: 1; }
    .vm-panel {
      position: relative; width: 100%; max-width: 900px;
      border: 1px solid rgba(182,255,60,.3);
      border-radius: 12px; overflow: hidden;
      background: #000;
      box-shadow: 0 30px 90px rgba(0,0,0,.8);
      transform: scale(.96); transition: transform .2s ease;
    }
    .vm-backdrop.open .vm-panel { transform: scale(1); }
    .vm-body { position: relative; width: 100%; aspect-ratio: 16/9; }
    .vm-body iframe {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    }
    .vm-close {
      position: absolute; top: -1px; right: -1px; z-index: 2;
      background: #000; border: 1px solid rgba(182,255,60,.3);
      border-top: 0; border-right: 0; border-radius: 0 0 0 12px;
      color: #B6FF3C; font-size: 18px; line-height: 1;
      width: 38px; height: 38px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .vm-close:hover { background: rgba(182,255,60,.12); }
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
        '<button class="vm-close" aria-label="Close video">×</button>' +
        '<div class="vm-body"><iframe id="vm-frame" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="sports-workbench demo"></iframe></div>' +
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
    }, 180);
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
