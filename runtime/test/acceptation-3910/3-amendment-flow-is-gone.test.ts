// #3910, critère 3 : le flux d'amendement a disparu : une cook n'a plus de balise `<amendement>` à écrire ; un critère
// faux est un motif de renvoi, ou une carte TODO quand il change le produit. Par la station, sur le vrai dépôt, GitHub
// et `claude` faux : le brief du cook ne propose aucun amendement, et un cook qui finit tout de même sur une balise
// `<amendement>` ne déclenche ni proposition sur l'issue ni manager qui la classe.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";

const TICKET = 15;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "A label.", "", "## Acceptance criteria", "", "- The export button is labelled"].join("\n");
const PROPOSITION = ["<amendement>", "test: test/acceptation/critere-1.test.ts", "old: the export button is labelled 'Exprot'", "new: the export button is labelled 'Export'", "why: a typo", "</amendement>"].join("\n");
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("the amendment flow is gone: no amendment in the cook's brief, and an <amendement> block starts no proposal and no manager", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, "tests-written"], CORPS);
  const consignes: string[] = [];
  const lancements: string[] = [];
  const lancer: Lancer = ({ args, flux, entree }) => {
    lancements.push(entree ?? "");
    if (!args.includes("--tools")) consignes.push(entree ?? "");
    writeFileSync(flux, RENDU(`The criterion looks wrong.\n${PROPOSITION}`));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.ok(consignes.length > 0, "a cook was launched");
  for (const consigne of consignes) assert.doesNotMatch(consigne, /amend/i, "the cook's brief offers no amendment");
  const commentaires = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body).join("\n");
  assert.doesNotMatch(commentaires, /brigade:amendement/, "no amendment proposal or application is posted on the issue");
  assert.equal(lancements.some((entree) => entree.includes("brigade:amendement-au-manager")), false, "the manager is never asked to classify an amendment");
  assert.equal(existsSync(join(import.meta.dirname, "..", "..", "src", "amendement")), false, "the amendment code is deleted");
});
