// Le rejeu de brigade le 2026-11-06 à 17:40 UTC (#2618) : aucun cook ne tourne,
// et quinze tickets ont l'air prêts. Neuf sont des épiques découpées dont tous
// les sous-tickets sont fermés ; elles gardent `fire`, leur `prio:` et un
// décompte `0/N servi`. En un tour, le manager réécrit leur décompte depuis
// GitHub et les ferme ; la station n'en prend aucune, et la retenue de la
// cuisine ne les compte plus. Horloge fixée, aucune station réelle.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { DEBUT, FIN } from "../src/epique.ts";
import { suivreLeTour } from "../src/retenue/tour.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "./faux-github.ts";
import { jusqua } from "./outils.ts";

const MAINTENANT = new Date("2026-11-06T17:40:00Z");
const EPIQUES = [2583, 2582, 2553, 2514, 2498, 2484, 2462, 2181, 2356];
const LABELS = ["fire", "prio:1", "model:opus", "effort:medium"];
// Les sous-tickets de chaque épique : trois, tous fermés. Le premier de #2553
// est fermé sans PR mergée — abandonné ; les autres sont servis.
const sousTickets = (epic: number) => [1, 2, 3].map((rang) => epic * 10 + rang);
const ABANDONNE = 25531;

// Le corps d'une épique tel qu'il était à 17:40 : le décompte d'avant, figé.
const corpsDe = (epic: number) =>
  [
    `Epic ${epic}.`,
    "",
    DEBUT,
    "## Tickets de l'épique",
    "",
    "**0/3 servi.**",
    "",
    "| # | Ticket | État |",
    "|---|---|---|",
    ...sousTickets(epic).map((ticket) => `| #${ticket} | Ticket ${ticket} | pas sur le rail |`),
    "",
    FIN,
  ].join("\n");

test("#2618 on 2026-11-06 17:40: nine split epics whose sub-tickets are all closed are closed within one manager turn, their tally rewritten from GitHub", async (t) => {
  const fermes = EPIQUES.flatMap(sousTickets).map((numero) => issue(numero, ["model:sonnet", "effort:medium"], { state: "closed", title: `Ticket ${numero}` }));
  const c = cuisine(t, { manager: { jugement: "juge-ticket" }, issues: [...EPIQUES.map((epic) => issue(epic, LABELS, { title: `Epic ${epic}` })), ...fermes] });
  for (const epic of EPIQUES) c.gh.decrire(epic, { body: corpsDe(epic) });
  for (const { number } of fermes) {
    if (number !== ABANDONNE) c.gh.fermeesParUnMerge.set(number, { number: number + 100_000, url: `https://github.com/benomite/brigade/pull/${number + 100_000}`, base: "main", sha: "s", state: "closed", merged: true, enRetard: false, mergeePar: null });
  }
  // Le tour pendant lequel chaque épique se ferme : le compte des sondages des
  // issues ouvertes à ce moment.
  const tours = new Map<number, number>();
  const fermer = c.gh.github.fermerIssue.bind(c.gh.github);
  c.gh.github.fermerIssue = async (numero) => {
    tours.set(numero, c.gh.sondages.ouvertes);
    await fermer(numero);
  };
  chef(c.repertoire, "manager.enabled");

  await jusqua(() => EPIQUES.every((epic) => c.gh.lire(epic)?.state === "closed"));

  assert.deepEqual([...tours.values()], EPIQUES.map(() => 1), "every epic is closed in the first manager turn");
  assert.equal(c.lancements().length, 0, "no judgment is spent on them");
  for (const epic of EPIQUES) {
    const liste = c.gh.corpsDe(epic);
    const servis = epic === 2553 ? 2 : 3;
    assert.match(liste, new RegExp(`\\*\\*${servis}/3 served\\.\\*\\*`));
    assert.doesNotMatch(liste, /pas sur le rail/);
    const dits = c.gh.commentaires.filter(([numero, corps]) => numero === epic && corps.includes("brigade:epique-terminee"));
    assert.equal(dits.length, 1, `#${epic} carries one closing comment`);
  }
  assert.match(c.gh.corpsDe(2553), /\| #25531 \| Ticket 25531 \| dropped \|/);
  const dit2553 = c.gh.commentaires.find(([numero, corps]) => numero === 2553 && corps.includes("brigade:epique-terminee"))?.[1] ?? "";
  assert.match(dit2553, /\*\*Dropped\*\* \(1\), closed with no merged PR:\n- #25531 Ticket 25531$/m);
  assert.match(dit2553, /It closes anyway/);
});

test("#2618 on 2026-11-06 17:40: no station claims a split epic, and the held-kitchen line no longer counts them", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "replay-2618-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  for (const epic of EPIQUES) faux.feu(epic, LABELS, corpsDe(epic));
  // Un ticket ordinaire, retenu par une dépendance ouverte : il attend, lui.
  faux.feu(2600, LABELS, "Depends on #2601");
  faux.feu(2601, ["model:opus"], "an open issue");
  const lancer: Lancer = () => assert.fail("no cook leaves");
  const suivi = suivreLeTour(() => MAINTENANT);
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom: "box/claude",
    places: 4,
    depotGitHub: "benomite/brigade",
    github: fauxClient(faux, "box/claude"),
    depot: { connait: () => false, preparer: async () => assert.fail("no worktree"), reprendre: async () => assert.fail("no worktree"), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "", tete: () => "t" },
    flux: repertoire,
    lancer,
    observer: suivi.envelopper,
    maintenant: () => MAINTENANT,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();

  assert.equal(faux.prisesDe("box/claude"), 0);
  assert.deepEqual(faux.pris(), []);
  assert.deepEqual(suivi.vue().enAttente, [2600]);
});
