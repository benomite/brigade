// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : la lecture du rail pose la phrase du runtime et la ligne de
// chaque carte dans `facts`, qui les portent jusqu'au tableau, à la carte et à la ligne en tête du rail.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/rail-bloque/rail-bloque.ts";
import { comprendre, rail, tableau, type Carte, type Faits } from "../../src/faits.ts";
import { ligneEnAttente, PRET } from "../../src/ligne-carte.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { attenteDuRailLue, lignesDesCartesLues } from "../../src/vue/attente-du-rail/attente-du-rail.ts";
import { ligneDeLAttente } from "../../src/vue/attente-du-rail/ligne-de-l-attente.js";
import { avecLeRail, type RailSurGithub, type TicketSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "chef/secondes";
const LU = "2026-11-12T10:00:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T09:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...autres });
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (numero: number, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${DEPOT}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: "2026-11-12T09:00:00.000Z", pr: null, prise: null, entreLe: "2026-11-12T09:58:00.000Z", ...autres });
const lecture = (tickets: TicketSurGithub[], stations: StationDuCompte[]) => avecLeRail(VIDE, { lu: LU, tickets } satisfies RailSurGithub, { lus: stations });
const faitsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Faits;
const carte = (faits: Faits, numero: number): Carte => {
  const dessine = rail(faits);
  return [...dessine.colonnes.flatMap(({ cartes }) => cartes), ...dessine.hors].find((une) => une.ticket === numero) ?? assert.fail(`pas de carte #${numero}`);
};
const pris = ticket(3, { etat: "pris", prise: { station: "box/claude", le: "2026-11-12T09:30:00.000Z" }, entreLe: undefined });

describe("la lecture du rail pose la phrase et les lignes des cartes dans `facts`", () => {
  test("des tickets en file, une station en ligne : l'attente normale, et `facts` la porte jusqu'au tableau", () => {
    const faits = faitsDe(lecture([ticket(4), ticket(5)], [station()]));
    assert.deepEqual(faits.attenteDuRail, { raison: "normale", phrase: "Normal wait: a cook takes the ticket within minutes (the oldest has waited 2 min). It resolves by itself.", geste: null });
    assert.equal(faits.lignesDesCartes, undefined);
    assert.deepEqual(tableau(faits).attenteDuRail, faits.attenteDuRail);
  });

  test("aucune station ne sert le projet : la raison 1, et son geste", () => {
    const faits = faitsDe(lecture([ticket(4)], [station({ selection: ["chef/autre"] })]));
    assert.deepEqual(faits.attenteDuRail, { raison: "aucune-station", phrase: "No station serves this project, so no cook can start. Add the project to a station.", geste: "ajouter-a-une-station" });
  });

  test("les signes de vie qui ne se lisent pas : aucune raison de station n'est devinée", () => {
    const lu = avecLeRail(VIDE, { lu: LU, tickets: [ticket(4)] }, { illisible: "no answer" });
    assert.equal(faitsDe(lu).attenteDuRail?.raison, "normale");
  });

  test("un cook tourne, ou rien n'est en file : aucune phrase", () => {
    assert.equal(faitsDe(lecture([ticket(4), pris], [])).attenteDuRail, undefined);
    assert.equal(faitsDe(lecture([], [])).attenteDuRail, undefined);
    assert.equal(faitsDe(lecture([pris], [])).attenteDuRail, undefined);
  });

  test("une livraison en pass : la raison 6", () => {
    const enPass = ticket(3, { etat: "en pass", prise: { station: "box/claude", le: "2026-11-12T09:30:00.000Z" }, entreLe: undefined });
    assert.equal(faitsDe(lecture([ticket(4), enPass], [station()])).attenteDuRail?.raison, "pass");
  });

  test("un ticket mis de côté ou en WAITING n'est pas en file : seul, il n'attend rien", () => {
    assert.equal(faitsDe(lecture([ticket(4, { etat: "86" }), ticket(5, { etat: "WAITING" })], [])).attenteDuRail, undefined);
  });

  test("un `attenteDuRail` ou des `lignesDesCartes` mal formés ne sont pas posés", () => {
    for (const brut of [null, [], { raison: "inconnue", phrase: "x", geste: null }, { raison: "normale", phrase: "", geste: null }, { raison: "normale", phrase: "x", geste: "autre" }, { raison: "normale", phrase: "x" }]) {
      assert.deepEqual(attenteDuRailLue(brut), {}, JSON.stringify(brut));
    }
    for (const brut of [null, [], {}, { x: "after #4" }, { 5: "" }, { 5: 4 }]) assert.deepEqual(lignesDesCartesLues(brut), {}, JSON.stringify(brut));
    assert.deepEqual(lignesDesCartesLues({ 5: "after #4" }), { lignesDesCartes: { 5: "after #4" } });
  });
});

describe("la ligne de chaque carte en file", () => {
  const depend = (...numeros: number[]) => ({ depend: numeros });

  test("« after #N » derrière un ticket en file, « waiting for #N to merge » derrière un ticket tenu ; la carte qui part ensuite n'en a aucune", () => {
    const faits = faitsDe(lecture([ticket(4), ticket(5, depend(4)), ticket(6, depend(3)), pris], [station()]));
    assert.deepEqual(faits.lignesDesCartes, { 5: "after #4", 6: "waiting for #3 to merge" });
    assert.equal(carte(faits, 5).ligne, "after #4");
    assert.deepEqual(carte(faits, 5).liens, [4]);
    assert.equal(carte(faits, 6).ligne, "waiting for #3 to merge");
    // La carte qui part ensuite garde sa phrase d'avant : elle n'a pas de dépendance.
    assert.equal(carte(faits, 4).ligne, PRET);
  });

  test("la ligne se dit même quand un cook tourne : c'est la carte qui attend, pas la file", () => {
    const faits = faitsDe(lecture([ticket(5, depend(3)), pris], []));
    assert.equal(faits.attenteDuRail, undefined);
    assert.equal(carte(faits, 5).ligne, "waiting for #3 to merge");
  });

  test("ce qui retient déjà la carte, et ses messages (« Will not start », mise de côté), passent avant", () => {
    assert.deepEqual(ligneEnAttente("en attente", "blocked by #9", "after #4"), { ligne: "Waiting for #9", liens: [9] });
    assert.deepEqual(ligneEnAttente("en attente", undefined, "after #4"), { ligne: "after #4", liens: [4] });
    assert.deepEqual(ligneEnAttente("en attente", undefined, undefined), { ligne: PRET });
    const refusee = ticket(5, { etat: "86", depend: [4], miseDeCote: { label: "served-elsewhere", raison: "already done", liens: [], auChef: false, pr: null } });
    const faits = faitsDe(lecture([ticket(4), refusee], [station()]));
    assert.match(carte(faits, 5).ligne ?? "", /^Will not start: /);
    assert.equal(carte(faits, 5).signal, "set aside");
  });
});

describe("la ligne en tête du rail", () => {
  test("une panne (raisons 1 à 3) : FAULT, la phrase, et le geste en bouton qui ouvre Stations", () => {
    const attente = faitsDe(lecture([ticket(4)], [station({ stoppedAt: "2026-11-12T09:59:40.000Z" })])).attenteDuRail;
    const appels: string[] = [];
    const [ligne] = ligneDeLAttente(doc, attente, { ouvrirStations: () => appels.push("stations") }) as unknown as Faux[];
    assert.ok(ligne !== undefined);
    assert.equal(ligne.role, "alert");
    assert.deepEqual(ligne.children.map((enfant) => enfant.textContent), ["FAULT", "The station is stopped, so no cook can start. Start the station.", "Start the station"]);
    ligne.dessous("button")[0]?.click();
    assert.deepEqual(appels, ["stations"]);
  });

  test("une attente qui passe seule : la phrase, sans alarme ni bouton", () => {
    const attente = faitsDe(lecture([ticket(4)], [station()])).attenteDuRail;
    const [ligne] = ligneDeLAttente(doc, attente, { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.ok(ligne !== undefined);
    assert.notEqual(ligne.role, "alert");
    assert.deepEqual(ligne.children.map((enfant) => enfant.textContent), [attente?.phrase]);
  });

  test("sans attente, ou en lecture seule : aucune ligne, ou aucun bouton", () => {
    assert.deepEqual(ligneDeLAttente(doc, undefined, null), []);
    const attente = faitsDe(lecture([ticket(4)], [])).attenteDuRail;
    const [ligne] = ligneDeLAttente(doc, attente, null) as unknown as Faux[];
    assert.deepEqual(ligne?.dessous("button"), []);
  });
});

describe("le `status` que l'app tire de sa lecture", () => {
  test("la phrase au-dessus de la ligne `rail`, puis la ligne de chaque carte", () => {
    const lignes = statusDuTableau(lecture([ticket(4), ticket(5, { depend: [4] })], [station()])).split("\n");
    const rang = lignes.findIndex((ligne) => ligne.startsWith("queue wait "));
    assert.ok(rang !== -1, lignes.join("\n"));
    assert.match(lignes[rang] ?? "", /^queue wait Normal wait: a cook takes the ticket within minutes \(the oldest has waited 2 min\)\. It resolves by itself\.$/);
    assert.equal(lignes[rang + 1], "  #5  after #4");
    assert.ok(lignes.findIndex((ligne) => ligne.startsWith("rail ")) > rang);
  });

  test("rien n'attend : aucune ligne", () => {
    assert.doesNotMatch(statusDuTableau(lecture([ticket(4), pris], [station()])), /queue wait/);
  });
});
