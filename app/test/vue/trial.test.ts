// « try it » sur la carte (#3215), côté vue : le bouton n'est là que sur une carte en pass ou livrée, et seulement quand le
// projet déclare un `.brigade/try.json` valable ; sans déclaration utilisable, la carte ne dit rien. En route, la carte dit où est
// la version et ne porte qu'un « stop » ; raté, une ligne de raison puis la fin de la sortie. Jouée devant le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { putAPart } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import type { StateTrial, ReadDeclaration, SeenOfTrials } from "../../src/trial.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";

const A = "2026-11-10T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
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

async function open(seenOne: SeenOfTrials | undefined): Promise<Played> {
  const answers: Answers = { demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => seenOne };
  const vue = await playTheVue(answers as Answers & Required<Pick<Answers, "demarrage">>);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  const drawable = heldOnes.attendre(putAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? receivedOne;
  vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Played, ticket: number): Fake => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const buttons = (or: Fake) => or.dessous("button").map(({ textContent }) => textContent);
const valid = (trials: Record<number, StateTrial> = {}, declaration: ReadDeclaration = { declaration: { command: "npm run dev", url: "http://localhost:5173" } }): SeenOfTrials => ({ declaration, essais: trials });
const sentences = (or: Fake, classe: string) => or.dessous("p").filter(({ className }) => className === classe).map(({ textContent }) => textContent);

describe("« try it » sur la carte", () => {
  test("présent sur une carte en pass et sur une carte livrée, absent des autres états", async () => {
    const vue = await open(valid());
    assert.ok(buttons(card(vue, 33)).includes("try it"), "en pass");
    assert.ok(buttons(card(vue, 34)).includes("try it"), "livrée");
    assert.ok(!buttons(card(vue, 31)).includes("try it"), "en attente");
    assert.ok(!buttons(card(vue, 32)).includes("try it"), "au travail");
  });

  test("sans .brigade/try.json : aucun bouton et aucun texte sur l'essai, sur aucune carte", async () => {
    const vue = await open(valid({}, { absente: true }));
    for (const ticket of [31, 32, 33, 34]) {
      assert.ok(!buttons(card(vue, ticket)).includes("try it"), `#${ticket}`);
      assert.doesNotMatch(card(vue, ticket).textContent, /try|try\.json|command/i, `#${ticket}`);
    }
  });

  test("{\"tryable\": false, \"reason\": …} : aucun bouton, ni texte sur l'essai ni sur la raison", async () => {
    // Ce que le process principal en dit : une déclaration sans `command` valable, donc ni bouton ni phrase.
    const vue = await open(valid({}, { invalide: ".brigade/try.json needs a `command` key: a non-empty string" }));
    assert.ok(!buttons(card(vue, 33)).includes("try it"));
    assert.deepEqual(sentences(card(vue, 33), "essai-sans-declaration"), []);
    assert.doesNotMatch(card(vue, 33).textContent, /try|command|cannot be tried/i);
  });

  test("déclaration mal formée : pas de bouton et pas de texte", async () => {
    const vue = await open(valid({}, { invalide: ".brigade/try.json is not valid JSON" }));
    assert.ok(!buttons(card(vue, 33)).includes("try it"));
    assert.doesNotMatch(card(vue, 33).textContent, /try|JSON/i);
  });

  test("la rangée de l'essai n'est pas un point des essais de la cuisine (#1895) : elle ne porte pas la classe « essai »", async () => {
    const vue = await open(valid({ 33: { enCours: true }, 34: { echec: { raison: "boom", fin: "" } } }));
    for (const ticket of [33, 34]) {
      const classes = card(vue, ticket).dessous("div").map(({ className }) => className);
      assert.ok(classes.includes("essai-rangee"), `#${ticket} a sa rangée`);
      assert.ok(!classes.includes("essai"), `#${ticket} : pas de rond de 8 px`);
    }
  });

  test("un clic sur « try it » demande l'essai de ce ticket", async () => {
    const vue = await open(valid());
    (card(vue, 34).dessous("button").find(({ textContent }) => textContent === "try it") ?? assert.fail("pas de bouton")).click();
    assert.deepEqual(vue.dernier("essayer"), ["parade", 34]);
  });

  test("en route avec une adresse : la carte la dit et ne porte qu'un « stop » ; sans adresse, elle dit où ça tourne", async () => {
    const vue = await open(valid({ 33: { enCours: true, url: "http://localhost:5173" }, 34: { enCours: true } }));
    assert.deepEqual(sentences(card(vue, 33), "essai-ou"), ["running at http://localhost:5173"]);
    assert.ok(buttons(card(vue, 33)).filter((wording) => wording === "stop" || wording === "try it").join() === "stop");
    assert.deepEqual(sentences(card(vue, 34), "essai-ou"), ["it runs in the opened window or process"]);
    (card(vue, 33).dessous("button").find(({ textContent }) => textContent === "stop") ?? assert.fail("pas de stop")).click();
    assert.deepEqual(vue.dernier("arreterEssai"), ["parade", 33]);
  });

  test("un essai raté : une ligne de raison, puis la fin de la sortie ; « try it » est de nouveau là", async () => {
    const vue = await open(valid({ 33: { echec: { raison: "the command exited with code 3", fin: "ligne-39\nligne-40" } } }));
    assert.deepEqual(sentences(card(vue, 33), "essai-echec"), ["the command exited with code 3"]);
    assert.deepEqual(card(vue, 33).dessous("pre").map(({ textContent }) => textContent), ["ligne-39\nligne-40"]);
    assert.ok(buttons(card(vue, 33)).includes("try it"));
  });

  test("le process principal prévient la vue d'un changement : elle relit les essais", async () => {
    let readOne = 0;
    const seenOne: SeenOfTrials = valid();
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], essais: () => (readOne++, seenOne) } as Answers & Required<Pick<Answers, "demarrage">>);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const before = readOne;
    vue.dire("surEssais", "parade");
    await repos();
    assert.equal(readOne, before + 1);
  });
});
