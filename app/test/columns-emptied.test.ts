// Une colonne du rail qui passe de cartes à aucune est dite dans le journal de l'app, avec la lecture qui l'a fait (#2151) :
// son heure, l'heure où la box a publié le rail lu, où sont passées les cartes, et ce que chaque colonne porte désormais.
// Une lecture ratée n'en vide aucune : elle ne dit rien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdTheColumns } from "../src/columns-emptied.ts";
import { holdFacts, type Drawable, type Facts } from "../src/facts.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-03T16:${String(minute).padStart(2, "0")}:00.000Z`;
const ticket = (number: number, state: string) => ({ ticket: number, etat: state, titre: `Ticket ${number}`, url: `https://github.com/chef/parade/issues/${number}`, activite: null });
const facts = (rail: Facts["rail"], awaiting: Facts["attend"] = []): Facts => ({
  etat: "ouverte",
  lu: a(0),
  compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: awaiting?.length ?? 0, livres24h: 0 },
  rail,
  cooks: [],
  attend: awaiting,
});
const readOne = (of: Facts, minute: number): Drawable => ({ ...holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(of) }] }), publieLe: a(minute - 1) });
const missed = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded.", atteinte: true, cas: null, duTableau: true });

const AWAITING = [{ ticket: 21, titre: "Ticket 21", url: "https://github.com/chef/parade/issues/21" }];

describe("le journal des colonnes vidées (#2151)", () => {
  test("une colonne qui passe de cartes à aucune : une ligne, avec la lecture qui l'a fait, celle d'avant, et où sont passées ses cartes", () => {
    const saidEntries: string[] = [];
    const columns = holdTheColumns((line) => saidEntries.push(line));
    assert.deepEqual(columns.voir(readOne(facts([ticket(14, "pris"), ticket(21, "en attente")], AWAITING), 2)), []);
    const renderedEntries = columns.voir(readOne(facts([ticket(14, "pris"), ticket(21, "pris")]), 5));

    assert.deepEqual(renderedEntries, saidEntries);
    assert.deepEqual(saidEntries, [
      `brigade: parade — the Awaiting you column went from 1 card to none (#21 now in Taken), by the reading of ${a(5)}, published by the box at ${a(4)}; the one before was read at ${a(2)}, published by the box at ${a(1)}. Columns now: On the rail 0 · Taken 2 · Pass 0 · Awaiting you 0 · Waiting 0 · Served 0`,
    ]);
  });

  test("une carte qui n'est plus dans la lecture le dit ; chaque colonne vidée a sa ligne", () => {
    const saidEntries: string[] = [];
    const columns = holdTheColumns((line) => saidEntries.push(line));
    columns.voir(readOne(facts([ticket(14, "pris"), ticket(21, "en attente")], AWAITING), 2));
    columns.voir(readOne(facts([]), 3));
    assert.deepEqual(
      saidEntries.map((line) => line.split(", by the reading")[0]),
      ["brigade: parade — the Taken column went from 1 card to none (#14 not in this reading)", "brigade: parade — the Awaiting you column went from 1 card to none (#21 not in this reading)"],
    );
  });

  test("une lecture ratée ne dit rien et n'efface pas la dernière : la lecture qui suit se compare à celle-là", () => {
    const saidEntries: string[] = [];
    const columns = holdTheColumns((line) => saidEntries.push(line));
    columns.voir(readOne(facts([ticket(14, "pris")]), 2));
    assert.deepEqual(columns.voir(missed(3)), []);
    assert.deepEqual(columns.voir(readOne(facts([ticket(14, "pris")]), 4)), []);
    assert.deepEqual(saidEntries, []);
  });

  test("une première lecture, ou une colonne qui garde une carte, ne dit rien", () => {
    const saidEntries: string[] = [];
    const columns = holdTheColumns((line) => saidEntries.push(line));
    columns.voir(readOne(facts([]), 2));
    columns.voir(readOne(facts([ticket(14, "pris")]), 3));
    columns.voir(readOne(facts([ticket(14, "pris"), ticket(15, "pris")]), 4));
    columns.voir(readOne(facts([ticket(15, "pris")]), 5));
    assert.deepEqual(saidEntries, []);
  });
});
