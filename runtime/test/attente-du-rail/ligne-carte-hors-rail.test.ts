// #3810 (suite de #3763) : ce que la ligne d'une carte dit quand un ticket attendu est hors du rail, et quand rien ne retient.
//
// Ce fichier VERROUILLE VOLONTAIREMENT le choix actuel de `ligneDeLaCarte` (raison.ts) : sans `attentes` lues, une carte
// dont le corps dit `Depends on #1912`, avec #1912 ouvert mais hors du rail (sans `fire`), n'a aucune ligne d'attente —
// `retenus` exclut #1912 — et sa carte retombe sur « prête, attend une place en cuisine ». La porte de prise
// (`attendusOuverts`, attente-ticket.ts) est plus large : elle retient sur tout ticket ouvert, sur le rail ou non. La carte
// de `brigade <project> status` et celle du rail de l'app passent par la même `ligneDeLaCarte`, avec leurs `attentes` : ce
// verrou tient pour elles aussi. Ce test ne dit pas que c'est le bon choix, il dit que le changer est une décision du chef,
// pas un effet de bord.
//
// Un ticket que rien ne retient n'a pas de ligne d'attente : cela existe déjà sur `main`, c'est une garde de non-régression
// (décision du chef sur #3810), tenue dans le premier test, rouge sur `main` pour la ligne du ticket retenu.
import assert from "node:assert/strict";
import { test } from "node:test";
import { expliquerLAttente, ligneDeLaCarte, type TicketDuRail } from "../../src/attente-du-rail/raison.ts";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { DEPOT } from "../outils.ts";

const T0 = Date.parse("2026-11-12T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const file = (ticket: number, depend: number[] = []): TicketDuRail => ({ ticket, etat: "queued", entreLe: iso(T0 - 60_000), depend });
const enLigne = { lues: [{ name: "box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] };
const raison = (tickets: TicketDuRail[]) => expliquerLAttente({ depot: DEPOT, tickets, stations: enLigne, plafondAtteint: false, maintenant: T0 })?.raison;

test("un ticket retenu par un ticket ouvert hors du rail n'a pas de ligne d'attente : le choix actuel ; un ticket libre n'en a pas non plus", () => {
  // #1912 est ouvert, mais il n'est pas sur le rail : `retenus` l'exclut.
  const rail = [file(5, [1912]), file(6)];
  assert.equal(ligneDeLaCarte(rail[0]!, rail), null);
  assert.equal(raison(rail), "normale");
  // Sur le rail, la même dépendance se dit.
  const avec1912 = [file(5, [1912]), file(1912)];
  assert.match(ligneDeLaCarte(avec1912[0]!, avec1912) ?? "", /waits for #1912 — read from the body/);
  // Un ticket que rien ne retient n'a pas de ligne ; celui qu'il retient dit son attente.
  const libre = [file(5), file(6, [5])];
  assert.equal(ligneDeLaCarte(libre[0]!, libre), null);
  assert.match(ligneDeLaCarte(libre[1]!, libre) ?? "", /^waits for #5 — read from the body/);
});

// Les trois sources et le cas libre, dans une même file : le corps, la fiche, l'arrêt d'un cook, et un ticket libre.
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ body, created_at: "2026-11-17T09:30:00Z" });

test("trois sources et un ticket libre dans une même file : chacun dit son attente et sa source, le libre n'a aucune ligne", async () => {
  const commentaires: Record<number, unknown[]> = {
    6: [commentaire([MARQUEUR, "- awaiting: #4"].join("\n"))],
    7: [commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)],
  };
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(4, ["fire", "taken"]), issue(5, ["fire"], "Depends on #4"), issue(6, ["fire"], "Restyle."), issue(7, ["fire"], "Restyle."), issue(8, ["fire"], "Independent work."), issue(9, ["fire"], "Depends on #1912.")];
    const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (sien !== null) return commentaires[Number(sien[1])] ?? [];
    if (/\/issues\/1912(\/|$)/.test(chemin)) assert.fail(`off-rail waited ticket must not be read: ${chemin}`);
    return chemin.includes("/events?") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  const dites = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-17T10:00:00.000Z") });
  const ligne = (n: number) => dites.find((l) => l.trimStart().startsWith(`#${n} `));
  assert.match(ligne(5) ?? "", /waits for #4 — read from the body: 'Depends on #4'/);
  assert.match(ligne(6) ?? "", /waits for #4 — read from the card/);
  assert.match(ligne(7) ?? "", /waits for #4 — read from a cook's stop/);
  assert.equal(ligne(8), undefined);
  // Voie de production de `status` : #9 dépend de #1912, ouvert mais hors du rail — le filtre `retenus` le tait, aucune ligne.
  assert.equal(ligne(9), undefined);
  assert.doesNotMatch(dites.join("\n"), /#1912|awaiting: none/);
});

test("les commentaires d'un ticket : une entrée sans texte est ignorée, les autres se lisent ; une réponse qui n'est pas une liste ne les dit pas lus", async () => {
  const lireAvec = (reponse: unknown) => async (chemin: string) => {
    if (chemin === FEUX) return [issue(4, ["fire", "taken"]), issue(7, ["fire"], "Restyle.")];
    if (chemin.includes("/issues/7/comments")) return reponse;
    return chemin.includes("/events?") ? [] : assert.fail(`not dictated: ${chemin}`);
  };
  const dire = (reponse: unknown) => lignesDeLAttente({ depot: DEPOT, lire: lireAvec(reponse), stations: async () => ({ lues: [] }), maintenant: Date.parse("2026-11-17T10:00:00.000Z") });
  const meles = await dire([null, { created_at: "2026-11-17T09:00:00Z" }, { body: 5 }, commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #4 -->\nThe cook stopped.`)]);
  const ligne = meles.find((l) => l.trimStart().startsWith("#7 ")) ?? "";
  assert.match(ligne, /waits for #4 — read from a cook's stop/);
  assert.doesNotMatch(ligne, /could not be read/);
  const illisibles = await dire({ message: "not a list" });
  assert.match(illisibles.find((l) => l.trimStart().startsWith("#7 ")) ?? "", /could not be read on GitHub/);
});
