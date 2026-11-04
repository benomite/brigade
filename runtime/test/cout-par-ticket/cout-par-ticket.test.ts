// Ce que coûte un ticket sur GitHub (#2198) : le coût suit les événements, pas
// le temps. Un ticket servi de bout en bout — pris, cuisiné, relu, mergé —
// coûte au plus 30 appels comptés ; une cuisine vide et des tickets qui
// attendent n'en coûtent aucun, une heure durant.
//
// Tout est le vrai chemin GitHub seul (`brigade-github.ts`, sa prise, sa
// relecture, son merge) sur le vrai client (`github.ts`, ses ETag, ses 304) :
// seul le transport est faux, plus bas que `gh` (`faux-github.ts`), et c'est
// lui qui compte. Un 304, que GitHub ne compte pas, n'est pas un appel compté.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherBrigadeGithub, priseDeLaStation, stationDuDepot, type Lancer, type StationGitHub } from "../../src/brigade-github.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirGitHub } from "../../src/github.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { FauxGitHub, type Appel } from "./faux-github.ts";

const DEPOT = "faux/cout";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
// Le budget d'un ticket servi, de sa prise à son merge.
const BUDGET = 30;
// L'intervalle entre deux tours de la station GitHub seul.
const TOUR_MS = 30_000;
const HEURE_MS = 60 * 60_000;

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;
const dire = (appels: Appel[]) => appels.map(({ methode, chemin, statut }) => `${methode} ${chemin} → ${statut}`).join("\n");

// La station GitHub seul de ce runtime, sur le faux GitHub. `cuisson` : ce que
// le cook attend avant de conclure — le test le tient au travail aussi
// longtemps qu'il veut. `avertis` : ce que la station dit de ce qui rate ;
// sans lui, rien ne doit rater.
function station(t: TestContext, faux: FauxGitHub, cuisson: () => Promise<void> = async () => {}, avertis?: string[]): StationGitHub {
  const repertoire = mkdtempSync(join(tmpdir(), "cout-par-ticket-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const fin = (async () => {
      if (!reviewer) await cuisson();
      writeFileSync(flux, fluxQuiConclut(reviewer ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
      return { code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null };
    })();
    return { fin };
  };
  const github = ouvrirGitHub({
    depot: DEPOT,
    // Propre au test : les lectures gardées du client se rangent sous ce nom.
    bin: `faux-gh-${repertoire}`,
    transport: faux.transport,
    limite: ouvrirLimite(),
    limitesDuCompte: ouvrirLimitesDuCompte(),
  });
  const ouverte = stationDuDepot({
    // Le coût mesuré ici est celui du REST, appel par appel (#2198) : la lecture GraphQL (#2301) a le sien.
    graphql: false,
    nom: "box",
    places: 2,
    base: "main",
    depotGitHub: DEPOT,
    github,
    depot: {
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      connait: () => false,
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["a.ts"],
      diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => (avertis === undefined ? assert.fail(texte) : void avertis.push(texte)),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  return ouverte;
}

test("a ticket served end to end, from taken to merged, costs at most 30 counted GitHub calls — the tours while it cooks and after its merge cost none", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  faux.feu(42, CALIBRE);
  let servir = () => {};
  const servi = new Promise<void>((resoudre) => (servir = resoudre));
  const box = station(t, faux, () => servi);

  // Prise et lancement du cook.
  await box.tour();
  assert.deepEqual(box.enCuisine(), [42]);
  // Le tour suivant relit la liste que la prise a changée ; puis le cook
  // travaille une demi-heure de tours, que rien ne change.
  await box.tour();
  const pendant = faux.appels.length;
  for (let tour = 0; tour < 60; tour += 1) await box.tour();
  assert.deepEqual(faux.comptes(pendant), [], `while it cooks:\n${dire(faux.comptes(pendant))}`);
  servir();
  await box.calme();
  // Relecture et merge, au tour suivant.
  for (let tour = 0; tour < 5 && faux.prDe(42)?.merged !== true; tour += 1) {
    await box.tour();
    await box.calme();
  }
  assert.equal(faux.prDe(42)?.merged, true);
  assert.equal(faux.issue(42).state, "closed");
  // Le tour qui voit le ticket parti, puis une demi-heure de cuisine vide.
  await box.tour();
  const servis = faux.comptes();
  const apres = faux.appels.length;
  for (let tour = 0; tour < 60; tour += 1) await box.tour();
  assert.deepEqual(faux.comptes(apres), [], `after the merge:\n${dire(faux.comptes(apres))}`);

  assert.ok(servis.length <= BUDGET, `${servis.length} counted calls for one served ticket, over the budget of ${BUDGET}:\n${dire(servis)}`);
});

// Un tour toutes les trente secondes, une heure durant, sur une horloge que le
// test avance : la station de `brancherBrigadeGithub`, telle que le runtime la
// fait tourner. Rend les appels comptés pendant l'heure, une fois le premier
// tour fait — celui qui lit tout pour la première fois.
async function uneHeure(t: TestContext, faux: FauxGitHub, avertis: string[] = []): Promise<{ comptes: Appel[]; tours: number; lus: number; tourSuivant(): Promise<void> }> {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const box = station(t, faux, undefined, avertis);
  let tours = 0;
  let fini = () => {};
  const tourFini = () => new Promise<void>((resoudre) => (fini = resoudre));
  let attendu = tourFini();
  const ouvert = brancherBrigadeGithub({
    reglages: { githubOnlyState: true },
    ancien: () => assert.fail("the old path is not opened"),
    station: () => ({
      ...box,
      tour: async () => {
        try {
          // Le tour et ses relectures, qui tournent hors de lui (#2329).
          await box.tour();
          await box.relu();
        } finally {
          tours += 1;
          fini();
        }
      },
    }),
    intervalleMs: TOUR_MS,
    // Ce qu'il dit à l'ouverture.
    avertir: () => {},
  });
  assert.equal(ouvert.chemin, "github");
  if (ouvert.chemin !== "github") throw new Error("the GitHub-only path is not opened");
  t.after(() => ouvert.arreter());
  // Le tour se termine, puis le suivant se programme : on attend l'un, puis
  // que l'autre soit posé, avant d'avancer l'horloge.
  const suivant = async () => {
    await attendu;
    attendu = tourFini();
    await new Promise((suite) => setImmediate(suite));
  };
  await suivant();
  const depuis = faux.appels.length;
  for (let ecoule = 0; ecoule < HEURE_MS; ecoule += TOUR_MS) {
    t.mock.timers.tick(TOUR_MS);
    await suivant();
  }
  const tourSuivant = async () => {
    t.mock.timers.tick(TOUR_MS);
    await suivant();
  };
  return { comptes: faux.comptes(depuis), tours, lus: faux.appels.length - depuis, tourSuivant };
}

test("an empty kitchen left an hour on a fake clock costs no counted GitHub call", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  const { comptes, tours, lus } = await uneHeure(t, faux);
  assert.equal(tours, 1 + HEURE_MS / TOUR_MS);
  // La station a bien relu GitHub à chaque tour — sous condition.
  assert.ok(lus >= HEURE_MS / TOUR_MS);
  assert.deepEqual(comptes, [], dire(comptes));
});

// Un ticket refusé à la relecture n'attend pas : il repart à un cook (#2209).
test("waiting tickets left an hour on a fake clock cost no counted GitHub call: waiting, not calibrated, taken by another station, its zone held by an open PR, its delivery waiting for the chef", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  // Il attend : le label `waiting`.
  faux.feu(5, [...CALIBRE, "waiting"]);
  // Il attend son calibrage.
  faux.feu(6, ["fire"]);
  // Une autre station le cuisine.
  faux.feu(7, [...CALIBRE, "taken"]);
  faux.commenterCommeLeDepot(7, corpsDePrise("mac/claude"));
  // Sa zone est tenue par une PR ouverte d'un autre ticket.
  faux.feu(8, CALIBRE, "ticket 8", "## Zone\n\n- `runtime/src`\n");
  faux.livrer(99, ["runtime/src/a.ts"]);
  // Approuvée, mais elle change ce qui la juge : elle attend le chef.
  faux.feu(10, [...CALIBRE, "in-pass", "blocked-on-human"]);
  const pr = faux.livrer(10, [".claude/brigade/gates.sh"]);
  faux.commenterCommeLeDepot(pr.number, corpsDeVerdict("mac/claude", pr.sha, { verdict: "approve", motif: "" }));
  const { comptes, tours, lus } = await uneHeure(t, faux);
  assert.equal(tours, 1 + HEURE_MS / TOUR_MS);
  assert.ok(lus >= HEURE_MS / TOUR_MS);
  assert.deepEqual(comptes, [], dire(comptes));
  // Rien n'a bougé sur eux.
  assert.equal(faux.prDe(10)?.merged, false);
  assert.deepEqual(faux.issue(7).labels, [...CALIBRE, "taken"]);
  assert.deepEqual(faux.issue(8).labels, CALIBRE);
});

test("an approved PR waiting on its required CI costs one refused merge, then nothing for an hour, and is merged at the tour after its CI turns green", async (t) => {
  const faux = new FauxGitHub(DEPOT);
  faux.protection = true;
  faux.feu(9, [...CALIBRE, "in-pass"]);
  const pr = faux.livrer(9);
  faux.commenterCommeLeDepot(pr.number, corpsDeVerdict("mac/claude", pr.sha, { verdict: "approve", motif: "" }));
  const avertis: string[] = [];
  const { comptes, tourSuivant } = await uneHeure(t, faux, avertis);
  // Le premier tour a tenté le merge, et GitHub l'a refusé : cela se dit, une fois.
  assert.equal(faux.appels.filter(({ methode, statut }) => methode === "PUT" && statut === 405).length, 1);
  assert.equal(avertis.length, 1);
  assert.match(avertis[0] ?? "", /merge of #9 on box refused by GitHub — HTTP 405 — Required status check "tests" is expected\.; retried once its PR or the base changes/);
  assert.deepEqual(comptes, [], dire(comptes));
  // La CI finit verte : la fiche de la PR change, et le tour suivant merge.
  faux.ciVerte(pr.sha);
  const avant = faux.appels.length;
  await tourSuivant();
  assert.equal(faux.prDe(9)?.merged, true);
  assert.equal(faux.issue(9).state, "closed");
  assert.ok(faux.comptes(avant).length <= 3, dire(faux.comptes(avant)));
});
