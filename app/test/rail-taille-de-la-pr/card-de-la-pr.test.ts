// #4051 : ce que la carte dit de sa PR selon ce que GitHub en a donné — la taille, l'âge, le lien —, et ce que le clic sur le lien fait.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, comprendre, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { cardDuTicket, jouerLaVue, repos, type Jouee } from "../aides/fausse-vue.ts";

const LU = "2026-11-24T12:00:00.000Z";
const URL_PR = "https://github.com/chef/parade/pull/71";
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
const livres = (prLue?: Record<string, unknown>) => ({
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  livres: [{ ticket: 80, titre: "Served one", url: "https://github.com/chef/parade/issues/80", livre: "2026-11-24T11:50:00Z", station: null, pr: "https://github.com/chef/parade/pull/81", ...(prLue === undefined ? {} : { prLue }) }],
});
const facts = (pr: Record<string, unknown>) => ({
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 70, etat: "en pass", titre: "Pass one", url: "https://github.com/chef/parade/issues/70", pr: { numero: 71, url: URL_PR, ...pr } }],
  cooks: [],
  attend: [],
});

async function ouvrir(pr: Record<string, unknown>, answers: Record<string, unknown> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(facts(pr)) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const lineDeLaPr = (vue: Jouee) => (cardDuTicket(vue, 70) ?? assert.fail("pas de carte")).dessous("p").find((p) => /livraison-carte/.test(p.className));
const dit = (vue: Jouee) => lineDeLaPr(vue)?.textContent;

const TAILLE = { additions: 135, deletions: 21 };
const OUVERT = { ouvertLe: "2026-11-24T11:15:00.000Z" };

test("la carte dit ce que GitHub a donné de sa PR, et rien de ce qu'il n'a pas donné", async () => {
  assert.equal(await ouvrir({ ...TAILLE, ...OUVERT }).then(dit), "PR 71 +135 −21 45 min");
  assert.equal(await ouvrir({ ...TAILLE }).then(dit), "PR 71 +135 −21");
  assert.equal(await ouvrir({ ...OUVERT }).then(dit), "PR 71 45 min");
  assert.equal(await ouvrir({}).then(dit), "PR 71");
  assert.equal(await ouvrir({ ...TAILLE, url: "http://github.com/chef/parade/pull/71" }).then(lineDeLaPr), undefined, "un lien qui ne s'ouvre pas en https n'a pas de ligne");
});

test("un lu qui ne donne qu'un côté de la taille, ou une heure qui n'en est pas une, ne la dit pas", () => {
  const lue = (pr: Record<string, unknown>) => ((comprendre(JSON.stringify(facts(pr))) as Facts).rail[0] ?? assert.fail("pas de ticket")).pr;
  assert.deepEqual(lue({ additions: 5 }), { numero: 71, url: URL_PR });
  assert.deepEqual(lue({ deletions: 5 }), { numero: 71, url: URL_PR });
  assert.deepEqual(lue({ ...TAILLE, ouvertLe: 5 }), { numero: 71, url: URL_PR, ...TAILLE });
  assert.deepEqual(lue({ ouvertLe: "pas une heure" }), { numero: 71, url: URL_PR });
  assert.deepEqual(lue({ ...TAILLE, ...OUVERT }), { numero: 71, url: URL_PR, ...TAILLE, ...OUVERT });
});

test("un clic sur le lien de la PR l'ouvre par le process principal ; refusé, par la page", async () => {
  for (const [answer, ouverte] of [[true, false], [false, true]] as const) {
    const vue = await ouvrir({ ...TAILLE }, { ouvrirLien: () => answer });
    const ouvertes: unknown[][] = [];
    (globalThis as unknown as { window: { open: (...args: unknown[]) => void } }).window.open = (...args) => void ouvertes.push(args);
    const lien = lineDeLaPr(vue)?.dessous("a")[0] ?? assert.fail("pas de lien");
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLien"), ["parade", 70, URL_PR]);
    assert.deepEqual(ouvertes, ouverte ? [[URL_PR, "_blank", "noopener"]] : []);
  }
});

test("la carte servie, celle de `livres`, dit la taille et l'âge de sa PR — et rien sans eux", async () => {
  const served = async (prLue?: Record<string, unknown>) => {
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(livres(prLue)) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    const ou = cardDuTicket(vue, 80) ?? assert.fail("pas de carte servie");
    return ou.dessous("p").find((p) => /livraison-carte/.test(p.className))?.textContent;
  };
  assert.equal(await served({ ...TAILLE, ...OUVERT }), "PR 81 +135 −21 45 min");
  assert.equal(await served({ ...OUVERT }), "PR 81 45 min");
  assert.equal(await served(), undefined);
});
