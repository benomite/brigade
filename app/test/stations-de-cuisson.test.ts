// L'onglet Stations couvre chaque station du projet (#1185) : chaque cook avec sa station, une ligne par station — son
// état, ses cooks en cours, pour la box comme pour le Mac ou un autre
// ordinateur —, et la ligne mise à jour par la lecture qui suit le clic, sans recharger la page. Chaque station y est
// un bloc, et ses cooks en cours une ligne chacun, et seulement les siens (#1270). Sur l'onglet Rail,
// une seule ligne dit ce qui, du côté des cooks, demande un geste — une station saturée, un projet refusé, l'accès
// au dépôt bloqué —, avec de quoi ouvrir Stations ; aucune quand rien ne le demande.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../runtime/src/etat.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Carte, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { RIEN_NE_TOURNE, BAISSER_LE_PLAFOND, OUVRIR_COOKS, POSER_LE_PLAFOND } from "../src/vue/stations-de-cuisson.js";
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
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
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

async function ouvrir(stations: DuRuntime[] = STATIONS, faits: Faits = FAITS) {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this Mac" }],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, faits, stations);
  return { vue };
}
function recevoir(vue: Jouee, faits: Faits, stations: DuRuntime[]): void {
  vue.dire("surFaits", { ...dessinable(faits, stations), demande: vue.dernier("faits")[0] as number });
}

const lignes = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson");
const ligne = (vue: Jouee, nom: string) => lignes(vue).find((li) => li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
const etatDe = (pose: Faux) => pose.dessous("span").find((span) => span.className === "pilule")?.textContent;
const boutonDe = (pose: Faux) => pose.dessous("button").find((bouton) => bouton.ariaLabel?.includes(" on ") === true);
// Les lignes de cooks d'un bloc : le numéro et le titre de chacune — ou, sans cook, ce qui le dit.
const cooksDe = (pose: Faux) => {
  const liste = pose.dessous("ul").find((ul) => ul.className.startsWith("cooks")) ?? assert.fail("pas de liste de cooks");
  const lignesDeCooks = liste.children.filter((li) => li.className !== "agent");
  if (liste.className === "cooks vide") return lignesDeCooks.map((li) => li.textContent);
  return lignesDeCooks.map((li) => `${li.children[0]?.textContent}${li.children[1]?.textContent}`);
};
const alertes = (vue: Jouee) => vue.element("rail").dessous("p").filter((p) => p.className === "alerte-de-cuisine");

describe("l'onglet Stations : une ligne par station du projet", () => {
  test("chaque cook est nommé avec sa station, et chaque station a sa ligne : son état, ses cooks", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    // La carte du projet est fondue dans le bloc des stations (#1456) : sa ligne, en tête, dit l'état de la cuisine ; ses
    // cooks sont ceux des stations, et la carte n'est plus posée.
    assert.throws(() => vue.element("carte"), /aucun élément « carte »/);
    const cuisine = vue.element("rail").dessous("p").find(({ className }) => className === "etat-de-la-cuisine") ?? assert.fail("pas de ligne de la cuisine");
    assert.match(cuisine.textContent, /^kitchenopen/);
    // Les stations, dans l'ordre de `facts`, sans rôle dit (#1786).
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "stopped", "cooking"]);
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksDe(ligne(vue, "atelier/claude")), [RIEN_NE_TOURNE]);
    // Arrêtée, la station dit par qui, depuis quand, et ce qui y finit ; elle se dit distante.
    assert.match(ligne(vue, "mac/claude").textContent, /remote/);
    assert.match(ligne(vue, "mac/claude").textContent, /by you, for 3 min · 1 cook finishing/);
    // Aucune n'a de bouton : une station cuit tant qu'elle déclare des places, et s'arrête sur sa machine.
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)), [undefined, undefined, undefined]);
  });

  test("sur Rail, les stations ne se montrent pas", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(lignes(vue), []);
  });

  test("une station saturée comme une qui refuse le projet : aucune n'a de bouton, la seconde dit pourquoi", async () => {
    const refus = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
    const { vue } = await ouvrir([station("box/claude", { cuisson: "saturated", cooks: [COOK_14] }), station("atelier/claude", { cuisson: "refused", refus })]);
    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(lignes(vue).map(etatDe), ["saturated", "refused"]);
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)), [undefined, undefined]);
    assert.match(ligne(vue, "atelier/claude").textContent, /cannot run the project's cooks/);
  });
});

describe("l'onglet Stations : un bloc par station, et ses tickets en cours (#1270)", () => {
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

  test("les quatre états, un bloc chacun : son mot, sans bouton, et les cartes de ses tickets en cours, rien d'autre", async () => {
    const { vue } = await ouvrir(QUATRE, FAITS_QUATRE);
    await ouvrirOnglet(vue, "Stations");
    // Exactement un bloc par station du projet, dans l'ordre de `facts`, sans rôle dit (#1786).
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude", "pc/claude"]);
    assert.deepEqual(lignes(vue).map(etatDe), ["cooking", "stopped", "saturated", "refused"]);
    assert.deepEqual(lignes(vue).map((li) => boutonDe(li)), [undefined, undefined, undefined, undefined]);
    // Chacun porte les tickets en cours sur sa station, et seulement celles-là : #21, sur le rail, n'est nulle part.
    assert.deepEqual(lignes(vue).map(cooksDe), [["#14Le journal en ajout seul"], ["#15La carte des desserts"], ["#16Le menu du soir"], [RIEN_NE_TOURNE]]);
    assert.doesNotMatch(vue.element("rail").textContent, /#21/);
    // Aucune sortie brute de commande dans un bloc : ni `pre`, ni ligne lancée, ni code de sortie.
    for (const bloc of lignes(vue)) {
      assert.deepEqual(bloc.dessous("pre"), []);
      assert.doesNotMatch(bloc.textContent, /\$ |stderr|stdout|exit code|brigade :/);
    }
  });

  test("la lecture suivante redessine les blocs : un ticket qui quitte sa station quitte son bloc", async () => {
    const { vue } = await ouvrir(QUATRE, FAITS_QUATRE);
    await ouvrirOnglet(vue, "Stations");
    recevoir(vue, { ...FAITS_QUATRE, cooks: [COOK_15, COOK_16] }, [station("box/claude"), ...QUATRE.slice(1)]);
    await repos();
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), [RIEN_NE_TOURNE]);
    assert.deepEqual(cooksDe(ligne(vue, "mac/claude")), ["#15La carte des desserts"]);
  });
});

describe("deux stations du projet : chacune a sa ligne (#1289)", () => {
  const DEUX = (box: Partial<DuRuntime>, mac: Partial<DuRuntime>): DuRuntime[] => [station("box/claude", { cooks: [COOK_14], ...box }), station("mac/claude", { distante: true, cooks: [COOK_15], ...mac })];

  test("deux stations, deux lignes, chacune à son nom, son état et ses cooks ; la lecture d'une station arrêtée ne touche pas l'autre", async () => {
    const { vue } = await ouvrir(DEUX({}, {}));
    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(lignes(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude"]);
    assert.match(ligne(vue, "box/claude").dessous("strong")[0]?.textContent ?? "", /^box\/claude$/);
    assert.match(ligne(vue, "mac/claude").dessous("strong")[0]?.textContent ?? "", /^mac\/claude$/);
    const texteAvant = ligne(vue, "mac/claude").textContent;
    recevoir(vue, FAITS, DEUX({ cuisson: "stopped", arreteeDepuis: "2026-10-20T10:04:05.000Z" }, {}));
    await repos();
    assert.deepEqual(lignes(vue).map(etatDe), ["stopped", "cooking"]);
    assert.equal(ligne(vue, "mac/claude").textContent, texteAvant);
  });
});

describe("l'onglet Rail : une ligne quand les cooks demandent un geste", () => {
  // Ce que le process principal rend des projets que les stations publient, l'accès au dépôt de parade bloqué.
  const ACCES = { bloque: "fetch" as const, raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username (git: fatal: could not read Username).", geste: "Run `gh auth setup-git` on parade-box." };
  const vus = (acces: typeof ACCES | null): VuDesProjets => ({
    a: A,
    projets: [{ nom: PARADE, depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, acces, refus: null, worktree: null }],
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

  test("une station saturée : une seule ligne la dit, et « open Cooks » ouvre l'onglet Stations", async () => {
    const { vue } = await ouvrir([station("box/claude", { cuisson: "saturated" }), station("mac/claude", { distante: true })]);
    await ouvrirOnglet(vue, "Rail");
    const [alerte, ...autres] = alertes(vue);
    assert.deepEqual(autres, []);
    assert.equal(alerte?.children[0]?.textContent, "box/claude is saturated: it takes no ticket until its machine has room.");
    // Elle est en tête de l'onglet.
    assert.equal(vue.element("rail").children[0]?.children[0], alerte);
    const lien = alerte?.dessous("button").find((bouton) => bouton.textContent === OUVRIR_COOKS) ?? assert.fail("pas de lien vers les stations");
    lien.click();
    await repos();
    assert.deepEqual(vue.element("onglets-du-projet").children.filter((onglet) => onglet.ariaSelected === "true").map((onglet) => onglet.textContent), ["Stations"]);
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
    // Le bloc des stations, qui détaille l'accès et son geste, reste sur Stations : sur Rail, la ligne seule le dit.
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

describe("la ligne de station dit le plafond du projet, sans le régler (ticket 1292)", () => {
  const accueil = (plafond: { dit: string; nombre: number | null; parLeChef: boolean }, retenue?: { depuis: string; ressources: string; detail: string }) => ({
    projets: [],
    sante: { ton: "vert" as const, dit: "", survol: "" },
    plafonds: { [PARADE]: { "box/claude": { plafond, ...(retenue === undefined ? {} : { retenue }) } } },
  });

  test("le plafond et ce qui sature, puis le plafond neuf à la lecture suivante ; ni champ ni bouton pour le régler", async () => {
    const vue = await jouerLaVue({
      demarrage,
      espace: () => [SECOND],
      machines: () => [{ id: "poste", titre: "this Mac" }],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    recevoir(vue, FAITS, [station("box/claude", { cuisson: "saturated", cooks: [COOK_14] })]);
    vue.dire("surAccueil", accueil({ dit: "3 at most — 8 cores", nombre: 3, parLeChef: false }, { depuis: "3 min", ressources: "CPU", detail: "load of 19.4 for at most 12" }));
    await repos();
    await ouvrirOnglet(vue, "Stations");
    const pose = ligne(vue, "box/claude");
    assert.match(pose.textContent, /Cooks at once: 3 at most — 8 cores/);
    assert.match(pose.textContent, /Saturated on CPU — load of 19\.4 for at most 12\. /);
    assert.ok(pose.textContent.includes(BAISSER_LE_PLAFOND));
    assert.equal(pose.dessous("input").length, 0);
    assert.equal(pose.dessous("button").some((bouton) => bouton.textContent === POSER_LE_PLAFOND), false);
    vue.dire("surAccueil", accueil({ dit: "1 at most — set by you, replaces 3 (8 cores)", nombre: 1, parLeChef: true }));
    await repos();
    assert.match(ligne(vue, "box/claude").textContent, /1 at most — set by you, replaces 3/);
    assert.doesNotMatch(ligne(vue, "box/claude").textContent, /Saturated on/);
  });
});

describe("le bloc de chaque station montre ce qu'elle fait tourner hors de ses cooks : la pass, le manager, le closer (#1971)", () => {
  const PASSE = { role: "pass", station: "box/claude", ticket: 21, fait: "review in progress", depuis: "2026-10-20T10:01:11.000Z" };
  const JUGE = { role: "manager", station: "box/claude", ticket: 30, fait: "qualifying the issue", depuis: "2026-10-20T10:04:01.000Z" };
  const NETTOIE = { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T09:04:11.000Z" };
  const agentsDe = (pose: Faux) => pose.dessous("li").filter((li) => li.className === "agent");

  test("une ligne par agent, avant celles des cooks : son rôle, son ticket, ce qu'il fait et depuis quand — distincte d'une ligne de cook", async () => {
    const { vue } = await ouvrir(STATIONS, { ...FAITS, agents: [PASSE, JUGE, NETTOIE] });
    await ouvrirOnglet(vue, "Stations");
    const box = ligne(vue, "box/claude");
    const agents = agentsDe(box);
    assert.deepEqual(agents.map((agent) => agent.dataset.role), ["pass", "manager", "closer"]);
    assert.deepEqual(agents.map((agent) => agent.textContent), [
      "pass#21review in progress · for 3 min",
      "manager#30qualifying the issue · for 10 s",
      "closerclosing: cleaning up the project · for 1 h 00",
    ]);
    // L'heure au survol de ce qu'il fait, ce qu'est son rôle au survol de son mot.
    const [pass] = agents;
    assert.equal(pass?.dessous("span").find((span) => span.className === "agent-fait")?.title, "since 2026-10-20T10:01:11.000Z");
    assert.match(pass?.dessous("strong").find((fort) => fort.className === "agent-role")?.title ?? "", /judges a delivery/);
    // Les agents viennent d'abord, puis la ligne du cook ; une autre station n'en a aucun.
    const posees = box.dessous("ul").find((ul) => ul.className === "cooks")?.children ?? assert.fail("pas de lignes");
    assert.deepEqual(posees.map((li) => li.className), ["agent", "agent", "agent", ""]);
    assert.deepEqual(cooksDe(ligne(vue, "atelier/claude")), [RIEN_NE_TOURNE]);
    assert.deepEqual(agentsDe(ligne(vue, "mac/claude")), []);
  });

  test("une station qui ne fait tourner qu'une pass ne se dit pas sans rien : la ligne de la pass, et pas celle qui dit que rien ne tourne ; la pass finie, à la lecture suivante, elle quitte le bloc", async () => {
    const seule = [station("box/claude"), station("mac/claude", { distante: true })];
    const { vue } = await ouvrir(seule, { ...FAITS, cooks: [], agents: [PASSE] });
    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(agentsDe(ligne(vue, "box/claude")).map((agent) => agent.dataset.role), ["pass"]);
    assert.deepEqual(ligne(vue, "box/claude").dessous("ul").filter((ul) => ul.className === "cooks vide"), []);
    assert.equal(ligne(vue, "box/claude").textContent.includes(RIEN_NE_TOURNE), false);

    recevoir(vue, { ...FAITS, cooks: [], agents: [] }, seule);
    await repos();
    assert.deepEqual(agentsDe(ligne(vue, "box/claude")), []);
    assert.deepEqual(cooksDe(ligne(vue, "box/claude")), [RIEN_NE_TOURNE]);
  });
});
