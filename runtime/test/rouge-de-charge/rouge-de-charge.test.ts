// Des gates rouges sous la charge de la machine ne comptent pas contre le
// ticket (#4211) : le classeur, le crochet, et la station qui les sert.
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { Gates } from "../../src/events/pass.ts";
import { classerLeRouge, seuilDeCharge } from "../../src/rouge-de-charge/classeur.ts";
import { enregistrerGatesRouges } from "../../src/rouge-de-charge/crochet.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const rouge: Gates = { outcome: "red", code: 1, failures: ["FAIL  test x"], tail: "" };

test("the classifier splits at the station's load threshold: at it, the red is the code's; above it, the load's", () => {
  assert.equal(classerLeRouge({ gates: rouge, lireCharge: () => 6, seuil: 6 }), "code");
  assert.equal(classerLeRouge({ gates: rouge, lireCharge: () => 6.01, seuil: 6 }), "load");
  // Le seuil de la station pour le processeur : la charge tolérée par cœur, fois ses cœurs.
  assert.equal(seuilDeCharge({ BRIGADE_MAX_LOAD_PER_CORE: "2" }), 2 * availableParallelism());
});

test("the load line names the load and the threshold; a red of the code writes no line and puts nothing back on the rail", async () => {
  const lignes: string[] = [];
  const remis: number[] = [];
  const ajoutes: number[] = [];
  const attentes = { essais: { ajouter: (t: number) => void ajoutes.push(t) }, journal: { ecrire: (l: string) => void lignes.push(l) }, rail: { remettre: (t: number) => void remis.push(t) } };
  await enregistrerGatesRouges({ ticket: 7, gates: rouge, lireCharge: () => 3, seuil: 12, ...attentes });
  assert.deepEqual([lignes, remis, ajoutes], [[], [], [7]]);
  await enregistrerGatesRouges({ ticket: 8, gates: rouge, lireCharge: () => 37.5, seuil: 12, ...attentes });
  assert.deepEqual([remis, ajoutes], [[8], [7]]);
  assert.match(lignes[0] ?? "", /machine load \(load 37\.5 for at most 12\)/);
});

const TICKET = 12;

test("on the station, red gates under load count no try and do not hold the delivery: it is pushed, and the CI of its PR judges it (#4366)", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  // Les gates : rouges, la machine chargée.
  const cuissons: number[] = [];
  const lancer: Lancer = ({ args, cwd, flux, ticket }) => {
    if (!args.includes("--tools")) {
      cuissons.push(ticket ?? 0);
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho gates >> '${trace}'\necho "FAIL  the button test is red" >&2\nexit 1\n`);
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const journal: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, places: 2, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, lireCharge: () => 40, avertir: (ligne) => void journal.push(ligne) });
  if ("refus" in station) throw new Error(station.refus);
  const corps = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);

  await station.tour();
  await station.calme();
  assert.deepEqual(cuissons, [TICKET], "one cook");
  assert.equal(readFileSync(trace, "utf8"), "gates\n", "the gates ran once");
  assert.notEqual(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "red under load: the delivery is pushed all the same");
  assert.ok(!corps().some((c) => c.startsWith("<!-- brigade:echec")), "no failed try is counted");
  assert.ok(!corps().some((c) => c.startsWith("<!-- brigade:attente")), "the ticket does not wait for the machine to calm down");
  assert.equal(journal.filter((l) => /#12 .*red under machine load.*the CI of its PR judges it/.test(l)).length, 1, "one line of the station log says it");
});

test("on the station, red gates on a calm machine still count a failed try, and the same red tree is not played again", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  let cuissons = 0;
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools") && (cuissons += 1) === 1) {
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho gates >> '${trace}'\necho "FAIL  the button test is red" >&2\nexit 1\n`);
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, lireCharge: () => 0.2, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && cuissons < 2; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(cuissons, 2);
  const corps = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  assert.ok(corps.some((c) => /its gates are red, so its delivery was not pushed: FAIL {2}the button test is red/.test(c)), "the red counts as a failed try");
  assert.ok(!corps.some((c) => /machine load/.test(c)));
  assert.equal(existsSync(trace) && readFileSync(trace, "utf8"), "gates\n", "same tree, same verdict: the gates are not played again");
});
