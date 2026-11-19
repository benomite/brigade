// Un ticket retenu par la zone d'un ticket en vol écrit ses tests d'acceptation
// pendant la retenue, et non après elle (#3872) : sa prise ne cumule plus la
// retenue et l'écriture. Le test passe par la station (`stationDuDepot`) sur le
// vrai dépôt d'un projet : seuls GitHub et `claude` sont faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, jusqua, repertoireTemporaire } from "../outils.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = (ticket: number) => ["## Context", "", `Screen ${ticket}.`, "", "## Acceptance criteria", "", `- Screen ${ticket} is shown`].join("\n");
const FICHE = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a ticket whose zone is held by a ticket in flight has its acceptance tests written while it waits", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  const feu = (ticket: number) => {
    faux.feu(ticket, CALIBRE, CORPS(ticket));
    faux.poster(ticket, "manager", FICHE("runtime/src/a.ts"));
  };
  feu(1);
  let liberer = () => {};
  const libre = new Promise<void>((resoudre) => (liberer = resoudre));
  const lancer: Lancer = ({ args, cwd, flux, entree, ticket }) => {
    const numero = Number(ticket);
    const fini = { code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null };
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      const chemin = `test/acceptation/ecran-${numero}.test.ts`;
      mkdirSync(dirname(join(cwd, chemin)), { recursive: true });
      writeFileSync(join(cwd, chemin), `// ${chemin}\n`);
      writeFileSync(flux, RENDU(JSON.stringify({ tests: [chemin] })));
      return { fin: Promise.resolve(fini) };
    }
    // Le cook de #1 ne finit pas : il tient la zone de #2 pendant tout le test.
    writeFileSync(flux, RENDU("Done.\n<livrable>\nThe screen.\n</livrable>"));
    return { fin: args.includes("--tools") ? Promise.resolve(fini) : libre.then(() => fini) };
  };
  const sauts = new Map<number, string>();
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, places: 4, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await jusqua(() => faux.ticket(1).labels.has(LABEL_TESTS_ECRITS));
  // #1 part au cook, qui tient sa zone ; #2, de la même zone, arrive ensuite.
  await ouverte.tour();
  feu(2);
  await ouverte.tour();
  await jusqua(() => faux.ticket(2).labels.has(LABEL_TESTS_ECRITS), 1500);
  assert.match(sauts.get(2) ?? "", /zone held by #1\b/, "it is still held by #1 when its tests are written");
  liberer();
  await ouverte.calme();
});
