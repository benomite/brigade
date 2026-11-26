// « try it » sur la carte (#3215), côté vue : le bouton n'est là que sur une carte en pass ou livrée, et seulement quand le
// projet déclare un `.brigade/try.json` valable ; sans déclaration utilisable, la carte ne dit rien. En route, la carte dit où est
// la version et ne porte qu'un « stop » ; raté, une ligne de raison puis la fin de la sortie. Jouée devant le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/awaiting.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import type { StateTrial, LueDeclaration, VuDesEssais } from "../../src/trial.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { cardDuTicket, type Faux, type Jouee, jouerLaVue, type Answers, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-10T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
// Un ticket par état : en attente (31), au travail (32), en pass (33), livré (34, par `livres`).
const rail: Facts["rail"] = [
  { ticket: 31, etat: "en attente", titre: "Attend", url: ISSUE(31), activite: null, attente: null },
  { ticket: 32, etat: "pris", titre: "Cuit", url: ISSUE(32), activite: null, attente: null },
  { ticket: 33, etat: "en pass", titre: "À la pass", url: ISSUE(33), activite: null, attente: null },
];
const facts: Facts = {
  etat: "ouverte",
  lu: "2026-11-10T10:04:11.000Z",
  dernierTick: "2026-11-10T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend: [],
  livres: [{ ticket: 34, titre: "Livré", url: ISSUE(34), livre: "2026-11-10T09:00:00.000Z", station: null, pr: null, relecture: null }],
} as unknown as Facts;
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       3", ""].join("\n");

async function ouvrir(vu: VuDesEssais | undefined): Promise<Jouee> {
  const answers: Answers = { demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => vu };
  const vue = await jouerLaVue(answers as Answers & Required<Pick<Answers, "demarrage">>);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const tenus = holdFacts();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Jouee, ticket: number): Faux => cardDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const boutons = (ou: Faux) => ou.dessous("button").map(({ textContent }) => textContent);
const valable = (essais: Record<number, StateTrial> = {}, declaration: LueDeclaration = { declaration: { command: "npm run dev", url: "http://localhost:5173" } }): VuDesEssais => ({ declaration, essais });
const phrases = (ou: Faux, classe: string) => ou.dessous("p").filter(({ className }) => className === classe).map(({ textContent }) => textContent);

describe("« try it » sur la carte", () => {
  test("présent sur une carte en pass et sur une carte livrée, absent des autres états", async () => {
    const vue = await ouvrir(valable());
    assert.ok(boutons(card(vue, 33)).includes("try it"), "en pass");
    assert.ok(boutons(card(vue, 34)).includes("try it"), "livrée");
    assert.ok(!boutons(card(vue, 31)).includes("try it"), "en attente");
    assert.ok(!boutons(card(vue, 32)).includes("try it"), "au travail");
  });

  test("sans .brigade/try.json : aucun bouton et aucun texte sur l'essai, sur aucune carte", async () => {
    const vue = await ouvrir(valable({}, { absente: true }));
    for (const ticket of [31, 32, 33, 34]) {
      assert.ok(!boutons(card(vue, ticket)).includes("try it"), `#${ticket}`);
      assert.doesNotMatch(card(vue, ticket).textContent, /try|try\.json|command/i, `#${ticket}`);
    }
  });

  test("{\"tryable\": false, \"reason\": …} : aucun bouton, ni texte sur l'essai ni sur la raison", async () => {
    // Ce que le process principal en dit : une déclaration sans `command` valable, donc ni bouton ni phrase.
    const vue = await ouvrir(valable({}, { invalide: ".brigade/try.json needs a `command` key: a non-empty string" }));
    assert.ok(!boutons(card(vue, 33)).includes("try it"));
    assert.deepEqual(phrases(card(vue, 33), "essai-sans-declaration"), []);
    assert.doesNotMatch(card(vue, 33).textContent, /try|command|cannot be tried/i);
  });

  test("déclaration mal formée : pas de bouton et pas de texte", async () => {
    const vue = await ouvrir(valable({}, { invalide: ".brigade/try.json is not valid JSON" }));
    assert.ok(!boutons(card(vue, 33)).includes("try it"));
    assert.doesNotMatch(card(vue, 33).textContent, /try|JSON/i);
  });

  test("la rangée de l'essai n'est pas un point des essais de la cuisine (#1895) : elle ne porte pas la classe « essai »", async () => {
    const vue = await ouvrir(valable({ 33: { enCours: true }, 34: { echec: { raison: "boom", fin: "" } } }));
    for (const ticket of [33, 34]) {
      const classes = card(vue, ticket).dessous("div").map(({ className }) => className);
      assert.ok(classes.includes("essai-rangee"), `#${ticket} a sa rangée`);
      assert.ok(!classes.includes("essai"), `#${ticket} : pas de rond de 8 px`);
    }
  });

  test("un clic sur « try it » demande l'essai de ce ticket", async () => {
    const vue = await ouvrir(valable());
    (card(vue, 34).dessous("button").find(({ textContent }) => textContent === "try it") ?? assert.fail("pas de bouton")).click();
    assert.deepEqual(vue.dernier("essayer"), ["parade", 34]);
  });

  test("en route avec une adresse : la carte la dit et ne porte qu'un « stop » ; sans adresse, elle dit où ça tourne", async () => {
    const vue = await ouvrir(valable({ 33: { enCours: true, url: "http://localhost:5173" }, 34: { enCours: true } }));
    assert.deepEqual(phrases(card(vue, 33), "essai-ou"), ["running at http://localhost:5173"]);
    assert.ok(boutons(card(vue, 33)).filter((libelle) => libelle === "stop" || libelle === "try it").join() === "stop");
    assert.deepEqual(phrases(card(vue, 34), "essai-ou"), ["it runs in the opened window or process"]);
    (card(vue, 33).dessous("button").find(({ textContent }) => textContent === "stop") ?? assert.fail("pas de stop")).click();
    assert.deepEqual(vue.dernier("arreterEssai"), ["parade", 33]);
  });

  test("un essai raté : une ligne de raison, puis la fin de la sortie ; « try it » est de nouveau là", async () => {
    const vue = await ouvrir(valable({ 33: { echec: { raison: "the command exited with code 3", fin: "ligne-39\nligne-40" } } }));
    assert.deepEqual(phrases(card(vue, 33), "essai-echec"), ["the command exited with code 3"]);
    assert.deepEqual(card(vue, 33).dessous("pre").map(({ textContent }) => textContent), ["ligne-39\nligne-40"]);
    assert.ok(boutons(card(vue, 33)).includes("try it"));
  });

  test("le process principal prévient la vue d'un changement : elle relit les essais", async () => {
    let lu = 0;
    const vu: VuDesEssais = valable();
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => (lu++, vu) } as Answers & Required<Pick<Answers, "demarrage">>);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const avant = lu;
    vue.dire("surEssais", "parade");
    await repos();
    assert.equal(lu, avant + 1);
  });
});
