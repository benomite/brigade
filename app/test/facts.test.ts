// Ce que l'app dessine : les faits que la box rend dans la forme que
// la doc de l'ancien runtime donnait. Son exemple est
// lu ici tel qu'elle l'écrivait ; une sortie qui n'est pas cette forme n'est
// jamais dessinée — ni tableau vide, ni zéros. Une couleur ne se pose que sur
// un mot des listes fermées. Le rail se range en six colonnes, TODO
// d'après `attend`, que la forme donne, et le bloc `attend` de `status` ; WAITING
// d'après les `tiers` de chaque ticket (wait.test.ts). Chaque
// carte porte ce que la file dit du ticket, et écrit ce qu'elle n'en dit pas :
// ce qui s'y lit est dans bon.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Reading } from "../src/box.ts";
import { withoutQuestion } from "../src/handover-second.ts";
import { COMMAND, understand, duration, rail, holdFacts } from "../src/facts.ts";
import type { Header } from "../src/card.ts";

const ROOT = join(import.meta.dirname, "../..");
// L'exemple que la doc de l'ancien runtime donnait des faits (ses champs `dernierTick` et `compteurs`).
const EXAMPLE = "{\"etat\":\"ouverte\",\"lu\":\"2026-10-12T10:04:11.000Z\",\"dernierTick\":\"2026-10-12T10:04:02.000Z\",\"compteurs\":{\"rail\":2,\"auTravail\":1,\"aLaPass\":1,\"attend\":1,\"livres24h\":3},\"dernierEvenement\":{\"seq\":812,\"at\":\"2026-10-12T10:03:58.000Z\",\"type\":\"merge.done\",\"ticket\":216},\"rail\":[{\"ticket\":14,\"etat\":\"pris\",\"titre\":\"Le journal en ajout seul\",\"url\":\"https://github.com/benomite/brigade/issues/14\",\"activite\":{\"fait\":\"lit\",\"faitEn\":\"reading\",\"cible\":\"runtime/src/etat.ts\",\"depuis\":\"2026-10-12T10:01:11.000Z\"},\"attente\":null},{\"ticket\":21,\"etat\":\"BLOQUÉ\",\"titre\":\"L'export du journal\",\"url\":\"https://github.com/benomite/brigade/issues/21\",\"activite\":null,\"attente\":null}],\"cooks\":[{\"ticket\":14,\"titre\":\"Le journal en ajout seul\",\"station\":\"box/claude\"}],\"attend\":[{\"ticket\":21,\"titre\":\"L'export du journal\",\"url\":\"https://github.com/benomite/brigade/issues/21\"}],\"livres\":[{\"ticket\":216,\"titre\":\"Le relevé des mesures\",\"url\":\"https://github.com/benomite/brigade/issues/216\",\"livre\":\"2026-10-12T10:03:58.000Z\",\"station\":\"box/claude\",\"pr\":\"https://github.com/benomite/brigade/pull/219\",\"relecture\":{\"resume\":\"Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.\",\"constats\":[{\"gravite\":\"remarque\",\"fichier\":\"runtime/src/mesures.ts\",\"constat\":\"Le seuil par défaut est répété dans deux fichiers.\"},{\"gravite\":\"remarque\",\"fichier\":null,\"constat\":\"À supprimer : l'ancien compteur, qui ne sert plus.\"}]}},{\"ticket\":201,\"titre\":\"Les grants sous plafond\",\"url\":\"https://github.com/benomite/brigade/issues/201\",\"livre\":\"2026-10-12T07:12:40.000Z\",\"station\":\"box/claude\",\"pr\":\"https://github.com/benomite/brigade/pull/207\",\"relecture\":{\"resume\":\"Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.\",\"constats\":[]}},{\"ticket\":188,\"titre\":\"Une fiche sans zone\",\"url\":\"https://github.com/benomite/brigade/issues/188\",\"livre\":\"2026-10-11T16:30:05.000Z\",\"station\":\"box/claude\",\"pr\":null,\"relecture\":null}]}";


const renderedOnes = (facts: object) => `${JSON.stringify(facts)}\n`;
// Ce qu'une carte dit quand `status` n'a pas été lu : ce que `faits` ne donne pas est écrit, pas tu.
const WITHOUT_STATUS = "not given by `facts`, and the `rail` line of `status` was not read";
// L'en-tête de sa fiche (card.ts), quand `status` n'a pas été lu : son titre, son issue — mais ni sa
// priorité, que seule sa ligne de `status` écrit, ni sa PR, que la box ne donne que d'un ticket livré.
const card = (title: string | undefined, other: Partial<Header> = {}): { fiche: Header } => ({
  fiche: {
    titre: title === undefined ? { sans: "not given — the station returns no title for this ticket" } : { valeur: title },
    priorite: { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" },
    issue: true,
    ...other,
  },
});

// Une carte qui t'attend porte, en tête de sa fiche, ce qu'on attend de toi (decision.ts) : sans
// décision donnée par `faits` — une box d'avant ce champ, comme ici —, « no question found on #N ».
const expected = (ticket: number) => ({ attendu: withoutQuestion(ticket) }) as const;
// Ce qui attend le chef est parked pour lui, pour ce que sa carte attend, sans date (#4261).
const atChef = (ticket: number) => ({ parque: { qui: "the chef", quoi: withoutQuestion(ticket), jusqua: null, chef: true } }) as const;

const readEntry = (text: string): Reading => ({ projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", sorties: [{ commande: "facts", texte: text }] });

function informs(text: string): string {
  const understood = understand(text);
  assert.ok("informe" in understood, `pris pour la forme : ${text}`);
  return understood.informe;
}

describe("les faits que l'app dessine", () => {
  test("la commande lue est `facts`", () => {
    assert.equal(COMMAND, "facts");
  });
















});

const cards = (draws: ReturnType<typeof rail>) => [...draws.colonnes.flatMap((column) => column.cartes), ...draws.hors];

describe("une couleur sur un mot de la liste fermée", () => {


});

describe("la carte de projet", () => {






  test("une durée se dit comme `status` la dit", () => {
    assert.deepEqual([0, 999, 59_000, 60_000, 12 * 60_000, 3_599_000, 3_600_000, (3 * 60 + 2) * 60_000, 24 * 3_600_000 - 1, 2 * 24 * 3_600_000].map(duration), ["0 s", "0 s", "59 s", "1 min", "12 min", "59 min", "1 h 00", "3 h 02", "23 h 59", "2 d"]);
    // Deux horloges ne se croisent pas ici — mais une forme écrite à la main ne doit pas rendre un âge négatif.
    assert.equal(duration(-5_000), "0 s");
  });
});

describe("un ticket s'ouvre sur son issue", () => {



});

// Un rail de chaque état, dans l'ordre de service, et le bloc `attend` que
// `status` écrit à côté : #12 et #21 y sont, #30 n'est pas sur le rail.
// Ces faits sont ceux d'une box d'avant `livres` : Livré y prend les tickets `servi`
// du rail, comme chaque colonne ceux de son mot. Ce que `livres` y change est plus bas.
const ticket = (number: number, state: string) => ({ ticket: number, etat: state, titre: `Ticket ${number}`, url: `https://github.com/benomite/brigade/issues/${number}` });
const RAIL = [ticket(9, "servi"), ticket(12, "en pass"), ticket(14, "pris"), ticket(15, "en pass"), ticket(16, "en attente"), ticket(21, "BLOQUÉ"), ticket(22, "en attente"), ticket(40, "86"), ticket(41, "au four")];
const BLOCK = {
  bloc:
    "attend     4 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
    "  claude  depuis 2 j  connexion Max absente — à rétablir : `claude /login` sous le compte du service, puis `brigade <projet> garde-fous reprendre`\n" +
    "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 21\n" +
    "  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue\n" +
    "  #12  depuis 4 min  livraison verte, non mergée — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12\n" +
    "fin attend\n",
  a: "2026-10-12T10:04:20.000Z",
};
const ranks = (draws: ReturnType<typeof rail>) => draws.colonnes.map(({ nom: name, compte: account, cartes: cards }) => [name, account, cards.map(({ ticket }) => ticket)]);

// Ce qu'une carte porte de plus que son rang, quand `status` n'a pas été lu et que rien d'autre ne le dit.
const BARE = { ligne: "ready, waits for a place in the kitchen", dit: [], sans: `${WITHOUT_STATUS} : who holds it · since when · its lease · what it burns · what blocks it` };
// Dans T'attend, sous ce que le bloc dit du ticket : ce qui le bloque est dit, le reste manque.
const expectedOne = (ticket: number) => ({ ligne: withoutQuestion(ticket), dit: [], sans: `${WITHOUT_STATUS} : who holds it · since when · its lease · what it burns` });

describe("le rail en six colonnes", () => {













});

// Livré, d'une box qui donne `livres` : les tickets servis dans les 24 h, que leur
// issue soit fermée ou non — le rail ne les porte plus quelques secondes après le merge.
describe("Livré, d'après `livres`", () => {
  const delivers = (ticket: number, deliversThe: string, other: object = {}) => ({
    ticket,
    titre: `Ticket ${ticket}`,
    url: `https://github.com/benomite/brigade/issues/${ticket}`,
    livre: deliversThe,
    station: "box/claude",
    pr: `https://github.com/benomite/brigade/pull/${ticket + 100}`,
    ...other,
  });
  const DELIVERED = [delivers(30, "2026-10-12T10:00:00.000Z"), delivers(9, "2026-10-12T09:00:00.000Z"), delivers(14, "2026-10-11T12:00:00.000Z")];
  const deliversCol = (draws: ReturnType<typeof rail>) => draws.colonnes.find(({ nom: name }) => name === "Served");







});

describe("le bloc `attend` tenu à côté des faits", () => {
  const status = (text: string, a = BLOCK.a): Reading => ({ projet: "brigade", demande: 9, a, sorties: [{ commande: "status", texte: text }] });
  const column = (receivedOne: ReturnType<ReturnType<typeof holdFacts>["attendre"]>) => (receivedOne !== undefined && "tableau" in receivedOne ? receivedOne.tableau.rail.colonnes[3] : undefined);







});

describe("la bannière d'arrêt", () => {


});


describe("la question d'une carte de TODO, des faits à la carte (#3131)", () => {
});
