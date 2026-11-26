// #4320, critère 3 : quand le fetch de la branche de base échoue, la station ne prend plus aucun ticket du projet dès le premier échec.
// Elle en dit la raison une seule fois ; elle ne prend, n'échoue et ne relâche pas en boucle. L'échec n'est pas « branche absente » :
// c'est un fetch qui échoue pour une autre raison (réseau), que la station ne doit pas rejouer ticket après ticket.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer, type OptionsDuDepot } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

const RAISON = "fatal: unable to access 'https://github.com/faux/depot.git/': Could not resolve host: github.com";

test("when the fetch of the base branch fails, the station takes no more tickets of the project, says the reason once, and does not claim, fail and release in a loop", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-fetch-en-echec-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(31);
  faux.feu(32);
  const dits: string[] = [];
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  let preparations = 0;
  const depot: OptionsDuDepot["depot"] = {
    connait: () => false,
    preparer: async () => { preparations += 1; throw new Error(`git fetch origin main : ${RAISON}`); },
    reprendre: async (run) => join(repertoire, run),
    retirer: () => {},
    ranger: async () => null,
    pousser: () => {},
    commits: () => 1,
    changes: () => ["a.ts"],
    diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
  };
  const station = stationDuDepot({ nom: "A", places: 1, base: "main", depotGitHub: "faux/depot", github: fauxClient(faux, "A"), depot, prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer, avertir: (texte) => void dits.push(texte) });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  for (let i = 0; i < 5; i += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(preparations, 1, "the worktree is prepared once: the first failure stops the project");
  assert.equal(faux.prisesDe("A"), 1, "one ticket was claimed, and no other");
  assert.equal(dits.filter((dit) => dit.includes("Could not resolve host")).length, 1, dits.join("\n"));
});
