import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigInvalide } from "../src/runtime.ts";
import { direStations, ecrireStation, lireStations, NOM_DE_STATION } from "../src/stations-declarees.ts";

test("un projet déclare deux stations de la même machine : chacune a son nom, ce qu'elle fournit et son plafond", () => {
  assert.deepEqual(lireStations({ BRIGADE_STATIONS: "box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless" }), [
    { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 30 },
    { nom: "box/playwright", moteur: "playwright", fournit: ["navigateur-headless"], cooks: 2 },
  ]);
});

test("les blancs autour d'une station et de ses champs ne comptent pas", () => {
  assert.deepEqual(lireStations({ BRIGADE_STATIONS: " box/claude : 3 : code + raisonnement , atelier-2/claude:1:code " }), [
    { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3 },
    { nom: "atelier-2/claude", moteur: "claude", fournit: ["code"], cooks: 1 },
  ]);
});

test("une capacité se nomme comme la spec la nomme, accents compris", () => {
  assert.deepEqual(lireStations({ BRIGADE_STATIONS: "mac/claude-chrome:1:chrome-connecté" })[0]?.fournit, ["chrome-connecté"]);
});

for (const env of [{}, { BRIGADE_STATIONS: "" }, { BRIGADE_STATIONS: "  " }]) {
  test(`un projet qui ne déclare aucune station est accepté (${JSON.stringify(env)}), et le runtime dit qu'aucun cook ne partira`, () => {
    assert.deepEqual(lireStations(env), []);
    assert.match(direStations(lireStations(env)), /^none \(BRIGADE_STATIONS is set neither in the environment nor in the log\): no cook will leave/);
  });
}

test("ce que le runtime dit de ses stations au démarrage : chacune, son plafond, ce qu'elle fournit", () => {
  assert.equal(
    direStations(lireStations({ BRIGADE_STATIONS: "box/claude:30:code+raisonnement,box/playwright:1:navigateur-headless" })),
    "box/claude (30 cooks at most; provides: code, raisonnement) ; box/playwright (1 cook at most; provides: navigateur-headless)",
  );
});

// Chaque déclaration invalide est refusée par un message qui nomme la station
// et le champ fautif.
for (const [cas, valeur, attendu] of [
  ["un nom sans moteur", "box:2:code", /station no\. 1 \(“box:2:code”\) — name: “box” is not of the form `<machine>\/<engine>`/],
  ["un nom sans machine", "/claude:2:code", /name: “\/claude” is not of the form/],
  ["un nom à trois étages", "box/claude/opus:2:code", /name: “box\/claude\/opus” is not of the form/],
  ["un nom en majuscules", "Box/Claude:2:code", /name: “Box\/Claude” is not of the form/],
  ["un nom vide", ":2:code", /name: “” is not of the form/],
  ["un plafond à zéro", "box/claude:0:code", /cap: “0” is not an integer greater than zero/],
  ["un plafond négatif", "box/claude:-1:code", /cap: “-1” is not an integer greater than zero/],
  ["un plafond à virgule", "box/claude:1.5:code", /cap: “1.5” is not an integer greater than zero/],
  ["un plafond en lettres", "box/claude:deux:code", /cap: “deux” is not an integer greater than zero/],
  ["un plafond démesuré", "box/claude:99999999999999999999:code", /cap: “99999999999999999999” is not an integer greater than zero/],
  ["un plafond absent", "box/claude", /cap: it is missing/],
  ["un plafond vide", "box/claude::code", /cap: “” is not an integer greater than zero/],
  ["un nom en double", "box/claude:2:code,box/playwright:1:navigateur,box/claude:4:code", /station no\. 3 \(“box\/claude:4:code”\) — name: `box\/claude` is already declared/],
  ["une station sans capacité", "box/claude:2", /provides: it is missing/],
  ["une liste de capacités vide", "box/claude:2:", /provides: it is missing/],
  ["une capacité vide", "box/claude:2:code+", /provides: “” is not a capability name/],
  ["une capacité à espace", "box/claude:2:navigateur headless", /provides: “navigateur headless” is not a capability name/],
  ["une capacité en double", "box/claude:2:code+code", /provides: `code` is written twice/],
  ["un champ de trop", "box/claude:2:code:opus", /“opus” is one too many: a station has three fields/],
  ["un cinquième champ", "mac/claude:1:chrome-connecté:distante:vite", /“vite” is one too many: a station has three fields — an optional fourth says only `distante`/],
  ["un quatrième champ qui ne dit pas `distante`", "mac/claude:1:chrome-connecté:locale", /“locale” is one too many: a station has three fields — an optional fourth says only `distante`/],
  ["`ordinaires` sans `distante`", "box/claude:2:code:ordinaires", /`ordinaires` only goes with a `distante` station \(`distante\+ordinaires`\): a station of the box already takes the ordinary tickets/],
  ["`ordinaires` devant `distante`", "mac/claude:1:chrome-connecté:ordinaires+distante", /“ordinaires\+distante” is one too many/],
  ["une marque inconnue après `distante`", "mac/claude:1:chrome-connecté:distante+vite", /“distante\+vite” is one too many: .* or `distante\+ordinaires`: it also takes the ordinary tickets/],
  ["`ordinaires` deux fois", "mac/claude:1:chrome-connecté:distante+ordinaires+ordinaires", /“distante\+ordinaires\+ordinaires” is one too many/],
  ["une virgule de trop", "box/claude:2:code,", /station no\. 2 \(“”\) — it is empty: one comma too many/],
] as const) {
  test(`refus qui nomme la station et le champ fautif : ${cas} — BRIGADE_STATIONS=${valeur}`, () => {
    assert.throws(
      () => lireStations({ BRIGADE_STATIONS: valeur }),
      (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.startsWith("BRIGADE_STATIONS invalid: ") && attendu.test(erreur.message),
    );
  });
}

test("une station se déclare distante par un quatrième champ : elle ne tourne pas sur cette machine, et le démarrage le dit — les autres ne le sont pas", () => {
  const stations = lireStations({ BRIGADE_STATIONS: "box/claude:30:code, mac/claude:1:chrome-connecté+code : distante" });
  assert.deepEqual(stations, [
    { nom: "box/claude", moteur: "claude", fournit: ["code"], cooks: 30 },
    { nom: "mac/claude", moteur: "claude", fournit: ["chrome-connecté", "code"], cooks: 1, distante: true },
  ]);
  assert.equal(
    direStations(stations),
    "box/claude (30 cooks at most; provides: code) ; mac/claude (1 cook at most; provides: chrome-connecté, code; remote: it pulls its work, the box never reaches it)",
  );
});

test("un nom de station se reconnaît : une machine, un moteur — pas le reviewer ni le manager", () => {
  for (const nom of ["box/claude", "box/playwright", "mac/claude-chrome", "mac/accès-prod", "box-2/claude"]) assert.ok(NOM_DE_STATION.test(nom), nom);
  for (const nom of ["reviewer", "manager", "chef", "box/", "/claude", "box/claude/x", "box claude"]) assert.ok(!NOM_DE_STATION.test(nom), nom);
});

test("une capacité accentuée se lit sous un seul nom, quelle que soit la façon dont l'accent est écrit : c'est celui qu'une fiche demandera", () => {
  const [station] = lireStations({ BRIGADE_STATIONS: "mac/claude-chrome:1:chrome-connecté+code" });
  assert.deepEqual(station?.fournit, ["chrome-connecté", "code"]);
  // Deux écritures du même nom sont un doublon.
  assert.throws(() => lireStations({ BRIGADE_STATIONS: "mac/claude-chrome:1:chrome-connecté+chrome-connecté" }), /provides: `chrome-connecté` is written twice/);
});

test("une station distante prend aussi les tickets ordinaires quand le chef la déclare `distante+ordinaires` : le démarrage le dit, et la déclaration se réécrit à l'identique", () => {
  const ecrite = "box/claude:30:code,mac/claude:2:chrome-connecté:distante+ordinaires,win/claude:1:obs:distante";
  const stations = lireStations({ BRIGADE_STATIONS: ecrite.replace("distante+ordinaires", " distante + ordinaires ") });
  assert.deepEqual(stations, [
    { nom: "box/claude", moteur: "claude", fournit: ["code"], cooks: 30 },
    { nom: "mac/claude", moteur: "claude", fournit: ["chrome-connecté"], cooks: 2, distante: true, ordinaires: true },
    { nom: "win/claude", moteur: "claude", fournit: ["obs"], cooks: 1, distante: true },
  ]);
  assert.equal(stations.map(ecrireStation).join(","), ecrite);
  assert.match(direStations(stations), /mac\/claude \(2 cooks at most; provides: chrome-connecté; remote: it pulls its work, the box never reaches it; also takes ordinary tickets, in the sandbox of its workstation\)/);
  assert.doesNotMatch(direStations(stations).split(" ; win/")[1] ?? "", /ordinaires/);
});
