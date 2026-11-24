// Ce que les cooks partis laissent dans l'état de la cuisine se rend quand la
// machine sature sans cook en vol (#4106) : les gardes du tour, sur un vrai
// runtime, avec un disque et une machine que le test rend.
import assert from "node:assert/strict";
import { basename, dirname, join, sep } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { gardesDuTour } from "../../../src/github-seul/garde-fous/garde-fous.ts";
import type { Fichiers, Processus } from "../../../src/github-seul/garde-fous/recuperation.ts";
import { configMachine, type Machine } from "../../../src/machine.ts";
import { demarrer } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const STATION = "box/claude";
const AUTRE = "autre/claude";
const CLONE = "/clone/du/projet";
const GO = 1024 * 1024 * 1024;
const LIMITES = { durationMs: 1, tokens: 1, idleMs: 1 };

// Un disque en mémoire : les chemins qui s'y trouvent pèsent sur la machine
// tant que rien n'a été retiré.
function disqueFaux(repertoire: string, chemins: string[], options: { listeEchoue?: boolean } = {}) {
  const worktrees = join(repertoire, "worktrees");
  const runs = join(repertoire, "runs");
  const presents = new Set(chemins.map((chemin) => join(repertoire, chemin)));
  const retires: string[] = [];
  const elagues: string[] = [];
  let listes = 0;
  const fichiers: Fichiers = {
    lister: (dossier) => {
      listes++;
      if (options.listeEchoue === true) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      return [...presents].filter((chemin) => dirname(chemin) === dossier).map((chemin) => basename(chemin));
    },
    retirer: (chemin) => void (presents.delete(chemin), retires.push(chemin)),
    elaguer: (clone) => void elagues.push(clone),
  };
  // 8 cœurs, de la mémoire à revendre : seul le disque manque tant que ces restes l'occupent.
  const machine = (): Machine => ({ charge: 0, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: retires.length > 0 ? 100 * GO : 4 * GO });
  const restes = () => [...presents].map((chemin) => chemin.slice(repertoire.length + 1).split(sep).join("/")).sort();
  return { fichiers, machine, retires, elagues, restes, listes: () => listes };
}

// Un run au journal : lancé par une station, fini ou non, son worktree gardé ou non.
type Run = { run: string; station: string; fini: boolean; garde?: boolean };

type Vus = { pid: number; cwd: string | null }[];

function gardes(t: TestContext, chemins: string[], runs: Run[], options: { listeEchoue?: boolean; processus?: (worktrees: string) => Vus } = {}) {
  const repertoire = repertoireTemporaire(t);
  const disque = disqueFaux(repertoire, chemins, options);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const noter = (ticket: number, fait: Parameters<typeof runtime.journal.ajouter>[0] extends infer E ? Omit<Extract<E, { type: string }>, "project" | "ticket" | "author"> : never) =>
    runtime.journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait } as never);
  runs.forEach(({ run, station, fini, garde }, i) => {
    noter(i + 1, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, branch: `cook/${run}`, worktree: `worktrees/${run}` } });
    if (fini) noter(i + 1, { type: "cook.interrupted", payload: { run } });
    if (garde === true) noter(i + 1, { type: "worktree.kept", payload: { worktree: `worktrees/${run}`, branch: `cook/${run}`, reason: "unpushed", detail: "1 commit" } });
  });
  const avertis: string[] = [];
  const tues: number[] = [];
  const processus: Processus = { lister: () => options.processus?.(join(repertoire, "worktrees")) ?? [], tuer: (pid) => void tues.push(pid) };
  const du = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: null, machine: { lire: disque.machine, seuils: configMachine({}) }, fichiers: disque.fichiers, processus, env: { BRIGADE_REPO_DIR: CLONE }, avertir: (texte) => avertis.push(texte) });
  const faits = (type: string) => runtime.journal.tout().filter((evenement) => evenement.type === type);
  return { du, disque, avertis, faits, tues };
}

test("a station saturated with no cook of its own gives back only the finished runs' worktrees and files, then takes tickets again (#4106)", async (t) => {
  const { du, disque, avertis, faits } = gardes(
    t,
    ["worktrees/12-a", "worktrees/13-b", "worktrees/14-vivant", "worktrees/15-garde", "worktrees/review-4106-github", "runs/12-a.jsonl", "runs/14-vivant.jsonl", "runs/inconnu.jsonl"],
    [
      { run: "12-a", station: STATION, fini: true },
      { run: "13-b", station: AUTRE, fini: true },
      { run: "14-vivant", station: AUTRE, fini: false },
      { run: "15-garde", station: STATION, fini: true, garde: true },
    ],
  );
  assert.equal(await du.retenue(0), null);
  assert.deepEqual(disque.retires.map((chemin) => chemin.split(sep).slice(-2).join("/")).sort(), ["runs/12-a.jsonl", "worktrees/12-a", "worktrees/13-b"]);
  // Le cook en vol d'une autre station, le travail gardé, une relecture et un flux inconnu restent.
  assert.deepEqual(disque.restes(), ["runs/14-vivant.jsonl", "runs/inconnu.jsonl", "worktrees/14-vivant", "worktrees/15-garde", "worktrees/review-4106-github"]);
  // Le clone oublie les worktrees disparus : leur branche ne reste pas prise.
  assert.deepEqual(disque.elagues, [CLONE]);
  // La mesure qui compte est celle d'après : la saturation ne s'écrit pas, et la prise part.
  assert.equal(faits("station.saturated").length, 0);
  assert.equal(faits("station.relieved").length, 0);
  assert.match(avertis.join("\n"), /gave back 3 leftover/);
});

// brigade:guard — « a live cook's worktree is never touched » : ce que la station faisait déjà avec un cook en vol.
test("a station with a cook in flight leaves every worktree alone, and stays held (#4106)", async (t) => {
  const { du, disque, faits } = gardes(t, ["worktrees/12-a"], [{ run: "12-a", station: STATION, fini: true }]);
  assert.equal(await du.retenue(1), "machine");
  assert.deepEqual(disque.retires, []);
  assert.equal(disque.listes(), 0);
  assert.equal(faits("station.saturated").length, 1);
});

test("the reclaim runs once per gate turn, and again at the next one (#4106)", async (t) => {
  const { du, disque, faits } = gardes(t, ["worktrees/14-vivant"], [{ run: "14-vivant", station: AUTRE, fini: false }]);
  // Rien n'est rendable : la machine reste saturée, sans cook.
  await du.retenue(0);
  const apres = disque.listes();
  assert.equal(apres, 2);
  await du.retenue(0);
  assert.equal(disque.listes(), apres);
  await du.redire(0);
  await du.retenue(0);
  assert.equal(disque.listes(), 2 * apres);
  assert.equal(faits("station.saturated").length, 1);
});

test("a disk the reclaim cannot read does not fall the turn: the saturation stands and the failure is said (#4106)", async (t) => {
  const { du, avertis, faits } = gardes(t, [], [], { listeEchoue: true });
  assert.equal(await du.retenue(0), null);
  assert.equal(faits("station.saturated").length, 1);
  assert.match(avertis.join("\n"), /could not reclaim/);
});

test("a saturated station stops the orphaned processes of exited cooks, and only theirs (#4108)", async (t) => {
  const { du, tues, avertis } = gardes(
    t,
    ["worktrees/12-a", "worktrees/14-vivant"],
    [
      { run: "12-a", station: STATION, fini: true },
      { run: "14-vivant", station: AUTRE, fini: false },
    ],
    {
      processus: (worktrees) => [
        { pid: 500, cwd: join(worktrees, "12-a") },
        { pid: 501, cwd: join(worktrees, "12-a", "runtime") },
        { pid: 502, cwd: join(worktrees, "14-vivant", "runtime") },
        { pid: 503, cwd: join(worktrees, "12-ab") },
        { pid: 504, cwd: "/home/chef" },
        { pid: 505, cwd: null },
      ],
    },
  );
  await du.retenue(0);
  assert.deepEqual(tues, [500, 501]);
  assert.match(avertis.join("\n"), /stopped 2 orphaned/);
});

// brigade:guard — « nothing is killed with a live cook » : la récupération ne tourne pas tant qu'un cook est en vol.
test("a station with a cook in flight stops no process (#4108)", async (t) => {
  const { du, tues } = gardes(t, ["worktrees/12-a"], [{ run: "12-a", station: STATION, fini: true }], { processus: (worktrees) => [{ pid: 500, cwd: join(worktrees, "12-a") }] });
  assert.equal(await du.retenue(1), "machine");
  assert.deepEqual(tues, []);
});

test("a process that cannot be stopped or listed is said, and the rest is still given back (#4108)", async (t) => {
  const { du, disque, avertis } = gardes(t, ["worktrees/12-a"], [{ run: "12-a", station: STATION, fini: true }], {
    processus: () => {
      throw new Error("ps down");
    },
  });
  assert.equal(await du.retenue(0), null);
  assert.equal(disque.retires.length, 1);
  assert.match(avertis.join("\n"), /could not reclaim processes/);
});
