(function() {
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    if (a.target === '_blank') return;
    if (a.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    e.preventDefault();
    var url = href.split('#')[0];
    var hash = href.includes('#') ? href.substring(href.indexOf('#')) : '';
    fetch(url, { headers: { 'X-SPA': '1' } })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.title) document.title = doc.title;
        var newBody = doc.body;
        if (newBody) {
          document.body.innerHTML = newBody.innerHTML;
          // Re-execute scripts
          var scripts = document.body.querySelectorAll('script');
          scripts.forEach(function(s) {
            var ns = document.createElement('script');
            Array.from(s.attributes).forEach(function(a) { ns.setAttribute(a.name, a.value); });
            ns.textContent = s.textContent;
            s.parentNode.replaceChild(ns, s);
          });
        }
        if (window.history && window.history.pushState) {
          window.history.pushState({ spa: true, url: href }, '', href);
        }
        window.scrollTo(0, 0);
        if (hash) {
          var el = document.querySelector(hash);
          if (el) el.scrollIntoView();
        }
      })
      .catch(function() { window.location.href = href; });
  }, true);

  window.addEventListener('popstate', function(e) {
    if (e.state && e.state.spa) return;
    window.location.reload();
  });
})();
