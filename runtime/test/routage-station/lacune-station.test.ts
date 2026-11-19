// #3870 : la station dit à sa carte ce qu'elle n'a pas pu, et le dit quand elle le peut de nouveau ; la lecture des stations du projet sur GitHub avertit des issues qu'elle ne lit pas.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const N = 3869;
const CALIBRE = ["fire", "model:opus", "effort:medium", "prio:0"];
const GATES_INJOUABLES = "The gates cannot run on this station: the dependencies cannot be installed, `npm ci` is refused here.";
const MAC = "macbook-air-de-benoit/claude";

function station(t: TestContext, faux: FauxGitHub, bloque: string | null) {
  const repertoire = mkdtempSync(join(tmpdir(), "lacune-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = ({ flux }) => {
    const message = bloque !== null ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nDelivered.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const depot = depotNeuf(repertoire);
  const lacunes: Array<string | null> = [];
  const avertis: string[] = [];
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    nom: MAC,
    github: fauxClient(faux, MAC),
    depot: bloque === null ? { ...depot, commits: () => 1, changes: () => ["src/a.ts"], diff: () => "diff --git a/src/a.ts b/src/a.ts\n+x\n" } : depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertis.push(texte),
    stationsDuProjet: () => [MAC],
    lacune: (ligne) => void lacunes.push(ligne),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  return { tour, lacunes, avertis };
}

test("a ticket the station cannot run is said on its card; a ticket it delivers clears it", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(N, CALIBRE, "## Context\n\nRepair.");
  const bloquee = station(t, faux, GATES_INJOUABLES);
  await bloquee.tour();
  assert.deepEqual(bloquee.lacunes, ["dependencies cannot be installed"]);

  const faux2 = new FauxGitHub();
  faux2.feu(N, CALIBRE, "## Context\n\nRepair.");
  const livre = station(t, faux2, null);
  await livre.tour();
  assert.deepEqual(livre.lacunes, [null]);
});

test("over forty open issues moved lately, the station warns that it reads only the most recent; at forty it does not", async (t) => {
  const avertis = async (combien: number) => {
    const faux = new FauxGitHub();
    faux.feu(N, CALIBRE, "## Context\n\nRepair.");
    for (let i = 1; i < combien; i++) faux.feu(5000 + i, ["model:opus"]);
    const bloquee = station(t, faux, GATES_INJOUABLES);
    await bloquee.tour();
    return bloquee.avertis.some((a) => /only the 40 most recent are read/.test(a));
  };
  assert.equal(await avertis(40), false);
  assert.equal(await avertis(41), true);
});
