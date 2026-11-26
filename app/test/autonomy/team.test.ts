// L'équipe d'un projet (ticket 4029) : un badge par agent en tête de la vue du projet, son fil au clic, son niveau
// d'autonomie et ses gestes en attente — jouée avec la fixture (team-fixture.ts) dans la vue entière, puis le bloc seul
// devant un faux document, pour ce qu'une lecture ou un geste qui échoue y laisse. Le module des données
// (autonomy/source.js) est remplacé par un faux, comme la vue l'appelle : par l'objet `source`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { holdLTeam } from "../../src/vue/autonomy/team.js";
import { source, type Agent } from "../../src/vue/autonomy/source.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";
import { TEAM } from "./team-fixture.ts";

const LA_VRAIE = { ...source };
// Les lignes que le chef lit, telles que le bloc les écrit.
const INDISPONIBLE = "The agents not reached.";
const ILLISIBLE = "the agents' reading is not readable";
const AUCUN_ACTION = "No gesture yet.";
const NIVEAU_NON_CHANGE = (agent: string) => `${agent}'s level was not changed`;
const NON_APPROUVE = (agent: string) => `${agent}'s gesture was not approved`;
const SANS_LE_ACTION = "the app does not take this gesture yet";
const doc = { createElement: (balise: string) => new Faux(balise) };
const copie = (): Agent[] => structuredClone(TEAM);
const boutons = (racine: Faux) => racine.dessous("button");
const badgeDe = (racine: Faux, name: string): Faux => boutons(racine).find((pose) => pose.dataset.agent === name) ?? assert.fail(`pas de badge « ${name} »`);
const nomme = (racine: Faux, texte: string): Faux[] => boutons(racine).filter((pose) => pose.textContent === texte);

// La source remplacée : ce que `lire` rend (une fonction, pour un rejet), et chaque appel reçu.
function faux(lire: () => Promise<unknown>, { regler = async () => {}, approuver = async () => {} }: { regler?: () => Promise<void>; approuver?: () => Promise<void> } = {}) {
  const calls: unknown[][] = [];
  Object.assign(source, {
    lire: (...args: unknown[]) => (calls.push(["lire", ...args]), lire()),
    regler: (...args: unknown[]) => (calls.push(["regler", ...args]), regler()),
    approuver: (...args: unknown[]) => (calls.push(["approuver", ...args]), approuver()),
  });
  return calls;
}

async function bloc(project = "parade") {
  const cadre = new Faux("section");
  const team = holdLTeam(doc, cadre);
  team.lire(project);
  team.montrer(project);
  await repos();
  return { cadre, equipe: team };
}

test("the project view shows the fixture's agents at its top: supervisor and closer first, then manager, pass and each cook", async () => {
  faux(async () => copie());
  const facts = { etat: "ouverte", lu: "2026-10-13T10:04:11.000Z", dernierTick: "2026-10-13T10:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const demarrage = () => ({
    configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  assert.equal(vue.element("equipe-du-projet").hidden, true, "no project shown: no team");
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] }), demande: demandes.at(-1)?.args[0] as number });
  await repos();
  const team = vue.element("equipe-du-projet");
  assert.equal(team.hidden, false);
  assert.deepEqual(
    boutons(team).map((pose) => pose.dataset.agent),
    ["supervisor", "closer", "manager", "pass", "cook-4029", "cook-4032"],
  );
  const closer = badgeDe(team, "closer");
  // Une ligne (#4354) : son point, son nom, son état, ce qui attend l'OK du chef ; le reste est dans son fil.
  assert.equal(closer.textContent, "closeridle1 awaits your OK");
  assert.deepEqual(["supervisor", "manager", "cook-4032"].map((name) => badgeDe(team, name).dessous("span")[0]?.dataset.ton), ["gris", "bleu", "rouge"]);
  closer.click();
  const fil = team.dessous("section").find(({ className }) => className === "fil") ?? assert.fail("pas de fil");
  assert.ok(fil.textContent.includes("deleted 412 dead lines in runtime/src/retenue/ · 03:12 UTC"));
  assert.ok(fil.textContent.includes("closer: next pass in 3 h"));
  assert.ok(!badgeDe(team, "supervisor").textContent.includes("awaits your OK"), "nothing pending, nothing said");
  assert.equal(badgeDe(team, "cook-4032").dataset.etat, "casse", "a broken agent is marked");
  assert.equal(badgeDe(team, "cook-4029").dataset.etat, "");
});

test("a click opens the agent's thread under the badges, marks its badge, and a second click closes it", async () => {
  faux(async () => copie());
  const { cadre } = await bloc();
  assert.equal(cadre.hidden, false);
  badgeDe(cadre, "supervisor").click();
  assert.deepEqual(
    boutons(cadre).filter((pose) => pose.ariaExpanded === "true").map((pose) => pose.dataset.agent),
    ["supervisor"],
  );
  assert.deepEqual(
    boutons(cadre).filter((pose) => pose.className.includes("ouvert")).map((pose) => pose.dataset.agent),
    ["supervisor"],
  );
  const fil = cadre.dessous("section")[0] ?? assert.fail("pas de fil");
  assert.deepEqual(
    fil.dessous("li").map((line) => line.textContent),
    ["09:01 UTC · reran tests on 0de1ff5 (red for 10 min): green", "07:30 UTC · freed the zone of #4012 (no cook held it): #4013 taken"],
  );
  assert.ok(fil.textContent.includes("fixed by itself 12 · handed to the chef 1"));
  assert.equal(nomme(cadre, "OK").length, 0, "nothing pending: no OK");
  badgeDe(cadre, "supervisor").click();
  assert.equal(cadre.dessous("section").length, 0, "closed again");
  badgeDe(cadre, "cook-4029").click();
  assert.ok(cadre.textContent.includes(AUCUN_ACTION), "an agent with no gesture says so");
});

test("nothing published by the runtime: no team at the top; another project shown: hidden too", async () => {
  faux(async () => null);
  const cadre = new Faux("section");
  cadre.hidden = false;
  const team = holdLTeam(doc, cadre);
  assert.equal(cadre.hidden, true, "hidden before any reading");
  team.lire("parade");
  team.montrer("parade");
  await repos();
  assert.equal(cadre.hidden, true);
  faux(async () => copie());
  team.lire("parade");
  await repos();
  assert.equal(cadre.hidden, false);
  team.montrer("carnet");
  assert.equal(cadre.hidden, true, "the team of parade is not carnet's");
  team.montrer(undefined);
  assert.equal(cadre.hidden, true);
});

test("a reading that fails says it in one line, its detail on hover", async () => {
  faux(async () => {
    throw new Error("ssh: box unreachable");
  });
  const { cadre } = await bloc();
  assert.equal(cadre.hidden, false);
  assert.equal(cadre.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
  assert.ok(cadre.textContent.startsWith(INDISPONIBLE));
  assert.ok(!cadre.textContent.includes("ssh: box unreachable"), "no raw error on screen");
  assert.ok(cadre.dessous("button").some((aide) => aide.ariaLabel === "ssh: box unreachable"), "its detail on hover");
});

test("a reading that is not an agents list, or an agent missing a field, is said not readable: nothing is invented", async () => {
  for (const lue of [{ agents: [] }, [{ ...copie()[0], state: undefined }], [{ ...copie()[0], counters: { fixedBySelf: 1 } }]]) {
    faux(async () => lue);
    const { cadre } = await bloc();
    assert.equal(cadre.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
    assert.ok(cadre.textContent.startsWith(ILLISIBLE), JSON.stringify(lue));
  }
});

test("a reading of the project left behind is not shown on the next one", async () => {
  let rendre: (lus: unknown) => void = () => {};
  faux(() => new Promise((fin) => (rendre = fin)));
  const cadre = new Faux("section");
  const team = holdLTeam(doc, cadre);
  team.lire("parade");
  const first = rendre;
  await repos();
  faux(async () => null);
  team.lire("carnet");
  team.montrer("carnet");
  await repos();
  first(copie());
  await repos();
  assert.equal(cadre.hidden, true);
  assert.equal(cadre.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
});

test("a level is set once, even clicked twice while it goes; the current level is not set again", async () => {
  let finir: () => void = () => {};
  const calls = faux(async () => copie(), { regler: () => new Promise((fin) => (finir = fin)) });
  const { cadre } = await bloc();
  badgeDe(cadre, "closer").click();
  (nomme(cadre, "propose")[0] ?? assert.fail()).click();
  const act = nomme(cadre, "act")[0] ?? assert.fail();
  act.click();
  await repos();
  assert.equal(nomme(cadre, "act")[0]?.disabled, true, "disabled while it goes");
  act.click();
  await repos();
  finir();
  await repos();
  assert.deepEqual(
    calls.filter(([action]) => action === "regler"),
    [["regler", "closer", "act", "parade"]],
  );
  assert.equal(nomme(cadre, "act")[0]?.ariaPressed, "true");
  assert.equal(nomme(cadre, "act")[0]?.disabled, false);
});

test("a level the runtime refuses leaves the level as it was and says it in one line", async () => {
  faux(async () => copie(), {
    regler: async () => {
      throw new Error("runtime: unknown agent");
    },
  });
  const { cadre } = await bloc();
  badgeDe(cadre, "closer").click();
  (nomme(cadre, "act")[0] ?? assert.fail()).click();
  await repos();
  assert.equal(nomme(cadre, "propose")[0]?.ariaPressed, "true");
  assert.equal(nomme(cadre, "act")[0]?.ariaPressed, "false");
  assert.ok(cadre.textContent.includes(NIVEAU_NON_CHANGE("closer")));
  assert.equal(cadre.dessous("p").find((line) => line.textContent.startsWith(NIVEAU_NON_CHANGE("closer")))?.role, "alert", "a failed gesture is read out at once");
  assert.ok(cadre.dessous("button").some((aide) => aide.ariaLabel === "runtime: unknown agent"), "its detail on hover");
  assert.equal(nomme(cadre, "propose")[0]?.ariaPressed, "true", "the level kept, in its thread");
});

test("an approval that fails keeps the gesture pending, with its OK, and says it; one that goes removes it", async () => {
  let echoue = true;
  const calls = faux(async () => copie(), {
    approuver: async () => {
      if (echoue) throw new Error("runtime: gesture expired");
    },
  });
  const { cadre } = await bloc();
  badgeDe(cadre, "closer").click();
  (nomme(cadre, "OK")[0] ?? assert.fail()).click();
  await repos();
  assert.equal(nomme(cadre, "OK").length, 1);
  assert.ok(cadre.textContent.includes("delete 180 dead lines in runtime/src/rail.ts"));
  assert.ok(cadre.textContent.includes(NON_APPROUVE("closer")));
  echoue = false;
  const ok = nomme(cadre, "OK")[0] ?? assert.fail();
  ok.click();
  ok.click();
  await repos();
  assert.deepEqual(
    calls.filter(([action]) => action === "approuver"),
    [
      ["approuver", "closer", "p-1", "parade"],
      ["approuver", "closer", "p-1", "parade"],
    ],
    "one failed call, then one call for two clicks",
  );
  assert.equal(nomme(cadre, "OK").length, 0);
  assert.ok(!cadre.textContent.includes(NON_APPROUVE("closer")));
  assert.ok(!badgeDe(cadre, "closer").textContent.includes("awaits your OK"));
});

test("the real source reads the agents through the bridge, null when the bridge has none, and a gesture it does not carry is refused", async () => {
  Object.assign(source, LA_VRAIE);
  const recus: unknown[][] = [];
  const pont: Record<string, unknown> = {};
  Object.assign(globalThis, { window: { brigade: pont } });
  assert.equal(await source.lire("parade"), null);
  await assert.rejects(source.regler("closer", "act", "parade"), { message: SANS_LE_ACTION });
  await assert.rejects(source.approuver("closer", "p-1", "parade"), { message: SANS_LE_ACTION });
  Object.assign(pont, {
    lireLesAgents: async (...args: unknown[]) => (recus.push(["lire", ...args]), undefined),
  });
  assert.equal(await source.lire("parade"), null);
  Object.assign(pont, {
    lireLesAgents: async (...args: unknown[]) => (recus.push(["lire", ...args]), copie()),
    reglerLAutonomie: async (...args: unknown[]) => void recus.push(["regler", ...args]),
    approuverLeGeste: async (...args: unknown[]) => void recus.push(["approuver", ...args]),
  });
  assert.deepEqual(await source.lire("parade"), copie());
  await source.regler("closer", "act", "parade");
  await source.approuver("closer", "p-1", "parade");
  assert.deepEqual(recus, [
    ["lire", "parade"],
    ["lire", "parade"],
    ["regler", "parade", "closer", "act"],
    ["approuver", "parade", "closer", "p-1"],
  ]);
});
