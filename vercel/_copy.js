// Vanilla copy button — bypasses React hydration entirely.
// Finds every .copy-btn element, reads the command text from the
// adjacent <code.inst-cmd-txt> sibling, and wires up a click handler
// that writes to the clipboard and shows "Copied ✓" feedback.
// Fallback: uses document.execCommand("copy") on a hidden textarea
// when navigator.clipboard is unavailable (insecure context, old browser).
(function () {
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("execCommand copy failed"));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  function wire() {
    var buttons = document.querySelectorAll(".copy-btn");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        if (btn.dataset.copyWired === "1") return;
        btn.dataset.copyWired = "1";
        // Stop React's broken handler (if it ever hydrates) from also firing
        btn.addEventListener(
          "click",
          function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var code = btn.parentElement
              ? btn.parentElement.querySelector(".inst-cmd-txt")
              : null;
            var text = code ? code.textContent.trim() : "";
            if (!text) {
              // Last-resort: read aria-label or button's own textContent
              text = (btn.getAttribute("aria-label") || btn.textContent || "")
                .replace(/^Copy\s*/i, "")
                .trim();
            }
            copyToClipboard(text)
              .then(function () {
                var label = btn.querySelector(".copy-label");
                var prev = label ? label.textContent : "";
                if (label) label.textContent = "Copied";
                btn.classList.add("copied");
                setTimeout(function () {
                  if (label) label.textContent = prev || "Copy";
                  btn.classList.remove("copied");
                }, 1500);
              })
              .catch(function (err) {
                var label = btn.querySelector(".copy-label");
                if (label) label.textContent = "Error";
                setTimeout(function () {
                  if (label) label.textContent = "Copy";
                }, 1500);
                console.error("[sports-workbench] copy failed:", err);
              });
          },
          true // capture phase — runs BEFORE React's onClick
        );
      })(buttons[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
  // Also re-wire after nav.js SPA navigation swaps the body
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a && a.getAttribute("href") && a.getAttribute("href").startsWith("/")) {
      setTimeout(wire, 50);
    }
  }, true);
})();
