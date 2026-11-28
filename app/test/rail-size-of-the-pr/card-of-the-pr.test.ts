// #4051 : ce que la carte dit de sa PR selon ce que GitHub en a donné — la taille, l'âge, le lien —, et ce que le clic sur le lien fait.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { understand, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { cardOfTicket, playTheVue, repos, type Played } from "../helpers/false-vue.ts";

const READ = "2026-11-24T12:00:00.000Z";
const URL_PR = "https://github.com/chef/parade/pull/71";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const delivered = (prRead?: Record<string, unknown>) => ({
  etat: "ouverte",
  lu: READ,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 1 },
  cooks: [],
  attend: [],
  livres: [{ ticket: 80, titre: "Served one", url: "https://github.com/chef/parade/issues/80", livre: "2026-11-24T11:50:00Z", station: null, pr: "https://github.com/chef/parade/pull/81", ...(prRead === undefined ? {} : { prLue: prRead }) }],
});
const facts = (pr: Record<string, unknown>) => ({
  etat: "ouverte",
  lu: READ,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 0, livres24h: 0 },
  rail: [{ ticket: 70, etat: "en pass", titre: "Pass one", url: "https://github.com/chef/parade/issues/70", pr: { numero: 71, url: URL_PR, ...pr } }],
  cooks: [],
  attend: [],
});

async function open(pr: Record<string, unknown>, answers: Record<string, unknown> = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(facts(pr)) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const lineOfThePr = (vue: Played) => (cardOfTicket(vue, 70) ?? assert.fail("pas de carte")).dessous("p").find((p) => /livraison-carte/.test(p.className));
const said = (vue: Played) => lineOfThePr(vue)?.textContent;

const SIZE = { additions: 135, deletions: 21 };
const OPEN = { ouvertLe: "2026-11-24T11:15:00.000Z" };

test("la carte dit ce que GitHub a donné de sa PR, et rien de ce qu'il n'a pas donné", async () => {
  assert.equal(await open({ ...SIZE, ...OPEN }).then(said), "PR 71 +135 −21 45 min");
  assert.equal(await open({ ...SIZE }).then(said), "PR 71 +135 −21");
  assert.equal(await open({ ...OPEN }).then(said), "PR 71 45 min");
  assert.equal(await open({}).then(said), "PR 71");
  assert.equal(await open({ ...SIZE, url: "http://github.com/chef/parade/pull/71" }).then(lineOfThePr), undefined, "un lien qui ne s'ouvre pas en https n'a pas de ligne");
});

test("un lu qui ne donne qu'un côté de la taille, ou une heure qui n'en est pas une, ne la dit pas", () => {
  const readEntry = (pr: Record<string, unknown>) => ((understand(JSON.stringify(facts(pr))) as Facts).rail[0] ?? assert.fail("pas de ticket")).pr;
  assert.deepEqual(readEntry({ additions: 5 }), { numero: 71, url: URL_PR });
  assert.deepEqual(readEntry({ deletions: 5 }), { numero: 71, url: URL_PR });
  assert.deepEqual(readEntry({ ...SIZE, ouvertLe: 5 }), { numero: 71, url: URL_PR, ...SIZE });
  assert.deepEqual(readEntry({ ouvertLe: "pas une heure" }), { numero: 71, url: URL_PR });
  assert.deepEqual(readEntry({ ...SIZE, ...OPEN }), { numero: 71, url: URL_PR, ...SIZE, ...OPEN });
});

test("un clic sur le lien de la PR l'ouvre par le process principal ; refusé, par la page", async () => {
  for (const [answer, openOne] of [[true, false], [false, true]] as const) {
    const vue = await open({ ...SIZE }, { ouvrirLien: () => answer });
    const openEntries: unknown[][] = [];
    (globalThis as unknown as { window: { open: (...args: unknown[]) => void } }).window.open = (...args) => void openEntries.push(args);
    const link = lineOfThePr(vue)?.dessous("a")[0] ?? assert.fail("pas de lien");
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLien"), ["parade", 70, URL_PR]);
    assert.deepEqual(openEntries, openOne ? [[URL_PR, "_blank", "noopener"]] : []);
  }
});

test("la carte servie, celle de `livres`, dit la taille et l'âge de sa PR — et rien sans eux", async () => {
  const served = async (prRead?: Record<string, unknown>) => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(delivered(prRead)) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    const or = cardOfTicket(vue, 80) ?? assert.fail("pas de carte servie");
    return or.dessous("p").find((p) => /livraison-carte/.test(p.className))?.textContent;
  };
  assert.equal(await served({ ...SIZE, ...OPEN }), "PR 81 +135 −21 45 min");
  assert.equal(await served({ ...OPEN }), "PR 81 45 min");
  assert.equal(await served(), undefined);
});
