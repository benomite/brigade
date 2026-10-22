// Le bouton du refus, sur la page du projet (#1205) : là où la station dit pourquoi elle refuse de le servir
// (#1178), le remède qu'elle publie devient un bouton — sa phrase pour libellé, avant tout clic. Un remède qui
// retire ou efface demande d'abord confirmation, avec la même phrase ; les autres partent au clic. Ensuite, levé,
// le refus quitte la page ; tenu, elle dit pourquoi en une phrase. Sans remède, la consigne écrite reste, et la
// raison de l'absence de bouton la suit. L'écran ne connaît aucun code de refus : un refus jamais vu, avec son
// descripteur, montre son bouton. La vue est jouée contre le faux pont (aides/fausse-vue.ts) ; le suivi est écrit
// dans la forme du runtime, et relu par `lireSuivi`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refus as refusDuRuntime } from "../../../runtime/src/projets/refus.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { lireSuivi } from "../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { IssueDuRemede } from "../../src/projets/remede.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { NON, OUI } from "../../src/vue/onboarding/depot-retenu.js";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// Ce que le runtime publie, tel quel (runtime/src/projets/refus.ts) : un refus qui retire, un qui n'efface rien,
// un sans remède — et un refus d'un type que l'écran n'a jamais vu, avec son descripteur.
const DESTRUCTIF = refusDuRuntime("proxy-port-set");
const ANODIN = refusDuRuntime("sandbox-unusable");
const SANS = refusDuRuntime("fetch-blocked");
const JAMAIS_VU = {
  status: "refused",
  code: "moon-in-the-wrong-phase",
  message: "The station waits for the moon to be full before it opens this project.",
  action: "Tell the station that the moon does not matter for this project.",
  remedy: { id: "ignore-the-moon", description: "Tells the station to ignore the moon for this project.", destructive: false },
};
const remede = (refus: object) => ("remedy" in refus ? (refus.remedy as { id: string; description: string; destructive: boolean }) : assert.fail("ce refus n'a pas de remède"));

const vue = (refus: object | null): VuDesProjets => {
  const [lu] = lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: refus === null ? "servi" : "refuse", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...(refus === null ? {} : { refus }) }] }));
  const projet: ProjetVu = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: [{ id: "g1", nom: "parade-box", principale: true, etat: lu?.etat ?? "servi", dit: "", autoriser: [] }],
    servi: null,
    acces: null,
    refus: lu?.refus ?? null,
    worktree: null,
  };
  return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
};

const demarrage = (projetsDesStations: VuDesProjets) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations,
});

const visible = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lignes = (ou: Faux) => ou.dessous("p").filter((p) => visible(ou, p)).map((p) => p.textContent);
const boutons = (ou: Faux) => ou.dessous("button").filter((b) => visible(ou, b));
const bouton = (ou: Faux, libelle: string) => boutons(ou).find((b) => b.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} » : ${boutons(ou).map((b) => b.textContent).join(" | ")}`);
const retenu = (ou: Faux) => ou.dessous("div").find((d) => d.className === "depot-retenu" && visible(ou, d));

// La page de « parade », refusé par sa box ; `issue` : ce que la station répondra au remède, quand le test le dit.
async function laPage(refus: object) {
  let repondre: (issue: IssueDuRemede) => void = () => assert.fail("aucun remède demandé");
  const jouee = await jouerLaVue({
    demarrage: () => demarrage(vue(refus)),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
    // Le faux pont rend la promesse telle quelle : la réponse vient quand le test la donne.
    leverLeRefus: () => new Promise<IssueDuRemede>((resoudre) => (repondre = resoudre)) as unknown as IssueDuRemede,
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const leves = () => jouee.appels.filter(({ geste }) => geste === "leverLeRefus").map(({ args }) => args);
  return { jouee, bloc: jouee.element("stations-du-projet"), leves, repondre: (issue: IssueDuRemede) => repondre(issue) };
}

test("un refus avec remède : son bouton porte la phrase du descripteur avant tout clic, recommandé, à côté de la consigne", async () => {
  const { bloc, leves } = await laPage(DESTRUCTIF);
  const dits = lignes(bloc);
  assert.ok(dits.includes(DESTRUCTIF.message), dits.join(" | "));
  assert.ok(dits.includes(DESTRUCTIF.action), dits.join(" | "));
  assert.equal(bouton(bloc, remede(DESTRUCTIF).description).className, "recommande");
  assert.deepEqual(leves(), []);
});

test("un remède qui retire ou efface : le clic ouvre la confirmation, avec la même phrase ; « cancel » ne joue rien, « yes » le joue", async () => {
  const { bloc, leves } = await laPage(DESTRUCTIF);
  const { id, description } = remede(DESTRUCTIF);
  bouton(bloc, description).click();
  await repos();
  const confirmation = bloc.dessous("section").find((s) => s.className === "confirmation" && visible(bloc, s)) ?? assert.fail("pas de confirmation");
  assert.equal(confirmation.dessous("p")[0]?.textContent, description);
  assert.deepEqual(leves(), [], "ouvrir la confirmation ne joue rien");
  bouton(confirmation, NON).click();
  await repos();
  assert.deepEqual(leves(), [], "renoncer ne joue rien");
  assert.equal(bloc.dessous("section").some((s) => s.className === "confirmation" && visible(bloc, s)), false);
  bouton(bloc, description).click();
  await repos();
  bouton(bloc, OUI).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "proxy-port-set", id]]);
});

test("un remède qui n'efface rien part au clic, sans confirmation ; pendant que la station le joue, le bouton attend", async () => {
  const { bloc, leves } = await laPage(ANODIN);
  const { id, description } = remede(ANODIN);
  bouton(bloc, description).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "sandbox-unusable", id]]);
  assert.equal(bloc.dessous("section").some((s) => s.className === "confirmation"), false);
  assert.equal(bouton(bloc, description).disabled, true);
  assert.ok(lignes(bloc).includes("asking parade-box to do it — it reads the app's requests every 30 s…"), lignes(bloc).join(" | "));
  // Un second clic, la demande en route, ne la redemande pas.
  bouton(bloc, description).click();
  await repos();
  assert.equal(leves().length, 1);
});

test("levé, le refus quitte la page ; la relecture suivante dit ce qu'il en est", async () => {
  const { jouee, bloc, repondre } = await laPage(ANODIN);
  bouton(bloc, remede(ANODIN).description).click();
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
  bouton(bloc, description).click();
  await repos();
  bouton(bloc, OUI).click();
  await repos();
  const raison = "The action was done, but the station still refuses this project: this project's settings choose a network port that the station reserves for itself.";
  repondre({ outcome: "holds", reason: raison });
  await repos();
  assert.ok(lignes(bloc).includes(raison), lignes(bloc).join(" | "));
  assert.ok(lignes(bloc).includes(DESTRUCTIF.message));
  assert.equal(bouton(bloc, description).disabled, false);
  // Relue, la station refuse encore : la phrase reste. Le refus parti, elle s'en va avec lui.
  jouee.dire("surProjetsDesStations", vue(DESTRUCTIF));
  await repos();
  assert.ok(lignes(bloc).includes(raison));
  jouee.dire("surProjetsDesStations", vue(null));
  await repos();
  assert.equal(retenu(bloc), undefined);
});

test("rien n'est parti : la page le dit en une ligne, sans ce que GitHub a répondu — au survol", async () => {
  const { bloc, repondre } = await laPage(ANODIN);
  bouton(bloc, remede(ANODIN).description).click();
  await repos();
  repondre({ outcome: "error", error: "GitHub could not be read or written, so nothing is known to have been done — gh: HTTP 502" });
  await repos();
  const dit = bloc.dessous("p").find((p) => p.className === "remede-dit") ?? assert.fail("pas de phrase");
  assert.equal(dit.textContent, "GitHub could not be read or written, so nothing is known to have been done.");
  assert.equal(dit.title, "gh: HTTP 502");
});

test("un refus sans remède : la consigne écrite, et pourquoi il n'y a pas de bouton", async () => {
  const { bloc } = await laPage(SANS);
  const dits = lignes(bloc);
  assert.ok(dits.includes(SANS.action), dits.join(" | "));
  assert.ok("noRemedy" in SANS && dits.includes(SANS.noRemedy), dits.join(" | "));
  assert.equal(boutons(retenu(bloc) ?? assert.fail("pas de refus")).length, 0);
});

test("un type de refus jamais vu, avec son descripteur : son bouton paraît et joue son remède — l'écran ne connaît aucun code", async () => {
  const { bloc, leves } = await laPage(JAMAIS_VU);
  assert.ok(lignes(bloc).includes(JAMAIS_VU.message));
  bouton(bloc, JAMAIS_VU.remedy.description).click();
  await repos();
  assert.deepEqual(leves(), [["parade", "moon-in-the-wrong-phase", "ignore-the-moon"]]);
});
