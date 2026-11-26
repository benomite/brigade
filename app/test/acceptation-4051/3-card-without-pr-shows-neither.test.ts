// #4051, critère 3 : une carte sans PR ne montre ni taille ni âge, et pas de place vide à leur place.
// Un test qui passerait sur une vue sans le ticket est écarté : la carte avec PR, elle, doit les montrer.
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Dessinable, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { cardDuTicket, jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const REPOSITORY = "chef/parade";
const LU = "2026-11-24T12:00:00.000Z";
const OUVERTE_IL_Y_A_45_MIN = "2026-11-24T11:15:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Le rail lu : #70 en pass avec sa PR #71 (+135 −21, ouverte il y a 45 min), #72 servi (PR #73, +8 −2), #74 en pass sans PR.
// Contrat que ce test fixe, le ticket le laissant ouvert : la PR d'une carte du rail porte `additions`, `deletions` et `ouvertLe`.
const facts = (): Facts =>
  ({
    etat: "ouverte",
    lu: LU,
    dernierTick: LU,
    compteurs: { rail: 3, auTravail: 0, aLaPass: 2, attend: 0, livres24h: 1 },
    dernierEvenement: null,
    rail: [
      { ticket: 70, etat: "en pass", titre: "Pass one", url: `https://github.com/${REPOSITORY}/issues/70`, pr: { numero: 71, url: `https://github.com/${REPOSITORY}/pull/71`, additions: 135, deletions: 21, ouvertLe: OUVERTE_IL_Y_A_45_MIN } },
      { ticket: 72, etat: "servi", titre: "Served one", url: `https://github.com/${REPOSITORY}/issues/72`, pr: { numero: 73, url: `https://github.com/${REPOSITORY}/pull/73`, additions: 8, deletions: 2, ouvertLe: OUVERTE_IL_Y_A_45_MIN } },
      { ticket: 74, etat: "en pass", titre: "No PR yet", url: `https://github.com/${REPOSITORY}/issues/74` },
    ],
    cooks: [],
    attend: [],
  }) as unknown as Facts;
const dessinable = (): Dessinable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] });

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...dessinable(), demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const card = (vue: Jouee, ticket: number): Faux => cardDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const toutLeTexte = (ou: Faux) => [ou, ...ou.descendants()].map((e) => e.textContent).join(" ");

test("la carte sans PR n'a ni lignes ajoutées/retirées, ni âge, ni lien, ni emplacement vide — celle avec PR les a", async () => {
  const vue = await ouvrir();
  assert.match(toutLeTexte(card(vue, 70)), /\+135/, "la carte avec PR montre sa taille");
  const nue = card(vue, 74);
  const texte = toutLeTexte(nue);
  assert.doesNotMatch(texte, /[+−]\s?\d/, "pas de taille");
  assert.doesNotMatch(texte, /\b\d+\s?(m|min|h|d)\b/, "pas d'âge");
  assert.doesNotMatch(texte, /PR\s*#?\d|\b0\b|—\s*$|\+\s*[−-]/, "pas de PR ni de zéros ni de tiret de remplissage");
  assert.deepEqual(nue.dessous("a").filter((a) => /\/pull\//.test((a as unknown as { href?: string }).href ?? "")), [], "pas de lien de PR");
  const vides = [...nue.descendants()].filter((e) => /(^|\s)(pr|taille|age|diff)[\w-]*/.test(e.className) && e.textContent.trim() === "");
  assert.deepEqual(vides.map((e) => e.className), [], "pas d'emplacement vide");
});
