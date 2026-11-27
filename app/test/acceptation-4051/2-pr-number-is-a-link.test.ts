// #4051, critère 2 : le numéro de PR d'une carte avec livraison est un lien qui ouvre la PR.
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { cardOfTicket, playTheVue, repos, type Fake, type Played } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const READ = "2026-11-24T12:00:00.000Z";
const OPEN_IT_Y_A_45_MIN = "2026-11-24T11:15:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Le rail lu : #70 en pass avec sa PR #71 (+135 −21, ouverte il y a 45 min), #72 servi (PR #73, +8 −2), #74 en pass sans PR.
// Contrat que ce test fixe, le ticket le laissant ouvert : la PR d'une carte du rail porte `additions`, `deletions` et `ouvertLe`.
const facts = (): Facts =>
  ({
    etat: "ouverte",
    lu: READ,
    dernierTick: READ,
    compteurs: { rail: 3, auTravail: 0, aLaPass: 2, attend: 0, livres24h: 1 },
    dernierEvenement: null,
    rail: [
      { ticket: 70, etat: "en pass", titre: "Pass one", url: `https://github.com/${REPOSITORY}/issues/70`, pr: { numero: 71, url: `https://github.com/${REPOSITORY}/pull/71`, additions: 135, deletions: 21, ouvertLe: OPEN_IT_Y_A_45_MIN } },
      { ticket: 72, etat: "servi", titre: "Served one", url: `https://github.com/${REPOSITORY}/issues/72`, pr: { numero: 73, url: `https://github.com/${REPOSITORY}/pull/73`, additions: 8, deletions: 2, ouvertLe: OPEN_IT_Y_A_45_MIN } },
      { ticket: 74, etat: "en pass", titre: "No PR yet", url: `https://github.com/${REPOSITORY}/issues/74` },
    ],
    cooks: [],
    attend: [],
  }) as unknown as Facts;
const drawable = (): Drawable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] });

async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(), demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const card = (vue: Played, ticket: number): Fake => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const allTheText = (or: Fake) => [or, ...or.descendants()].map((e) => e.textContent).join(" ");

for (const [ticket, pr] of [[70, 71], [72, 73]] as const) {
  test(`sur la carte #${ticket}, « ${pr} » est un lien vers la PR`, async () => {
    const vue = await open();
    const links = card(vue, ticket).dessous("a").filter((a) => (a as unknown as { href?: string }).href === `https://github.com/${REPOSITORY}/pull/${pr}`);
    assert.ok(links.length > 0, "aucun lien vers la PR");
    assert.ok(links.some((a) => new RegExp(`(^|\\D)${pr}(\\D|$)`).test(a.textContent)), `le texte du lien dit le numéro ${pr}`);
  });
}
