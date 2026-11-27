// #4392 : l'écran de l'app et la ligne de la station disent `restricted mode: no sandbox`, avec ce
// que le mode restreint couvre (lecture des identifiants, réseau, garde) et ce qu'il ne couvre pas
// (les trous du shell, tels que docs/runtime/station-cook.md les liste).
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDOnboarding, type Entrees } from "../../../runtime/src/onboarding/etat.ts";
import { readOnboarding } from "../../src/projects/request.ts";
import { setJourney } from "../../src/vue/onboarding/journey.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const NOW = Date.parse("2026-10-13T10:04:00.000Z");

const WITHOUT_SANDBOX: Entrees = {
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

function screen(entries: Entrees): string {
  const onboarding = etatDOnboarding(entries);
  const tracking = JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-13T10:00:00.000Z", projets: [], onboarding: { mirrorlab: onboarding } });
  const readOne = readOnboarding(tracking).mirrorlab ?? assert.fail("onboarding illisible");
  const section = setJourney(doc, { projet: "mirrorlab", onboarding: readOne, maintenant: NOW, ouvrir: () => {}, ecarter: () => {}, continuerSansBac: () => {}, autreStation: () => {} }) as Fake;
  return section.textContent;
}

function said(text: string, or: string) {
  assert.match(text, /restricted mode: no sandbox/, or);
  // Couvert.
  assert.match(text, /credential/i, or);
  assert.match(text, /network/i, or);
  assert.match(text, /guard/i, or);
  // Non couvert : les trous du shell du garde.
  for (const hole of ["sed -i", "curl -o", "perl -i", "python -c"]) assert.ok(text.includes(hole), `${or} : ${hole}`);
}

test("avant et après la décision du chef, l'écran de l'app et la ligne de la station disent « restricted mode: no sandbox », le couvert et le non-couvert", () => {
  const after = { ...WITHOUT_SANDBOX, decision: { station: "box" } };
  for (const [name, entries] of [["décision attendue", WITHOUT_SANDBOX], ["décision prise", after]] as const) {
    const line = etatDOnboarding(entries).etapes.find(({ etape: step }) => step === "machine")?.dit ?? "";
    said(`${line} ${etatDOnboarding(entries).etapes.find(({ etape: step }) => step === "machine")?.geste?.quoi ?? ""}`, `ligne de la station, ${name}`);
    said(screen(entries), `écran de l'app, ${name}`);
  }
});
