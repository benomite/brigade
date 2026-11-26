// Les délais des dernières 24 heures (#4309), hors de la vue jouée : relayés par le suivi de la station, relus par la vue —
// le pire d'abord, les illisibles écartés, jamais un chiffre inventé — et un dépassement qui s'ouvre puis se referme.
import assert from "node:assert/strict";
import { test } from "node:test";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireSuivi, type ProjetDemande } from "../../src/projets/demande.ts";
import { tenirProjets } from "../../src/projets/projets.ts";
import type { Fichiers, GitHubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { tenirLesDelais } from "../../src/vue-delais/delais.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARTS = { cook: 1, gates: 2, review: 3, renvois: 4, attentes: 5 };
const pire = (ticket: number, attendu_min: number, reel_min: number, repartition_min: object = PARTS) => ({ ticket, titre: `T${ticket}`, attendu_min, reel_min, modele: "opus", effort: "medium", repartition_min });
const DELAIS = { fenetre_heures: 24, fusionnes: 9, dans_les_temps: 6, part_dans_les_temps: 6 / 9, sans_temps_attendu: 2, pires_depassements: [pire(1, 30, 40), pire(2, 10, 60), pire(3, 5, 30)] };
const texte = (lu: unknown) => tenirLesDelais(doc).poser("parade", lu).textContent;
const SANS = /^Last 24 hoursNo ticket merged with an expected time in the last 24 hours\.$/;
const suivi = (plus: object) => JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...plus }] });

test("the station's published follow-up relays `delais` as is, and says nothing of it when absent", () => {
  assert.deepEqual(lireSuivi(suivi({ delais: DELAIS }))[0]?.delais, DELAIS);
  assert.equal("delais" in (lireSuivi(suivi({}))[0] ?? {}), false);
});

test("the overruns come worst first, by minutes over the expected time; an unreadable one is left out", () => {
  const lu = texte({ ...DELAIS, pires_depassements: [...DELAIS.pires_depassements, { ticket: 4, titre: "no times" }, pire(5, -1, 9), null] });
  assert.deepEqual([...lu.matchAll(/#(\d+) T/g)].map(([, n]) => Number(n)), [2, 3, 1]);
  assert.match(texte({ ...DELAIS, pires_depassements: [pire(6, 0, 0)] }), /#6 T6 — expected 0 min, took 0 min/, "zero minutes is a reading");
});

test("no readable share, no figure: a missing count or a share that is not a number gives the empty line", () => {
  for (const faux of [{ part_dans_les_temps: "0.8" }, { part_dans_les_temps: Number.NaN }, { part_dans_les_temps: -0.1 }, { fusionnes: null }, { dans_les_temps: undefined }]) {
    assert.match(texte({ ...DELAIS, ...faux }), SANS, JSON.stringify(faux));
  }
  assert.match(texte(undefined), SANS);
  assert.match(texte({ ...DELAIS, part_dans_les_temps: 0 }), /0 % merged within their expected time \(6\/9\)/, "no ticket on time is a share");
});

test("the block says the share, how many have no expected time, and the window it covers", () => {
  const texte = tenirLesDelais(doc).poser("parade", { ...DELAIS, fenetre_heures: 12 }).textContent;
  assert.match(texte, /^Last 12 hours/);
  assert.match(texte, /67 % merged within their expected time \(6\/9\) · 2 without an expected time/);
  assert.doesNotMatch(tenirLesDelais(doc).poser("parade", { ...DELAIS, sans_temps_attendu: 0 }).textContent, /without an expected time/);
  assert.match(tenirLesDelais(doc).poser("parade", { ...DELAIS, fenetre_heures: undefined, sans_temps_attendu: "x" }).textContent, /^Last 24 hours67 % merged within their expected time \(6\/9\)#2 /);
});

test("an overrun opens on a click, closes on the second, and stays open when the block is posed again", () => {
  const tenus = tenirLesDelais(doc);
  const bouton = () => tenus.poser("parade", DELAIS).children.at(-1)?.children[0]?.children[0] ?? assert.fail("no overrun");
  const premier = bouton();
  assert.equal(premier.ariaExpanded, "false");
  assert.doesNotMatch(premier.parentElement?.textContent ?? "", /Cook:/);
  premier.click();
  assert.equal(premier.ariaExpanded, "true");
  assert.match(premier.parentElement?.textContent ?? "", /Cook: 1 minGates: 2 minReview: 3 minSend-backs: 4 minWaits: 5 min$/);
  const repose = bouton();
  assert.equal(repose.ariaExpanded, "true", "still open after the view is posed again");
  repose.click();
  assert.equal(repose.ariaExpanded, "false");
  assert.doesNotMatch(repose.parentElement?.textContent ?? "", /Cook:/);
  repose.click();
  assert.equal(tenus.poser("cantine", DELAIS).children.at(-1)?.children[0]?.children[0]?.ariaExpanded, "false", "another kitchen's overrun is not opened");
});

test("an overrun whose breakdown is not readable says so when opened, and makes up no minute", () => {
  const bloc = tenirLesDelais(doc).poser("parade", { ...DELAIS, pires_depassements: [pire(7, 5, 50, { cook: 1, gates: 2, review: 3, renvois: 4 })] });
  const bouton = bloc.children.at(-1)?.children[0]?.children[0] ?? assert.fail("no overrun");
  bouton.click();
  assert.match(bouton.parentElement?.textContent ?? "", /Where its time went is not readable\.$/);
});

test("a station that cannot read its merged tickets says why, and shows no share", () => {
  assert.equal(texte({ illisible: "delais-tickets.json is not a JSON array" }), "Last 24 hoursThe merged tickets cannot be read: delais-tickets.json is not a JSON array");
  assert.match(texte({ ...DELAIS, illisible: 7 }), /67 % merged within their expected time/, "a reason that is not a text is not one");
});

test("the main process gives the view the `delais` a station publishes, and drops them once the station no longer does", async () => {
  const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
  const PARADE: ProjetDemande = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };
  const gists = new Map<string, Fichiers>();
  const publier = (plus: object) => gists.set(BOX.id, { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-11-25T12:00:00.000Z", projets: [{ nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: BOX.nom, ici: false, bascule: null, ...plus }] }) });
  const github: GitHubDesStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const projets = tenirProjets({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, maintenant: () => Date.parse("2026-11-25T12:00:00.000Z"), locale: () => null });
  const parade = async () => (await projets.relire()).projets.find(({ nom }) => nom === "parade");
  publier({ delais: DELAIS });
  assert.deepEqual((await parade())?.delais, DELAIS);
  publier({});
  assert.equal("delais" in ((await parade()) ?? assert.fail("no parade")), false);
});
