// Renders site/autonomie.json (input contract: docs/autonomie-page.md, to be produced by #3213) without computing anything:
// each figure is shown as the file gives it. A missing or unreadable file leaves "Figures not yet available".
(function (root) {
  var LABELS = [
    ["servedWithoutHuman", "Tickets served without a human"],
    ["medianLeadTime", "Median lead time"],
    ["sendBackRate", "Send-back rate"],
    ["mergedPullRequests", "Pull requests merged"]
  ];
  var LIST_URL = /^https:\/\/github\.com\/benomite\/brigade\//;

  // The rows to show, or null when the file does not hold the four figures with a value, a date and a list link.
  function rows(data) {
    if (!data || typeof data !== "object" || !data.figures) return null;
    var out = [];
    for (var i = 0; i < LABELS.length; i++) {
      var f = data.figures[LABELS[i][0]];
      if (!f || typeof f.value !== "string" || typeof f.computedAt !== "string" || !LIST_URL.test(f.url)) return null;
      out.push({ label: LABELS[i][1], value: f.value, computedAt: f.computedAt, url: f.url });
    }
    return out;
  }

  function render(doc, data) {
    var list = rows(data);
    if (!list) return false;
    var box = doc.getElementById("autonomy-figures");
    list.forEach(function (r) {
      var p = doc.createElement("p");
      p.className = "r-line";
      var name = doc.createElement("span");
      name.textContent = r.label + " (" + r.computedAt + ")";
      var a = doc.createElement("a");
      a.href = r.url;
      a.textContent = r.value;
      var val = doc.createElement("span");
      val.appendChild(a);
      p.appendChild(name);
      p.appendChild(val);
      box.appendChild(p);
    });
    box.hidden = false;
    doc.getElementById("autonomy-status").hidden = true;
    return true;
  }

  root.autonomie = { rows: rows, render: render };
  if (typeof document !== "undefined" && typeof fetch === "function") {
    fetch("autonomie.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { render(document, d); }, function () {});
  }
})(typeof window !== "undefined" ? window : globalThis);
