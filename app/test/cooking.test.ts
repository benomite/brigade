// La cuisine d'un projet, station par station (#1185) : ce que `facts` dit de chaque station (#1183) devient sa
// ligne de l'onglet Cooks — son mot, ce qu'il veut dire, ses cooks, le geste de son bouton — et la ligne d'alerte de
// l'onglet Rail. Le bouton ne part plus de l'app (#2061) : aucune box ne lit plus de tableau de la cuisine.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FactsOfRuntime } from "../../runtime/src/etat.ts";
import { PASS_A_L_OUVRAGE as PASS_OF_RUNTIME } from "../../runtime/src/activites.ts";
import { ABSENT, cookingOf, PASS_AT_THE_WORK } from "../src/cooking.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import type { FactsStation } from "../src/ordinary.ts";

const READ = "2026-10-20T10:04:11.000Z";
type OfRuntime = FactsOfRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts), mot pour mot.
const station = (name: string, more: Partial<OfRuntime> = {}): OfRuntime => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: false,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...more,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const REFUSAL = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };

const FACTS: Facts = {
  etat: "ouverte",
  lu: READ,
  dernierTick: READ,
  compteurs: { rail: 0, auTravail: 2, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [COOK_14, COOK_15],
};
// Ce que la vue reçoit d'une lecture de `facts` qui porte ces stations.
function readEntries(stations: OfRuntime[]) {
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations }) }] });
  assert.ok("tableau" in receivedOne, "titre" in receivedOne ? receivedOne.titre : "");
  return { tenus: heldOnes, tableau: receivedOne.tableau };
}

describe("une station distante que la principale ne voit pas (#1830)", () => {
  test("absente, elle ne se lit jamais « cooking » : « not cooking », grise, son bouton d'arrêt gardé ; arrêtée, elle reste arrêtée ; présente, elle cuit — et ce qu'elle fournit, sa présence et sa dernière demande passent tels quels", () => {
    const { tableau: board } = readEntries([
      station("box/claude", { fournit: ["code"], presente: true, vueLe: null }),
      station("mac/claude", { distante: true, fournit: ["code", "macos"], presente: false, vueLe: null }),
      station("pc/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", presente: false, vueLe: "2026-10-20T09:00:00.000Z" }),
      station("mini/claude", { distante: true, presente: true, vueLe: "2026-10-20T10:04:00.000Z" }),
      // Un runtime d'avant ces champs : rien n'est dit de sa présence, son mot est pris tel quel.
      station("vieux/claude", { distante: true }),
    ]);
    const lines = board.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lines.map(({ station: name, etat: state, ton: your, fournit: provides, presente, vueLe: vueThe }) => ({ nom: name, etat: state, ton: your, fournit: provides, presente, vueLe: vueThe })),
      [
        { nom: "box/claude", etat: "cooking", ton: "vert", fournit: ["code"], presente: true, vueLe: null },
        { nom: "mac/claude", etat: ABSENT.etat, ton: "gris", fournit: ["code", "macos"], presente: false, vueLe: null },
        { nom: "pc/claude", etat: "stopped", ton: "gris", fournit: undefined, presente: false, vueLe: "2026-10-20T09:00:00.000Z" },
        { nom: "mini/claude", etat: "cooking", ton: "vert", fournit: undefined, presente: true, vueLe: "2026-10-20T10:04:00.000Z" },
        { nom: "vieux/claude", etat: "cooking", ton: "vert", fournit: undefined, presente: undefined, vueLe: undefined },
      ],
    );
    assert.match(lines[1]?.survol ?? "", /does not see it: it takes no ticket until it shows itself/);
  });
});

describe("les stations du projet, ligne par ligne", () => {
  test("chaque station dit son mot, ses cooks, et le geste de son bouton : stop quand elle cuit, start quand le chef l'a arrêtée", () => {
    const { tableau: board } = readEntries([
      station("box/claude", { cooks: [COOK_14] }),
      station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", cooks: [COOK_15] }),
      station("atelier/claude", { cuisson: "refused", refus: REFUSAL }),
    ]);
    const lines = board.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lines.map(({ station: name, distante: remote, etat: state, ton: your, dit: said, cooks }) => ({ nom: name, distante: remote, etat: state, ton: your, dit: said, cooks: cooks.map(({ ticket, station: itsOwnOne }) => `#${ticket} ${itsOwnOne}`) })),
      [
        { nom: "box/claude", distante: false, etat: "cooking", ton: "vert", dit: "", cooks: ["#14 box/claude"] },
        { nom: "mac/claude", distante: true, etat: "stopped", ton: "gris", dit: "by you, for 3 min · 1 cook finishing", cooks: ["#15 mac/claude"] },
        { nom: "atelier/claude", distante: false, etat: "refused", ton: "rouge", dit: REFUSAL.message, cooks: [] },
      ],
    );
  });

  test("refusée, la station dit pourquoi, et ce que le chef fait au survol ; elle n'a pas de bouton", () => {
    const [line] = readEntries([station("box/claude", { cuisson: "refused", refus: REFUSAL })]).tableau.stations?.lignes ?? [];
    assert.equal(line?.etat, "refused");
    assert.equal(line?.ton, "rouge");
    assert.equal(line?.dit, REFUSAL.message);
    assert.equal(line?.survol, REFUSAL.action);
  });

  test("arrêtée par le « stop » de toute la cuisine : ce n'est pas d'elle que l'arrêt vient — pas de bouton, la reprise est sur la bannière", () => {
    const [line] = readEntries([station("box/claude", { cuisson: "stopped", arreteeDepuis: null, cooks: [COOK_14] })]).tableau.stations?.lignes ?? [];
    assert.equal(line?.etat, "stopped");
    assert.equal(line?.dit, "the whole kitchen is stopped · 1 cook finishing");
  });

  test("d'un runtime d'avant `cuisson` : l'état n'est pas dit, aucun bouton, et ses cooks viennent de `facts.cooks`", () => {
    const oldOne: FactsStation = { station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: true };
    const { lignes: lines } = cookingOf([oldOne], [COOK_14, COOK_15], READ);
    assert.equal(lines[0]?.etat, "not given");
    assert.deepEqual(lines[0]?.cooks, [COOK_15]);
    // Et la forme d'avant se lit toujours : rien n'y manque.
    const { tableau: board } = readEntries([{ ...station("box/claude") }].map(({ cuisson: _c, arreteeDepuis: _a, refus: _r, cooks: _k, ...before }) => before as OfRuntime));
    assert.equal(board.stations?.lignes[0]?.etat, "not given");
  });

  test("un mot que l'app ne connaît pas se dit tel quel, sans couleur ni bouton", () => {
    const [line] = cookingOf([{ ...station("box/claude"), cuisson: "drained" }], [], READ).lignes;
    assert.equal(line?.etat, "drained");
    assert.equal(line?.ton, undefined);
  });

  test("un runtime qui ne donne pas les stations : rien n'est posé", () => {
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    assert.ok("tableau" in receivedOne);
    assert.equal(receivedOne.tableau.stations, undefined);
  });

  test("une station dont `cuisson` n'a pas la forme : `facts` n'est pas dessiné, et la vue dit pourquoi", () => {
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [{ ...station("box/claude"), cooks: "deux" }] }) }] });
    assert.ok("informe" in receivedOne);
    assert.match(receivedOne.informe, /stations\[0\]\.cooks/);
  });
});

describe("les stations lues d'un projet", () => {
  const STATIONS = [station("box/claude"), station("mac/claude", { distante: true })];

  test("les stations que l'app connaît sont celles des derniers `facts` du projet", () => {
    const { tenus: heldOnes } = readEntries(STATIONS);
    assert.deepEqual(heldOnes.stations("parade")?.map(({ station: name }) => name), ["box/claude", "mac/claude"]);
  });
});

describe("ce que chaque station fait tourner hors de ses cooks (#1971)", () => {
  type Agents = FactsOfRuntime["agents"];
  // Une lecture de `facts` qui porte ces stations, ces agents et ce rail.
  function readWith(stations: OfRuntime[], agents: Agents | undefined, rail: Facts["rail"] = []) {
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: READ, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, rail, stations, ...(agents === undefined ? {} : { agents }) }) }] });
    assert.ok("tableau" in receivedOne, "titre" in receivedOne ? receivedOne.titre : "");
    return (receivedOne.tableau.stations ?? assert.fail("pas de stations")).lignes;
  }
  const RAIL_15: Facts["rail"] = [{ ticket: 15, etat: "en pass", titre: "La carte des desserts", url: "https://exemple.test/15", activite: { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: "2026-10-20T10:01:11.000Z" }, attente: null }];

  test("la pass, le manager et le closer vont sur la station qui les fait tourner, avec le titre du rail, ce qu'ils font et depuis combien de temps ; une station qui n'en fait tourner aucun n'en a pas", () => {
    const lines = readWith(
      [station("box/claude"), station("mac/claude", { distante: true })],
      [
        { role: "pass", station: "box/claude", ticket: 15, fait: "running the gates", depuis: "2026-10-20T10:01:11.000Z" },
        { role: "manager", station: "box/claude", ticket: 21, fait: "qualifying the issue", depuis: "2026-10-20T10:04:01.000Z" },
        { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T09:04:11.000Z" },
      ],
      RAIL_15,
    );
    assert.deepEqual(lines.map(({ station: name, agents }) => [name, agents]), [
      [
        "box/claude",
        [
          { role: "pass", ticket: 15, titre: "La carte des desserts", fait: "running the gates", depuis: "2026-10-20T10:01:11.000Z", pour: "3 min" },
          { role: "manager", ticket: 21, titre: "", fait: "qualifying the issue", depuis: "2026-10-20T10:04:01.000Z", pour: "10 s" },
          { role: "closer", ticket: null, titre: "", fait: "closing: cleaning up the project", depuis: "2026-10-20T09:04:11.000Z", pour: "1 h 00" },
        ],
      ],
      ["mac/claude", []],
    ]);
  });

  test("sans station nommée, ou nommée d'une station que le projet ne déclare pas, l'agent va sur sa première station d'ici ; un agent mal formé n'est pas lu, et le reste l'est", () => {
    const lines = readWith(
      [station("mac/claude", { distante: true }), station("box/claude")],
      [
        { role: "manager", station: null, ticket: 21, fait: "splitting the epic", depuis: "2026-10-20T10:04:01.000Z" },
        { role: "closer", station: "ailleurs/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T10:04:01.000Z" },
        // Ni rôle, ni heure lisible : écartés.
        { station: "box/claude", ticket: 3, fait: "judging", depuis: "2026-10-20T10:04:01.000Z" } as unknown as Agents[number],
        { role: "pass", station: "box/claude", ticket: 4, fait: "judging", depuis: "hier" },
      ],
    );
    assert.deepEqual(lines.map(({ station: name, agents }) => [name, agents.map(({ role }) => role)]), [["mac/claude", []], ["box/claude", ["manager", "closer"]]]);
  });

  test("d'un runtime d'avant `agents`, la pass se lit au rail : un ticket que la pass juge est sur la principale ; une livraison qui attend la pass ne la fait pas tourner", () => {
    const awaiting = { ...RAIL_15[0]!, ticket: 16, activite: { fait: "attend la pass", faitEn: "waiting for the pass", cible: null, depuis: "2026-10-20T10:01:11.000Z" } };
    const lines = readWith([station("box/claude")], undefined, [...RAIL_15, awaiting]);
    assert.deepEqual(lines[0]?.agents.map(({ role, ticket, fait: done }) => [role, ticket, done]), [["pass", 15, "running the gates"]]);
    // Un runtime qui dit `agents`, même vide, en dit seul : le rail n'ajoute rien.
    assert.deepEqual(readWith([station("box/claude")], [], RAIL_15)[0]?.agents, []);
  });

  test("les phases où la pass travaille sont celles du runtime, une pour une", () => {
    assert.deepEqual([...PASS_AT_THE_WORK].sort(), [...PASS_OF_RUNTIME].sort());
  });
});
