// #4228, critère 1 : un cook relancé sur une livraison dont les gates sont rouges reçoit le nom des gates et leur sortie d'erreur.
// Par la station : la PR ouverte du ticket porte le check `brigade/gates` rouge, dont le statut dit l'échec.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

test("a cook relaunched on red gates is told the gate's name and its error output (#4228)", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  let consigne = "";
  const lancer: Lancer = ({ entree, flux }) => {
    consigne = entree ?? "";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box", places: 1, base: "main", depotGitHub: "faux/depot",
    github: {
      ...fauxClient(faux),
      ci: async () => [{ name: "brigade/gates", conclusion: "failure", outcome: "red", url: null }],
      statuts: async () => [{ id: 1, state: "failure", context: "brigade/gates", description: "Gates red on station box: FAIL  the button test is red", createdAt: "2026-11-20T10:00:00Z" }],
    },
    depot: { connait: (branche) => branche === "cook/14-github", preparer: async () => assert.fail("the branch is resumed"), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 1, changes: () => [], diff: () => "", tete: () => "a".repeat(40) },
    prise: priseDeLaStation, claude: "claude", env: {}, cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1, reviewer: { model: "sonnet", effort: "medium" }, flux: repertoire, lancer, avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();

  assert.match(consigne, /brigade\/gates/);
  assert.match(consigne, /FAIL {2}the button test is red/);
});
