// Les captures d'une livraison d'interface : trouvées dans ce qu'elle change,
// dites dans la PR et sur le ticket, données à l'app. Sans E/S.
import assert from "node:assert/strict";
import { test } from "node:test";
import { adresseDeCapture, capturesLivrees, capturesManquantes, capturesVues, direCaptures, estDInterface, lireCaptures } from "../src/captures.ts";

const DEPOT = "acme/brigade";
const SHA = "0123abcd";

test("un ticket est d'interface quand sa zone touche la vue de l'app, ou que le manager l'a désigné pour le cook design", () => {
  assert.equal(estDInterface({ zone: ["app/src/vue"], labels: null }), true);
  assert.equal(estDInterface({ zone: ["app/src/vue/vue.js"], labels: [] }), true);
  // Un dossier qui contient la vue la touche.
  assert.equal(estDInterface({ zone: ["runtime/src", "app/src"], labels: [] }), true);
  assert.equal(estDInterface({ zone: [], labels: ["fire", "cook:design"] }), true);
  for (const zone of [[], ["runtime/src"], ["docs"], ["scripts/capture-ecran"], ["app/src/faits.ts"]]) {
    assert.equal(estDInterface({ zone, labels: ["fire", "model:opus", "effort:high"] }), false, String(zone));
  }
});

test("les captures d'une livraison se lisent dans les fichiers qu'elle change : avant et après appariés par écran", () => {
  const changes = [
    "app/src/vue/vue.js",
    "docs/captures/842/fiche-apres.png",
    "docs/captures/842/fiche-avant.png",
    "docs/captures/842/Rail_vide.AVANT.png",
    "docs/captures/842/rail_vide-APRÈS.png",
    "docs/captures/842/espace-avant.png",
    // Ni d'un autre ticket, ni sous un dossier, ni autre chose qu'un PNG, ni sans moment.
    "docs/captures/8420/fiche-apres.png",
    "docs/captures/842/vieux/fiche-apres.png",
    "docs/captures/842/notes-avant.txt",
    "docs/captures/842/fiche.png",
  ];
  assert.deepEqual(capturesLivrees(842, changes), [
    { screen: "espace", before: "docs/captures/842/espace-avant.png", after: null },
    { screen: "fiche", before: "docs/captures/842/fiche-avant.png", after: "docs/captures/842/fiche-apres.png" },
    { screen: "Rail_vide", before: "docs/captures/842/Rail_vide.AVANT.png", after: "docs/captures/842/rail_vide-APRÈS.png" },
  ]);
  assert.deepEqual(capturesLivrees(842, ["docs/captures/842/avant.png", "docs/captures/842/apres.png"]), [
    { screen: "", before: "docs/captures/842/avant.png", after: "docs/captures/842/apres.png" },
  ]);
  assert.deepEqual(capturesLivrees(842, ["app/src/vue/vue.js"]), []);
});

test("ce qui manque se dit en clair : aucune capture, ou l'une des deux d'un écran", () => {
  assert.equal(capturesManquantes([]), "aucune capture");
  assert.equal(capturesManquantes([{ screen: "fiche", before: "a.png", after: "b.png" }]), null);
  assert.equal(
    capturesManquantes([
      { screen: "fiche", before: "a.png", after: null },
      { screen: "", before: null, after: "b.png" },
    ]),
    "la capture après de `fiche`, la capture avant de l'écran",
  );
});

test("une capture se charge au commit poussé, par l'adresse que GitHub montre aussi dans un dépôt privé", () => {
  assert.equal(adresseDeCapture(DEPOT, SHA, "docs/captures/842/fiche avant.png"), `https://github.com/${DEPOT}/blob/${SHA}/docs/captures/842/fiche%20avant.png?raw=true`);
});

test("une livraison d'interface complète montre chaque écran avant et après, côte à côte et légendés", () => {
  const lignes = direCaptures(DEPOT, 842, { sha: SHA, screens: [{ screen: "fiche", before: "docs/captures/842/fiche-avant.png", after: "docs/captures/842/fiche-apres.png" }] });
  assert.deepEqual(lignes, [
    "### Captures",
    "",
    "**Écran `fiche`**",
    "",
    "| Avant | Après |",
    "| --- | --- |",
    `| ![fiche — avant](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/842/fiche-avant.png?raw=true)<br>fiche — avant | ![fiche — après](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/842/fiche-apres.png?raw=true)<br>fiche — après |`,
    "",
  ]);
});

test("une livraison d'interface sans ses captures est dite incomplète, avec ce qui manque et où le poser", () => {
  const sans = direCaptures(DEPOT, 842, { sha: SHA, screens: [] }).join("\n");
  assert.match(sans, /^### Captures/);
  assert.match(sans, /Livraison incomplète : captures manquantes\*\* — aucune capture/);
  assert.match(sans, /`docs\/captures\/842\/<écran>-avant\.png` et `docs\/captures\/842\/<écran>-apres\.png`/);
  assert.match(sans, /scripts\/capture-ecran\//);
  assert.doesNotMatch(sans, /!\[/);

  const moitie = direCaptures(DEPOT, 842, { sha: SHA, screens: [{ screen: "fiche", before: "docs/captures/842/fiche-avant.png", after: null }] }).join("\n");
  assert.match(moitie, /Livraison incomplète : captures manquantes\*\* — la capture après de `fiche`/);
  assert.match(moitie, /!\[fiche — avant\]/);
  assert.match(moitie, /_fiche — après : manquante_/);
});

test("pour l'app, chaque capture est donnée par son adresse, nulle quand elle manque, et la livraison dite complète ou non", () => {
  assert.deepEqual(capturesVues(DEPOT, { sha: SHA, screens: [{ screen: "fiche", before: "docs/captures/842/fiche-avant.png", after: null }] }), {
    complet: false,
    ecrans: [{ ecran: "fiche", avant: `https://github.com/${DEPOT}/blob/${SHA}/docs/captures/842/fiche-avant.png?raw=true`, apres: null }],
  });
  assert.deepEqual(capturesVues(DEPOT, { sha: SHA, screens: [] }), { complet: false, ecrans: [] });
});

test("des captures se relisent au journal telles qu'écrites, ou pas du tout", () => {
  const ecrites = { sha: SHA, screens: [{ screen: "fiche", before: "a.png", after: null }] };
  assert.deepEqual(lireCaptures(JSON.parse(JSON.stringify(ecrites))), ecrites);
  for (const brut of [null, {}, { sha: "", screens: [] }, { sha: SHA, screens: "fiche" }, { sha: SHA, screens: [{ before: "a.png" }] }]) {
    assert.equal(lireCaptures(brut), null, JSON.stringify(brut));
  }
});
