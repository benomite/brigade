// Une carte du rail que plus aucun cook ne prendra (ticket 3147), côté vue : sa première ligne dit « Will not start: … » en
// mots simples, le message de la station est derrière « details », en entier ; trois boutons — « Relaunch », « Close as
// already done », « Ask the second » — partent chacun vers son geste, et la carte relue n'est plus refusée. Une carte qui
// attend une autre la nomme, et son numéro s'ouvre. La vue est jouée telle qu'elle est, devant un faux document et un faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const A = "2026-11-10T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const RAW = "off the kitchen after 3 cooks without a delivery — the cook added nothing, last message of the cook: Aucun changement à livrer, the ticket is already served by #3100 and the working tree is clean";
const rail = (refuses: boolean): Facts["rail"] => [
  { ticket: 21, etat: "en attente", titre: "L'export", url: ISSUE(21), activite: null, attente: null },
  refuses
    ? { ticket: 22, etat: "86", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: { raison: "off the kitchen after 3 cooks without a delivery — the cook added nothing…", complete: RAW, label: "served-elsewhere", colonne: "en attente", retour: null } }
    : { ticket: 22, etat: "en attente", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: null },
];
const facts = (refuses: boolean): Facts => ({ etat: "ouverte", lu: "2026-11-10T10:04:11.000Z", compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: rail(refuses), cooks: [], attend: [] });
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       2 en attente", "  #21  en attente  -  zone tenue par #3128 (app/src) — depuis 2 h 05  L'export", ""].join("\n");
function drawable(refuses: boolean): Drawable {
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(refuses)) }] });
  return heldOnes.attendre(putAside({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? receivedOne;
}
const receive = (vue: Played, refuses = true) => vue.dire("surFaits", { ...drawable(refuses), demande: vue.dernier("faits")[0] as number });
const slip = (vue: Played, ticket: number): Fake => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const buttons = (or: Fake) => or.dessous("button").map(({ textContent }) => textContent);
const button = (or: Fake, wording: string): Fake => or.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`pas de bouton « ${wording} »`);
const line = (or: Fake) => or.dessous("p").find(({ className }) => className.includes("refus-ligne"));

describe("la carte que plus aucun cook ne prendra", () => {
  test("sa première ligne dit pourquoi en mots simples ; le message de la station est derrière « details », en entier", async () => {
    const vue = await open();
    receive(vue);
    await repos();
    const card = slip(vue, 22);
    assert.equal(line(card)?.textContent, "Will not start: 3 cooks in a row stopped without delivering anything.");
    assert.ok("refus" in card.dataset, "la carte est distincte de celles qui attendent leur tour");
    assert.ok(!("refus" in slip(vue, 21).dataset));
    // La ligne est en haut : avant le titre. Le message brut n'est nulle part en clair, seulement dans « details ».
    const fold = card.dessous("details")[0] ?? assert.fail("pas de « details »");
    assert.ok(fold.dessous("p").some(({ textContent }) => textContent === RAW), "le message entier, non coupé");
    assert.ok(!card.dessous("p").some(({ textContent }) => textContent.includes("added nothing…")));
    // Une carte qui attend son tour n'a ni cette ligne ni ces boutons.
    assert.equal(line(slip(vue, 21)), undefined);
    assert.ok(!buttons(slip(vue, 21)).includes("Relaunch"));
  });

  test("un 86 que la station relève seule (quota) garde sa ligne de mise de côté : ni « Will not start », ni « Relaunch »", async () => {
    const vue = await open();
    const f = facts(true);
    f.rail = f.rail.map((entry) => (entry.ticket === 22 ? { ...entry, attente: { raison: "attend : quota du compte épuisé", colonne: "en attente", retour: null } } : entry));
    const heldOnes = holdFacts();
    vue.dire("surFaits", { ...heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(f) }] }), demande: vue.dernier("faits")[0] as number });
    await repos();
    const card = slip(vue, 22);
    assert.equal(line(card), undefined);
    assert.ok(!("refus" in card.dataset));
    assert.ok(!buttons(card).includes("Relaunch"));
  });

  test("elle montre trois boutons, et le « report to brigade » n'est pas le seul geste", async () => {
    const vue = await open();
    receive(vue);
    await repos();
    const saidOnes = buttons(slip(vue, 22));
    for (const wording of ["Relaunch", "Close as already done", "Ask the second"]) assert.ok(saidOnes.includes(wording), `${wording} : ${saidOnes.join(" | ")}`);
    assert.ok(saidOnes.includes("report to brigade"));
  });

  test("« Relaunch » part pour ce ticket ; relue sans le label, la carte n'est plus refusée et attend son tour", async () => {
    const vue = await open({ refus: () => ({ fait: "relaunched on GitHub: #22 no longer carries `served-elsewhere`", detail: ISSUE(22) }) });
    receive(vue);
    await repos();
    button(slip(vue, 22), "Relaunch").click();
    await repos();
    assert.deepEqual(vue.dernier("refus"), ["parade", "relancer", 22]);
    receive(vue, false);
    await repos();
    assert.equal(line(slip(vue, 22)), undefined);
    assert.ok(!("refus" in slip(vue, 22).dataset));
    assert.ok(!buttons(slip(vue, 22)).includes("Relaunch"));
    assert.ok(slip(vue, 22).dessous("p").some(({ textContent }) => textContent === "ready, waits for a place in the kitchen"));
  });

  test("« Close as already done » part pour ce ticket ; l'issue fermée, la carte n'est plus sur le rail", async () => {
    const vue = await open({ refus: () => ({ fait: "closed as completed on GitHub: #22 leaves the rail", detail: ISSUE(22) }) });
    receive(vue);
    await repos();
    button(slip(vue, 22), "Close as already done").click();
    await repos();
    assert.deepEqual(vue.dernier("refus"), ["parade", "clore", 22]);
    // La lecture suivante ne porte plus le ticket.
    const without = { ...facts(false), rail: rail(false).filter(({ ticket }) => ticket !== 22), compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } };
    const heldOnes = holdFacts();
    vue.dire("surFaits", { ...heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(without) }] }), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.equal(cardOfTicket(vue, 22), undefined);
  });

  test("un geste refusé reste sur la carte et dit pourquoi rien n'a changé", async () => {
    const vue = await open({ refus: () => ({ refus: "nothing was changed: GitHub did not close #22", detail: "403" }) });
    receive(vue);
    await repos();
    button(slip(vue, 22), "Close as already done").click();
    await repos();
    await repos();
    assert.equal(line(slip(vue, 22))?.textContent?.startsWith("Will not start:"), true);
    assert.ok(slip(vue, 22).dessous("span").some(({ textContent }) => textContent === "nothing was changed: GitHub did not close #22"));
  });

  test("« Ask the second » passe la carte au second par la passation qui existe, sans question", async () => {
    const vue = await open({ passerAuSecond: () => ({ ...SECOND, demandeEcrite: true }) });
    receive(vue);
    await repos();
    button(slip(vue, 22), "Ask the second").click();
    await repos();
    assert.deepEqual(vue.dernier("passerAuSecond"), ["parade", 22, null]);
  });

  test("une carte qui attend une autre la nomme, et son numéro s'ouvre sur son issue", async () => {
    const vue = await open({ ouvrirIssue: () => true });
    receive(vue);
    await repos();
    const awaiting = slip(vue, 21).dessous("p").find(({ className }) => className === "ligne-carte") ?? assert.fail("pas de ligne");
    assert.equal(awaiting.textContent, "Waiting for #3128");
    const link = awaiting.dessous("button").find(({ textContent }) => textContent === "#3128") ?? assert.fail("le numéro n'est pas un lien");
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue").slice(0, 2), ["parade", 3128]);
  });
});
