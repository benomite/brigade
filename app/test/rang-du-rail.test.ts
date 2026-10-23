// Ranger les cartes de « On the rail » (ticket 1347) : sur l'écran large, une carte en attente se glisse vers le haut
// ou le bas de sa colonne et se lâche à côté d'une autre. Elle prend aussitôt sa place et la priorité de sa voisine,
// badge compris, et le process principal joue `rail move` ; la lecture qui suit montre l'ordre que le runtime sert — le
// même après un redémarrage de l'app. Refusée — elle passerait devant un ticket qu'elle attend —, elle reprend sa place,
// et la phrase du runtime le dit sous la tête de la colonne. La carte en tête qui ne part pas dit pourquoi.
// La vue est jouée devant un faux document (aides/fausse-vue.ts) : le glisser du navigateur y est rejoué événement par
// événement, sur la carte puis sur sa colonne, comme ils remontent.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import type { Cote, RenduDuDeplacement } from "../src/deplacement.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, FauxStockage, FauxTransfert, jouerLaVue, type Jouee, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-10-20T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Le rail de parade tel que le runtime le sert : #14 pris ; en attente, #23 et #21 en `prio:1`, #22 sans priorité. #23, en
// tête, ne part pas : #14 tient sa zone. `facts` les donne dans l'ordre de service, `status` les imprime dans le même.
type EnFile = { ticket: number; prio: string; raison?: string };
const TITRES: Record<number, string> = { 21: "L'export du journal", 22: "Un ticket libre", 23: "Le menu du soir" };
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const RAIL: EnFile[] = [{ ticket: 23, prio: "prio:1", raison: "zone held by #14 (app/src)" }, { ticket: 21, prio: "prio:1" }, { ticket: 22, prio: "-" }];

function lecture(file: EnFile[], a: string = A): Dessinable {
  const faits: Faits = {
    etat: "ouverte",
    lu: a,
    dernierTick: null,
    compteurs: { rail: file.length, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: issue(14), activite: null },
      ...file.map(({ ticket, raison }) => ({ ticket, etat: "en attente", titre: TITRES[ticket] ?? "", url: issue(ticket), activite: null, raison: raison ?? null })),
    ],
    cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
    attend: [],
  };
  const status = [
    "project    parade",
    "",
    `rail       1 taken · ${file.length} queued`,
    "  #14  taken  prio:1  by box/claude since 12 min, lease 27 min left  Le journal en ajout seul",
    ...file.map(({ ticket, prio, raison }) => `  #${ticket}  queued  ${prio}  ${raison === undefined ? "" : `${raison} — `}since 3 min  ${TITRES[ticket]}`),
    "",
  ].join("\n");
  const tenus = tenirFaits();
  tenus.recevoir({ projet: PARADE, demande: 0, a, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien de dessiné");
}

// Ce que le pont répond à une carte lâchée : rien tant que le test ne le lâche pas.
type Reponse = { projet: string; ticket: number; voisin: number; cote: Cote; rendre(rendu: RenduDuDeplacement): void };

async function ouvrir(file: EnFile[] = RAIL, stockage?: FauxStockage) {
  const reponses: Reponse[] = [];
  const vue = await jouerLaVue(
    {
      demarrage,
      espace: () => [SECOND],
      // Le faux pont attend la promesse rendue : la réponse arrive quand le test la lâche.
      deplacer: (projet, ticket, voisin, cote) => new Promise<RenduDuDeplacement>((rendre) => reponses.push({ projet, ticket, voisin, cote, rendre })) as unknown as RenduDuDeplacement,
    },
    stockage === undefined ? {} : { stockage },
  );
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, file);
  return { vue, reponses };
}
function recevoir(vue: Jouee, file: EnFile[], a: string = A): void {
  vue.dire("surFaits", { ...lecture(file, a), demande: vue.dernier("faits")[0] as number });
}

const colonne = (vue: Jouee): Faux =>
  vue.element("rail").dessous("section").find((section) => section.className === "colonne" && section.children[0]?.children[0]?.textContent === "On the rail") ?? assert.fail("pas de colonne On the rail");
const cartes = (vue: Jouee) => colonne(vue).dessous("li").filter((li) => li.classList.contains("bon"));
const numero = (carte: Faux) => Number(carte.children[0]?.children[0]?.textContent.slice(1));
const ordre = (vue: Jouee) => cartes(vue).map(numero);
const carte = (vue: Jouee, ticket: number) => cartes(vue).find((pose) => numero(pose) === ticket) ?? assert.fail(`pas de carte #${ticket}`);
const prio = (vue: Jouee, ticket: number) => carte(vue, ticket).children.find((enfant) => enfant.classList.contains("prio"))?.textContent;
const refus = (vue: Jouee) => colonne(vue).children.filter((enfant) => enfant.className === "refus-de-rang");
const traits = (vue: Jouee) =>
  cartes(vue).flatMap((pose) => [...(pose.classList.contains("depot-avant") ? [`avant #${numero(pose)}`] : []), ...(pose.classList.contains("depot-apres") ? [`après #${numero(pose)}`] : [])]);

// Un événement de glisser, tel qu'il remonte : de la carte survolée jusqu'à sa colonne. Rend s'il a été accepté —
// `preventDefault`, ce qui permet de lâcher.
function remonter(vue: Jouee, type: string, ou: Faux, transfert: FauxTransfert): boolean {
  let accepte = false;
  const evenement = { dataTransfer: transfert, relatedTarget: null, preventDefault: () => void (accepte = true), stopPropagation: () => {} };
  for (const element of [ou, colonne(vue)]) element.declencher(type, evenement);
  return accepte;
}
// La carte `de` part, survole `sur` — et, `lacher`, y est lâchée : le navigateur finit par `dragend` sur elle.
function glisser(vue: Jouee, de: number, sur: number, lacher: boolean): { accepte: boolean } {
  const transfert = new FauxTransfert();
  const partie = carte(vue, de);
  partie.declencher("dragstart", { dataTransfer: transfert });
  const accepte = remonter(vue, "dragover", carte(vue, sur), transfert);
  if (lacher) {
    remonter(vue, "drop", carte(vue, sur), transfert);
    partie.declencher("dragend", { dataTransfer: transfert });
  }
  return { accepte };
}

describe("la colonne « On the rail » montre l'ordre du runtime", () => {
  test("ses cartes dans l'ordre où le runtime les sert, chacune avec sa priorité ; la tête qui ne part pas dit pourquoi", async () => {
    const { vue } = await ouvrir();
    assert.deepEqual(ordre(vue), [23, 21, 22]);
    assert.deepEqual([23, 21, 22].map((ticket) => prio(vue, ticket)), ["prio:1", "prio:1", "no prio"]);
    assert.match(carte(vue, 23).textContent, /does not leave: zone held by #14 \(app\/src\)/);
    assert.doesNotMatch(carte(vue, 21).textContent, /does not leave/);
    // Les cartes en attente se rangent ; celle du ticket pris non, ni aucune autre colonne.
    assert.deepEqual(cartes(vue).map(({ draggable }) => draggable), [true, true, true]);
    const prise = vue.element("rail").dessous("li").find((li) => li.classList.contains("bon") && numero(li) === 14) ?? assert.fail("pas de carte #14");
    assert.equal(prise.draggable, false);
  });

  test("après un redémarrage de l'app, la colonne a l'ordre que le runtime sert — le même que `status`", async () => {
    const stockage = new FauxStockage();
    const servi: EnFile[] = [{ ticket: 22, prio: "prio:1", raison: "machine saturated" }, { ticket: 23, prio: "prio:1" }, { ticket: 21, prio: "prio:1" }];
    await ouvrir(servi, stockage);
    const { vue } = await ouvrir(servi, stockage);
    assert.deepEqual(ordre(vue), [22, 23, 21]);
    assert.match(carte(vue, 22).textContent, /does not leave: machine saturated/);
  });
});

describe("glisser une carte et la lâcher entre deux autres", () => {
  test("en vol : la carte s'efface à demi, un trait dit où elle atterrira — avant la carte survolée si elle monte, après si elle descend, rien sur elle-même", async () => {
    const { vue, reponses } = await ouvrir();
    const { accepte } = glisser(vue, 22, 23, false);
    assert.equal(accepte, true);
    assert.equal(carte(vue, 22).classList.contains("glissee"), true);
    assert.deepEqual(traits(vue), ["avant #23"]);
    remonter(vue, "dragover", carte(vue, 22), new FauxTransfert());
    // Un transfert sans la carte — un fichier glissé d'ailleurs — n'est pas reçu : le trait reste où il était.
    assert.deepEqual(traits(vue), ["avant #23"]);
    carte(vue, 22).declencher("dragend");
    assert.deepEqual(traits(vue), []);
    assert.equal(carte(vue, 22).classList.contains("glissee"), false);

    const transfert = new FauxTransfert();
    carte(vue, 23).declencher("dragstart", { dataTransfer: transfert });
    remonter(vue, "dragover", carte(vue, 21), transfert);
    assert.deepEqual(traits(vue), ["après #21"]);
    remonter(vue, "dragover", carte(vue, 23), transfert);
    assert.deepEqual(traits(vue), []);
    // Lâchée sur elle-même : rien ne part.
    remonter(vue, "drop", carte(vue, 23), transfert);
    assert.deepEqual(reponses, []);
  });

  test("lâchée entre deux autres : elle y est aussitôt, `rail move` part, et la lecture qui suit garde l'ordre du runtime", async () => {
    const { vue, reponses } = await ouvrir();
    glisser(vue, 21, 23, true);
    await repos();
    assert.deepEqual(reponses.map(({ projet, ticket, voisin, cote }) => [projet, ticket, voisin, cote]), [[PARADE, 21, 23, "before"]]);
    // Sans attendre la station.
    assert.deepEqual(ordre(vue), [21, 23, 22]);
    // Une seule à la fois : tant que la station n'a pas répondu, aucune autre ne part.
    glisser(vue, 22, 23, true);
    await repos();
    assert.equal(reponses.length, 1);
    const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    reponses[0]?.rendre({ place: true, dit: "#21: placed before #23, prio:1 — cost: none" });
    await repos();
    // Placée : la box est relue tout de suite, et la colonne garde la place jusqu'à cette lecture.
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
    assert.deepEqual(ordre(vue), [21, 23, 22]);
    assert.deepEqual(refus(vue), []);
    // La lecture suivante dit l'ordre que le runtime sert : c'est lui que la colonne montre.
    recevoir(vue, [{ ticket: 21, prio: "prio:1", raison: "zone held by #14 (app/src)" }, { ticket: 23, prio: "prio:1" }, { ticket: 22, prio: "-" }], "2026-10-20T10:04:20.000Z");
    assert.deepEqual(ordre(vue), [21, 23, 22]);
    assert.match(carte(vue, 21).textContent, /does not leave: zone held by #14/);
    assert.doesNotMatch(carte(vue, 23).textContent, /does not leave/);
  });

  test("lâchée parmi des cartes d'une autre priorité : son badge prend la leur, dès le lâcher", async () => {
    const { vue, reponses } = await ouvrir();
    assert.equal(prio(vue, 22), "no prio");
    glisser(vue, 22, 21, true);
    await repos();
    assert.deepEqual(reponses.map(({ ticket, voisin, cote }) => [ticket, voisin, cote]), [[22, 21, "before"]]);
    assert.deepEqual(ordre(vue), [23, 22, 21]);
    assert.equal(prio(vue, 22), "prio:1");
    reponses[0]?.rendre({ place: true, dit: "#22: placed before #21, prio:1 — cost: `prio:1` is put on its issue" });
    await repos();
    assert.equal(prio(vue, 22), "prio:1");
  });

  test("refusée — elle passerait devant ce qu'elle attend : la carte reprend sa place, et une phrase dit pourquoi, ce que la station a rendu au survol", async () => {
    const { vue, reponses } = await ouvrir();
    glisser(vue, 22, 23, true);
    await repos();
    assert.deepEqual(ordre(vue), [22, 23, 21]);
    assert.equal(prio(vue, 22), "prio:1");
    reponses[0]?.rendre({ refus: "#22 awaits #23, so it cannot be placed before it.", detail: "$ ssh box brigade parade rail move 22 --before 23\nbrigade : #22 is not touched: …\n→ exit code 1" });
    await repos();
    assert.deepEqual(ordre(vue), [23, 21, 22]);
    assert.equal(prio(vue, 22), "no prio");
    const [phrase] = refus(vue);
    assert.equal(phrase?.children[0]?.textContent, "#22 awaits #23, so it cannot be placed before it.");
    assert.match(phrase?.dessous("button").find((bouton) => bouton.className === "aide")?.ariaLabel ?? "", /rail move 22 --before 23/);
    // La phrase reste jusqu'à la carte suivante que le chef lâche.
    recevoir(vue, RAIL, "2026-10-20T10:04:20.000Z");
    assert.equal(refus(vue).length, 1);
    glisser(vue, 21, 23, true);
    await repos();
    assert.deepEqual(refus(vue), []);
  });
});
