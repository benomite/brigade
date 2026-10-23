// Le ticket qui prépare le dépôt, sur une vraie station — un seul process,
// `station/main.ts` —, dont GitHub est un faux `gh` : tant qu'il n'est pas
// servi, la cuisine du projet ne prend que lui, même quand un ticket plus
// ancien attend ; servi, elle prend les autres.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { FICHIER } from "../../src/preparation-depot/ouvrir.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, lancer, repertoireTemporaire, temporaireDuFichier, tuerLesRelais } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const FAUX_GH_GISTS = join(import.meta.dirname, "../appairage/faux-gh-gists.ts");
const DEPOT = "acme/shop";
// Le ticket du chef, plus ancien : sans préparation, c'est lui qui partirait le premier.
const DU_CHEF = 15;
const PREPARATION = 20;

function uneStation(t: TestContext, preparation: "ouverte" | "servie") {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  mkdirSync(racine);
  mkdirSync(compte);
  const etat = join(racine, "etat/shop");
  mkdirSync(etat, { recursive: true });
  aArreter(t, () => tuerLesRelais(etat));
  // Ce que la station a fait en ajoutant le projet depuis l'app : les décisions
  // du parcours au journal, et le ticket qui prépare le dépôt.
  const journal = ouvrirJournal(etat);
  const decide = { BRIGADE_STATIONS: "box/claude:30:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decide)) journal.ajouter({ project: "shop", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  if (preparation === "servie") {
    const noter = (type: string, payload: object, author = "runtime") => journal.ajouter({ project: "shop", ticket: PREPARATION, author, type, payload } as never);
    noter("ticket.arrived", { title: "Préparer le dépôt", priority: null, createdAt: "2026-10-15T00:00:00Z", url: `https://github.com/${DEPOT}/issues/${PREPARATION}`, model: "opus", effort: "high", card: null }, "github");
    noter("ticket.taken", { station: "box/claude", leaseUntil: "2026-10-15T01:00:00.000Z" }, "station:box/claude");
    noter("ticket.passing", { station: "box/claude" }, "station:box/claude");
    noter("ticket.served", {});
  }
  journal.fermer();
  // Ces cuisines tournent sans bac à sable : le chef a décidé de continuer ainsi.
  accepterSansBacASable({ repertoireEtat: etat, station: "box" });
  writeFileSync(join(etat, FICHIER), JSON.stringify({ ticket: PREPARATION, ouvertLe: "2026-10-15T00:00:00.000Z" }));

  const { clone } = depotGit(t);
  const gh = fauxGh(t);
  const issues = [issueGitHub(DU_CHEF, { labels: ["fire", "model:sonnet", "effort:low"] }), ...(preparation === "ouverte" ? [issueGitHub(PREPARATION, { labels: ["fire", "model:opus", "effort:high"], created_at: "2026-10-15T00:00:00Z" })] : [])];
  for (const issue of issues) {
    gh.repondre(`repos/${DEPOT}/issues/${issue.number}`, { corps: issue });
    gh.repondre(`repos/${DEPOT}/issues/${issue.number}/comments?per_page=100`, { corps: [] });
  }
  gh.repondre(`repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`, { corps: issues });
  writeFileSync(join(racine, "projets"), `shop ${DEPOT} ${BASE} BRIGADE_GH_BIN=${gh.bin} BRIGADE_REPO_DIR=${clone}\n`);

  // Chaque cook commite, puis attend : il tient son ticket tant que le test dure.
  const suite = join(repertoireTemporaire(t), "suite.txt");
  ecrireSuite(suite, ["commite-puis-attend", "commite-puis-attend"]);
  const gists = repertoireTemporaire(t);
  const station = lancer(t, STATION, [], {
    ...ENV_GIT,
    BRIGADE_GH_BIN: FAUX_GH_GISTS,
    FAUX_GISTS: gists,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "box",
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    FAUX_CLAUDE_SUITE: suite,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  });
  const faits = (type: string) => {
    const lu = ouvrirJournal(etat, { lectureSeule: true });
    try {
      return lu.tout().filter((evenement) => evenement.type === type);
    } finally {
      lu.fermer();
    }
  };
  return { station, faits };
}

test("tant que le ticket qui prépare le dépôt n'est pas servi, la cuisine ne prend que lui — un ticket plus ancien reste sur le rail", async (t) => {
  const { station, faits } = uneStation(t, "ouverte");
  await station.attendre("le rail attend #20 (préparer le dépôt) — aucun autre ticket ne part avant son merge");
  await jusqua(() => faits("cook.launched").length === 1);
  // Une prise et la suivante se font d'un trait, avant que le premier cook ne
  // soit lancé : l'autre ticket, s'il pouvait partir, serait déjà pris.
  assert.deepEqual(
    faits("ticket.taken").map((evenement) => evenement.ticket),
    [PREPARATION],
  );
  assert.deepEqual(
    faits("ticket.arrived").map((evenement) => evenement.ticket).sort(),
    [DU_CHEF, PREPARATION],
  );
  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);
});

test("le ticket qui prépare le dépôt servi, la cuisine prend les autres", async (t) => {
  const { station, faits } = uneStation(t, "servie");
  await jusqua(() => faits("cook.launched").length === 1);
  assert.deepEqual(
    faits("ticket.taken").map((evenement) => evenement.ticket),
    [PREPARATION, DU_CHEF],
  );
  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
