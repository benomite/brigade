// L'onglet Cooks couvre chaque station du projet (#1185) : chaque cook avec sa station, une ligne par station — son
// état, ses cooks en cours, un bouton qui la lance ou l'arrête, pour la box comme pour le Mac ou un autre
// ordinateur —, et la ligne mise à jour par la lecture qui suit le clic, sans recharger la page. Chaque station y est
// un bloc, et ses cooks en cours les cartes de leurs tickets — celles du kanban de Rail, qui ouvrent la même fiche,
// et seulement les siennes (#1270). Sur l'onglet Rail,
// une seule ligne dit ce qui, du côté des cooks, demande un geste — une station saturée, un projet refusé, l'accès
// au dépôt bloqué —, avec de quoi ouvrir Cooks ; aucune quand rien ne le demande.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import type { RenduDeCuisson } from "../src/cuisson.ts";
import { BANNIERE, tenirFaits, type Carte, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { AUCUN_COOK, BAISSER_LE_PLAFOND, BOUTONS as BOUTONS_DE_CUISSON, OUVRIR_COOKS, PLAFOND_PAR_DEFAUT, POSER_LE_PLAFOND } from "../src/vue/stations-de-cuisson.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
// Les cartes d'un bloc : le numéro et le titre de chacune — ou, sans cook, ce qui le dit.
const cartesDe = (pose: Faux) => pose.dessous("li").filter((li) => li.className === "bon");
const cooksDe = (pose: Faux) => {
  const cartes = cartesDe(pose);
  if (cartes.length > 0) return cartes.map((bon) => `${bon.children[0]?.children[0]?.textContent}${bon.children[1]?.textContent}`);
  return pose.dessous("p").filter((p) => p.className === "aucun-cook").map((p) => p.textContent);
};
const alertes = (vue: Jouee) => vue.element("rail").dessous("p").filter((p) => p.className === "alerte-de-cuisine");

describe("l'onglet Cooks : une ligne par station du projet", () => {
  test("chaque cook est nommé avec sa station, et chaque station a sa ligne : son état, ses cooks, son bouton", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    // La carte du projet est fondue dans le bloc des stations (#1456) : sa ligne, en tête, dit l'état de la cuisine ; ses
    // cooks sont ceux des stations, et la carte n'est plus posée.
    assert.throws(() => vue.element("carte"), /aucun élément « carte »/);
    const cuisine = vue.element("rail").dessous("p").find(({ className }) => className === "etat-de-la-cuisine") ?? assert.fail("pas de ligne de la cuisine");
    assert.match(cuisine.textContent, /^kitchenouverte/);
    // Les stations, dans l'ordre de `facts`, celles de la principale d'abord (#1786).
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "atelier/claude", "mac/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "cooking", "stopped"]);
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksDe(ligne(vue, "atelier/claude")), [AUCUN_COOK]);
    // Arrêtée, la station dit par qui, depuis quand, et ce qui y finit ; elle se dit distante.
    assert.match(ligne(vue, "mac/claude").textContent, /remote/);
    assert.match(ligne(vue, "mac/claude").textContent, /by you, for 3 min · 1 cook finishing/);
    // Un bouton par ligne : arrêter celle qui cuit, relancer celle que le chef a arrêtée.
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)?.textContent), ["stop cooking", "stop cooking", "start cooking"]);
    // Ce qu'il fait est au survol ; arrêter ne coûte rien — pas d'icône de prix —, relancer dit son prix au survol.
    assert.match(boutonDe(ligne(vue, "box/claude"))?.title ?? "", /running cooks finish/);
    assert.equal(ligne(vue, "box/claude").dessous("button").some((bouton) => bouton.className === "aide"), false);
    assert.equal(ligne(vue, "mac/claude").dessous("button").find((bouton) => bouton.className === "aide")?.ariaLabel, BOUTONS_DE_CUISSON.start.prix);
  });

  test("Cooks dans l'ordre de sa revue (#1456) : les stations d'abord, puis les tickets, les gates, et les blocs repliés en bas", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    const ids = vue.element("rail").children.map(({ id, className }) => id || className);
    const ordre = ["cuisson-du-projet", "activite-du-projet", "gates-du-projet", "plafond-du-projet", "roles-du-projet", "appris-du-projet", "replie lecture-de-la-cuisine"];
    assert.deepEqual(ids.filter((id) => ordre.includes(id)), ordre);
    // Rien de ce qui précède les stations n'est un bloc : au plus la ligne qui dit l'âge de la lecture.
    assert.deepEqual(ids.slice(0, ids.indexOf("cuisson-du-projet")).filter((id) => id !== "fraicheur"), []);
    // La lecture brute de `station`, en bas, est fermée.
    assert.equal(Reflect.get(vue.element("rail").children.at(-1) ?? assert.fail("rien en bas"), "open"), false);
  });

  test("un cook coincé le dit sur sa carte, dans sa station : STUCK, et depuis quand (#1456)", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    // Le bail de #14, tel que `status` l'écrit pour un cook coincé, et rien de tel pour #15.
    const lu = dessinable(FAITS, STATIONS);
    assert.ok("tableau" in lu);
    const bail = (carte: Carte): Carte => (carte.ticket === 14 ? { ...carte, dit: [...carte.dit, { libelle: "lease", valeur: "STUCK: no progress since 31 min, lease 3 min left" }] } : carte);
    const { rail: lus } = lu.tableau;
    const coince = { ...lu, tableau: { ...lu.tableau, rail: { ...lus, colonnes: lus.colonnes.map((colonne) => ({ ...colonne, cartes: colonne.cartes.map(bail) })), hors: lus.hors.map(bail) } } };
    vue.dire("surFaits", { ...coince, demande: vue.dernier("faits")[0] as number });
    const signaux = (nom: string) => ligne(vue, nom).dessous("p").filter((p) => p.className === "signal").map((p) => p.textContent);
    assert.deepEqual(signaux("box/claude"), ["STUCK: no progress since 31 min"]);
    assert.deepEqual(signaux("mac/claude"), []);
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
    reponses[0]?.rendre({ refus: "atelier/claude did not stop: the runtime did not take it — nothing was changed", detail: "$ node geste.ts parade station stop atelier/claude\nbrigade : unknown station" });
    await repos();
    const dit = ligne(vue, "atelier/claude").dessous("p").find((p) => p.className === "dit refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(dit.textContent, "atelier/claude did not stop: the runtime did not take it — nothing was changed");
    assert.match(dit.title, /unknown station/);
    assert.doesNotMatch(ligne(vue, "atelier/claude").textContent, /node geste|brigade :/);
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

describe("l'onglet Cooks : un bloc par station, et les cartes de ses tickets en cours (#1270)", () => {
  const COOK_16 = { ticket: 16, titre: "Le menu du soir", station: "atelier/claude" };
  const REFUS = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
  // Une station dans chacun des quatre états : la box cuit #14, le Mac arrêté par le chef y finit #15, l'atelier saturé
  // cuit encore #16 — que le rail lu ne porte pas —, le PC refuse le projet. #21 attend sur le rail, aucune station ne l'a.
  const QUATRE: DuRuntime[] = [
    station("box/claude", { cooks: [COOK_14] }),
    station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: ARRETEE, cooks: [COOK_15] }),
    station("atelier/claude", { cuisson: "saturated", cooks: [COOK_16] }),
    station("pc/claude", { distante: true, cuisson: "refused", refus: REFUS }),
  ];
  const FAITS_QUATRE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, auTravail: 3 }, cooks: [COOK_14, COOK_15, COOK_16] };
  const fiche = (vue: Jouee) => vue.element("fiche");
  const fermer = (vue: Jouee) => (fiche(vue).dessous("button").find((pose) => pose.className === "fermer") ?? assert.fail("pas de bouton pour fermer la fiche")).click();
  const carteDe = (pose: Faux, numero: number) => cartesDe(pose).find((bon) => bon.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de carte #${numero}`);

  test("les quatre états, un bloc chacun : son mot, son bouton tel qu'aujourd'hui, et les cartes de ses tickets en cours, rien d'autre", async () => {
    const { vue } = await ouvrir(QUATRE, FAITS_QUATRE);
    await ouvrirOnglet(vue, "Cooks");
    // Exactement un bloc par station du projet, dans l'ordre de `facts`, celles de la principale d'abord (#1786).
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "atelier/claude", "mac/claude", "pc/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "saturated", "stopped", "refused"]);
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)?.textContent), ["stop cooking", "stop cooking", "start cooking", undefined]);
    // Chacun porte les cartes des tickets en cours sur sa station, et seulement celles-là : #21, sur le rail, n'est nulle part.
    assert.deepEqual(lignes(vue).map(cooksDe), [["#14Le journal en ajout seul"], ["#16Le menu du soir"], ["#15La carte des desserts"], [AUCUN_COOK]]);
    assert.doesNotMatch(vue.element("rail").textContent, /#21/);
    // Ce sont les cartes du kanban : le même bon, l'état du ticket compris — #16, que le rail lu ne porte pas, n'a que
    // son numéro et son titre, et son numéro n'ouvre pas d'issue.
    const quatorze = carteDe(ligne(vue, "box/claude"), 14);
    assert.equal((quatorze as Faux & { tabIndex?: number }).tabIndex, 0);
    assert.equal(quatorze.children[0]?.children[1]?.textContent, "pris");
    assert.equal(quatorze.children[0]?.children[0]?.balise, "button");
    assert.equal(carteDe(ligne(vue, "atelier/claude"), 16).children[0]?.children[0]?.balise, "span");
    // Aucune sortie brute de commande dans un bloc : ni `pre`, ni ligne lancée, ni code de sortie.
    for (const bloc of lignes(vue)) {
      assert.deepEqual(bloc.dessous("pre"), []);
      assert.doesNotMatch(bloc.textContent, /\$ |stderr|stdout|exit code|brigade :/);
    }
  });

  test("une carte d'un bloc ouvre la même fiche que la même carte du kanban de Rail", async () => {
    const { vue } = await ouvrir(QUATRE, FAITS_QUATRE);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(fiche(vue).hidden, true);
    carteDe(ligne(vue, "box/claude"), 14).click();
    await repos();
    assert.equal(fiche(vue).hidden, false);
    const depuisCooks = fiche(vue).textContent;
    assert.match(depuisCooks, /#14/);
    assert.match(depuisCooks, /Le journal en ajout seul/);
    fermer(vue);
    await repos();
    assert.equal(fiche(vue).hidden, true);

    await ouvrirOnglet(vue, "Rail");
    const taken = vue.element("rail").dessous("section").find((colonne) => colonne.className === "colonne" && colonne.children[0]?.children[0]?.textContent === "Taken") ?? assert.fail("pas de colonne Taken");
    carteDe(taken, 14).click();
    await repos();
    assert.equal(fiche(vue).hidden, false);
    assert.equal(fiche(vue).textContent, depuisCooks);
    fermer(vue);
    await repos();

    // Au clavier aussi, comme sur le kanban : Entrée sur la carte.
    await ouvrirOnglet(vue, "Cooks");
    carteDe(ligne(vue, "mac/claude"), 15).declencher("keydown", { key: "Enter" });
    await repos();
    assert.equal(fiche(vue).hidden, false);
    assert.match(fiche(vue).textContent, /La carte des desserts/);
  });

  test("la lecture suivante redessine les blocs : un ticket qui quitte sa station quitte son bloc", async () => {
    const { vue } = await ouvrir(QUATRE, FAITS_QUATRE);
    await ouvrirOnglet(vue, "Cooks");
    recevoir(vue, { ...FAITS_QUATRE, cooks: [COOK_15, COOK_16] }, [station("box/claude"), ...QUATRE.slice(1)]);
    await repos();
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), [AUCUN_COOK]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
  });
});

describe("deux stations du projet : chacune cuit et s'arrête sans toucher l'autre (#1289)", () => {
  const DEUX = (box: Partial<DuRuntime>, mac: Partial<DuRuntime>): DuRuntime[] => [station("box/claude", { cooks: [COOK_14], ...box }), station("mac/claude", { distante: true, cooks: [COOK_15], ...mac })];
  const instantane = (vue: Jouee) => lignes(vue).map((li) => [li.dataset.station, etatDe(li), boutonDe(li)?.textContent, boutonDe(li)?.disabled, cooksDe(li)]);

  test("deux stations, deux lignes, chacune à son nom ; arrêter l'une laisse la ligne et l'état de l'autre tels quels", async () => {
    const { vue, reponses } = await ouvrir(DEUX({}, {}));
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude"]);
    assert.match(ligne(vue, "box/claude").dessous("strong")[0]?.textContent ?? "", /^box\/claude$/);
    assert.match(ligne(vue, "mac/claude").dessous("strong")[0]?.textContent ?? "", /^mac\/claude$/);
    const avant = instantane(vue)[1];
    const texteAvant = ligne(vue, "mac/claude").textContent;
    boutonDe(ligne(vue, "box/claude"))?.click();
    await repos();
    // Seule la box est appelée, et seul son bouton attend ; la ligne du Mac n'a pas bougé.
    assert.deepEqual(reponses.map(({ station: nom, geste }) => [nom, geste]), [["box/claude", "stop"]]);
    assert.deepEqual(instantane(vue)[1], avant);
    reponses[0]?.rendre({ fait: "box/claude stops cooking parade: it takes no more tickets, its running cooks finish" });
    await repos();
    recevoir(vue, FAITS, DEUX({ cuisson: "stopped", arreteeDepuis: "2026-10-20T10:04:05.000Z" }, {}));
    await repos();
    assert.equal(etatDe(ligne(vue, "box/claude")), "stopped");
    assert.deepEqual(instantane(vue)[1], avant);
    assert.equal(ligne(vue, "mac/claude").textContent, texteAvant);
    assert.equal(reponses.length, 1);
  });

  test("relancer l'une des deux ne lance pas l'autre : un seul geste part, et l'autre station reste arrêtée", async () => {
    const arretee: Partial<DuRuntime> = { cuisson: "stopped", arreteeDepuis: ARRETEE, cooks: [] };
    const { vue, reponses } = await ouvrir(DEUX(arretee, arretee));
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(lignes(vue).map(etatDe), ["stopped", "stopped"]);
    const avant = instantane(vue)[0];
    boutonDe(ligne(vue, "mac/claude"))?.click();
    await repos();
    assert.deepEqual(reponses.map(({ station: nom, geste }) => [nom, geste]), [["mac/claude", "start"]]);
    reponses[0]?.rendre({ fait: "mac/claude cooks parade again: it takes its tickets at the runtime's next read" });
    await repos();
    recevoir(vue, FAITS, DEUX(arretee, { cuisson: "cooking", arreteeDepuis: null, cooks: [] }));
    await repos();
    assert.deepEqual(lignes(vue).map(etatDe), ["stopped", "cooking"]);
    assert.deepEqual(instantane(vue)[0], avant);
    assert.equal(boutonDe(ligne(vue, "box/claude"))?.textContent, "start cooking");
    assert.equal(reponses.length, 1);
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

describe("la ligne de station dit le plafond du projet et le règle (ticket 1292)", () => {
  const accueil = (plafond: { dit: string; nombre: number | null; parLeChef: boolean }, retenue?: { depuis: string; ressources: string; detail: string }) => ({
    projets: [],
    sante: { ton: "vert" as const, dit: "", survol: "" },
    plafonds: { [PARADE]: { "box/claude": { plafond, ...(retenue === undefined ? {} : { retenue }) } } },
  });
  const boutons = (pose: Faux) => pose.dessous("button").map((bouton) => bouton.textContent);

  test("le plafond, ce qui sature, le geste d'un coup, puis le retour au défaut", async () => {
    const appels: unknown[][] = [];
    const vue = await jouerLaVue({
      demarrage,
      espace: () => [SECOND],
      machines: () => [{ id: "poste", titre: "this Mac" }],
      reglerLePlafond: (...args: unknown[]) => (appels.push(args), { fait: "the cap is 1" }),
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    recevoir(vue, FAITS, [station("box/claude", { cuisson: "saturated", cooks: [COOK_14] })]);
    vue.dire("surAccueil", accueil({ dit: "3 at most — 8 cores", nombre: 3, parLeChef: false }, { depuis: "3 min", ressources: "CPU", detail: "load of 19.4 for at most 12" }));
    await repos();
    await ouvrirOnglet(vue, "Cooks");
    const pose = ligne(vue, "box/claude");
    assert.match(pose.textContent, /Cooks at once: 3 at most — 8 cores/);
    assert.match(pose.textContent, /Saturated on CPU — load of 19\.4 for at most 12\. /);
    assert.ok(pose.textContent.includes(BAISSER_LE_PLAFOND));
    assert.equal(boutons(pose).includes(PLAFOND_PAR_DEFAUT), false);
    // Un geste : le nombre tapé, et le réglage part pour ce projet seul.
    const champ = pose.dessous("input")[0] ?? assert.fail("pas de champ");
    champ.value = "1";
    champ.declencher("input");
    pose.dessous("button").find((bouton) => bouton.textContent === POSER_LE_PLAFOND)?.click();
    await repos();
    assert.deepEqual(appels, [["box/claude", "1", PARADE]]);
    // Le plafond neuf arrive par l'accueil, et offre le retour au défaut.
    vue.dire("surAccueil", accueil({ dit: "1 at most — set by you, replaces 3 (8 cores)", nombre: 1, parLeChef: true }));
    await repos();
    assert.match(ligne(vue, "box/claude").textContent, /1 at most — set by you, replaces 3/);
    assert.doesNotMatch(ligne(vue, "box/claude").textContent, /Saturated on/);
    ligne(vue, "box/claude").dessous("button").find((bouton) => bouton.textContent === PLAFOND_PAR_DEFAUT)?.click();
    await repos();
    assert.deepEqual(appels.at(-1), ["box/claude", "auto", PARADE]);
  });
});
