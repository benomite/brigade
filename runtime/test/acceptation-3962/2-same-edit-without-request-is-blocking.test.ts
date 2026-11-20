// #3962, critère 2 : la même modification, faite sans demande du manager, reste un point bloquant. Par la station, sur
// le vrai dépôt, GitHub et `claude` faux : le fil du ticket ne porte aucune demande, la consigne du relecteur range le
// test gelé parmi les constats bloquants.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "A label.", "", "## Acceptance criteria", "", "- The export button is labelled"].join("\n");
const GELE = "test/acceptation/critere-1.test.ts";
const ANCIEN = "assert.match(label(), /Export/);";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;
// Le test gelé tel que le cook le rend : la même marque, que personne n'a demandée.
const RENDUE = `// brigade:guard\n${ANCIEN}\n`;

// brigade:guard
test("the same frozen test edit made without a manager request is still a blocking point in the review's brief", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  const relectures: string[] = [];
  const commiter = (cwd: string, fichier: string, texte: string, message: string, ...trailers: string[]) => {
    mkdirSync(dirname(join(cwd, fichier)), { recursive: true });
    writeFileSync(join(cwd, fichier), texte);
    git(cwd, "add", fichier);
    git(cwd, "commit", "-q", "-m", message, ...trailers.flatMap((trailer) => ["-m", trailer]));
  };
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (args.includes("--tools")) {
      relectures.push(entree ?? "");
      message = JSON.stringify({ verdict: "rouge", resume: "Read.", constats: [], criteres: [{ critere: 1, tests: [], relecture: false }] });
    } else {
      // Le manager a gelé les tests avant le cook ; ici, on les pose, puis le cook les change et livre.
      if (!git(cwd, "log", "--format=%B", `origin/${BASE}..HEAD`).includes("Acceptance-Tests: frozen")) commiter(cwd, GELE, `${ANCIEN}\n`, `test(#${TICKET}): frozen acceptance tests`, "Acceptance-Tests: frozen");
      commiter(cwd, GELE, RENDUE, "test: the cook's edit");
      commiter(cwd, "bouton.ts", "export const bouton = 1;\n", "feat: the button");
      message = "Done.\n<livrable>\nThe button.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  for (let tour = 0; tour < 4 && relectures.length === 0; tour += 1) {
    await ouverte.tour();
    await ouverte.calme();
  }
  assert.ok(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)) !== "", "the delivery was pushed");
  assert.equal(relectures.length > 0, true, "the reviewer runs");
  const consigne = relectures[0] ?? "";
  assert.match(consigne, /`test\/acceptation\/critere-1\.test\.ts`[^\n]*(c'est|chacun est) un constat `bloquant`/, "the review still lists the unrequested edit as a blocking point");
  assert.ok(consigne.includes("+// brigade:guard"), "with its diff");
});
