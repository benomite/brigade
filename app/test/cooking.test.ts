// La cuisine d'un projet, station par station (#1185) : ce que `facts` dit de chaque station (#1183) devient sa
// ligne de l'onglet Cooks — son mot, ce qu'il veut dire, ses cooks, le geste de son bouton — et la ligne d'alerte de
// l'onglet Rail. Le bouton ne part plus de l'app (#2061) : aucune box ne lit plus de tableau de la cuisine.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FactsDuRuntime } from "../../runtime/src/etat.ts";
import { PASS_A_L_OUVRAGE as PASS_DU_RUNTIME } from "../../runtime/src/activites.ts";
import { ABSENTE, cookingDe, PASS_A_L_OUVRAGE } from "../src/cooking.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import type { FactsStation } from "../src/ordinaires.ts";

const LU = "2026-10-20T10:04:11.000Z";
type DuRuntime = FactsDuRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts), mot pour mot.
const station = (name: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({
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
  ...plus,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const REFUSAL = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };

const FACTS: Facts = {
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 0, auTravail: 2, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [COOK_14, COOK_15],
};
// Ce que la vue reçoit d'une lecture de `facts` qui porte ces stations.
function lues(stations: DuRuntime[]) {
  const tenus = holdFacts();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations }) }] });
  assert.ok("tableau" in recue, "titre" in recue ? recue.titre : "");
  return { tenus, tableau: recue.tableau };
}

describe("une station distante que la principale ne voit pas (#1830)", () => {
  test("absente, elle ne se lit jamais « cooking » : « not cooking », grise, son bouton d'arrêt gardé ; arrêtée, elle reste arrêtée ; présente, elle cuit — et ce qu'elle fournit, sa présence et sa dernière demande passent tels quels", () => {
    const { tableau } = lues([
      station("box/claude", { fournit: ["code"], presente: true, vueLe: null }),
      station("mac/claude", { distante: true, fournit: ["code", "macos"], presente: false, vueLe: null }),
      station("pc/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", presente: false, vueLe: "2026-10-20T09:00:00.000Z" }),
      station("mini/claude", { distante: true, presente: true, vueLe: "2026-10-20T10:04:00.000Z" }),
      // Un runtime d'avant ces champs : rien n'est dit de sa présence, son mot est pris tel quel.
      station("vieux/claude", { distante: true }),
    ]);
    const lines = tableau.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lines.map(({ station: name, etat: state, ton, fournit, presente, vueLe }) => ({ nom: name, etat: state, ton, fournit, presente, vueLe })),
      [
        { nom: "box/claude", etat: "cooking", ton: "vert", fournit: ["code"], presente: true, vueLe: null },
        { nom: "mac/claude", etat: ABSENTE.etat, ton: "gris", fournit: ["code", "macos"], presente: false, vueLe: null },
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
    const { tableau } = lues([
      station("box/claude", { cooks: [COOK_14] }),
      station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", cooks: [COOK_15] }),
      station("atelier/claude", { cuisson: "refused", refus: REFUSAL }),
    ]);
    const lines = tableau.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lines.map(({ station: name, distante: remote, etat: state, ton, dit, cooks }) => ({ nom: name, distante: remote, etat: state, ton, dit, cooks: cooks.map(({ ticket, station: sienne }) => `#${ticket} ${sienne}`) })),
      [
        { nom: "box/claude", distante: false, etat: "cooking", ton: "vert", dit: "", cooks: ["#14 box/claude"] },
        { nom: "mac/claude", distante: true, etat: "stopped", ton: "gris", dit: "by you, for 3 min · 1 cook finishing", cooks: ["#15 mac/claude"] },
        { nom: "atelier/claude", distante: false, etat: "refused", ton: "rouge", dit: REFUSAL.message, cooks: [] },
      ],
    );
  });

  test("refusée, la station dit pourquoi, et ce que le chef fait au survol ; elle n'a pas de bouton", () => {
    const [line] = lues([station("box/claude", { cuisson: "refused", refus: REFUSAL })]).tableau.stations?.lignes ?? [];
    assert.equal(line?.etat, "refused");
    assert.equal(line?.ton, "rouge");
    assert.equal(line?.dit, REFUSAL.message);
    assert.equal(line?.survol, REFUSAL.action);
  });

  test("arrêtée par le « stop » de toute la cuisine : ce n'est pas d'elle que l'arrêt vient — pas de bouton, la reprise est sur la bannière", () => {
    const [line] = lues([station("box/claude", { cuisson: "stopped", arreteeDepuis: null, cooks: [COOK_14] })]).tableau.stations?.lignes ?? [];
    assert.equal(line?.etat, "stopped");
    assert.equal(line?.dit, "the whole kitchen is stopped · 1 cook finishing");
  });

  test("d'un runtime d'avant `cuisson` : l'état n'est pas dit, aucun bouton, et ses cooks viennent de `facts.cooks`", () => {
    const ancienne: FactsStation = { station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: true };
    const { lignes: lines } = cookingDe([ancienne], [COOK_14, COOK_15], LU);
    assert.equal(lines[0]?.etat, "not given");
    assert.deepEqual(lines[0]?.cooks, [COOK_15]);
    // Et la forme d'avant se lit toujours : rien n'y manque.
    const { tableau } = lues([{ ...station("box/claude") }].map(({ cuisson: _c, arreteeDepuis: _a, refus: _r, cooks: _k, ...avant }) => avant as DuRuntime));
    assert.equal(tableau.stations?.lignes[0]?.etat, "not given");
  });

  test("un mot que l'app ne connaît pas se dit tel quel, sans couleur ni bouton", () => {
    const [line] = cookingDe([{ ...station("box/claude"), cuisson: "drained" }], [], LU).lignes;
    assert.equal(line?.etat, "drained");
    assert.equal(line?.ton, undefined);
  });

  test("un runtime qui ne donne pas les stations : rien n'est posé", () => {
    const tenus = holdFacts();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    assert.ok("tableau" in recue);
    assert.equal(recue.tableau.stations, undefined);
  });

  test("une station dont `cuisson` n'a pas la forme : `facts` n'est pas dessiné, et la vue dit pourquoi", () => {
    const tenus = holdFacts();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [{ ...station("box/claude"), cooks: "deux" }] }) }] });
    assert.ok("informe" in recue);
    assert.match(recue.informe, /stations\[0\]\.cooks/);
  });
});

describe("les stations lues d'un projet", () => {
  const STATIONS = [station("box/claude"), station("mac/claude", { distante: true })];

  test("les stations que l'app connaît sont celles des derniers `facts` du projet", () => {
    const { tenus } = lues(STATIONS);
    assert.deepEqual(tenus.stations("parade")?.map(({ station: name }) => name), ["box/claude", "mac/claude"]);
  });
});

describe("ce que chaque station fait tourner hors de ses cooks (#1971)", () => {
  type Agents = FactsDuRuntime["agents"];
  // Une lecture de `facts` qui porte ces stations, ces agents et ce rail.
  function luesAvec(stations: DuRuntime[], agents: Agents | undefined, rail: Facts["rail"] = []) {
    const tenus = holdFacts();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, rail, stations, ...(agents === undefined ? {} : { agents }) }) }] });
    assert.ok("tableau" in recue, "titre" in recue ? recue.titre : "");
    return (recue.tableau.stations ?? assert.fail("pas de stations")).lignes;
  }
  const RAIL_15: Facts["rail"] = [{ ticket: 15, etat: "en pass", titre: "La carte des desserts", url: "https://exemple.test/15", activite: { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: "2026-10-20T10:01:11.000Z" }, attente: null }];

  test("la pass, le manager et le closer vont sur la station qui les fait tourner, avec le titre du rail, ce qu'ils font et depuis combien de temps ; une station qui n'en fait tourner aucun n'en a pas", () => {
    const lines = luesAvec(
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
    const lines = luesAvec(
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
    const lines = luesAvec([station("box/claude")], undefined, [...RAIL_15, awaiting]);
    assert.deepEqual(lines[0]?.agents.map(({ role, ticket, fait }) => [role, ticket, fait]), [["pass", 15, "running the gates"]]);
    // Un runtime qui dit `agents`, même vide, en dit seul : le rail n'ajoute rien.
    assert.deepEqual(luesAvec([station("box/claude")], [], RAIL_15)[0]?.agents, []);
  });

  test("les phases où la pass travaille sont celles du runtime, une pour une", () => {
    assert.deepEqual([...PASS_A_L_OUVRAGE].sort(), [...PASS_DU_RUNTIME].sort());
  });
});
