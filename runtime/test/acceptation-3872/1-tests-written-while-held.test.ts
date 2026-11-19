// #3872, critère 1 : la cause de l'attente de prise est corrigée à sa source — les tests d'acceptation d'un
// ticket retenu (ici par un ticket ouvert qu'il attend) s'écrivent pendant la retenue, pas après elle : sa prise
// ne cumule plus la retenue et l'écriture. Test d'acceptation gelé (#3725), sur le vrai dépôt, GitHub et `claude` faux.
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
const CORPS = (ticket: number, suite = "") => ["## Context", "", `Screen ${ticket}.`, "", "## Acceptance criteria", "", `- Screen ${ticket} is shown`, "", suite].join("\n");
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a ticket held by an open ticket it depends on has its acceptance tests written while it waits", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(10, CALIBRE, CORPS(10));
  faux.feu(20, CALIBRE, CORPS(20, "Depends on #10"));
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
    // Le cook de #10 ne finit pas : #20 reste retenu par lui pendant tout le test.
    writeFileSync(flux, RENDU("Done.\n<livrable>\nThe screen.\n</livrable>"));
    return { fin: args.includes("--tools") ? Promise.resolve(fini) : libre.then(() => fini) };
  };
  const sauts = new Map<number, string>();
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, places: 4, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await jusqua(() => faux.ticket(10).labels.has(LABEL_TESTS_ECRITS));
  await ouverte.tour();
  await jusqua(() => faux.ticket(20).labels.has(LABEL_TESTS_ECRITS), 1500);
  assert.match(sauts.get(20) ?? "", /waiting for #10\b/, "it is still held by #10 when its tests are written");
  liberer();
  await ouverte.calme();
});
