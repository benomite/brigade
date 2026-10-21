// Les gestes de la file sur le téléphone appairé (ticket 1164) : merger une PR qui attend, trancher une carte, arrêter
// ou relancer la cuisine d'un projet. La vue est celle du desktop, sur un écran étroit (#1186), et ses gestes appellent
// les mêmes actions du pont que sur le desktop : `gesteDeFiche` — le geste, le ticket, jamais une commande — et
// `cuireSurLaStation`. Sur le téléphone, il n'y a pas de second où écrire la commande : le pont rend ce que la station
// a fait (`fait`), comme pour une station sur Cooks. La fiche le dit, la box est relue tout de suite, et la carte quitte
// la file à la lecture qui suit. Un geste refusé, ou un pont qui lève, le dit en une ligne, son détail au survol, et la
// file reste ce qu'elle était. Vus sur les captures `telephone-gestes*` de scripts/capture-ecran (docs/captures/1164/).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import type { RenduDeCuisson } from "../../src/cuisson.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { type Faux, FauxEcran, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }];
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const PR_12 = "https://github.com/chef/parade/pull/40";

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé, ni code ni stations lus — et le projet que sa station sert.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { appaire: true as const, station: "box", adresse: "http://192.168.1.20:7010" },
});

type Station = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<Station> = {}): Station => ({
  station: nom,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...plus,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// Dans TODO, deux décisions : #12, verte, que la pass ne merge pas sans le grant — la merger ; #31, dont la PR a été
// fermée sans merge — la sortir du rail. #21 est sur le rail ; #14 cuit sur la box.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 2, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: issue(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null },
    { ticket: 31, etat: "en pass", titre: "Le tri des fournisseurs", url: issue(31), activite: null },
  ],
  cooks: [COOK_14],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: issue(12), decision: { quoi: "merge", motif: "no-grant", cause: null, pr: PR_12 } },
    { ticket: 31, titre: "Le tri des fournisseurs", url: issue(31), decision: { quoi: "fermee", motif: null, cause: null, pr: null } },
  ],
  stations: [station("box/claude", { cooks: [COOK_14] })],
};
// La lecture qui suit le merge de #12 : servi, il n'attend plus personne.
const MERGEE: Faits = {
  ...FAITS,
  compteurs: { ...FAITS.compteurs, aLaPass: 1, attend: 1, livres24h: 1 },
  rail: FAITS.rail.map((ticket) => (ticket.ticket === 12 ? { ...ticket, etat: "servi" } : ticket)),
  attend: (FAITS.attend ?? []).filter(({ ticket }) => ticket !== 12),
};
// Celle qui suit le retrait de #31 : il a quitté le rail.
const RETIREE: Faits = { ...FAITS, compteurs: { ...FAITS.compteurs, aLaPass: 1, attend: 1 }, rail: FAITS.rail.filter(({ ticket }) => ticket !== 31), attend: (FAITS.attend ?? []).filter(({ ticket }) => ticket !== 31) };
// Celle qui suit l'arrêt de la cuisine sur la box : ses cooks finissent.
const ARRETEE: Faits = { ...FAITS, stations: [station("box/claude", { cuisson: "stopped", arreteeDepuis: A, cooks: [COOK_14] })] };

const dessinable = (faits: Faits) => tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
// Ce que la box rend à la lecture que la vue a demandée en dernier — la relecture qu'un geste fait demande comprise.
function lire(vue: Jouee, faits: Faits): void {
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(faits), demande: demandes.at(-1)?.args[0] as number });
}

// L'espace de parade ouvert sur le téléphone, ses faits lus. Les gestes de la fiche sont ceux du process principal
// (gestes-fiche.ts), pour la carte que la vue lui donne.
async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [], gestesDeFiche: (carte) => gestesDeCarte(carte), ...reponses }, { ecran: new FauxEcran(true) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  lire(vue, FAITS);
  await repos();
  return vue;
}

const rail = (vue: Jouee) => vue.element("rail");
// Les tickets de chaque colonne de Rail, par son nom.
const file = (vue: Jouee) =>
  Object.fromEntries(
    rail(vue)
      .dessous("section")
      .filter((pose) => pose.className === "colonne")
      .map((colonne) => [colonne.children[0]?.children[0]?.textContent, colonne.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent)]),
  );
const fiche = (vue: Jouee) => vue.element("fiche");
async function toucherLaCarte(vue: Jouee, numero: number): Promise<void> {
  const carte = rail(vue).dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de carte #${numero}`);
  carte.click();
  await repos();
}
const gestes = (vue: Jouee) => fiche(vue).dessous("section").find((pose) => pose.className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
// Le bouton d'un geste de la fiche — pas l'icône de son survol.
const geste = (vue: Jouee, id: string): Faux => gestes(vue).dessous("li").find((ligne) => ligne.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} »`);
// Toucher un geste qui coûte, puis son « oui » : la confirmation dit son prix d'abord.
async function confirmer(vue: Jouee, id: string): Promise<void> {
  geste(vue, id).click();
  await repos();
  const confirmation = gestes(vue).dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
  (confirmation.dessous("button").find((pose) => pose.className === "recommande") ?? assert.fail("pas de « oui »")).click();
  await repos();
}
// Ce que la fiche dit sous ses gestes : sa ligne, sa classe, et son survol.
const issueDuGeste = (vue: Jouee) => gestes(vue).children.filter((pose) => pose.balise === "p").map((pose) => ({ classe: pose.className, dit: pose.textContent, survol: pose.title }));

describe("depuis le téléphone, merger une PR qui attend", () => {
  test("TODO : #12, son geste recommandé « merge the PR » ; confirmé, il part nommé — projet, geste, ticket —, la fiche dit ce que la station a fait, la box est relue, et #12 quitte la file", async () => {
    const vue = await ouvrir({ gesteDeFiche: () => ({ fait: "#12 merged into the integration branch", detail: "brigade : #12: merged (PR #40)" }) });
    assert.deepEqual(file(vue).TODO, ["#12", "#31"]);
    await toucherLaCarte(vue, 12);
    assert.equal(geste(vue, "merger").className, "recommande");
    assert.equal(geste(vue, "merger").textContent, "merge the PR");
    const relues = vue.appels.filter(({ geste: nom }) => nom === "relireBox").length;
    await confirmer(vue, "merger");
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "merger", 12, undefined]);
    assert.deepEqual(issueDuGeste(vue), [{ classe: "dit", dit: "#12 merged into the integration branch", survol: "brigade : #12: merged (PR #40)" }]);
    assert.equal(vue.appels.filter(({ geste: nom }) => nom === "relireBox").length, relues + 1, "la box est relue tout de suite");
    lire(vue, MERGEE);
    await repos();
    assert.deepEqual(file(vue).TODO, ["#31"]);
    assert.deepEqual(file(vue).Served, ["#12"]);
  });

  test("tant que la station n'a pas répondu, la fiche le dit et ses gestes attendent : rien ne part deux fois", async () => {
    let rendre: (rendu: { fait: string }) => void = () => {};
    const vue = await ouvrir({ gesteDeFiche: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    await toucherLaCarte(vue, 12);
    await confirmer(vue, "merger");
    assert.deepEqual(issueDuGeste(vue).map(({ dit }) => dit), ["merge the PR: sent, waiting for the answer…"]);
    assert.equal(geste(vue, "merger").disabled, true);
    assert.equal(geste(vue, "issue").disabled, true);
    rendre({ fait: "#12 merged into the integration branch" });
    await repos();
    assert.deepEqual(issueDuGeste(vue).map(({ dit }) => dit), ["#12 merged into the integration branch"]);
    assert.equal(geste(vue, "merger").disabled, false);
    assert.equal(vue.appels.filter(({ geste: nom }) => nom === "gesteDeFiche").length, 1);
  });
});

describe("sur une fenêtre étroite du desktop, le geste part dans le second, que l'écran ne montre pas à côté de la fiche", () => {
  test("la fiche dit où lire sa réponse : l'onglet Second", async () => {
    const vue = await ouvrir({ gesteDeFiche: () => ({ id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "written in the second", arrete: false }) });
    await toucherLaCarte(vue, 12);
    await confirmer(vue, "merger");
    assert.deepEqual(issueDuGeste(vue), [{ classe: "dit", dit: "sent to the second: its answer is in the Second tab", survol: "" }]);
  });
});

describe("depuis le téléphone, trancher une carte", () => {
  test("TODO : #31, sa PR fermée sans merge — « remove from the rail », recommandé, confirmé : la carte quitte la file à la lecture qui suit", async () => {
    const vue = await ouvrir({ gesteDeFiche: () => ({ fait: "#31 left the rail" }) });
    await toucherLaCarte(vue, 31);
    assert.equal(geste(vue, "retirer").className, "recommande");
    await confirmer(vue, "retirer");
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "retirer", 31, undefined]);
    assert.deepEqual(issueDuGeste(vue), [{ classe: "dit", dit: "#31 left the rail", survol: "" }]);
    lire(vue, RETIREE);
    await repos();
    assert.deepEqual(file(vue).TODO, ["#12"]);
    assert.ok(!Object.values(file(vue)).flat().includes("#31"), "#31 n'est plus nulle part dans la file");
  });
});

describe("depuis le téléphone, un geste qui échoue le dit et laisse la file telle quelle", () => {
  for (const [cas, gesteDeFiche, dit, survol] of [
    ["refusé par la station", () => ({ refus: "#12 was not merged: GitHub refused the merge", detail: "brigade : #12: merge refused — Pull Request is not mergeable" }), "#12 was not merged: GitHub refused the merge", "brigade : #12: merge refused — Pull Request is not mergeable"],
    ["la station injoignable : le pont lève", () => Promise.reject(new Error("connect ETIMEDOUT 192.168.1.20:7010")), "nothing was sent — nothing was changed", "connect ETIMEDOUT 192.168.1.20:7010"],
    // Le pont Android d'aujourd'hui (app/android/web/pont.js) : un geste qu'il ne connaît pas ne rend rien.
    ["le pont ne porte pas l'action : il ne rend rien", () => undefined, "nothing was sent — nothing was changed", "this app does not carry this action to the station yet"],
  ] as const) {
    test(`${cas} : une ligne, son détail au survol seulement ; la box n'est pas relue, et #12 reste dans TODO`, async () => {
      const vue = await ouvrir({ gesteDeFiche: gesteDeFiche as Reponses["gesteDeFiche"] });
      const avant = file(vue);
      await toucherLaCarte(vue, 12);
      const relues = vue.appels.filter(({ geste: nom }) => nom === "relireBox").length;
      await confirmer(vue, "merger");
      assert.deepEqual(issueDuGeste(vue), [{ classe: "refus", dit, survol }]);
      assert.doesNotMatch(gestes(vue).textContent, /ETIMEDOUT|brigade :/, "le détail n'est qu'au survol");
      assert.equal(vue.appels.filter(({ geste: nom }) => nom === "relireBox").length, relues);
      assert.deepEqual(file(vue), avant);
      assert.equal(geste(vue, "merger").disabled, false, "le geste se rejoue");
    });
  }
});

describe("depuis le téléphone, arrêter ou relancer la cuisine d'un projet", () => {
  const cooks = async (vue: Jouee) => {
    (vue.element("onglets-du-projet").children.find((onglet) => onglet.textContent === "Cooks") ?? assert.fail("pas d'onglet Cooks")).click();
    await repos();
  };
  const ligne = (vue: Jouee) => rail(vue).dessous("li").find((li) => li.className === "station-de-cuisson") ?? assert.fail("pas de station");
  const bouton = (vue: Jouee) => ligne(vue).dessous("button").find((pose) => pose.className !== "aide") ?? assert.fail("pas de bouton sur la station");
  const etat = (vue: Jouee) => ligne(vue).dessous("span").find((pose) => pose.className === "pilule")?.textContent;
  const dit = (vue: Jouee) => ligne(vue).dessous("p").map((pose) => [pose.className, pose.textContent]);

  test("« stop cooking » arrête la cuisine sur la box, et l'écran dit son état neuf ; « start cooking » la relance", async () => {
    const rendus: Record<string, RenduDeCuisson> = { stop: { fait: "box/claude stops cooking parade" }, start: { fait: "box/claude cooks parade again" } };
    const vue = await ouvrir({ cuireSurLaStation: (_projet, _station, quoi) => rendus[quoi] as RenduDeCuisson });
    await cooks(vue);
    assert.equal(etat(vue), "cooking");
    assert.equal(bouton(vue).textContent, "stop cooking");
    bouton(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("cuireSurLaStation"), [PARADE, "box/claude", "stop"]);
    assert.deepEqual(dit(vue), [["dit", "box/claude stops cooking parade"]]);
    lire(vue, ARRETEE);
    await repos();
    assert.equal(etat(vue), "stopped");
    assert.equal(bouton(vue).textContent, "start cooking");
    bouton(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("cuireSurLaStation"), [PARADE, "box/claude", "start"]);
    lire(vue, FAITS);
    await repos();
    assert.equal(etat(vue), "cooking");
    assert.equal(bouton(vue).textContent, "stop cooking");
  });

  test("refusé, il le dit sous la station, et elle reste dans son état", async () => {
    const vue = await ouvrir({ cuireSurLaStation: () => ({ refus: "box/claude was not stopped", detail: "brigade : station unreachable" }) });
    await cooks(vue);
    bouton(vue).click();
    await repos();
    assert.deepEqual(dit(vue), [["dit refus", "box/claude was not stopped"]]);
    assert.equal(etat(vue), "cooking");
    assert.equal(bouton(vue).textContent, "stop cooking");
  });

  test("un pont qui ne porte pas l'action ne rend rien : la station le dit, et le bouton se rejoue", async () => {
    const vue = await ouvrir({ cuireSurLaStation: () => undefined as unknown as RenduDeCuisson });
    await cooks(vue);
    bouton(vue).click();
    await repos();
    assert.deepEqual(dit(vue), [["dit refus", "box/claude: nothing was sent — nothing was changed"]]);
    assert.equal(bouton(vue).disabled, false);
    assert.equal(etat(vue), "cooking");
  });
});
