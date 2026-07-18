// SPA navigation for the static site.
// Intercepts <a> clicks and does a fetch + body swap instead of a full page load,
// matching how Next.js <Link> behaves on a real app router.
//
// Behavior:
//   href="#section"       → smooth scroll, no navigation (browser-native hash)
//   href="/path/"         → fetch + body swap (SPA nav)
//   href="https://..."    → browser handles (full nav to external)
//   data-no-spa="1"      → opt out (browser handles as if no JS)
//   target="_blank"      → browser handles (new tab)
//   download="..."       → browser handles (file download)
//   modifier keys held    → browser handles (user wants new tab/window)
(function () {
  var IS_EXTERNAL = /^(https?:|mailto:|tel:|javascript:|\/\/)/i;

  function reexecuteInlineScripts() {
    var scripts = document.body.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      if (s.dataset && s.dataset.noReexec === "1") continue;
      if (s.src) continue; // external scripts don't need re-execution; the browser caches them
      var ns = document.createElement("script");
      var attrs = s.attributes;
      for (var j = 0; j < attrs.length; j++) {
        ns.setAttribute(attrs[j].name, attrs[j].value);
      }
      ns.textContent = s.textContent;
      if (s.parentNode) s.parentNode.replaceChild(ns, s);
    }
  }

  function smoothScrollTo(target) {
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      target.scrollIntoView();
    }
  }

  function onClick(e) {
    // Only primary button, no modifier keys
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Find the closest anchor (handles clicks on nested elements like SVG)
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;

    // Skip non-navigating links
    if (a.target === "_blank") return;
    if (a.hasAttribute("download")) return;
    if (a.dataset && a.dataset.noSpa === "1") return;

    var href = a.getAttribute("href");
    if (!href || href === "#") return;

    // External links — let the browser handle
    if (IS_EXTERNAL.test(href)) return;

    // Same-page hash link — smooth scroll, no fetch
    if (href.charAt(0) === "#") {
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        smoothScrollTo(target);
        if (window.history && window.history.pushState) {
          history.pushState(null, "", href);
        }
      }
      // If target not found on this page, let the browser handle it
      // (it will just update the URL hash without reloading)
      return;
    }

    // Internal link — full page load (no SPA swap; avoids React hydration bugs)
    e.preventDefault();
    window.location = href;
  }

  // Use capture phase so we run BEFORE any element-level or React handler
  document.addEventListener("click", onClick, true);

  // Browser back/forward — only reload if we're not navigating within our own SPA history
  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.spa) return;
    window.location.reload();
  });
})();
