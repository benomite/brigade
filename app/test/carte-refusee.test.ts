// Une carte du rail que plus aucun cook ne prendra (ticket 3147), côté vue : sa première ligne dit « Will not start: … » en
// mots simples, le message de la station est derrière « details », en entier ; trois boutons — « Relaunch », « Close as
// already done », « Ask the second » — partent chacun vers son geste, et la carte relue n'est plus refusée. Une carte qui
// attend une autre la nomme, et son numéro s'ouvre. La vue est jouée telle qu'elle est, devant un faux document et un faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const A = "2026-11-10T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const BRUT = "off the kitchen after 3 cooks without a delivery — the cook added nothing, last message of the cook: Aucun changement à livrer, the ticket is already served by #3100 and the working tree is clean";
const rail = (refuse: boolean): Faits["rail"] => [
  { ticket: 21, etat: "en attente", titre: "L'export", url: ISSUE(21), activite: null, attente: null },
  refuse
    ? { ticket: 22, etat: "86", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: { raison: "off the kitchen after 3 cooks without a delivery — the cook added nothing…", complete: BRUT, colonne: "en attente", retour: null } }
    : { ticket: 22, etat: "en attente", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: null },
];
const faits = (refuse: boolean): Faits => ({ etat: "ouverte", lu: "2026-11-10T10:04:11.000Z", dernierTick: "2026-11-10T10:04:11.000Z", compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: rail(refuse), cooks: [], attend: [] });
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       2 en attente", "  #21  en attente  -  zone tenue par #3128 (app/src) — depuis 2 h 05  L'export", ""].join("\n");
function dessinable(refuse: boolean): Dessinable {
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(refuse)) }] });
  return tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? recue;
}
const recevoir = (vue: Jouee, refuse = true) => vue.dire("surFaits", { ...dessinable(refuse), demande: vue.dernier("faits")[0] as number });
const bon = (vue: Jouee, ticket: number): Faux => carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const boutons = (ou: Faux) => ou.dessous("button").map(({ textContent }) => textContent);
const bouton = (ou: Faux, libelle: string): Faux => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const ligne = (ou: Faux) => ou.dessous("p").find(({ className }) => className.includes("refus-ligne"));

describe("la carte que plus aucun cook ne prendra", () => {
  test("sa première ligne dit pourquoi en mots simples ; le message de la station est derrière « details », en entier", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await repos();
    const carte = bon(vue, 22);
    assert.equal(ligne(carte)?.textContent, "Will not start: 3 cooks in a row stopped without delivering anything.");
    assert.ok("refus" in carte.dataset, "la carte est distincte de celles qui attendent leur tour");
    assert.ok(!("refus" in bon(vue, 21).dataset));
    // La ligne est en haut : avant le titre. Le message brut n'est nulle part en clair, seulement dans « details ».
    const pli = carte.dessous("details")[0] ?? assert.fail("pas de « details »");
    assert.ok(pli.dessous("p").some(({ textContent }) => textContent === BRUT), "le message entier, non coupé");
    assert.ok(!carte.dessous("p").some(({ textContent }) => textContent.includes("added nothing…")));
    // Une carte qui attend son tour n'a ni cette ligne ni ces boutons.
    assert.equal(ligne(bon(vue, 21)), undefined);
    assert.ok(!boutons(bon(vue, 21)).includes("Relaunch"));
  });

  test("elle montre trois boutons, et le « report to brigade » n'est pas le seul geste", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await repos();
    const dits = boutons(bon(vue, 22));
    for (const libelle of ["Relaunch", "Close as already done", "Ask the second"]) assert.ok(dits.includes(libelle), `${libelle} : ${dits.join(" | ")}`);
    assert.ok(dits.includes("report to brigade"));
  });

  test("« Relaunch » part pour ce ticket ; relue sans le label, la carte n'est plus refusée et attend son tour", async () => {
    const vue = await ouvrir({ refus: () => ({ fait: "relaunched on GitHub: #22 no longer carries `served-elsewhere`", detail: ISSUE(22) }) });
    recevoir(vue);
    await repos();
    bouton(bon(vue, 22), "Relaunch").click();
    await repos();
    assert.deepEqual(vue.dernier("refus"), ["parade", "relancer", 22]);
    recevoir(vue, false);
    await repos();
    assert.equal(ligne(bon(vue, 22)), undefined);
    assert.ok(!("refus" in bon(vue, 22).dataset));
    assert.ok(!boutons(bon(vue, 22)).includes("Relaunch"));
    assert.ok(bon(vue, 22).dessous("p").some(({ textContent }) => textContent === "ready, waits for a place in the kitchen"));
  });

  test("« Close as already done » part pour ce ticket ; l'issue fermée, la carte n'est plus sur le rail", async () => {
    const vue = await ouvrir({ refus: () => ({ fait: "closed as completed on GitHub: #22 leaves the rail", detail: ISSUE(22) }) });
    recevoir(vue);
    await repos();
    bouton(bon(vue, 22), "Close as already done").click();
    await repos();
    assert.deepEqual(vue.dernier("refus"), ["parade", "clore", 22]);
    // La lecture suivante ne porte plus le ticket.
    const sans = { ...faits(false), rail: rail(false).filter(({ ticket }) => ticket !== 22), compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } };
    const tenus = tenirFaits();
    vue.dire("surFaits", { ...tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(sans) }] }), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.equal(carteDuTicket(vue, 22), undefined);
  });

  test("un geste refusé reste sur la carte et dit pourquoi rien n'a changé", async () => {
    const vue = await ouvrir({ refus: () => ({ refus: "nothing was changed: GitHub did not close #22", detail: "403" }) });
    recevoir(vue);
    await repos();
    bouton(bon(vue, 22), "Close as already done").click();
    await repos();
    await repos();
    assert.equal(ligne(bon(vue, 22))?.textContent?.startsWith("Will not start:"), true);
    assert.ok(bon(vue, 22).dessous("span").some(({ textContent }) => textContent === "nothing was changed: GitHub did not close #22"));
  });

  test("« Ask the second » passe la carte au second par la passation qui existe, sans question", async () => {
    const vue = await ouvrir({ passerAuSecond: () => ({ ...SECOND, demandeEcrite: true }) });
    recevoir(vue);
    await repos();
    bouton(bon(vue, 22), "Ask the second").click();
    await repos();
    assert.deepEqual(vue.dernier("passerAuSecond"), ["parade", 22, null]);
  });

  test("une carte qui attend une autre la nomme, et son numéro s'ouvre sur son issue", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true });
    recevoir(vue);
    await repos();
    const attend = bon(vue, 21).dessous("p").find(({ className }) => className === "ligne-carte") ?? assert.fail("pas de ligne");
    assert.equal(attend.textContent, "Waiting for #3128");
    const lien = attend.dessous("button").find(({ textContent }) => textContent === "#3128") ?? assert.fail("le numéro n'est pas un lien");
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue").slice(0, 2), ["parade", 3128]);
  });
});
