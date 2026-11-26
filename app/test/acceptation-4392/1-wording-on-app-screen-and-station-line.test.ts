// #4392 : l'écran de l'app et la ligne de la station disent `restricted mode: no sandbox`, avec ce
// que le mode restreint couvre (lecture des identifiants, réseau, garde) et ce qu'il ne couvre pas
// (les trous du shell, tels que docs/runtime/station-cook.md les liste).
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDOnboarding, type Entrees } from "../../../runtime/src/onboarding/etat.ts";
import { lireOnboarding } from "../../src/projets/demande.ts";
import { poserParcours } from "../../src/vue/onboarding/parcours.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = Date.parse("2026-10-13T10:04:00.000Z");

const SANS_BAC: Entrees = {
  projet: "mirrorlab",
  depot: "BOBL-tech/mirrorlab",
  station: "box",
  suivi: { etat: "servi", dit: "served by box", autoriser: [] },
  clone: true,
  sansBacASable: true,
  decision: null,
  preparation: null,
  premierTicket: null,
  dejaServi: false,
};

function ecran(entrees: Entrees): string {
  const onboarding = etatDOnboarding(entrees);
  const suivi = JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-13T10:00:00.000Z", projets: [], onboarding: { mirrorlab: onboarding } });
  const lu = lireOnboarding(suivi).mirrorlab ?? assert.fail("onboarding illisible");
  const section = poserParcours(doc, { projet: "mirrorlab", onboarding: lu, maintenant: MAINTENANT, ouvrir: () => {}, ecarter: () => {}, continuerSansBac: () => {}, autreStation: () => {} }) as Faux;
  return section.textContent;
}

function dit(texte: string, ou: string) {
  assert.match(texte, /restricted mode: no sandbox/, ou);
  // Couvert.
  assert.match(texte, /credential/i, ou);
  assert.match(texte, /network/i, ou);
  assert.match(texte, /guard/i, ou);
  // Non couvert : les trous du shell du garde.
  for (const trou of ["sed -i", "curl -o", "perl -i", "python -c"]) assert.ok(texte.includes(trou), `${ou} : ${trou}`);
}

test("avant et après la décision du chef, l'écran de l'app et la ligne de la station disent « restricted mode: no sandbox », le couvert et le non-couvert", () => {
  const apres = { ...SANS_BAC, decision: { station: "box" } };
  for (const [nom, entrees] of [["décision attendue", SANS_BAC], ["décision prise", apres]] as const) {
    const ligne = etatDOnboarding(entrees).etapes.find(({ etape }) => etape === "machine")?.dit ?? "";
    dit(`${ligne} ${etatDOnboarding(entrees).etapes.find(({ etape }) => etape === "machine")?.geste?.quoi ?? ""}`, `ligne de la station, ${nom}`);
    dit(ecran(entrees), `écran de l'app, ${nom}`);
  }
});
