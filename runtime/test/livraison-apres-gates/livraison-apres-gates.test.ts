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
        writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho "gates $BRIGADE_GATES_VERROU" >> '${trace}'\n[ -f "$1/corrige.txt" ] || [ -f corrige.txt ] && exit 0\necho "FAIL  the button test is red" >&2\nexit 1\n`);
        chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
        writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
      } else writeFileSync(join(cwd, "corrige.txt"), "fixed\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  // Le tour des gates que la station a reçu, elle le leur passe.
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, env: { BRIGADE_GATES_VERROU: "aucun" }, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
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
  assert.equal(existsSync(trace) && readFileSync(trace, "utf8"), "gates aucun\ngates aucun\n");
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

test("a saved head the next cook delivers as it is plays the gates, and is pushed once they are green", async (t) => {
  const lieux = depotGit(t);
  const vert = join(repertoireTemporaire(t), "vert").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  // Le premier cook écrit tout, sous des gates rouges tant que `vert` n'existe pas ; le suivant n'ajoute rien et livre le travail sauvé tel quel.
  let cuissons = 0;
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools") && (cuissons += 1) === 1) {
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\n[ -f '${vert}' ] && exit 0\necho "FAIL  the button test is red" >&2\nexit 1\n`);
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);

  await station.tour();
  await station.calme();
  assert.equal(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "nothing was pushed: the gates are red");

  writeFileSync(vert, "");
  for (let tour = 0; tour < 4 && git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)) === ""; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.ok(cuissons >= 2, "the next cook was launched");
  assert.notEqual(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "green gates: the saved head, delivered as it is, is pushed");
  assert.equal(git(lieux.origine, "cat-file", "-e", `${brancheDuTicket(TICKET)}:bouton.ts`), "");
});

test("a delivery cut before its push, found only in the clone, plays the gates: red, it is not pushed nor sent to the pass, and a cook resumes it with what they say (#2577)", async (t) => {
  const lieux = depotGit(t);
  // La branche du ticket, commitée dans le clone sous des gates rouges, jamais poussée : la station s'est arrêtée là.
  const branche = brancheDuTicket(TICKET);
  git(lieux.clone, "checkout", "-q", "-b", branche);
  mkdirSync(join(lieux.clone, ".claude/brigade"), { recursive: true });
  writeFileSync(join(lieux.clone, ".claude/brigade/gates.sh"), '#!/bin/sh\necho "FAIL  the button test is red" >&2\nexit 1\n');
  chmodSync(join(lieux.clone, ".claude/brigade/gates.sh"), 0o755);
  writeFileSync(join(lieux.clone, "bouton.ts"), "export const bouton = 1;\n");
  git(lieux.clone, "add", ".");
  git(lieux.clone, "commit", "-q", "-m", "the button");
  git(lieux.clone, "checkout", "-q", BASE);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  const consignes: string[] = [];
  const lancer: Lancer = ({ args, flux, entree }) => {
    if (!args.includes("--tools")) consignes.push(entree ?? "");
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done." })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);

  await station.tour();
  await station.calme();
  assert.equal(git(lieux.origine, "branch", "--list", branche), "", "red gates: the cut delivery is not pushed");
  assert.equal(faux.prs.length, 0, "nor sent to the pass");
  assert.match(consignes[0] ?? "", /## Gates red on the delivery[\s\S]*its gates are red, so its delivery was not pushed: FAIL {2}the button test is red/, "a cook resumes it with what the gates say");
});
