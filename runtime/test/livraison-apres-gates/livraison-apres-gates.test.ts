// Une livraison n'est poussée qu'une fois les gates du projet vertes dans son
// worktree (#3996). Rouges, la branche garde la marque du travail sauvé : le
// cook suivant en repart, et sa livraison part quand elles sont vertes.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;

test("red gates keep the delivery in the clone, marked as saved work; the next cook delivers it once they are green", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  // Les gates du projet : vertes une fois `corrige.txt` posé, rouges avant.
  const consignes: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    if (!args.includes("--tools")) {
      consignes.push(entree ?? "");
      if (consignes.length === 1) {
        mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
        writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho gates >> '${trace}'\n[ -f "$1/corrige.txt" ] || [ -f corrige.txt ] && exit 0\necho "FAIL  the button test is red" >&2\nexit 1\n`);
        chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
        writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
      } else writeFileSync(join(cwd, "corrige.txt"), "fixed\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);

  await station.tour();
  await station.calme();
  assert.equal(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "nothing was pushed: the gates are red");
  assert.match(git(lieux.clone, "log", "-1", "--format=%s", brancheDuTicket(TICKET)), /work in progress saved/);
  assert.ok([...faux.commentaires.values()].flat().some((c) => /its gates are red, so its delivery was not pushed: FAIL {2}the button test is red/.test(c.body)));

  for (let tour = 0; tour < 4 && git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)) === ""; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.match(consignes[1] ?? "", /## Work saved before a restart/, "the next cook starts from the saved work");
  assert.notEqual(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "green gates: the delivery is pushed");
  assert.equal(git(lieux.origine, "cat-file", "-e", `${brancheDuTicket(TICKET)}:corrige.txt`), "");
  assert.equal(existsSync(trace) && readFileSync(trace, "utf8"), "gates\ngates\n");
});

test("only gates that judge hold a delivery, and only a delivery plays them: gates that run no test command do not hold it, red gates that run one do, a cook that commits nothing plays none", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  // La base du projet porte des gates qui lancent un test rouge, et notent où elles jouent.
  mkdirSync(join(lieux.clone, ".claude/brigade"), { recursive: true });
  writeFileSync(join(lieux.clone, ".claude/brigade/gates.sh"), `#!/bin/sh\necho "$PWD" >> '${trace}'\necho "FAIL  the button test is red" >&2\nexit 1\n`);
  chmodSync(join(lieux.clone, ".claude/brigade/gates.sh"), 0o755);
  git(lieux.clone, "add", ".");
  git(lieux.clone, "commit", "-q", "-m", "gates");
  git(lieux.clone, "push", "-q", "origin", `HEAD:${BASE}`);
  git(lieux.clone, "fetch", "-q", "origin");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  for (const numero of [12, 13, 14]) faux.feu(numero, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  // #12 remplace les gates par des gates qui ne lancent rien, et sortent rouges ; #13 livre sous les gates de la base ; #14 n'écrit rien.
  const lancer: Lancer = ({ args, cwd, flux, ticket }) => {
    if (!args.includes("--tools") && ticket === 12) writeFileSync(join(cwd, ".claude/brigade/gates.sh"), "#!/bin/sh\nexit 1\n");
    if (!args.includes("--tools") && ticket !== 14) writeFileSync(join(cwd, `bouton-${ticket}.ts`), "export const bouton = 1;\n");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, places: 3, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();

  assert.notEqual(git(lieux.origine, "branch", "--list", brancheDuTicket(12)), "", "gates that run nothing judge nothing: the delivery is pushed, the pass says why it does not run them");
  const jouees = existsSync(trace) ? readFileSync(trace, "utf8") : "";
  assert.match(jouees, /13-github/, "#13 was cooked, and its gates played");
  assert.equal(git(lieux.origine, "branch", "--list", brancheDuTicket(13)), "", "red gates that run a test hold the delivery");
  assert.doesNotMatch(jouees, /14-github/, "a cook that committed nothing has no delivery to play the gates on");
});
