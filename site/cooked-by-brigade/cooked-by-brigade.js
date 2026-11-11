// Renders projects.json, the list of the "Cooked by Brigade" page (#3264): one entry per project, in the file's order.
// The autonomy figures are those of #3213 (served without a human, lead time, send-back rate), shown as the file gives
// them with their period and date; nothing is computed here. An entry with no complete figures is listed and says so.
(function (root) {
  var FIGURES = [
    ["servedWithoutHuman", "Served without a human"],
    ["leadTime", "Lead time (median)"],
    ["sendBackRate", "Send-back rate"]
  ];
  var LINK = /^https:\/\//;
  var str = function (v) { return typeof v === "string" && v.trim() !== ""; };

  // The figures to show, or null when one of the three, the period or the date is missing.
  function figures(f) {
    if (!f || typeof f !== "object" || !str(f.period) || !str(f.asOf)) return null;
    var out = [];
    for (var i = 0; i < FIGURES.length; i++) {
      if (!str(f[FIGURES[i][0]])) return null;
      out.push({ label: FIGURES[i][1], value: f[FIGURES[i][0]] });
    }
    return { period: f.period, asOf: f.asOf, rows: out };
  }

  // The entries to show, in the file's order, or null when the file holds no list. An entry without a name,
  // a description or an https link is left out.
  function entries(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.projects)) return null;
    return data.projects.filter(function (p) {
      return p && str(p.name) && str(p.description) && str(p.url) && LINK.test(p.url);
    }).map(function (p) {
      return { name: p.name, repository: str(p.repository) ? p.repository : null, description: p.description, url: p.url, figures: figures(p.figures) };
    });
  }

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render(doc, data) {
    var list = entries(data);
    if (!list || list.length === 0) return false;
    var box = doc.getElementById("cooked-projects");
    list.forEach(function (p) {
      var item = el(doc, "article", "receipt");
      var h = el(doc, "h3");
      var a = el(doc, "a", null, p.name);
      a.href = p.url;
      h.appendChild(a);
      if (p.repository) h.appendChild(el(doc, "span", "fine", " " + p.repository));
      item.appendChild(h);
      item.appendChild(el(doc, "p", null, p.description));
      if (p.figures) {
        p.figures.rows.forEach(function (r) {
          var line = el(doc, "p", "r-line");
          line.appendChild(el(doc, "span", null, r.label));
          line.appendChild(el(doc, "span", null, r.value));
          item.appendChild(line);
        });
        item.appendChild(el(doc, "p", "fine", "Over the " + p.figures.period + ", as of " + p.figures.asOf + "."));
      } else {
        item.appendChild(el(doc, "p", "fine", "Autonomy figures not available."));
      }
      box.appendChild(item);
    });
    box.hidden = false;
    doc.getElementById("cooked-status").hidden = true;
    return true;
  }

  root.cookedByBrigade = { entries: entries, render: render };
  if (typeof document !== "undefined" && typeof fetch === "function") {
    fetch("projects.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { render(document, d); }, function () {});
  }
})(typeof window !== "undefined" ? window : globalThis);
