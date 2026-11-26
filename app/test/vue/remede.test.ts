// Le bouton du refus, sur la page du projet (#1205) : là où la station dit pourquoi elle refuse de le servir
// (#1178), le remède qu'elle publie devient un bouton — sa phrase pour libellé, avant tout clic. Un remède qui
// retire ou efface demande d'abord confirmation, avec la même phrase ; les autres partent au clic. Ensuite, levé,
// le refus quitte la page ; tenu, elle dit pourquoi en une phrase. Sans remède, la consigne écrite reste, et la
// raison de l'absence de bouton la suit. L'écran ne connaît aucun code de refus : un refus jamais vu, avec son
// descripteur, montre son bouton. La vue est jouée contre le faux pont (aides/fausse-vue.ts) ; le suivi est écrit
// dans la forme du runtime, et relu par `lireSuivi`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus as refusalDuRuntime } from "../../../runtime/src/projets/refus.ts";
import type { Home } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { lireSuivi } from "../../src/projects/request.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type ProjectVu, type VuDesProjects } from "../../src/projects/projects.ts";
import type { IssueDuRemede } from "../../src/projects/remede.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { NON, OUI } from "../../src/vue/onboarding/repository-retenu.js";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// Ce que le runtime publie, tel quel (runtime/src/projets/refus.ts) : un refus qui retire, un qui n'efface rien,
// un sans remède — et un refus d'un type que l'écran n'a jamais vu, avec son descripteur.
const DESTRUCTIF = refusalDuRuntime("proxy-port-set");
const ANODIN = refusalDuRuntime("sandbox-unusable");
const SANS = refusalDuRuntime("fetch-blocked");
const JAMAIS_VU = {
  status: "refused",
  code: "moon-in-the-wrong-phase",
  message: "The station waits for the moon to be full before it opens this project.",
  action: "Tell the station that the moon does not matter for this project.",
  remedy: { id: "ignore-the-moon", description: "Tells the station to ignore the moon for this project.", destructive: false },
};
const remede = (refusal: object) => ("remedy" in refusal ? (refusal.remedy as { id: string; description: string; destructive: boolean }) : assert.fail("ce refus n'a pas de remède"));

const vue = (refusal: object | null): VuDesProjects => {
  const [lu] = lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: refusal === null ? "servi" : "refuse", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...(refusal === null ? {} : { refus: refusal }) }] }));
  const project: ProjectVu = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: lu?.etat ?? "servi", dit: "", autoriser: [] }],
    servi: null,
    acces: null,
    refus: lu?.refus ?? null,
    worktree: null,
  };
  return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrationRecommande([]) };
};

const demarrage = (projectsDesStations: VuDesProjects) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: HOME,
  projetsDesStations: projectsDesStations,
});

const visible = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lines = (ou: Faux) => ou.dessous("p").filter((p) => visible(ou, p)).map((p) => p.textContent);
const boutons = (ou: Faux) => ou.dessous("button").filter((b) => visible(ou, b) && b.className !== "aide");
const button = (ou: Faux, libelle: string) => boutons(ou).find((b) => b.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} » : ${boutons(ou).map((b) => b.textContent).join(" | ")}`);
const retenu = (ou: Faux) => ou.dessous("div").find((d) => d.className === "depot-retenu" && visible(ou, d));

// La page de « parade », refusé par sa box ; `issue` : ce que la station répondra au remède, quand le test le dit.
async function laPage(refusal: object) {
  let repondre: (issue: IssueDuRemede) => void = () => assert.fail("aucun remède demandé");
  const jouee = await jouerLaVue({
    demarrage: () => demarrage(vue(refusal)),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
    // Le faux pont rend la promesse telle quelle : la réponse vient quand le test la donne.
    leverLeRefus: () => new Promise<IssueDuRemede>((resoudre) => (repondre = resoudre)) as unknown as IssueDuRemede,
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const leves = () => jouee.appels.filter(({ geste: action }) => action === "leverLeRefus").map(({ args }) => args);
  return { jouee, bloc: jouee.element("stations-du-projet"), leves, repondre: (issue: IssueDuRemede) => repondre(issue) };
}

test("un refus avec remède : son bouton porte la phrase du descripteur avant tout clic, recommandé, à côté de la consigne", async () => {
  const { bloc, leves } = await laPage(DESTRUCTIF);
  const dits = lines(bloc);
  assert.ok(dits.some((line) => line.startsWith(DESTRUCTIF.message)), dits.join(" | "));
  assert.ok(dits.includes(DESTRUCTIF.action), dits.join(" | "));
  assert.equal(button(bloc, remede(DESTRUCTIF).description).className, "recommande");
  assert.deepEqual(leves(), []);
});

test("un remède qui retire ou efface : le clic ouvre la confirmation, avec la même phrase ; « cancel » ne joue rien, « yes » le joue", async () => {
  const { bloc, leves } = await laPage(DESTRUCTIF);
  const { id, description } = remede(DESTRUCTIF);
  button(bloc, description).click();
  await repos();
  const confirmation = bloc.dessous("section").find((s) => s.className === "confirmation" && visible(bloc, s)) ?? assert.fail("pas de confirmation");
  assert.equal(confirmation.dessous("p")[0]?.textContent, description);
  assert.deepEqual(leves(), [], "ouvrir la confirmation ne joue rien");
  button(confirmation, NON).click();
  await repos();
  assert.deepEqual(leves(), [], "renoncer ne joue rien");
  assert.equal(bloc.dessous("section").some((s) => s.className === "confirmation" && visible(bloc, s)), false);
  button(bloc, description).click();
  await repos();
  button(bloc, OUI).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "proxy-port-set", id]]);
});

test("un remède qui n'efface rien part au clic, sans confirmation ; pendant que la station le joue, le bouton attend", async () => {
  const { bloc, leves } = await laPage(ANODIN);
  const { id, description } = remede(ANODIN);
  button(bloc, description).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "sandbox-unusable", id]]);
  assert.equal(bloc.dessous("section").some((s) => s.className === "confirmation"), false);
  assert.equal(button(bloc, description).disabled, true);
  assert.ok(lines(bloc).includes("asking parade-box to do it — it reads the app's requests every 30 s…"), lines(bloc).join(" | "));
  // Un second clic, la demande en route, ne la redemande pas.
  button(bloc, description).click();
  await repos();
  assert.equal(leves().length, 1);
});

test("levé, le refus quitte la page ; la relecture suivante dit ce qu'il en est", async () => {
  const { jouee, bloc, repondre } = await laPage(ANODIN);
  button(bloc, remede(ANODIN).description).click();
  await repos();
  repondre({ outcome: "lifted" });
  await repos();
  assert.equal(retenu(bloc), undefined, "le refus n'est plus sur la page");
  assert.doesNotMatch(bloc.textContent, new RegExp(ANODIN.message.replace(/[.()]/g, "\\$&")));
  // Relu, le projet est servi : la page reste sans refus.
  jouee.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.equal(retenu(bloc), undefined);
});

test("la station répond qu'il tient : la page le dit en une phrase, sous le refus, et le bouton reste pour réessayer", async () => {
  const { jouee, bloc, repondre } = await laPage(DESTRUCTIF);
  const { description } = remede(DESTRUCTIF);
  button(bloc, description).click();
  await repos();
  button(bloc, OUI).click();
  await repos();
  const raison = "The action was done, but the station still refuses this project: this project's settings choose a network port that the station reserves for itself.";
  repondre({ outcome: "holds", reason: raison });
  await repos();
  assert.ok(lines(bloc).includes(raison), lines(bloc).join(" | "));
  assert.ok(lines(bloc).some((line) => line.startsWith(DESTRUCTIF.message)));
  assert.equal(button(bloc, description).disabled, false);
  // Relue, la station refuse encore : la phrase reste. Le refus parti, elle s'en va avec lui.
  jouee.dire("surProjetsDesStations", vue(DESTRUCTIF));
  await repos();
  assert.ok(lines(bloc).includes(raison));
  jouee.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.equal(retenu(bloc), undefined);
});

test("rien n'est parti : la page le dit en une ligne, sans ce que GitHub a répondu — au survol", async () => {
  const { bloc, repondre } = await laPage(ANODIN);
  button(bloc, remede(ANODIN).description).click();
  await repos();
  repondre({ outcome: "error", error: "GitHub could not be read or written, so nothing is known to have been done — gh: HTTP 502" });
  await repos();
  const dit = bloc.dessous("p").find((p) => p.className === "remede-dit") ?? assert.fail("pas de phrase");
  assert.equal(dit.textContent, "GitHub could not be read or written, so nothing is known to have been done.");
  assert.equal(dit.title, "gh: HTTP 502");
});

test("un refus sans remède : la consigne écrite, et pourquoi il n'y a pas de bouton", async () => {
  const { bloc } = await laPage(SANS);
  const dits = lines(bloc);
  assert.ok(dits.includes(SANS.action), dits.join(" | "));
  assert.ok("noRemedy" in SANS && dits.includes(SANS.noRemedy), dits.join(" | "));
  assert.equal(boutons(retenu(bloc) ?? assert.fail("pas de refus")).length, 0);
});

test("un type de refus jamais vu, avec son descripteur : son bouton paraît et joue son remède — l'écran ne connaît aucun code", async () => {
  const { bloc, leves } = await laPage(JAMAIS_VU);
  assert.ok(lines(bloc).some((line) => line.startsWith(JAMAIS_VU.message)));
  button(bloc, JAMAIS_VU.remedy.description).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "moon-in-the-wrong-phase", "ignore-the-moon"]]);
});
