// #3786 : après le deuxième échec identique, la carte dit « design review cannot start: <error> », pas « review in progress ».
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";

const TICKET = 40;
const PR = 1040;
const ECRAN = ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`];

type Lancement = { args: string[]; entree: string | undefined };

// La station du dépôt, sur un ticket d'interface en pass dont la PR est verte et
// approuvée, sous un projet dont un humain valide les designs : la pass lance le
// jugement du choix de design. `lancer` est le faux `claude`, noté à chaque lancement.
function parLeDepot(t: TestContext, reponse: (rang: number) => { erreur: string | null; message: string | null }) {
  const repertoire = mkdtempSync(join(tmpdir(), "design-3786-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, LABEL_IN_PASS], "## Acceptance criteria\n- the rail shows a new screen");
  const sha = faux.sha();
  faux.prs.push({ number: PR, issue: TICKET, branche: brancheDuTicket(TICKET), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: ECRAN });
  faux.poster(PR, "box", `<!-- brigade:verdict station=box verdict=approve sha=${sha} -->\nApproved by station \`box\`.`);
  const lancements: Lancement[] = [];
  const avertis: string[] = [];
  const lancer: Lancer = ({ args, entree, flux }) => {
    const { erreur, message } = reponse(lancements.length);
    lancements.push({ args, entree });
    if (message !== null) writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: erreur === null ? 0 : null, signal: null, turns: 0, tokens: 0, durationMs: 1, arret: null, erreur }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue },
    depot: { connait: () => false, preparer: async () => assert.fail("nothing is cooked"), reprendre: async () => repertoire, retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "+une ligne\n".repeat(500) },
    flux: repertoire,
    lancer,
    avertir: (texte) => avertis.push(texte),
    projet: () => ({ integrationBranch: "main", humanValidatesDesigns: true }),
  });
  if ("refus" in station) throw new Error(station.refus);
  const tours = async (n: number) => {
    for (let i = 0; i < n; i += 1) {
      await station.tour();
      await station.calme();
      await station.relu();
    }
  };
  // Tout ce que la pass dit de la livraison : ses avertissements, les commentaires du ticket et de la PR, les issues ouvertes.
  const dit = () => [...avertis, ...[TICKET, PR].flatMap((n) => (faux.commentaires.get(n) ?? []).map((c) => c.body)), ...faux.tickets.values().map((x) => `${x.title}\n${x.corps}`)].join("\n---\n");
  return { faux, lancements, tours, dit };
}

const BON = "<choix-de-design>non: wording set by the criteria</choix-de-design>";

test("after the second identical failure, the card says 'design review cannot start: <error>' with the real error, not 'review in progress'", async (t) => {
  const { dit, tours } = parLeDepot(t, () => ({ erreur: "spawn E2BIG", message: null }));
  await tours(6);
  const texte = dit();
  assert.match(texte, /design review cannot start: [^\n]*spawn E2BIG/);
  assert.ok(!texte.includes("review in progress"));
});
