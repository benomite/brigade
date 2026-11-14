// Pourquoi la file du rail ne part pas (#3433) : l'ordre des raisons, leur phrase, leur geste, le seuil de l'attente normale,
// et la ligne de chaque carte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dependancesDuCorps, expliquerLAttente, lignesDeStatus, lignesDesCartes, type TicketDuRail } from "../../src/attente-du-rail/raison.ts";
import { MOTS_DU_GESTE, type StationDuCompte } from "../../src/rail-bloque/rail-bloque.ts";

const DEPOT = "chef/secondes";
const T0 = Date.parse("2026-11-12T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const file = (ticket: number, entreLe: string | null = iso(T0 - 60_000), depend: number[] = []): TicketDuRail => ({ ticket, etat: "queued", entreLe, depend });
const station = (surcharge: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...surcharge });
const attente = (tickets: TicketDuRail[], stations: StationDuCompte[] | null, plafondAtteint = false, maintenant = T0) =>
  expliquerLAttente({ depot: DEPOT, tickets, stations: stations === null ? { illisibles: "no answer" } : { lues: stations }, plafondAtteint, maintenant });

describe("la raison pour laquelle la file ne part pas", () => {
  test("1 : aucune station ne sert le projet — la phrase nomme le geste", () => {
    assert.deepEqual(attente([file(4)], [station({ selection: ["chef/autre"] }), station({ name: "mac", selection: null })]), {
      raison: "aucune-station",
      phrase: "No station serves this project, so no cook can start. Add the project to a station.",
      geste: "ajouter-a-une-station",
      stations: [],
    });
    assert.deepEqual(attente([file(4)], [])?.raison, "aucune-station");
  });

  test("2 : sa station est arrêtée", () => {
    assert.deepEqual(attente([file(4)], [station({ stoppedAt: iso(T0 - 20_000) })]), {
      raison: "arretee",
      phrase: "Station box/claude is stopped, so no cook can start. Start the station.",
      geste: "demarrer-la-station",
      stations: ["box/claude"],
    });
  });

  test("3 : sa station est hors ligne ou sans quota", () => {
    assert.deepEqual(attente([file(4)], [station({ lastSeen: iso(T0 - 3_600_000) })]), {
      raison: "hors-ligne",
      phrase: "Station box/claude is offline or out of quota, so no cook can start. Start the station.",
      geste: "demarrer-la-station",
      stations: ["box/claude"],
    });
  });

  test("3 bis : une station arrêtée et une hors ligne — la panne ne nomme que celle qui devrait cuire", () => {
    const dite = attente([file(4)], [station({ name: "mac", stoppedAt: iso(T0 - 20_000) }), station({ name: "parade", lastSeen: iso(T0 - 3_600_000) })]);
    assert.equal(dite?.raison, "hors-ligne");
    assert.deepEqual(dite?.stations, ["parade/claude"]);
    assert.match(dite?.phrase ?? "", /^Station parade\/claude is offline/);
    assert.doesNotMatch(dite?.phrase ?? "", /mac/);
  });

  test("3 ter : une station arrêtée et une en ligne — aucune panne", () => {
    const dite = attente([file(4)], [station({ name: "mac", stoppedAt: iso(T0 - 20_000) }), station({ name: "parade" })]);
    assert.equal(dite?.raison, "normale");
    assert.deepEqual(dite?.stations, []);
    assert.equal(dite?.geste, null);
  });

  test("4 : la station attend le quota de GitHub — aucun geste, elle passe seule", () => {
    const retenue = { limit: "primary", since: iso(T0 - 600_000), until: iso(T0 + 600_000) };
    assert.deepEqual(attente([file(4)], [station({ heldBy: retenue })]), {
      raison: "quota-github",
      phrase: "The station waits for the GitHub quota before it starts a cook. It resolves by itself.",
      geste: null,
      stations: [],
    });
  });

  test("5 : le plafond de cooks est atteint", () => {
    assert.deepEqual(attente([file(4)], [station()], true), {
      raison: "plafond",
      phrase: "The station has reached its cook cap: a cook starts as soon as a place frees up. It resolves by itself.",
      geste: null,
      stations: [],
    });
  });

  test("6 : une livraison est dans la pass", () => {
    const enPass: TicketDuRail = { ticket: 3, etat: "pass", entreLe: null, depend: [] };
    assert.deepEqual(attente([file(4), enPass], [station()]), {
      raison: "pass",
      phrase: "The pass is judging a delivery: the queue starts once it is done. It resolves by itself.",
      geste: null,
      stations: [],
    });
  });

  test("7 : chaque ticket en file en attend un autre", () => {
    assert.deepEqual(attente([file(4, undefined, [5]), file(5, undefined, [4])], [station()]), {
      raison: "autre-ticket",
      phrase: "Every queued ticket waits for another ticket: they start once it merges. It resolves by itself.",
      geste: null,
      stations: [],
    });
    // Un ticket libre en file : la file n'attend pas tout entière.
    assert.equal(attente([file(4, undefined, [5]), file(5)], [station()])?.raison, "normale");
  });

  test("les raisons 1 à 3 nomment leur geste, les raisons 4 à 8 n'en nomment aucun et disent qu'elles passent seules", () => {
    const gestes = Object.values(MOTS_DU_GESTE);
    const retenue = { limit: "primary", since: iso(T0 - 600_000), until: iso(T0 + 600_000) };
    const enPass: TicketDuRail = { ticket: 3, etat: "pass", entreLe: null, depend: [] };
    const seules = [
      attente([file(4)], [station({ heldBy: retenue })]),
      attente([file(4)], [station()], true),
      attente([file(4), enPass], [station()]),
      attente([file(4, undefined, [5]), file(5, undefined, [4])], [station()]),
      attente([file(4)], [station()]),
      attente([file(4, iso(T0 - 20 * 60_000))], [station()]),
    ];
    for (const dite of seules) {
      assert.ok(dite !== null);
      assert.equal(dite.geste, null, dite.phrase);
      assert.match(dite.phrase, /It resolves by itself\.$/);
      assert.ok(gestes.every((geste) => !dite.phrase.includes(geste)), dite.phrase);
    }
    const pannes = [attente([file(4)], []), attente([file(4)], [station({ stoppedAt: iso(T0 - 20_000) })]), attente([file(4)], [station({ lastSeen: iso(T0 - 3_600_000) })])];
    for (const dite of pannes) {
      assert.ok(dite?.geste !== null && dite?.geste !== undefined);
      assert.ok(gestes.some((geste) => dite.phrase.endsWith(`${geste}.`)), dite.phrase);
      assert.doesNotMatch(dite.phrase, /resolves by itself/);
    }
  });

  test("l'ordre : la première raison qui tient l'emporte", () => {
    const retenue = { limit: "primary", since: iso(T0 - 600_000), until: iso(T0 + 600_000) };
    const enPass: TicketDuRail = { ticket: 3, etat: "pass", entreLe: null, depend: [] };
    const bloques = [file(4, undefined, [5]), file(5, undefined, [4]), enPass];
    // Tout tient à la fois : la station manque d'abord.
    assert.equal(attente(bloques, [], true)?.raison, "aucune-station");
    assert.equal(attente(bloques, [station({ stoppedAt: iso(T0 - 20_000), heldBy: retenue })], true)?.raison, "arretee");
    assert.equal(attente(bloques, [station({ lastSeen: iso(T0 - 3_600_000) })], true)?.raison, "hors-ligne");
    assert.equal(attente(bloques, [station({ heldBy: retenue })], true)?.raison, "quota-github");
    assert.equal(attente(bloques, [station()], true)?.raison, "plafond");
    assert.equal(attente(bloques, [station()])?.raison, "pass");
    assert.equal(attente([file(4, undefined, [5]), file(5, undefined, [4])], [station()])?.raison, "autre-ticket");
  });

  test("une station qui sert le projet en ligne suffit, même si une autre est arrêtée", () => {
    assert.equal(attente([file(4)], [station({ name: "mac", stoppedAt: iso(T0 - 20_000) }), station()])?.raison, "normale");
  });

  test("des stations qui ne se lisent pas ne font aucune des raisons 1 à 4", () => {
    assert.equal(attente([file(4)], null)?.raison, "normale");
    assert.equal(attente([file(4)], null, true)?.raison, "plafond");
  });
});

describe("l'attente normale", () => {
  const du = (entree: number | null, maintenant: number) => attente([file(4, entree === null ? null : iso(entree))], [station()], false, maintenant);

  test("sous 5 minutes : normale, avec le temps du plus ancien depuis son entrée dans la file", () => {
    assert.deepEqual(du(T0 - 299_000, T0), { raison: "normale", phrase: "Normal wait: a cook takes the ticket within minutes (the oldest has waited 4 min). It resolves by itself.", geste: null, stations: [] });
  });

  test("à 5 minutes et plus, sans raison : plus longue que d'ordinaire", () => {
    assert.deepEqual(du(T0 - 300_000, T0), { raison: "normale", phrase: "The wait is longer than usual: the oldest queued ticket has waited 5 min and no reason is found. It resolves by itself.", geste: null, stations: [] });
    assert.match(du(T0 - 14 * 3_600_000, T0)?.phrase ?? "", /has waited 14 h and/);
  });

  test("le plus ancien des tickets en file fait le temps", () => {
    const dite = attente([file(5, iso(T0 - 60_000)), file(4, iso(T0 - 7 * 60_000))], [station()]);
    assert.match(dite?.phrase ?? "", /longer than usual: the oldest queued ticket has waited 7 min/);
  });

  test("sans l'instant d'entrée, la durée n'est pas dite — ni inventée", () => {
    assert.deepEqual(du(null, T0), { raison: "normale", phrase: "A cook takes the ticket within minutes. It resolves by itself.", geste: null, stations: [] });
    assert.equal(attente([file(4, "pas une date")], [station()])?.phrase, "A cook takes the ticket within minutes. It resolves by itself.");
  });
});

describe("quand aucune ligne ne se montre", () => {
  test("rien en file", () => {
    assert.equal(attente([], [station()]), null);
    assert.equal(attente([{ ticket: 3, etat: "pass", entreLe: null, depend: [] }], []), null);
  });

  test("un cook tourne : aucune ligne, même sans station", () => {
    assert.equal(attente([file(4), { ticket: 3, etat: "taken", entreLe: null, depend: [] }], []), null);
  });
});

describe("la ligne de chaque carte", () => {
  const pris: TicketDuRail = { ticket: 8, etat: "taken", entreLe: null, depend: [] };

  test("« after #N » derrière un ticket en file, « waiting for #N to merge » derrière un ticket que la cuisine tient", () => {
    const tickets = [file(4), file(5, undefined, [4]), file(6, undefined, [8]), pris];
    assert.deepEqual(lignesDesCartes(tickets), { 5: "after #4", 6: "waiting for #8 to merge" });
  });

  test("la carte qui part ensuite, une carte sans dépendance et un ticket hors du rail n'ont aucune ligne", () => {
    const tickets = [file(4), file(5), file(6, undefined, [99, 6])];
    assert.deepEqual(lignesDesCartes(tickets), {});
  });

  test("plusieurs dépendances : toutes nommées, la fusion attendue d'abord", () => {
    assert.deepEqual(lignesDesCartes([file(4), file(5), file(6, undefined, [5, 4])]), { 6: "after #4, #5" });
    assert.deepEqual(lignesDesCartes([file(4), pris, file(6, undefined, [4, 8])]), { 6: "waiting for #8 to merge" });
  });

  test("les lignes de `status` : la phrase, puis une ligne par carte, dans l'ordre des tickets", () => {
    assert.deepEqual(lignesDeStatus("Une phrase.", { 6: "after #5", 5: "after #4" }), ["queue wait Une phrase.", "  #5  after #4", "  #6  after #5"]);
    assert.deepEqual(lignesDeStatus(null, {}), []);
    assert.deepEqual(lignesDeStatus(null, { 5: "after #4" }), ["  #5  after #4"]);
  });
});

describe("`Depends on #N`", () => {
  test("lit les numéros d'une ligne, un ou plusieurs", () => {
    assert.deepEqual(dependancesDuCorps("Texte\nDepends on #12\n- Depends on #3, #4 and #5"), [12, 3, 4, 5]);
    assert.deepEqual(dependancesDuCorps("Rien ici, mais #7 est cité."), []);
  });
});
