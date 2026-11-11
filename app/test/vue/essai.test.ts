// « try it » sur la carte (#3215), côté vue : le bouton n'est là que sur une carte en pass ou livrée, et seulement quand le
// projet déclare un `.brigade/try.json` valable ; sans déclaration, une phrase dit quoi créer. En route, la carte dit où est
// la version et ne porte qu'un « stop » ; raté, une ligne de raison puis la fin de la sortie. Jouée devant le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import type { EtatEssai, LueDeclaration, VuDesEssais } from "../../src/essai.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

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
const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
// Un ticket par état : en attente (31), au travail (32), en pass (33), livré (34, par `livres`).
const rail: Faits["rail"] = [
  { ticket: 31, etat: "en attente", titre: "Attend", url: ISSUE(31), activite: null, attente: null },
  { ticket: 32, etat: "pris", titre: "Cuit", url: ISSUE(32), activite: null, attente: null },
  { ticket: 33, etat: "en pass", titre: "À la pass", url: ISSUE(33), activite: null, attente: null },
];
const faits: Faits = {
  etat: "ouverte",
  lu: "2026-11-10T10:04:11.000Z",
  dernierTick: "2026-11-10T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend: [],
  livres: [{ ticket: 34, titre: "Livré", url: ISSUE(34), livre: "2026-11-10T09:00:00.000Z", station: null, pr: null, relecture: null }],
} as unknown as Faits;
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       3", ""].join("\n");

async function ouvrir(vu: VuDesEssais | undefined): Promise<Jouee> {
  const reponses: Reponses = { demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => vu };
  const vue = await jouerLaVue(reponses as Reponses & Required<Pick<Reponses, "demarrage">>);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const carte = (vue: Jouee, ticket: number): Faux => carteDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const boutons = (ou: Faux) => ou.dessous("button").map(({ textContent }) => textContent);
const valable = (essais: Record<number, EtatEssai> = {}, declaration: LueDeclaration = { declaration: { command: "npm run dev", url: "http://localhost:5173" } }): VuDesEssais => ({ declaration, essais });
const phrases = (ou: Faux, classe: string) => ou.dessous("p").filter(({ className }) => className === classe).map(({ textContent }) => textContent);

describe("« try it » sur la carte", () => {
  test("présent sur une carte en pass et sur une carte livrée, absent des autres états", async () => {
    const vue = await ouvrir(valable());
    assert.ok(boutons(carte(vue, 33)).includes("try it"), "en pass");
    assert.ok(boutons(carte(vue, 34)).includes("try it"), "livrée");
    assert.ok(!boutons(carte(vue, 31)).includes("try it"), "en attente");
    assert.ok(!boutons(carte(vue, 32)).includes("try it"), "au travail");
  });

  test("sans .brigade/try.json : aucun bouton, et une phrase qui dit quoi créer, l'exemple compris", async () => {
    const vue = await ouvrir(valable({}, { absente: true }));
    assert.ok(!boutons(carte(vue, 33)).includes("try it"));
    const [phrase = ""] = phrases(carte(vue, 33), "essai-sans-declaration");
    assert.match(phrase, /\.brigade\/try\.json/);
    assert.match(phrase, /`command`/);
    assert.match(phrase, /optional `url`/);
    assert.ok(phrase.includes('{"command": "npm install && npm run dev", "url": "http://localhost:5173"}'));
    assert.deepEqual(phrases(carte(vue, 31), "essai-sans-declaration"), [], "une carte d'un autre état ne dit rien");
  });

  test("déclaration mal formée : pas de bouton, la raison", async () => {
    const vue = await ouvrir(valable({}, { invalide: ".brigade/try.json is not valid JSON" }));
    assert.ok(!boutons(carte(vue, 33)).includes("try it"));
    assert.deepEqual(phrases(carte(vue, 33), "essai-sans-declaration"), [".brigade/try.json is not valid JSON"]);
  });

  test("un clic sur « try it » demande l'essai de ce ticket", async () => {
    const vue = await ouvrir(valable());
    (carte(vue, 34).dessous("button").find(({ textContent }) => textContent === "try it") ?? assert.fail("pas de bouton")).click();
    assert.deepEqual(vue.dernier("essayer"), ["parade", 34]);
  });

  test("en route avec une adresse : la carte la dit et ne porte qu'un « stop » ; sans adresse, elle dit où ça tourne", async () => {
    const vue = await ouvrir(valable({ 33: { enCours: true, url: "http://localhost:5173" }, 34: { enCours: true } }));
    assert.deepEqual(phrases(carte(vue, 33), "essai-ou"), ["running at http://localhost:5173"]);
    assert.ok(boutons(carte(vue, 33)).filter((libelle) => libelle === "stop" || libelle === "try it").join() === "stop");
    assert.deepEqual(phrases(carte(vue, 34), "essai-ou"), ["it runs in the opened window or process"]);
    (carte(vue, 33).dessous("button").find(({ textContent }) => textContent === "stop") ?? assert.fail("pas de stop")).click();
    assert.deepEqual(vue.dernier("arreterEssai"), ["parade", 33]);
  });

  test("un essai raté : une ligne de raison, puis la fin de la sortie ; « try it » est de nouveau là", async () => {
    const vue = await ouvrir(valable({ 33: { echec: { raison: "the command exited with code 3", fin: "ligne-39\nligne-40" } } }));
    assert.deepEqual(phrases(carte(vue, 33), "essai-echec"), ["the command exited with code 3"]);
    assert.deepEqual(carte(vue, 33).dessous("pre").map(({ textContent }) => textContent), ["ligne-39\nligne-40"]);
    assert.ok(boutons(carte(vue, 33)).includes("try it"));
  });

  test("le process principal prévient la vue d'un changement : elle relit les essais", async () => {
    let lu = 0;
    const vu: VuDesEssais = valable();
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => (lu++, vu) } as Reponses & Required<Pick<Reponses, "demarrage">>);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const avant = lu;
    vue.dire("surEssais", "parade");
    await repos();
    assert.equal(lu, avant + 1);
  });
});
