// #3962, critère 3 : une modification qui va au-delà de ce que le manager a demandé reste jugée par la revue. Par la
// station, sur le vrai dépôt, GitHub et `claude` faux : le manager demande la marque, le cook change aussi l'assertion ;
// la consigne du relecteur porte la demande du manager et juge toujours le test gelé comme bloquant.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "A label.", "", "## Acceptance criteria", "", "- The export button is labelled"].join("\n");
const GELE = "test/acceptation/critere-1.test.ts";
const ANCIEN = "assert.match(label(), /Export/);";
const DEMANDE = "Add `// brigade:guard` on the line above the case in `test/acceptation/critere-1.test.ts`, nothing else.";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;
// Le test gelé tel que le cook le rend : la marque demandée, et une assertion vidée que personne n'a demandée.
const RENDUE = "// brigade:guard\nassert.ok(true);\n";

test("a frozen test edited beyond what the manager asked is still judged by the review: its brief carries the request and still lists the test as blocking", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  faux.poster(TICKET, "manager", `${MARQUEUR_MANAGER}\n${DEMANDE}`);
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
  assert.ok(consigne.includes("nothing else"), "the review reads the manager's instruction from the ticket thread");
  assert.match(consigne, /`test\/acceptation\/critere-1\.test\.ts`[^\n]*(c'est|chacun est) un constat `bloquant`/, "the edit beyond the request is still a blocking point");
  assert.ok(consigne.includes("+assert.ok(true);"), "its diff shows what the cook added beyond the request");
});
