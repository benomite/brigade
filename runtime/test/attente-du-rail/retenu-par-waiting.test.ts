// #3761 : un ticket en file retenu par un ticket en WAITING le dit — « waits for `#N`, WAITING on <qui> » —, la file
// dit pourquoi elle ne part pas, et le seul ticket du rail retenu depuis plus d'une heure se nomme, avec ce qu'il attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attendusDesCartes, expliquerLAttente, lignesDesCartes, UNE_HEURE_MS, type TicketDuRail, type TicketEnWaiting } from "../../src/attente-du-rail/raison.ts";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import type { StationDuCompte } from "../../src/rail-bloque/rail-bloque.ts";
import { DEPOT } from "../outils.ts";

const T0 = Date.parse("2026-11-17T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const corps = (ticket: number) => [{ ticket, source: "corps" as const, phrase: `Depends on #${ticket}` }];
const file = (ticket: number, attend: number[], entreLe: string | null = iso(T0 - 2 * UNE_HEURE_MS)): TicketDuRail => ({ ticket, etat: "queued", entreLe, depend: attend, attentes: attend.flatMap(corps) });
const station: StationDuCompte = { name: "box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] };
const attente = (tickets: TicketDuRail[], waiting: TicketEnWaiting[], maintenant = T0) => expliquerLAttente({ depot: DEPOT, tickets, stations: { lues: [station] }, plafondAtteint: false, maintenant, waiting });
const W40: TicketEnWaiting = { ticket: 40, qui: "a collaborator" };

describe("un ticket en file qu'un ticket en WAITING retient", () => {
  test("sa ligne nomme le ticket en WAITING et qui il attend ; qui ne se lit pas, un tiers", () => {
    assert.equal(lignesDesCartes([file(21, [40])], [W40])[21], "waits for `#40`, WAITING on a collaborator — read from the body: 'Depends on #40'");
    const parSaFiche: TicketDuRail = { ticket: 21, etat: "queued", entreLe: null, depend: [40], attentes: [{ ticket: 40, source: "fiche" }] };
    assert.equal(lignesDesCartes([parSaFiche], [{ ticket: 40, qui: null }])[21], "waits for `#40`, WAITING on a third party — read from the card");
    assert.deepEqual(attendusDesCartes([file(21, [40])], [W40]), { 21: [40] });
  });

  test("chaque ticket en file retenu par un ticket en WAITING : la raison `waiting`, qui ne passe pas seule", () => {
    const dite = attente([file(21, [40], iso(T0 - 20 * 60_000)), file(22, [40], iso(T0 - 20 * 60_000))], [W40]);
    assert.equal(dite?.raison, "waiting");
    assert.equal(dite?.phrase, "Every queued ticket waits for a ticket in WAITING on a third party: it starts once that ticket is served.");
  });

  test("l'un retenu par un ticket en WAITING, l'autre par un ticket du rail : un autre ticket", () => {
    assert.equal(attente([file(21, [40]), file(22, [21])], [W40])?.raison, "autre-ticket");
  });

  test("le seul ticket du rail, retenu depuis plus d'une heure : la phrase le nomme, et ce qu'il attend ; sous l'heure, non", () => {
    assert.equal(attente([file(21, [40], iso(T0 - UNE_HEURE_MS - 60_000))], [W40])?.phrase, "#21 has not been able to leave for 1 h: it waits for `#40`, WAITING on a collaborator — read from the body: 'Depends on #40'.");
    assert.doesNotMatch(attente([file(21, [40], iso(T0 - UNE_HEURE_MS))], [W40])?.phrase ?? "", /#21|#40/);
    assert.doesNotMatch(attente([file(21, [40], null)], [W40])?.phrase ?? "", /#21|#40/, "sans l'instant de son entrée, la durée n'est pas devinée");
  });

  test("deux tickets retenus depuis plus d'une heure : aucun n'est le seul, la phrase commune", () => {
    assert.doesNotMatch(attente([file(21, [40]), file(22, [40])], [W40])?.phrase ?? "", /#21|#22|#40/);
  });
});

describe("`status` lit qui retient un ticket en WAITING de sa marque", () => {
  const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
  const MARQUE = corpsDeLAttente({ what: "the answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" });
  const enLigne = { lues: [{ ...station, lastSeen: iso(T0 - 30_000) }] };
  const lignes = (commentaires: (chemin: string) => unknown) =>
    lignesDeLAttente({
      depot: DEPOT,
      maintenant: T0,
      stations: async () => enLigne,
      lire: async (chemin) => {
        if (chemin === FEUX) return [issue(1912, ["fire", "waiting"]), issue(3734, ["fire", "model:opus", "effort:medium"], "Depends on #1912")];
        if (/\/issues\/1912\/comments/.test(chemin)) return commentaires(chemin);
        if (/\/comments/.test(chemin)) return [];
        return [{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-17T09:30:00Z" }];
      },
    });

  test("ses commentaires illisibles : la ligne dit un tiers, et le rail reste lu", async () => {
    const dites = await lignes(() => {
      throw new Error("HTTP 502");
    });
    assert.ok(dites.some((ligne) => /#3734 {2}waits for `#1912`, WAITING on a third party/.test(ligne)), dites.join("\n"));
  });

  test("une marque d'un auteur qui n'est pas du dépôt ne dit pas qui", async () => {
    const dites = await lignes(() => [{ body: MARQUE, author_association: "NONE" }]);
    assert.ok(dites.some((ligne) => /WAITING on a third party/.test(ligne)), dites.join("\n"));
    const deConfiance = await lignes(() => [{ body: MARQUE, author_association: "MEMBER" }]);
    assert.ok(deConfiance.some((ligne) => /WAITING on a collaborator/.test(ligne)), deConfiance.join("\n"));
  });
});
