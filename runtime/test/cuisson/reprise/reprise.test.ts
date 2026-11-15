// Un ticket dont le cook a été tué par la garde d'inactivité repart de la
// branche du run précédent et de ses commits, au lieu de la base (#3649).
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer, type StationGitHub } from "../../../src/brigade-github.ts";
import { commitsDuRunPrecedent, consigneDuRunPrecedent } from "../../../src/cuisson/reprise/reprise.ts";
import type { Fin } from "../../../src/superviseur.ts";
import { ouvrirDepot } from "../../../src/depot.ts";
import { FauxGitHub, fauxClient } from "../../faux-github.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "../../outils.ts";

const conclut = (flux: string) => writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
const fini = { code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null };
const tue: Fin = { ...fini, code: null, signal: "SIGTERM", turns: 35, arret: { reason: "idle", limit: 60_000, observed: 60_000 } };
const options = { claude: "claude", env: ENV_GIT, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 }, graceMs: 1, reviewer: { model: "sonnet", effort: "medium" } } as const;

const station = (t: TestContext, numero: number, lancer: Lancer) => {
  const { origine, clone } = depotGit(t);
  const racine = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(numero);
  const ouverte = stationDuDepot({ ...options, nom: "box", places: 1, base: BASE, depotGitHub: "faux/depot", github: fauxClient(faux), depot: ouvrirDepot({ clone, base: BASE, worktrees: join(racine, "worktrees"), env: ENV_GIT }), prise: priseDeLaStation, flux: racine, lancer, avertir: () => {} });
  if ("refus" in ouverte) assert.fail(ouverte.refus);
  return { station: ouverte as StationGitHub, origine, clone };
};

test("a run killed by the idle guard after committing is relaunched on its branch: the new run's worktree has its commit and what it left uncommitted, and its prompt names the branch and its commits (#3649)", async (t) => {
  const vus: { commit: boolean; nonCommite: boolean; prompt: string }[] = [];
  let run = 0;
  const { station: ouverte, clone } = station(t, 53, ({ cwd, args, entree, flux }) => {
    run += 1;
    if (run === 1) {
      commiter(cwd, "premier.txt");
      writeFileSync(join(cwd, "a-moitie.txt"), "work in progress\n");
      return { fin: Promise.resolve(tue) };
    }
    vus.push({ commit: existsSync(join(cwd, "premier.txt")), nonCommite: existsSync(join(cwd, "a-moitie.txt")), prompt: [...args, entree ?? ""].join(" ") });
    commiter(cwd, "fini.txt");
    conclut(flux);
    return { fin: Promise.resolve(fini) };
  });
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(run, 1);
  assert.deepEqual(git(clone, "log", "--format=%s", `${BASE}..cook/53-github`).split("\n"), ["brigade: work in progress saved after the idle guard stopped the cook (#3649)", "ajoute premier.txt"]);

  await ouverte.tour();
  await ouverte.calme();
  assert.equal(vus.length, 1);
  const [vu] = vus;
  assert.equal(vu!.commit, true);
  assert.equal(vu!.nonCommite, true);
  assert.match(vu!.prompt, /Work left by the previous run/);
  assert.match(vu!.prompt, /`cook\/53-github`/);
  assert.match(vu!.prompt, /- [0-9a-f]+ ajoute premier\.txt/);
  assert.match(vu!.prompt, /- [0-9a-f]+ brigade: work in progress saved after the idle guard/);
});

test("a run killed by the idle guard that left nothing does not keep its branch: the next run starts from the base, as before (#3649)", async (t) => {
  const prompts: string[] = [];
  let run = 0;
  const { station: ouverte, clone } = station(t, 54, ({ args, entree, flux }) => {
    run += 1;
    if (run === 1) return { fin: Promise.resolve(tue) };
    prompts.push([...args, entree ?? ""].join(" "));
    conclut(flux);
    return { fin: Promise.resolve(fini) };
  });
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(git(clone, "branch", "--list", "cook/54-github"), "");
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(prompts.length, 1);
  assert.doesNotMatch(prompts[0]!, /Work left by the previous run/);
});

test("when git cannot list the previous run's commits, the prompt still names its branch and says to read them (#3649)", async () => {
  assert.equal(await commitsDuRunPrecedent(undefined, "/nulle-part", BASE), null);
  assert.equal(await commitsDuRunPrecedent(async () => ({ code: 128, stdout: "", stderr: "fatal" }), "/nulle-part", BASE), null);
  assert.equal(await commitsDuRunPrecedent(async () => Promise.reject(new Error("spawn git ENOENT")), "/nulle-part", BASE), null);
  const consigne = consigneDuRunPrecedent("cook/7-github", null);
  assert.match(consigne, /`cook\/7-github`/);
  assert.match(consigne, /could not list its commits: read them with `git log`/);
});
