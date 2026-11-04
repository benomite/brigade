import assert from "node:assert/strict";
import { test } from "node:test";
import { fusionner, relire, type CommentaireDeVerdict, type GitHubDeLaFusion, type PRAFusionner } from "../../src/github-etat/fusion.ts";
import type { Merge } from "../../src/github.ts";
import { decider, tourner, type Accord, type Tour } from "../../src/stations-cloud/autoscale.ts";
import { fournisseurFactice } from "../../src/stations-cloud/fournisseur.ts";

const PROJET = "brigade";
const PERMIS: Accord = { permis: true };

// Un tour sur le fournisseur factice : la station locale `box/claude` tient un
// ticket, aucune station n'est occupée d'autre, et les plafonds permettent.
const tour = (fournisseur: Tour["fournisseur"], reste: Partial<Tour> = {}): Tour => ({
  fournisseur,
  projet: PROJET,
  servables: 0,
  locales: [{ nom: "box/claude", libre: false }],
  occupees: new Set(),
  plafonds: () => PERMIS,
  ...reste,
});

test("des tickets à servir et aucune station locale pour les prendre : une station cloud démarre, une seule", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  assert.deepEqual(await tourner(tour(fournisseur, { servables: 3 })), { geste: "demarrer" });
  assert.deepEqual(gestes, [`demarrer ${PROJET} c1`]);
  assert.deepEqual((await fournisseur.lister(PROJET)).map(({ nom }) => nom), ["cloud/c1"]);
});

test("des tickets à servir mais une station locale libre : rien ne démarre", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  const decision = await tourner(tour(fournisseur, { servables: 1, locales: [{ nom: "box/claude", libre: true }] }));
  assert.deepEqual(decision, { geste: "rien", raison: "preneur-libre" });
  assert.deepEqual(gestes, []);
});

test("une station cloud démarrée et encore libre compte comme preneur : une autre ne démarre que pour un ticket sans preneur", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  await tourner(tour(fournisseur, { servables: 1 }));
  assert.deepEqual(await tourner(tour(fournisseur, { servables: 1 })), { geste: "rien", raison: "preneur-libre" });
  assert.deepEqual(await tourner(tour(fournisseur, { servables: 2 })), { geste: "demarrer" });
  assert.deepEqual(gestes, [`demarrer ${PROJET} c1`, `demarrer ${PROJET} c2`]);
});

test("le rail vide : les stations cloud libres s'arrêtent, celle qui tient un ticket garde son travail, la locale n'est pas touchée", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  await fournisseur.demarrer(PROJET);
  await fournisseur.demarrer(PROJET);
  await fournisseur.demarrer(PROJET);
  const ailleurs = await fournisseur.demarrer("autre");
  gestes.length = 0;

  const decision = await tourner(tour(fournisseur, { occupees: new Set(["cloud/c2"]) }));
  assert.deepEqual(decision, { geste: "arreter", ids: ["c1", "c3"] });
  assert.deepEqual(gestes, ["arreter c1", "arreter c3"]);
  assert.deepEqual((await fournisseur.lister(PROJET)).map(({ id }) => id), ["c2"]);
  assert.deepEqual((await fournisseur.lister("autre")).map(({ id }) => id), [ailleurs.id]);

  // Elle a livré : libre, le rail toujours vide, elle s'arrête à son tour.
  assert.deepEqual(await tourner(tour(fournisseur)), { geste: "arreter", ids: ["c2"] });
  assert.deepEqual(await fournisseur.lister(PROJET), []);
  assert.deepEqual(await tourner(tour(fournisseur)), { geste: "rien", raison: "rail-vide" });
});

test("un plafond atteint : rien ne démarre, et la décision nomme le plafond", async () => {
  const { fournisseur, gestes } = fournisseurFactice();
  await fournisseur.demarrer(PROJET);
  gestes.length = 0;
  const lues: number[] = [];
  // Une station à la fois : celle qui tourne l'atteint.
  const plafonds = (enCours: { id: string }[]): Accord => (lues.push(enCours.length), enCours.length >= 1 ? { permis: false, plafond: "stations-a-la-fois" } : PERMIS);
  const decision = await tourner(tour(fournisseur, { servables: 2, occupees: new Set(["cloud/c1"]), plafonds }));
  assert.deepEqual(decision, { geste: "rien", raison: "plafond", plafond: "stations-a-la-fois" });
  assert.deepEqual(lues, [1]);
  assert.deepEqual(gestes, []);

  for (const plafond of ["heures-par-jour", "heures-par-mois"]) {
    assert.deepEqual(decider({ servables: 1, stations: [], plafonds: { permis: false, plafond } }), { geste: "rien", raison: "plafond", plafond });
  }
});

test("un plafond atteint n'empêche pas d'arrêter : le rail vide arrête les stations cloud libres", () => {
  const stations = [{ nom: "cloud/c1", libre: true, cloud: "c1" }];
  assert.deepEqual(decider({ servables: 0, stations, plafonds: { permis: false, plafond: "heures-par-jour" } }), { geste: "arreter", ids: ["c1"] });
});

// Une PR approuvée sur GitHub, dont la CI de la tête est réglable ; `merges`
// garde chaque merge demandé.
function prApprouvable(numero: number) {
  let id = 9000;
  const pr: { sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean } = { sha: "a1", state: "open", merged: false, enRetard: false };
  const commentaires: CommentaireDeVerdict[] = [];
  const ci: { etat: "green" | "red" | "pending" } = { etat: "red" };
  const merges: string[] = [];
  const github: GitHubDeLaFusion = {
    async commentaires() {
      return [...commentaires];
    },
    async commenter(_numero, corps) {
      commentaires.push({ id: ++id, body: corps, association: "OWNER", createdAt: new Date(Date.parse("2026-11-04T10:00:00Z") + id * 1_000).toISOString() });
    },
    async mettreAJour() {},
    async ci() {
      return [{ name: "tests", outcome: ci.etat }];
    },
    async merger(_numero, sha): Promise<Merge> {
      merges.push(sha);
      pr.state = "closed";
      pr.merged = true;
      return { fait: true };
    },
  };
  return { github, ci, merges, lue: (): PRAFusionner => ({ number: numero, ...pr }) };
}

test("une station cloud ne merge pas sans CI verte, exactement comme une station locale", async () => {
  const { fournisseur } = fournisseurFactice();
  const cloud = await fournisseur.demarrer(PROJET);
  const issues: Record<string, string[]> = {};
  for (const station of [cloud.nom, "box/claude"]) {
    const pr = prApprouvable(station === cloud.nom ? 1 : 2);
    const rendu = await relire(pr.lue(), { github: pr.github, station, juger: async () => ({ verdict: "approve", motif: "" }) });
    assert.equal(rendu?.station, station);
    const suite: string[] = [];
    for (const etat of ["red", "pending", "green"] as const) {
      pr.ci.etat = etat;
      suite.push((await fusionner(pr.lue(), pr.github)).issue);
    }
    assert.deepEqual(pr.merges, ["a1"], station);
    issues[station] = suite;
  }
  assert.deepEqual(issues[cloud.nom], ["ci-rouge", "ci-attendue", "mergee"]);
  assert.deepEqual(issues[cloud.nom], issues["box/claude"]);
});
