// Un critère faux n'est plus un amendement (#3910) : la consigne du cook lui
// dit de laisser le test gelé tel quel et de le dire dans `<bloque>`, et sa
// question va au manager, sans livraison ni relecture. Par la station, sur le
// vrai dépôt, GitHub et `claude` faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 9;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "A label.", "", "## Acceptance criteria", "", "- The export button is labelled"].join("\n");
const CHEMIN = "test/acceptation/critere-1.test.ts";
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const QUESTION = "The frozen test expects the label 'Exprot', a typo of 'Export'.";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a cook that finds a criterion wrong leaves its frozen test and says it in <bloque>: nothing is reviewed, the manager gets the question", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  const cooks: string[] = [];
  const lectures: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      mkdirSync(dirname(join(cwd, CHEMIN)), { recursive: true });
      writeFileSync(join(cwd, CHEMIN), "assert.match(label(), /Exprot/);\n");
      message = JSON.stringify({ tests: [CHEMIN] });
    } else if (!args.includes("--tools")) {
      cooks.push(entree ?? "");
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 'Export';\n");
      git(cwd, "add", "bouton.ts");
      git(cwd, "commit", "-q", "-m", "feat: the button");
      message = `The criterion looks wrong.\n<bloque>${QUESTION}</bloque>`;
    } else {
      lectures.push([...args, entree ?? ""].join("\n"));
      message = JSON.stringify({ verdict: "vert", resume: "ok", constats: [], criteres: [] });
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), manager: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  for (let tour = 0; tour < 3 && cooks.length === 0; tour += 1) {
    await ouverte.tour();
    await ouverte.calme();
  }
  assert.equal(cooks.length, 1, "a cook was launched");
  assert.match(cooks[0] ?? "", /If a criterion looks wrong to you, leave its test as it is and say why in `<bloque>`/, "the cook's brief sends a wrong criterion to <bloque>");
  assert.match(cooks[0] ?? "", /the review reads any change to them as a blocking finding/);
  assert.ok(lectures.some((lecture) => lecture.includes(QUESTION)), "the manager is asked the cook's question");
  assert.equal(lectures.some((lecture) => lecture.includes("Tu es le reviewer")), false, "nothing is reviewed");
});
