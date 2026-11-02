// La cuisine d'un projet, station par station (#1185) : ce que `facts` dit de chaque station (#1183) devient sa
// ligne de l'onglet Cooks — son mot, ce qu'il veut dire, ses cooks, le geste de son bouton — et la ligne d'alerte de
// l'onglet Rail ; le bouton poste `/brigade station stop|start <station>` sur le tableau de la cuisine du projet, que sa
// box ou ce Mac joue (#1845).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { PASS_A_L_OUVRAGE as PASS_DU_RUNTIME } from "../../runtime/src/activites.ts";
import { ABSENTE, cuireSurLaStation, cuissonDe, PASS_A_L_OUVRAGE } from "../src/cuisson.ts";
import { tenirFaits, type Faits } from "../src/faits.ts";
import type { StationDesFaits } from "../src/ordinaires.ts";
import type { DecisionDuChef, EtatDuGeste } from "../src/tableau-gestes/gestes.ts";

const LU = "2026-10-20T10:04:11.000Z";
type DuRuntime = FaitsDuRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts), mot pour mot.
const station = (nom: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({
  station: nom,
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
const REFUS = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };

const FAITS: Faits = {
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
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
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
    const lignes = tableau.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lignes.map(({ station: nom, etat, ton, geste, fournit, presente, vueLe }) => ({ nom, etat, ton, geste, fournit, presente, vueLe })),
      [
        { nom: "box/claude", etat: "cooking", ton: "vert", geste: "stop", fournit: ["code"], presente: true, vueLe: null },
        { nom: "mac/claude", etat: ABSENTE.etat, ton: "gris", geste: "stop", fournit: ["code", "macos"], presente: false, vueLe: null },
        { nom: "pc/claude", etat: "stopped", ton: "gris", geste: "start", fournit: undefined, presente: false, vueLe: "2026-10-20T09:00:00.000Z" },
        { nom: "mini/claude", etat: "cooking", ton: "vert", geste: "stop", fournit: undefined, presente: true, vueLe: "2026-10-20T10:04:00.000Z" },
        { nom: "vieux/claude", etat: "cooking", ton: "vert", geste: "stop", fournit: undefined, presente: undefined, vueLe: undefined },
      ],
    );
    assert.match(lignes[1]?.survol ?? "", /does not see it: it takes no ticket until it shows itself/);
  });
});

describe("les stations du projet, ligne par ligne", () => {
  test("chaque station dit son mot, ses cooks, et le geste de son bouton : stop quand elle cuit, start quand le chef l'a arrêtée", () => {
    const { tableau } = lues([
      station("box/claude", { cooks: [COOK_14] }),
      station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", cooks: [COOK_15] }),
      station("atelier/claude", { cuisson: "saturated" }),
    ]);
    const lignes = tableau.stations?.lignes ?? assert.fail("pas de stations");
    assert.deepEqual(
      lignes.map(({ station: nom, distante, etat, ton, dit, cooks, geste }) => ({ nom, distante, etat, ton, dit, cooks: cooks.map(({ ticket, station: sienne }) => `#${ticket} ${sienne}`), geste })),
      [
        { nom: "box/claude", distante: false, etat: "cooking", ton: "vert", dit: "", cooks: ["#14 box/claude"], geste: "stop" },
        { nom: "mac/claude", distante: true, etat: "stopped", ton: "gris", dit: "by you, for 3 min · 1 cook finishing", cooks: ["#15 mac/claude"], geste: "start" },
        { nom: "atelier/claude", distante: false, etat: "saturated", ton: "jaune", dit: "its machine has no room", cooks: [], geste: "stop" },
      ],
    );
  });

  test("refusée, la station dit pourquoi, et ce que le chef fait au survol ; elle n'a pas de bouton", () => {
    const [ligne] = lues([station("box/claude", { cuisson: "refused", refus: REFUS })]).tableau.stations?.lignes ?? [];
    assert.equal(ligne?.etat, "refused");
    assert.equal(ligne?.ton, "rouge");
    assert.equal(ligne?.dit, REFUS.message);
    assert.equal(ligne?.survol, REFUS.action);
    assert.equal(ligne?.geste, null);
  });

  test("arrêtée par le « stop » de toute la cuisine : ce n'est pas d'elle que l'arrêt vient — pas de bouton, la reprise est sur la bannière", () => {
    const [ligne] = lues([station("box/claude", { cuisson: "stopped", arreteeDepuis: null, cooks: [COOK_14] })]).tableau.stations?.lignes ?? [];
    assert.equal(ligne?.etat, "stopped");
    assert.equal(ligne?.dit, "the whole kitchen is stopped · 1 cook finishing");
    assert.equal(ligne?.geste, null);
  });

  test("d'un runtime d'avant `cuisson` : l'état n'est pas dit, aucun bouton, et ses cooks viennent de `facts.cooks`", () => {
    const ancienne: StationDesFaits = { station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: true };
    const { lignes } = cuissonDe([ancienne], [COOK_14, COOK_15], LU);
    assert.equal(lignes[0]?.etat, "not given");
    assert.equal(lignes[0]?.geste, null);
    assert.deepEqual(lignes[0]?.cooks, [COOK_15]);
    // Et la forme d'avant se lit toujours : rien n'y manque.
    const { tableau } = lues([{ ...station("box/claude") }].map(({ cuisson: _c, arreteeDepuis: _a, refus: _r, cooks: _k, ...avant }) => avant as DuRuntime));
    assert.equal(tableau.stations?.lignes[0]?.etat, "not given");
  });

  test("un mot que l'app ne connaît pas se dit tel quel, sans couleur ni bouton", () => {
    const [ligne] = cuissonDe([{ ...station("box/claude"), cuisson: "drained" }], [], LU).lignes;
    assert.equal(ligne?.etat, "drained");
    assert.equal(ligne?.ton, undefined);
    assert.equal(ligne?.geste, null);
  });

  test("un runtime qui ne donne pas les stations : rien n'est posé", () => {
    const tenus = tenirFaits();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    assert.ok("tableau" in recue);
    assert.equal(recue.tableau.stations, undefined);
  });

  test("une station dont `cuisson` n'a pas la forme : `facts` n'est pas dessiné, et la vue dit pourquoi", () => {
    const tenus = tenirFaits();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [{ ...station("box/claude"), cooks: "deux" }] }) }] });
    assert.ok("informe" in recue);
    assert.match(recue.informe, /stations\[0\]\.cooks/);
  });
});

describe("la ligne d'alerte de l'onglet Rail", () => {
  test("rien ne demande de geste : pas de ligne", () => {
    assert.equal(lues([station("box/claude"), station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: LU })]).tableau.stations?.alerte, null);
  });

  test("une station saturée, une qui refuse le projet : une seule ligne, qui les dit", () => {
    assert.equal(lues([station("box/claude", { cuisson: "saturated" })]).tableau.stations?.alerte, "box/claude is saturated: it takes no ticket until its machine has room");
    assert.equal(
      lues([station("box/claude", { cuisson: "refused", refus: REFUS })]).tableau.stations?.alerte,
      "box/claude refuses the project: This computer cannot run the project's cooks in Claude Code's sandbox",
    );
    assert.equal(
      lues([station("box/claude", { cuisson: "saturated" }), station("atelier/claude", { cuisson: "refused", refus: REFUS }), station("mac/claude", { distante: true })]).tableau.stations?.alerte,
      "box/claude is saturated: it takes no ticket until its machine has room — and 1 more station",
    );
  });
});

describe("le bouton d'une station poste `/brigade station stop|start <station>` sur le tableau", () => {
  const STATIONS = [station("box/claude"), station("mac/claude", { distante: true })];
  const COMMENTAIRE = { id: 7001, url: "https://github.com/chef/parade/issues/9#issuecomment-7001" };
  const postees: DecisionDuChef[] = [];
  // Le tableau, doublé : la décision postée est notée, et la box y répond comme `reponse` le dit.
  const auTableau = (etat: "taken" | "refused" | "pending" | "failed", reponse = "") => async (decision: DecisionDuChef): Promise<EtatDuGeste> => {
    postees.push(decision);
    if (etat === "failed") return { etat, raison: "The gesture could not be posted on the Kitchen board of chef/parade: HTTP 502 Bad Gateway." };
    if (etat === "pending") return { etat, commentaire: COMMENTAIRE };
    return { etat, commentaire: COMMENTAIRE, reponse, lu: { commentaire: COMMENTAIRE.id, url: COMMENTAIRE.url, le: LU, geste: "station", ticket: null, etat: etat === "taken" ? "pris" : "refuse", traiteLe: LU, reponse } };
  };

  test("arrêter une station : le geste part sur le tableau, et la ligne dit ce que la box a fait, sa réponse au survol", async () => {
    postees.length = 0;
    const rendu = await cuireSurLaStation("parade", STATIONS, "mac/claude", "stop", auTableau("taken", `**Done** — [station stop mac/claude](${COMMENTAIRE.url}): mac/claude: stopped — it takes no more tickets of this project, its 1 running cook finishes — cost: none: only the log is written`));
    assert.deepEqual(postees, [{ geste: "station", action: "stop", station: "mac/claude" }]);
    assert.ok("fait" in rendu);
    assert.equal(rendu.fait, "mac/claude stops cooking parade: it takes no more tickets, its running cooks finish");
    assert.equal(rendu.detail, `mac/claude: stopped — it takes no more tickets of this project, its 1 running cook finishes\n${COMMENTAIRE.url}`);
  });

  test("relancer une station : le même geste, `start`", async () => {
    postees.length = 0;
    const rendu = await cuireSurLaStation("parade", STATIONS, "box/claude", "start", auTableau("taken", "**Done** — [station start box/claude](…): box/claude: cooking — cost: none: only the log is written"));
    assert.deepEqual(postees, [{ geste: "station", action: "start", station: "box/claude" }]);
    assert.ok("fait" in rendu);
    assert.equal(rendu.fait, "box/claude cooks parade again: it takes its tickets at the runtime's next read");
  });

  test("la box refuse : la ligne le dit, sans code ni commande, et ce qu'elle a répondu est au survol", async () => {
    const rendu = await cuireSurLaStation("parade", STATIONS, "mac/claude", "stop", auTableau("refused", "**Not done** — [station stop mac/claude](…): unknown station"));
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "mac/claude did not stop: the box did not take it — nothing was changed");
    assert.match(rendu.detail ?? "", /^unknown station\n/);
  });

  test("la box n'a pas encore lu le geste : il est posté, la ligne le dit ; GitHub qui refuse : rien n'est parti", async () => {
    const posee = await cuireSurLaStation("parade", STATIONS, "mac/claude", "stop", auTableau("pending"));
    assert.deepEqual(posee, { fait: "posted on the Kitchen board: mac/claude stops cooking parade at the box's next tick", detail: COMMENTAIRE.url });
    const refusee = await cuireSurLaStation("parade", STATIONS, "mac/claude", "stop", auTableau("failed"));
    assert.deepEqual(refusee, { refus: "nothing was sent: the gesture could not be posted on the Kitchen board of chef/parade: HTTP 502 Bad Gateway" });
  });

  test("rien ne part pour un geste ou une station que l'app ne connaît pas, ni avant que les stations soient lues", async () => {
    postees.length = 0;
    const jamais = auTableau("taken");
    assert.deepEqual(await cuireSurLaStation("parade", STATIONS, "mac/claude", "restart", jamais), { refus: "nothing was sent: “restart” is neither start nor stop" });
    assert.deepEqual(await cuireSurLaStation("parade", STATIONS, "autre/claude", "stop", jamais), { refus: "nothing was sent: “autre/claude” is not one of parade's stations" });
    assert.deepEqual(await cuireSurLaStation("parade", [station("box/claude; rm -rf /")], "box/claude; rm -rf /", "stop", jamais), { refus: "nothing was sent: “box/claude; rm -rf /” is not one of parade's stations" });
    assert.deepEqual(await cuireSurLaStation("parade", undefined, "mac/claude", "stop", jamais), { refus: "nothing was sent: parade's stations are not read yet" });
    assert.deepEqual(postees, []);
  });

  test("les stations que le bouton connaît sont celles des derniers `facts` du projet", () => {
    const { tenus } = lues(STATIONS);
    assert.deepEqual(tenus.stations("parade")?.map(({ station: nom }) => nom), ["box/claude", "mac/claude"]);
  });
});

describe("ce que chaque station fait tourner hors de ses cooks (#1971)", () => {
  type Agents = FaitsDuRuntime["agents"];
  // Une lecture de `facts` qui porte ces stations, ces agents et ce rail.
  function luesAvec(stations: DuRuntime[], agents: Agents | undefined, rail: Faits["rail"] = []) {
    const tenus = tenirFaits();
    const recue = tenus.recevoir({ projet: "parade", demande: 0, a: LU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, rail, stations, ...(agents === undefined ? {} : { agents }) }) }] });
    assert.ok("tableau" in recue, "titre" in recue ? recue.titre : "");
    return (recue.tableau.stations ?? assert.fail("pas de stations")).lignes;
  }
  const RAIL_15: Faits["rail"] = [{ ticket: 15, etat: "en pass", titre: "La carte des desserts", url: "https://exemple.test/15", activite: { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: "2026-10-20T10:01:11.000Z" }, attente: null }];

  test("la pass, le manager et le closer vont sur la station qui les fait tourner, avec le titre du rail, ce qu'ils font et depuis combien de temps ; une station qui n'en fait tourner aucun n'en a pas", () => {
    const lignes = luesAvec(
      [station("box/claude"), station("mac/claude", { distante: true })],
      [
        { role: "pass", station: "box/claude", ticket: 15, fait: "running the gates", depuis: "2026-10-20T10:01:11.000Z" },
        { role: "manager", station: "box/claude", ticket: 21, fait: "qualifying the issue", depuis: "2026-10-20T10:04:01.000Z" },
        { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T09:04:11.000Z" },
      ],
      RAIL_15,
    );
    assert.deepEqual(lignes.map(({ station: nom, agents }) => [nom, agents]), [
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
    const lignes = luesAvec(
      [station("mac/claude", { distante: true }), station("box/claude")],
      [
        { role: "manager", station: null, ticket: 21, fait: "splitting the epic", depuis: "2026-10-20T10:04:01.000Z" },
        { role: "closer", station: "ailleurs/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T10:04:01.000Z" },
        // Ni rôle, ni heure lisible : écartés.
        { station: "box/claude", ticket: 3, fait: "judging", depuis: "2026-10-20T10:04:01.000Z" } as unknown as Agents[number],
        { role: "pass", station: "box/claude", ticket: 4, fait: "judging", depuis: "hier" },
      ],
    );
    assert.deepEqual(lignes.map(({ station: nom, agents }) => [nom, agents.map(({ role }) => role)]), [["mac/claude", []], ["box/claude", ["manager", "closer"]]]);
  });

  test("d'un runtime d'avant `agents`, la pass se lit au rail : un ticket que la pass juge est sur la principale ; une livraison qui attend la pass ne la fait pas tourner", () => {
    const attend = { ...RAIL_15[0]!, ticket: 16, activite: { fait: "attend la pass", faitEn: "waiting for the pass", cible: null, depuis: "2026-10-20T10:01:11.000Z" } };
    const lignes = luesAvec([station("box/claude")], undefined, [...RAIL_15, attend]);
    assert.deepEqual(lignes[0]?.agents.map(({ role, ticket, fait }) => [role, ticket, fait]), [["pass", 15, "running the gates"]]);
    // Un runtime qui dit `agents`, même vide, en dit seul : le rail n'ajoute rien.
    assert.deepEqual(luesAvec([station("box/claude")], [], RAIL_15)[0]?.agents, []);
  });

  test("les phases où la pass travaille sont celles du runtime, une pour une", () => {
    assert.deepEqual([...PASS_A_L_OUVRAGE].sort(), [...PASS_DU_RUNTIME].sort());
  });
});
