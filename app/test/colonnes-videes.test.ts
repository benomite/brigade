// Une colonne du rail qui passe de cartes à aucune est dite dans le journal de l'app, avec la lecture qui l'a fait (#2151) :
// son heure, l'heure où la box a publié le rail lu, où sont passées les cartes, et ce que chaque colonne porte désormais.
// Une lecture ratée n'en vide aucune : elle ne dit rien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tenirLesColonnes } from "../src/colonnes-videes.ts";
import { tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-03T16:${String(minute).padStart(2, "0")}:00.000Z`;
const ticket = (numero: number, etat: string) => ({ ticket: numero, etat, titre: `Ticket ${numero}`, url: `https://github.com/chef/parade/issues/${numero}`, activite: null });
const faits = (rail: Faits["rail"], attend: Faits["attend"] = []): Faits => ({
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: attend?.length ?? 0, livres24h: 0 },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend,
});
const lu = (de: Faits, minute: number): Dessinable => ({ ...tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(de) }] }), publieLe: a(minute - 1) });
const ratee = (minute: number): Dessinable => tenirFaits().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded.", atteinte: true, cas: null, duTableau: true });

const ATTEND = [{ ticket: 21, titre: "Ticket 21", url: "https://github.com/chef/parade/issues/21" }];

describe("le journal des colonnes vidées (#2151)", () => {
  test("une colonne qui passe de cartes à aucune : une ligne, avec la lecture qui l'a fait, celle d'avant, et où sont passées ses cartes", () => {
    const dites: string[] = [];
    const colonnes = tenirLesColonnes((ligne) => dites.push(ligne));
    assert.deepEqual(colonnes.voir(lu(faits([ticket(14, "pris"), ticket(21, "en attente")], ATTEND), 2)), []);
    const rendues = colonnes.voir(lu(faits([ticket(14, "pris"), ticket(21, "pris")]), 5));

    assert.deepEqual(rendues, dites);
    assert.deepEqual(dites, [
      `brigade: parade — the Awaiting you column went from 1 card to none (#21 now in Taken), by the reading of ${a(5)}, published by the box at ${a(4)}; the one before was read at ${a(2)}, published by the box at ${a(1)}. Columns now: On the rail 0 · Taken 2 · Pass 0 · Awaiting you 0 · Waiting 0 · Served 0`,
    ]);
  });

  test("une carte qui n'est plus dans la lecture le dit ; chaque colonne vidée a sa ligne", () => {
    const dites: string[] = [];
    const colonnes = tenirLesColonnes((ligne) => dites.push(ligne));
    colonnes.voir(lu(faits([ticket(14, "pris"), ticket(21, "en attente")], ATTEND), 2));
    colonnes.voir(lu(faits([]), 3));
    assert.deepEqual(
      dites.map((ligne) => ligne.split(", by the reading")[0]),
      ["brigade: parade — the Taken column went from 1 card to none (#14 not in this reading)", "brigade: parade — the Awaiting you column went from 1 card to none (#21 not in this reading)"],
    );
  });

  test("une lecture ratée ne dit rien et n'efface pas la dernière : la lecture qui suit se compare à celle-là", () => {
    const dites: string[] = [];
    const colonnes = tenirLesColonnes((ligne) => dites.push(ligne));
    colonnes.voir(lu(faits([ticket(14, "pris")]), 2));
    assert.deepEqual(colonnes.voir(ratee(3)), []);
    assert.deepEqual(colonnes.voir(lu(faits([ticket(14, "pris")]), 4)), []);
    assert.deepEqual(dites, []);
  });

  test("une première lecture, ou une colonne qui garde une carte, ne dit rien", () => {
    const dites: string[] = [];
    const colonnes = tenirLesColonnes((ligne) => dites.push(ligne));
    colonnes.voir(lu(faits([]), 2));
    colonnes.voir(lu(faits([ticket(14, "pris")]), 3));
    colonnes.voir(lu(faits([ticket(14, "pris"), ticket(15, "pris")]), 4));
    colonnes.voir(lu(faits([ticket(15, "pris")]), 5));
    assert.deepEqual(dites, []);
  });
});
