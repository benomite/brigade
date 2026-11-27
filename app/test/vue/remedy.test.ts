// Le bouton du refus, sur la page du projet (#1205) : là où la station dit pourquoi elle refuse de le servir
// (#1178), le remède qu'elle publie devient un bouton — sa phrase pour libellé, avant tout clic. Un remède qui
// retire ou efface demande d'abord confirmation, avec la même phrase ; les autres partent au clic. Ensuite, levé,
// le refus quitte la page ; tenu, elle dit pourquoi en une phrase. Sans remède, la consigne écrite reste, et la
// raison de l'absence de bouton la suit. L'écran ne connaît aucun code de refus : un refus jamais vu, avec son
// descripteur, montre son bouton. La vue est jouée contre le faux pont (helpers/false-vue.ts) ; le suivi est écrit
// dans la forme du runtime, et relu par `lireSuivi`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus as refusalOfRuntime } from "../../../runtime/src/projets/refus.ts";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { readTracking } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { IssueOfRemedy } from "../../src/projects/remedy.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { NOT, YES } from "../../src/vue/onboarding/repository-held.js";
import { type Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// Ce que le runtime publie, tel quel (runtime/src/projets/refus.ts) : un refus qui retire, un qui n'efface rien,
// un sans remède — et un refus d'un type que l'écran n'a jamais vu, avec son descripteur.
const DESTRUCTIF = refusalOfRuntime("proxy-port-set");
const HARMLESS = refusalOfRuntime("sandbox-unusable");
const WITHOUT = refusalOfRuntime("fetch-blocked");
const NEVER_SEEN = {
  status: "refused",
  code: "moon-in-the-wrong-phase",
  message: "The station waits for the moon to be full before it opens this project.",
  action: "Tell the station that the moon does not matter for this project.",
  remedy: { id: "ignore-the-moon", description: "Tells the station to ignore the moon for this project.", destructive: false },
};
const remedy = (refusal: object) => ("remedy" in refusal ? (refusal.remedy as { id: string; description: string; destructive: boolean }) : assert.fail("ce refus n'a pas de remède"));

const vue = (refusal: object | null): SeenOfProjects => {
  const [readOne] = readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: refusal === null ? "servi" : "refuse", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...(refusal === null ? {} : { refus: refusal }) }] }));
  const project: ProjectSeen = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: readOne?.etat ?? "servi", dit: "", autoriser: [] }],
    servi: null,
    acces: null,
    refus: readOne?.refus ?? null,
    worktree: null,
  };
  return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
};

const startup = (projectsOfStations: SeenOfProjects) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: HOME,
  projetsDesStations: projectsOfStations,
});

const visible = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lines = (or: Fake) => or.dessous("p").filter((p) => visible(or, p)).map((p) => p.textContent);
const buttons = (or: Fake) => or.dessous("button").filter((b) => visible(or, b) && b.className !== "aide");
const button = (or: Fake, wording: string) => buttons(or).find((b) => b.textContent === wording) ?? assert.fail(`pas de bouton « ${wording} » : ${buttons(or).map((b) => b.textContent).join(" | ")}`);
const retained = (or: Fake) => or.dessous("div").find((d) => d.className === "depot-retenu" && visible(or, d));

// La page de « parade », refusé par sa box ; `issue` : ce que la station répondra au remède, quand le test le dit.
async function thePage(refusal: object) {
  let reply: (issue: IssueOfRemedy) => void = () => assert.fail("aucun remède demandé");
  const played = await playTheVue({
    demarrage: () => startup(vue(refusal)),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
    // Le faux pont rend la promesse telle quelle : la réponse vient quand le test la donne.
    leverLeRefus: () => new Promise<IssueOfRemedy>((resolve) => (reply = resolve)) as unknown as IssueOfRemedy,
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const lifted = () => played.appels.filter(({ geste: action }) => action === "leverLeRefus").map(({ args }) => args);
  return { jouee: played, bloc: played.element("stations-du-projet"), leves: lifted, repondre: (issue: IssueOfRemedy) => reply(issue) };
}

test("un refus avec remède : son bouton porte la phrase du descripteur avant tout clic, recommandé, à côté de la consigne", async () => {
  const { bloc: block, leves: lifted } = await thePage(DESTRUCTIF);
  const saidOnes = lines(block);
  assert.ok(saidOnes.some((line) => line.startsWith(DESTRUCTIF.message)), saidOnes.join(" | "));
  assert.ok(saidOnes.includes(DESTRUCTIF.action), saidOnes.join(" | "));
  assert.equal(button(block, remedy(DESTRUCTIF).description).className, "recommande");
  assert.deepEqual(lifted(), []);
});

test("un remède qui retire ou efface : le clic ouvre la confirmation, avec la même phrase ; « cancel » ne joue rien, « yes » le joue", async () => {
  const { bloc: block, leves: lifted } = await thePage(DESTRUCTIF);
  const { id, description } = remedy(DESTRUCTIF);
  button(block, description).click();
  await repos();
  const confirmation = block.dessous("section").find((s) => s.className === "confirmation" && visible(block, s)) ?? assert.fail("pas de confirmation");
  assert.equal(confirmation.dessous("p")[0]?.textContent, description);
  assert.deepEqual(lifted(), [], "ouvrir la confirmation ne joue rien");
  button(confirmation, NOT).click();
  await repos();
  assert.deepEqual(lifted(), [], "renoncer ne joue rien");
  assert.equal(block.dessous("section").some((s) => s.className === "confirmation" && visible(block, s)), false);
  button(block, description).click();
  await repos();
  button(block, YES).click();
  await repos();
  assert.deepEqual(lifted(), [["parade", "proxy-port-set", id]]);
});

test("un remède qui n'efface rien part au clic, sans confirmation ; pendant que la station le joue, le bouton attend", async () => {
  const { bloc: block, leves: lifted } = await thePage(HARMLESS);
  const { id, description } = remedy(HARMLESS);
  button(block, description).click();
  await repos();
  assert.deepEqual(lifted(), [["parade", "sandbox-unusable", id]]);
  assert.equal(block.dessous("section").some((s) => s.className === "confirmation"), false);
  assert.equal(button(block, description).disabled, true);
  assert.ok(lines(block).includes("asking parade-box to do it — it reads the app's requests every 30 s…"), lines(block).join(" | "));
  // Un second clic, la demande en route, ne la redemande pas.
  button(block, description).click();
  await repos();
  assert.equal(lifted().length, 1);
});

test("levé, le refus quitte la page ; la relecture suivante dit ce qu'il en est", async () => {
  const { jouee: played, bloc: block, repondre: reply } = await thePage(HARMLESS);
  button(block, remedy(HARMLESS).description).click();
  await repos();
  reply({ outcome: "lifted" });
  await repos();
  assert.equal(retained(block), undefined, "le refus n'est plus sur la page");
  assert.doesNotMatch(block.textContent, new RegExp(HARMLESS.message.replace(/[.()]/g, "\\$&")));
  // Relu, le projet est servi : la page reste sans refus.
  played.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.equal(retained(block), undefined);
});

test("la station répond qu'il tient : la page le dit en une phrase, sous le refus, et le bouton reste pour réessayer", async () => {
  const { jouee: played, bloc: block, repondre: reply } = await thePage(DESTRUCTIF);
  const { description } = remedy(DESTRUCTIF);
  button(block, description).click();
  await repos();
  button(block, YES).click();
  await repos();
  const reason = "The action was done, but the station still refuses this project: this project's settings choose a network port that the station reserves for itself.";
  reply({ outcome: "holds", reason: reason });
  await repos();
  assert.ok(lines(block).includes(reason), lines(block).join(" | "));
  assert.ok(lines(block).some((line) => line.startsWith(DESTRUCTIF.message)));
  assert.equal(button(block, description).disabled, false);
  // Relue, la station refuse encore : la phrase reste. Le refus parti, elle s'en va avec lui.
  played.dire("surProjetsDesStations", vue(DESTRUCTIF));
  await repos();
  assert.ok(lines(block).includes(reason));
  played.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.equal(retained(block), undefined);
});

test("rien n'est parti : la page le dit en une ligne, sans ce que GitHub a répondu — au survol", async () => {
  const { bloc: block, repondre: reply } = await thePage(HARMLESS);
  button(block, remedy(HARMLESS).description).click();
  await repos();
  reply({ outcome: "error", error: "GitHub could not be read or written, so nothing is known to have been done — gh: HTTP 502" });
  await repos();
  const said = block.dessous("p").find((p) => p.className === "remede-dit") ?? assert.fail("pas de phrase");
  assert.equal(said.textContent, "GitHub could not be read or written, so nothing is known to have been done.");
  assert.equal(said.title, "gh: HTTP 502");
});

test("un refus sans remède : la consigne écrite, et pourquoi il n'y a pas de bouton", async () => {
  const { bloc: block } = await thePage(WITHOUT);
  const saidOnes = lines(block);
  assert.ok(saidOnes.includes(WITHOUT.action), saidOnes.join(" | "));
  assert.ok("noRemedy" in WITHOUT && saidOnes.includes(WITHOUT.noRemedy), saidOnes.join(" | "));
  assert.equal(buttons(retained(block) ?? assert.fail("pas de refus")).length, 0);
});

test("un type de refus jamais vu, avec son descripteur : son bouton paraît et joue son remède — l'écran ne connaît aucun code", async () => {
  const { bloc: block, leves: lifted } = await thePage(NEVER_SEEN);
  assert.ok(lines(block).some((line) => line.startsWith(NEVER_SEEN.message)));
  button(block, NEVER_SEEN.remedy.description).click();
  await repos();
  assert.deepEqual(lifted(), [["parade", "moon-in-the-wrong-phase", "ignore-the-moon"]]);
});
