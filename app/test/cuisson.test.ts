// La cuisine d'un projet, station par station (#1185) : ce que `facts` dit de chaque station (#1183) devient sa
// ligne de l'onglet Cooks — son mot, ce qu'il veut dire, ses cooks, le geste de son bouton — et la ligne d'alerte de
// l'onglet Rail ; le bouton joue `station stop|start <station>` là où la cuisine du projet tourne, la box comme le Mac.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import type { Lu, Rendu } from "../src/box.ts";
import { cuireSurLaStation, cuissonDe } from "../src/cuisson.ts";
import { tenirFaits, type Faits } from "../src/faits.ts";
import type { StationDesFaits } from "../src/ordinaires.ts";

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
const REFUS = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself." };

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

describe("le bouton d'une station joue `station stop|start <station>`", () => {
  const STATIONS = [station("box/claude"), station("mac/claude", { distante: true })];
  const BOX: Lu = { nom: "parade", cuisine: { hote: "box" } };
  const ICI: Lu = { nom: "parade", cuisine: { locale: { node: "/usr/bin/node", runtime: "/Applications/brigade/runtime", racine: "/Users/chef/.brigade", env: {} } } };
  const lances: { lu: Lu; commande: string }[] = [];
  const reussi = (sortie: string) => async (lu: Lu, commande: string): Promise<Rendu> => {
    lances.push({ lu, commande });
    return { lance: `$ brigade parade ${commande}`, erreur: null, sortie, erreurs: "" };
  };

  test("arrêter une station distante, depuis une cuisine sur sa box : la commande part par la box, et dit ce qu'elle a fait", async () => {
    lances.length = 0;
    const rendu = await cuireSurLaStation("parade", BOX, STATIONS, "mac/claude", "stop", reussi("brigade : mac/claude: stopped — it takes no more tickets of this project, its 1 running cook finishes\n"));
    assert.deepEqual(lances, [{ lu: BOX, commande: "station stop mac/claude" }]);
    assert.ok("fait" in rendu);
    assert.equal(rendu.fait, "mac/claude stops cooking parade: it takes no more tickets, its running cooks finish");
    assert.match(rendu.detail ?? "", /mac\/claude: stopped/);
  });

  test("relancer la station du Mac, la cuisine tournant sur ce Mac : la même commande, lancée ici", async () => {
    lances.length = 0;
    const rendu = await cuireSurLaStation("parade", ICI, STATIONS, "box/claude", "start", reussi("brigade : box/claude: cooking\n"));
    assert.deepEqual(lances, [{ lu: ICI, commande: "station start box/claude" }]);
    assert.ok("fait" in rendu);
    assert.equal(rendu.fait, "box/claude cooks parade again: it takes its tickets at the runtime's next read");
  });

  test("le runtime refuse : la ligne le dit, sans code ni commande, et ce qu'il a répondu est au survol", async () => {
    const rendu = await cuireSurLaStation("parade", BOX, STATIONS, "mac/claude", "stop", async () => ({ lance: "$ ssh box brigade parade station stop mac/claude", erreur: Object.assign(new Error("exit 1"), { code: 1 }) as ExecFileException, sortie: "", erreurs: "brigade : unknown station\n" }));
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "mac/claude did not stop: the runtime did not take it — nothing was changed");
    assert.match(rendu.detail ?? "", /unknown station/);
  });

  test("rien ne part pour un geste, une station ou un projet que l'app ne connaît pas", async () => {
    lances.length = 0;
    const jamais = reussi("");
    assert.deepEqual(await cuireSurLaStation("parade", BOX, STATIONS, "mac/claude", "restart", jamais), { refus: "nothing was sent: “restart” is neither start nor stop" });
    assert.deepEqual(await cuireSurLaStation("parade", BOX, STATIONS, "autre/claude", "stop", jamais), { refus: "nothing was sent: “autre/claude” is not one of parade's stations" });
    assert.deepEqual(await cuireSurLaStation("parade", BOX, [station("box/claude; rm -rf /")], "box/claude; rm -rf /", "stop", jamais), { refus: "nothing was sent: “box/claude; rm -rf /” is not one of parade's stations" });
    assert.deepEqual(await cuireSurLaStation("parade", BOX, undefined, "mac/claude", "stop", jamais), { refus: "nothing was sent: parade's stations are not read yet" });
    assert.deepEqual(await cuireSurLaStation("parade", undefined, STATIONS, "mac/claude", "stop", jamais), { refus: "nothing was sent: “parade” has no station — there is no command to run" });
    assert.deepEqual(lances, []);
  });

  test("les stations que le bouton connaît sont celles des derniers `facts` du projet", () => {
    const { tenus } = lues(STATIONS);
    assert.deepEqual(tenus.stations("parade")?.map(({ station: nom }) => nom), ["box/claude", "mac/claude"]);
  });
});
