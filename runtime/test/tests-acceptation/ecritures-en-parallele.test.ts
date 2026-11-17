// Les écritures des tests d'acceptation (#3725) partent en parallèle des cooks,
// sous la même limite de places, sans file ni verrou qui leur soit propre
// (#3742). Le test passe par la station (`stationDuDepot`) sur le vrai dépôt
// d'un projet : seuls GitHub et `claude` sont faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = (ticket: number) => ["## Context", "", `Screen ${ticket}.`, "", "## Acceptance criteria", "", `- Screen ${ticket} is shown`].join("\n");
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;
const PLACES = 4;

test("with N tests writings and M code cooks ready, they are dispatched concurrently up to the same places limit, with no tests-only queue", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  // Les tickets des cooks : leurs tests s'écrivent d'abord, sans retenue.
  for (const ticket of [7, 8]) faux.feu(ticket, CALIBRE, CORPS(ticket));
  let retenir = false;
  let liberer = () => {};
  const libre = new Promise<void>((resoudre) => (liberer = resoudre));
  // Ce qui tourne en même temps : les écritures et les cooks lancés, pas encore finis.
  const enCours = { ecritures: new Set<number>(), cooks: new Set<number>() };
  let pic = 0;
  const lancer: Lancer = ({ args, cwd, flux, entree, ticket }) => {
    const numero = Number(ticket);
    const fini = { code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null };
    let message = "{}";
    let tenu: Set<number> | null = null;
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      const chemin = `test/acceptation/ecran-${numero}.test.ts`;
      mkdirSync(dirname(join(cwd, chemin)), { recursive: true });
      writeFileSync(join(cwd, chemin), `// ${chemin}\n`);
      message = JSON.stringify({ tests: [chemin] });
      tenu = enCours.ecritures;
    } else if (!args.includes("--tools")) {
      writeFileSync(join(cwd, "ecran.ts"), `export const ecran = ${numero};\n`);
      git(cwd, "add", "ecran.ts");
      git(cwd, "commit", "-q", "-m", `feat: screen ${numero}`);
      message = "Done.\n<livrable>\nThe screen.\n</livrable>";
      tenu = enCours.cooks;
    }
    writeFileSync(flux, RENDU(message));
    if (tenu === null || !retenir) return { fin: Promise.resolve(fini) };
    tenu.add(numero);
    pic = Math.max(pic, enCours.ecritures.size + enCours.cooks.size);
    return { fin: libre.then(() => (tenu.delete(numero), fini)) };
  };
  // Ce que la porte de prise dit, au dernier mot, de chaque ticket qu'elle ne prend pas.
  const sauts = new Map<number, string>();
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, places: PLACES, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.ok([7, 8].every((ticket) => faux.ticket(ticket).labels.has(LABEL_TESTS_ECRITS)), "the cooks' tickets have their tests written");

  // M = 2 tickets prêts pour un cook, N = 3 tickets dont les tests sont à écrire.
  for (const ticket of [9, 10, 11]) faux.feu(ticket, CALIBRE, CORPS(ticket));
  retenir = true;
  await ouverte.tour();
  assert.match(sauts.get(11) ?? "", /the station's 4 places are all taken \(.*\)/, "the fifth ticket waits for a place, as a cook would");
  await jusqua(() => enCours.cooks.size + enCours.ecritures.size === PLACES);
  assert.deepEqual([...enCours.cooks].sort((a, b) => a - b), [7, 8], "the two code cooks are dispatched");
  assert.deepEqual([...enCours.ecritures].sort((a, b) => a - b), [9, 10], "two writings run at once, beside the cooks: no writing waits for another");
  assert.equal(pic, PLACES, "writings and cooks together fill the station's places");
  assert.equal(faux.ticket(11).labels.has(LABEL_TESTS_ECRITS), false);
  liberer();
  await ouverte.calme();
  assert.equal(pic, PLACES, "and never pass them");
});
