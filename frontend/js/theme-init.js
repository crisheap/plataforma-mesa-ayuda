/* Script síncrono: resuelve y aplica el tema antes del primer render. */
(() => {
  try {
    var pref = localStorage.getItem("tema") || "sistema";
    var oscuro = pref === "oscuro" || (pref === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", oscuro ? "#0F2A1A" : "#2E7D00");
  } catch (e) {
    /* sin almacenamiento: tema claro */
  }
})();
