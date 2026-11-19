// La ligne de la cuisine retenue ne dit plus « cause unknown » d'un ticket en WAITING : elle dit ce qu'il attend et sa
// date de relance (#3814).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherRetenue } from "../../src/retenue/brancher.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const A = (hhmmss: string) => `2026-11-18T${hhmmss}.000Z`;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: [...CALIBRE, ...labels], state: "open" });

test("a held kitchen with a ticket in WAITING: the hold line names what it waits for and its follow-up date, and does not say `cause unknown`", async (t) => {
  let instant = A("00:00:00");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait & { project: string; ticket: null; author: string });
  const suivi = suivreLeTour(() => new Date(instant));
  const marque = corpsDeLAttente({ what: "the client's production API key", who: "the client", followUp: "2026-11-25T00:00:00.000Z" });
  const client = {
    fires: async () => [ticket(30), ticket(31, "waiting")],
    dependancesOuvertes: async () => [],
    commentaires: async (numero: number) => (numero === 31 ? [{ body: marque, author: "brigade", association: "OWNER", createdAt: A("00:00:00") }] : []),
    checksDeLaBase: async () => [],
    merger: async () => ({ fait: true }),
    prDuTicket: async () => null,
    ci: async () => [],
  } as unknown as GitHubDuTour;
  const github = suivi.envelopper(client);
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  brancherRetenue(runtime, { tour: suivi, relance: null, maintenant: () => new Date(instant), dire: () => {} });
  await github.fires();
  for (const hhmmss of ["00:29:00", "00:45:00"]) {
    instant = A(hhmmss);
    for (const ecouter of ecouteurs) ecouter("tick");
  }
  const lignes = decrireEtat(lireEtat(journal, new Date(instant)), new Date(instant)).filter((ligne) => /^ {2}kitchen {2}for /.test(ligne));
  assert.equal(lignes.length, 1);
  const ligne = lignes[0] ?? "";
  assert.doesNotMatch(ligne, /cause unknown/);
  assert.match(ligne, /API key/);
  assert.match(ligne, /2026-11-25/);
});
