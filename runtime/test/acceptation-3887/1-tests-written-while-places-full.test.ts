// #3887, critère 1 : la cause de l'attente de prise est corrigée à sa source — un ticket en file quand les places sont
// prises par des cooks écrit ses tests d'acceptation pendant qu'il attend une place (comme le retenu de #3872), et non
// après elle : sa prise ne cumule plus l'attente d'une place et l'écriture. Test d'acceptation gelé (#3725), sur le vrai
// dépôt, GitHub et `claude` faux.
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
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a queued ticket waiting for a free place has its acceptance tests written while it waits", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(10, CALIBRE, CORPS(10));
  faux.feu(20, CALIBRE, CORPS(20));
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
    // Le cook de #10 ne finit pas : l'unique place reste prise pendant tout le test.
    writeFileSync(flux, RENDU("Done.\n<livrable>\nThe screen.\n</livrable>"));
    return { fin: args.includes("--tools") ? Promise.resolve(fini) : libre.then(() => fini) };
  };
  const sauts = new Map<number, string>();
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, places: 1, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await jusqua(() => faux.ticket(10).labels.has(LABEL_TESTS_ECRITS));
  await ouverte.tour();
  await ouverte.tour();
  await jusqua(() => faux.ticket(20).labels.has(LABEL_TESTS_ECRITS), 1500);
  assert.deepEqual(ouverte.enCuisine(), [10], "the only place is still held by #10's cook when #20's tests are written");
  liberer();
  await ouverte.calme();
});
