import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigInvalide } from "../src/runtime.ts";
import { direStations, lireStations, NOM_DE_STATION } from "../src/stations-declarees.ts";

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
    assert.match(direStations(lireStations(env)), /^aucune \(BRIGADE_STATIONS n'est pas défini\) : aucun cook ne partira/);
  });
}

test("ce que le runtime dit de ses stations au démarrage : chacune, son plafond, ce qu'elle fournit", () => {
  assert.equal(
    direStations(lireStations({ BRIGADE_STATIONS: "box/claude:30:code+raisonnement,box/playwright:1:navigateur-headless" })),
    "box/claude (30 cooks au plus ; fournit : code, raisonnement) ; box/playwright (1 cook au plus ; fournit : navigateur-headless)",
  );
});

// Chaque déclaration invalide est refusée par un message qui nomme la station
// et le champ fautif.
for (const [cas, valeur, attendu] of [
  ["un nom sans moteur", "box:2:code", /station n° 1 \(« box:2:code »\) — nom : « box » n'est pas de la forme `<machine>\/<moteur>`/],
  ["un nom sans machine", "/claude:2:code", /nom : « \/claude » n'est pas de la forme/],
  ["un nom à trois étages", "box/claude/opus:2:code", /nom : « box\/claude\/opus » n'est pas de la forme/],
  ["un nom en majuscules", "Box/Claude:2:code", /nom : « Box\/Claude » n'est pas de la forme/],
  ["un nom vide", ":2:code", /nom : «  » n'est pas de la forme/],
  ["un plafond à zéro", "box/claude:0:code", /plafond : « 0 » n'est pas un entier supérieur à zéro/],
  ["un plafond négatif", "box/claude:-1:code", /plafond : « -1 » n'est pas un entier supérieur à zéro/],
  ["un plafond à virgule", "box/claude:1.5:code", /plafond : « 1.5 » n'est pas un entier supérieur à zéro/],
  ["un plafond en lettres", "box/claude:deux:code", /plafond : « deux » n'est pas un entier supérieur à zéro/],
  ["un plafond démesuré", "box/claude:99999999999999999999:code", /plafond : « 99999999999999999999 » n'est pas un entier supérieur à zéro/],
  ["un plafond absent", "box/claude", /plafond : il manque/],
  ["un plafond vide", "box/claude::code", /plafond : «  » n'est pas un entier supérieur à zéro/],
  ["un nom en double", "box/claude:2:code,box/playwright:1:navigateur,box/claude:4:code", /station n° 3 \(« box\/claude:4:code »\) — nom : `box\/claude` est déjà déclarée/],
  ["une station sans capacité", "box/claude:2", /fournit : il manque/],
  ["une liste de capacités vide", "box/claude:2:", /fournit : il manque/],
  ["une capacité vide", "box/claude:2:code+", /fournit : «  » n'est pas un nom de capacité/],
  ["une capacité à espace", "box/claude:2:navigateur headless", /fournit : « navigateur headless » n'est pas un nom de capacité/],
  ["une capacité en double", "box/claude:2:code+code", /fournit : `code` est écrite deux fois/],
  ["un champ de trop", "box/claude:2:code:opus", /« opus » est en trop : une station a trois champs/],
  ["une virgule de trop", "box/claude:2:code,", /station n° 2 \(«  »\) — elle est vide : une virgule de trop/],
] as const) {
  test(`refus qui nomme la station et le champ fautif : ${cas} — BRIGADE_STATIONS=${valeur}`, () => {
    assert.throws(
      () => lireStations({ BRIGADE_STATIONS: valeur }),
      (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.startsWith("BRIGADE_STATIONS invalide : ") && attendu.test(erreur.message),
    );
  });
}

test("un nom de station se reconnaît : une machine, un moteur — pas le reviewer ni le manager", () => {
  for (const nom of ["box/claude", "box/playwright", "mac/claude-chrome", "mac/accès-prod", "box-2/claude"]) assert.ok(NOM_DE_STATION.test(nom), nom);
  for (const nom of ["reviewer", "manager", "chef", "box/", "/claude", "box/claude/x", "box claude"]) assert.ok(!NOM_DE_STATION.test(nom), nom);
});

test("une capacité accentuée se lit sous un seul nom, quelle que soit la façon dont l'accent est écrit : c'est celui qu'une fiche demandera", () => {
  const [station] = lireStations({ BRIGADE_STATIONS: "mac/claude-chrome:1:chrome-connecté+code" });
  assert.deepEqual(station?.fournit, ["chrome-connecté", "code"]);
  // Deux écritures du même nom sont un doublon.
  assert.throws(() => lireStations({ BRIGADE_STATIONS: "mac/claude-chrome:1:chrome-connecté+chrome-connecté" }), /fournit : `chrome-connecté` est écrite deux fois/);
});
