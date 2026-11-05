(function () {
  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    var area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(area);
    }
    return Promise.resolve();
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".lrp-copy");
    if (!btn) return;
    var id = btn.getAttribute("data-copy-target");
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    copyText(el.textContent.trim()).then(function () {
      var original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () {
        btn.textContent = original;
      }, 1200);
    });
  });
})();
