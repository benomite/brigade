// L'onglet Cooks couvre chaque station du projet (#1185) : chaque cook avec sa station, une ligne par station — son
// état, ses cooks en cours, un bouton qui la lance ou l'arrête, pour la box comme pour le Mac ou un autre
// ordinateur —, et la ligne mise à jour par la lecture qui suit le clic, sans recharger la page. Sur l'onglet Rail,
// une seule ligne dit ce qui, du côté des cooks, demande un geste — une station saturée, un projet refusé, l'accès
// au dépôt bloqué —, avec de quoi ouvrir Cooks ; aucune quand rien ne le demande.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import type { RenduDeCuisson } from "../src/cuisson.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { AUCUN_COOK, BOUTONS as BOUTONS_DE_CUISSON, OUVRIR_COOKS } from "../src/vue/stations-de-cuisson.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

type DuRuntime = FaitsDuRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts, #1183), mot pour mot.
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
const ARRETEE = "2026-10-20T10:01:11.000Z";

// #14 cuit sur la box, #15 sur le Mac — une station distante — que le chef a arrêté : #15 y finit. L'atelier, une autre
// station de la box, n'a pas de place.
const STATIONS: DuRuntime[] = [
  station("box/claude", { cooks: [COOK_14] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: ARRETEE, cooks: [COOK_15] }),
  station("atelier/claude"),
];
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 2, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: "https://github.com/benomite/brigade/issues/15", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
  ],
  cooks: [COOK_14, COOK_15],
  attend: [],
};

function dessinable(faits: Faits, stations: DuRuntime[]): Dessinable {
  return tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...faits, stations }) }] });
}

// Ce que le pont répond au bouton d'une station : rien tant que le test ne le lâche pas.
type Reponse = { projet: string; station: string; geste: string; rendre(rendu: RenduDeCuisson): void };

async function ouvrir(stations: DuRuntime[] = STATIONS, faits: Faits = FAITS) {
  const reponses: Reponse[] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this Mac" }],
    // Le faux pont attend la promesse rendue : la réponse arrive quand le test la lâche.
    cuireSurLaStation: (projet, station, geste) => new Promise<RenduDeCuisson>((rendre) => reponses.push({ projet, station, geste, rendre })) as unknown as RenduDeCuisson,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, faits, stations);
  return { vue, reponses };
}
function recevoir(vue: Jouee, faits: Faits, stations: DuRuntime[]): void {
  vue.dire("surFaits", { ...dessinable(faits, stations), demande: vue.dernier("faits")[0] as number });
}

const lignes = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson");
const ligne = (vue: Jouee, nom: string) => lignes(vue).find((li) => li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
const etatDe = (pose: Faux) => pose.dessous("span").find((span) => span.className === "pilule")?.textContent;
const boutonDe = (pose: Faux) => pose.dessous("button").find((bouton) => bouton.ariaLabel?.includes(" on ") === true);
const cooksDe = (pose: Faux) => (pose.dessous("ul")[0]?.children ?? []).map((li) => li.textContent);
const alertes = (vue: Jouee) => vue.element("rail").dessous("p").filter((p) => p.className === "alerte-de-cuisine");

describe("l'onglet Cooks : une ligne par station du projet", () => {
  test("chaque cook est nommé avec sa station, et chaque station a sa ligne : son état, ses cooks, son bouton", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    // La carte du projet : chaque cook, et sa station.
    const carte = vue.element("carte");
    const cooks = carte.dessous("ul").find((ul) => ul.className === "cooks") ?? assert.fail("pas de cooks sur la carte");
    assert.deepEqual(cooks.children.map((li) => li.textContent), ["#14Le journal en ajout seulbox/claude", "#15La carte des dessertsmac/claude"]);
    // Les stations, dans l'ordre de `facts`.
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "stopped", "cooking"]);
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksDe(ligne(vue, "atelier/claude")), [AUCUN_COOK]);
    // Arrêtée, la station dit par qui, depuis quand, et ce qui y finit ; elle se dit distante.
    assert.match(ligne(vue, "mac/claude").textContent, /remote/);
    assert.match(ligne(vue, "mac/claude").textContent, /by you, for 3 min · 1 cook finishing/);
    // Un bouton par ligne : arrêter celle qui cuit, relancer celle que le chef a arrêtée.
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)?.textContent), ["stop cooking", "start cooking", "stop cooking"]);
    // Ce qu'il fait est au survol ; arrêter ne coûte rien — pas d'icône de prix —, relancer dit son prix au survol.
    assert.match(boutonDe(ligne(vue, "box/claude"))?.title ?? "", /running cooks finish/);
    assert.equal(ligne(vue, "box/claude").dessous("button").some((bouton) => bouton.className === "aide"), false);
    assert.equal(ligne(vue, "mac/claude").dessous("button").find((bouton) => bouton.className === "aide")?.ariaLabel, BOUTONS_DE_CUISSON.start.prix);
  });

  test("sur Rail, les stations ne se montrent pas", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(lignes(vue), []);
  });

  test("arrêter une station de la box : le runtime est appelé, le cook en cours finit, la ligne finit à l'arrêt et le ticket revient au rail", async () => {
    const { vue, reponses } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    boutonDe(ligne(vue, "box/claude"))?.click();
    await repos();
    assert.deepEqual(reponses.map(({ projet, station: nom, geste }) => [projet, nom, geste]), [[PARADE, "box/claude", "stop"]]);
    // Tant que le runtime n'a pas répondu, le bouton dit qu'il s'y met, et ne se reclique pas.
    const enCours = boutonDe(ligne(vue, "box/claude")) ?? assert.fail("pas de bouton");
    assert.equal(enCours.textContent, BOUTONS_DE_CUISSON.stop.enCours);
    assert.equal(enCours.disabled, true);
    enCours.click();
    await repos();
    assert.equal(reponses.length, 1);
    const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    reponses[0]?.rendre({ fait: "box/claude stops cooking parade: it takes no more tickets, its running cooks finish", detail: "brigade : box/claude: stopped" });
    await repos();
    // Fait : la box est relue tout de suite, et la ligne dit ce qui a été fait jusqu'à la lecture suivante.
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
    assert.match(ligne(vue, "box/claude").textContent, /box\/claude stops cooking parade/);

    // La lecture suivante : la station est arrêtée, #14 y finit. Pas de rechargement : la même page, la ligne neuve.
    recevoir(vue, FAITS, [station("box/claude", { cuisson: "stopped", arreteeDepuis: "2026-10-20T10:04:05.000Z", cooks: [COOK_14] }), ...STATIONS.slice(1)]);
    await repos();
    assert.equal(etatDe(ligne(vue, "box/claude")), "stopped");
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.match(ligne(vue, "box/claude").textContent, /1 cook finishing/);
    assert.equal(boutonDe(ligne(vue, "box/claude"))?.textContent, "start cooking");
    assert.doesNotMatch(ligne(vue, "box/claude").textContent, /stops cooking parade/);

    // #14 a fini sans livrer : la station reste à l'arrêt, sans cook, et son ticket est de nouveau sur le rail.
    const rendu: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, rail: 2, auTravail: 1 }, rail: FAITS.rail.map((carte) => (carte.ticket === 14 ? { ...carte, etat: "en attente" } : carte)), cooks: [COOK_15] };
    recevoir(vue, rendu, [station("box/claude", { cuisson: "stopped", arreteeDepuis: "2026-10-20T10:04:05.000Z" }), ...STATIONS.slice(1)]);
    await repos();
    assert.equal(etatDe(ligne(vue, "box/claude")), "stopped");
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), [AUCUN_COOK]);
    await ouvrirOnglet(vue, "Rail");
    const surLeRail = vue.element("rail").dessous("section").find((colonne) => colonne.className === "colonne" && colonne.children[0]?.children[0]?.textContent === "On the rail");
    assert.ok(surLeRail?.dessous("li").some((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === "#14"), "#14 est de nouveau sur le rail");
  });

  test("relancer la station du Mac, distante : le même geste, et la ligne revient à « cooking » à la lecture suivante", async () => {
    const { vue, reponses } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    boutonDe(ligne(vue, "mac/claude"))?.click();
    await repos();
    assert.deepEqual(reponses.map(({ station: nom, geste }) => [nom, geste]), [["mac/claude", "start"]]);
    assert.equal(boutonDe(ligne(vue, "mac/claude"))?.textContent, BOUTONS_DE_CUISSON.start.enCours);
    reponses[0]?.rendre({ fait: "mac/claude cooks parade again: it takes its tickets at the runtime's next read" });
    await repos();
    recevoir(vue, FAITS, [STATIONS[0] as DuRuntime, station("mac/claude", { distante: true, cooks: [COOK_15] }), STATIONS[2] as DuRuntime]);
    await repos();
    assert.equal(etatDe(ligne(vue, "mac/claude")), "cooking");
    assert.equal(boutonDe(ligne(vue, "mac/claude"))?.textContent, "stop cooking");
  });

  test("le runtime refuse le geste : une ligne le dit sous la station, son détail au survol, rien n'est relu et le bouton revient", async () => {
    const { vue, reponses } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    boutonDe(ligne(vue, "atelier/claude"))?.click();
    await repos();
    reponses[0]?.rendre({ refus: "atelier/claude did not stop: the runtime did not take it — nothing was changed", detail: "$ ssh box brigade parade station stop atelier/claude\nbrigade : unknown station" });
    await repos();
    const dit = ligne(vue, "atelier/claude").dessous("p").find((p) => p.className === "dit refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(dit.textContent, "atelier/claude did not stop: the runtime did not take it — nothing was changed");
    assert.match(dit.title, /unknown station/);
    assert.doesNotMatch(ligne(vue, "atelier/claude").textContent, /ssh|brigade :/);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures);
    assert.equal(boutonDe(ligne(vue, "atelier/claude"))?.textContent, "stop cooking");
    assert.equal(boutonDe(ligne(vue, "atelier/claude"))?.disabled, false);
  });

  test("une station saturée garde son bouton d'arrêt ; une qui refuse le projet dit pourquoi, sans bouton", async () => {
    const refus = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
    const { vue } = await ouvrir([station("box/claude", { cuisson: "saturated", cooks: [COOK_14] }), station("atelier/claude", { cuisson: "refused", refus })]);
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(lignes(vue).map(etatDe), ["saturated", "refused"]);
    assert.equal(boutonDe(ligne(vue, "box/claude"))?.textContent, "stop cooking");
    assert.equal(boutonDe(ligne(vue, "atelier/claude")), undefined);
    assert.match(ligne(vue, "atelier/claude").textContent, /cannot run the project's cooks/);
  });
});

describe("l'onglet Rail : une ligne quand les cooks demandent un geste", () => {
  // Ce que le process principal rend des projets que les stations publient, l'accès au dépôt de parade bloqué.
  const ACCES = { bloque: "fetch" as const, raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username (git: fatal: could not read Username).", geste: "Run `gh auth setup-git` on parade-box." };
  const vus = (acces: typeof ACCES | null): VuDesProjets => ({
    a: A,
    projets: [{ nom: PARADE, depot: "benomite/parade", base: "main", stations: [{ id: "g1", nom: "parade-box", principale: true, etat: "servi", dit: "", autoriser: [] }], servi: null, acces, refus: null, worktree: null }],
    recommandee: "g1",
    avertissements: {},
    machines: {},
    calibrage: calibrageRecommande([]),
  });

  test("rien ne demande de geste : aucune ligne", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(alertes(vue), []);
  });

  test("une station saturée : une seule ligne la dit, et « open Cooks » ouvre l'onglet Cooks", async () => {
    const { vue } = await ouvrir([station("box/claude", { cuisson: "saturated" }), station("mac/claude", { distante: true })]);
    await ouvrirOnglet(vue, "Rail");
    const [alerte, ...autres] = alertes(vue);
    assert.deepEqual(autres, []);
    assert.equal(alerte?.children[0]?.textContent, "box/claude is saturated: it takes no ticket until its machine has room.");
    // Elle est en tête de l'onglet.
    assert.equal(vue.element("rail").children[0]?.children[0], alerte);
    const lien = alerte?.dessous("button").find((bouton) => bouton.textContent === OUVRIR_COOKS) ?? assert.fail("pas de lien vers Cooks");
    lien.click();
    await repos();
    assert.deepEqual(vue.element("onglets-du-projet").children.filter((onglet) => onglet.ariaSelected === "true").map((onglet) => onglet.textContent), ["Cooks"]);
    assert.deepEqual(alertes(vue), []);
    assert.equal(etatDe(ligne(vue, "box/claude")), "saturated");
  });

  test("une station qui refuse le projet : une seule ligne", async () => {
    const refus = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
    const { vue } = await ouvrir([station("box/claude", { cuisson: "refused", refus })]);
    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(alertes(vue).map((p) => p.children[0]?.textContent), ["box/claude refuses the project: This computer cannot run the project's cooks in Claude Code's sandbox."]);
  });

  test("l'accès au dépôt bloqué : une seule ligne, le détail de git en moins ; avec une station saturée, toujours une seule — et la ligne part quand c'est levé", async () => {
    const { vue } = await ouvrir([station("box/claude")]);
    await ouvrirOnglet(vue, "Rail");
    vue.dire("surProjetsDesStations", vus(ACCES));
    await repos();
    assert.deepEqual(alertes(vue).map((p) => p.children[0]?.textContent), ["parade-box cannot fetch from benomite/parade: github.com asks for a username."]);
    // Le bloc des stations, qui détaille l'accès et son geste, reste sur Cooks : sur Rail, la ligne seule le dit.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    recevoir(vue, FAITS, [station("box/claude", { cuisson: "saturated" })]);
    await repos();
    const [seule, ...autres] = alertes(vue);
    assert.deepEqual(autres, []);
    assert.equal(seule?.children[0]?.textContent, "parade-box cannot fetch from benomite/parade: github.com asks for a username · box/claude is saturated: it takes no ticket until its machine has room.");
    // Levé, puis la station a de la place : plus de ligne.
    vue.dire("surProjetsDesStations", vus(null));
    recevoir(vue, FAITS, [station("box/claude")]);
    await repos();
    assert.deepEqual(alertes(vue), []);
  });
});
