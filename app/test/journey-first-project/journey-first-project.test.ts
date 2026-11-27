// La page d'un projet pas encore prêt (#3166, épique #3164). D'abord ses morceaux, devant un faux document : où en est le
// parcours d'après ce qui est lu — « qui le cuit » d'abord, la mise en place seulement si le projet ne l'a pas —, la ligne
// de progression, le choix recommandé, et à chaque état de la mise en place ce qui est attendu et de qui. Puis la vue jouée
// entière (vue.js tel qu'il est, un faux pont) : « Add a project », un dépôt choisi, sa page s'ouvre sur la question à la
// place du rail, puis la mise en place, puis prêt ; un projet déjà prêt passe la mise en place ; un projet qu'une station
// cuit déjà passe « qui le cuit » ; un projet où le compte ne peut pas écrire n'ouvre rien de tout cela.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { TITRE as TITLE_OF_THE_PR_OF_SETUP } from "../../../runtime/src/second-init/pr-de-setup.ts";
import type { StationEnregistree } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { PREPARE } from "../../src/vue/page-project/repository-not-prepare.js";
import {
  addTheStation,
  cardOfSetup,
  choiceOfStation,
  STARTUP,
  PREVENTS,
  IN_ROUTE,
  NO_IN_LINE,
  HERE,
  HERE_SAYS,
  UNREADABLE,
  READING,
  LIT,
  MERGER,
  OPEN_THE_CARD,
  setJourneyFirstProject,
  progression,
  REFUSAL,
  ANSWER,
  STATION_SAYS,
  holdTheJourney,
  TITLE_OF_THE_CARD_OF_SETUP,
  workOfSecond,
  seenOfJourney,
  type Wait,
  type Choice,
  type ActionsOfJourney,
} from "../../src/vue/journey-first-project/journey-first-project.js";
import { RETRY } from "../../src/vue/lexicon.js";
import { ADD_A_SERVER } from "../../src/vue/add-server/add-server.js";
import { LATER, setFirstTicket, QUESTION as QUESTION_OF_FIRST } from "../../src/vue/first-ticket/first-ticket.js";
import { REFUSAL_NETWORK } from "../../src/stations-of-account.ts";
import { CONTINUE, RELEASE, PUT, PASS, setTheDeparture, holdTheDepartures, TITLE as TITLE_OF_DEPARTURE, type State as StateOfDeparture } from "../../src/vue/journey-first-project/departure.js";
import { launchTheTriage, proposeTheDeparture, type LaunchTheTriage } from "../../src/departure-of-project.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import { Fake, playTheVue, type Played, type Answers, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const REPOSITORY = "chef/cantine";
const MISSING = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const READY = { ready: true, missingBindings: [], missingLabels: [] };
const NOT_READY = { etape: "manque" as const, verif: { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] } };
const HERE_CHOICE: Choice = { cle: HERE, nom: "this computer", horsLigne: false, recommande: true };
// 22 min après le dernier signe de vie des stations hors ligne.
const TWENTY_TWO = Date.parse("2026-11-11T10:22:00.000Z");
const ATELIER_ABSENT = "Offline for 22 min: switch atelier on, or start its brigade-station service there: it starts with the machine";

const station = (id: string, name: string, available: boolean, selection: string[] | null = null): StationEnregistree => ({
  id,
  name,
  platform: "linux",
  machine: name,
  version: "1.0.0",
  account: "octo-chef",
  available,
  registeredAt: "2026-11-01T00:00:00.000Z",
  lastSeen: "2026-11-11T10:00:00.000Z",
  stoppedAt: null,
  refreshMs: 30_000,
  selection,
  ...(available ? {} : { offlineSince: "2026-11-11T10:00:00.000Z" }),
});

const actionsEmpty = (): ActionsOfJourney & { faits: string[] } => {
  const facts: string[] = [];
  return { faits: facts, choisir: (oneOf) => void facts.push(`choisir ${oneOf.cle}`), relire: () => void facts.push("relire"), preparer: () => void facts.push("preparer"), ouvrirLaCarte: () => void facts.push("carte") };
};
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const sentenceOf = (card: Fake) => card.dessous("p").find((pose) => pose.className === "phrase");

describe("où en est le parcours, d'après ce qui est lu", () => {
  test("« qui le cuit » d'abord, tant qu'elle n'est pas répondue — quoi que dise la mise en place", () => {
    assert.deepEqual(seenOfJourney({ station: "a-faire", second: {} }), { etape: "station" });
    assert.deepEqual(seenOfJourney({ station: { enCours: HERE }, preparation: { etape: "prepare" }, second: {} }), { etape: "station" });
    assert.deepEqual(seenOfJourney({ station: { ligne: "nothing was written", detail: "" }, preparation: NOT_READY, second: {} }), { etape: "station" });
  });

  test("répondue, ou pas à poser : un projet prêt va à prêt ; sinon, la mise en place", () => {
    assert.deepEqual(seenOfJourney({ station: "ajoutee", preparation: { etape: "prepare" }, second: { titre: "repos" } }), { etape: "pret" });
    assert.deepEqual(seenOfJourney({ station: "inutile", preparation: { etape: "prepare" }, second: {} }), { etape: "pret" });
    assert.equal(seenOfJourney({ station: "ajoutee", preparation: NOT_READY, second: {} }).etape, "setup");
    assert.equal(seenOfJourney({ station: "inutile", preparation: NOT_READY, second: {} }).etape, "setup");
  });

  test("chaque état de la mise en place dit qui est attendu : l'app, le second, ou toi", () => {
    const theCase: [Parameters<typeof seenOfJourney>[0], Wait, string][] = [
      [{ station: "ajoutee", second: {} }, "lecture", "app"],
      [{ station: "ajoutee", preparation: { etape: "inconnu" }, second: {} }, "lecture", "app"],
      [{ station: "ajoutee", illisible: "GitHub not reached", second: {} }, "illisible", "toi"],
      [{ station: "ajoutee", preparation: NOT_READY, second: {} }, "demarrage", "second"],
      [{ station: "ajoutee", preparation: NOT_READY, second: { titre: "travail" } }, "lit", "second"],
      [{ station: "ajoutee", preparation: NOT_READY, second: { titre: "repos" } }, "repondre", "toi"],
      [{ station: "ajoutee", preparation: NOT_READY, carte: true, second: { titre: "repos" } }, "merger", "toi"],
      [{ station: "ajoutee", preparation: { ...NOT_READY, etape: "en-route" }, second: { titre: "travail" } }, "en-route", "app"],
      [{ station: "ajoutee", preparation: { ...NOT_READY, etape: "refus", dit: "GitHub refused the labels." }, second: {} }, "refus", "toi"],
      [{ station: "ajoutee", preparation: NOT_READY, second: { empeche: true } }, "empeche", "toi"],
    ];
    for (const [readOne, wait, who] of theCase) assert.deepEqual(seenOfJourney(readOne), { etape: "setup", attente: wait, qui: who }, wait);
  });

  test("la ligne de progression : le rang, et combien de questions le projet pose — jamais une question sans rien à faire", () => {
    const station = { etape: "station" } as const;
    const setup = { etape: "setup", attente: "lit", qui: "second" } as const;
    assert.equal(progression(station, { station: "a-faire", preparation: NOT_READY }), "1 of 2: who cooks it");
    assert.equal(progression(setup, { station: "ajoutee", preparation: NOT_READY }), "2 of 2: its setup for Brigade");
    // Déjà prêt pour Brigade : une seule question.
    assert.equal(progression(station, { station: "a-faire", preparation: { etape: "prepare" } }), "1 of 1: who cooks it");
    // Une station le cuit déjà : la mise en place est la seule.
    assert.equal(progression(setup, { station: "inutile", preparation: NOT_READY }), "1 of 1: its setup for Brigade");
    // La mise en place pas encore lue : le compte n'est pas dit.
    assert.equal(progression(station, { station: "a-faire" }), "Who cooks it");
    assert.equal(progression(station, { station: "a-faire", preparation: { etape: "inconnu" } }), "Who cooks it");
  });

  test("cet ordinateur d'abord, son nom d'hôte après lui ; le choix recommandé : une station du compte en ligne, sinon cet ordinateur", () => {
    const atelier = station("g1", "atelier", false);
    const box = station("g2", "parade-box", true);
    const recommended = (choice: Choice[]) => choice.filter((oneOf) => oneOf.recommande).map(({ cle: key }) => key);
    assert.deepEqual(choiceOfStation({ ici: true, stations: [atelier, box], maintenant: TWENTY_TWO }).map(({ cle: key }) => key), [HERE, "g2", "g1"]);
    assert.deepEqual(recommended(choiceOfStation({ ici: true, stations: [atelier, box], maintenant: TWENTY_TWO })), ["g2"]);
    assert.deepEqual(choiceOfStation({ ici: true, stations: [atelier], maintenant: TWENTY_TWO }).map(({ cle: key }) => key), [HERE, "g1"]);
    assert.deepEqual(recommended(choiceOfStation({ ici: true, stations: [atelier], maintenant: TWENTY_TWO })), [HERE]);
    assert.deepEqual(choiceOfStation({ ici: true, stations: [] }), [HERE_CHOICE]);
    assert.deepEqual(choiceOfStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [] }), [{ ...HERE_CHOICE, hote: "MacBook-Air-de-Chef" }]);
    // Une station hors ligne n'est jamais recommandée : sans aucune en ligne ni cet ordinateur, rien ne l'est. Elle dit depuis
    // quand, et comment la ramener (#3187).
    assert.deepEqual(choiceOfStation({ ici: false, stations: [atelier], maintenant: TWENTY_TWO }), [{ cle: "g1", nom: "atelier", horsLigne: true, recommande: false, absente: ATELIER_ABSENT }]);
  });
});

describe("ce que la page dit", () => {
  test("« qui le cuit » : la progression, la question, la phrase du recommandé, un bouton par choix — le recommandé en tête", () => {
    const actions = actionsEmpty();
    const choice = choiceOfStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [station("g1", "atelier", false)], maintenant: TWENTY_TWO });
    const card = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix: choice }, actions) as unknown as Fake;
    assert.equal(card.dessous("p")[0]?.textContent, "1 of 2: who cooks it");
    assert.equal(card.dessous("h2")[0]?.textContent, "Who cooks chef/cantine?");
    assert.equal(sentenceOf(card)?.textContent, HERE_SAYS);
    assert.equal(HERE_SAYS, "This computer cooks the project's tickets while it is on; you can add a server or another computer later.");
    assert.deepEqual(buttons(card), ["this computer", "atelier", ADD_A_SERVER]);
    assert.equal(card.dessous("button")[0]?.className.includes("recommande"), true);
    assert.equal(card.dessous("button")[1]?.className.includes("recommande"), false);
    // Cet ordinateur, puis son nom d'hôte ; la station hors ligne dit depuis quand, et le geste qui la ramène.
    assert.deepEqual(card.dessous("li")[0]?.dessous("span").map(({ textContent }) => textContent).filter((text) => text !== "this computer"), ["MacBook-Air-de-Chef"]);
    assert.ok(card.dessous("span").some(({ textContent }) => textContent === ATELIER_ABSENT));
    card.dessous("button")[0]?.click();
    assert.deepEqual(actions.faits, [`choisir ${HERE}`]);
  });

  test("une station du compte en ligne, recommandée : sa phrase la nomme", () => {
    const choice = choiceOfStation({ ici: true, stations: [station("g2", "parade-box", true)] });
    const card = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: "a-faire", choix: choice }, actionsEmpty()) as unknown as Fake;
    assert.equal(sentenceOf(card)?.textContent, STATION_SAYS("parade-box"));
    assert.deepEqual(buttons(card), ["this computer", "parade-box", ADD_A_SERVER]);
    // Le recommandé se distingue où qu'il soit dans la liste.
    assert.equal(card.dessous("button")[0]?.className.includes("recommande"), false);
    assert.equal(card.dessous("button")[1]?.className.includes("recommande"), true);
  });

  test("aucune station en ligne, ni cet ordinateur : rien n'est recommandé, et la phrase le dit (#3187)", () => {
    const choice = choiceOfStation({ ici: false, stations: [station("g1", "atelier", false)], maintenant: TWENTY_TWO });
    const card = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: "a-faire", choix: choice }, actionsEmpty()) as unknown as Fake;
    assert.equal(sentenceOf(card)?.textContent, NO_IN_LINE);
    assert.equal(card.dessous("button").some(({ className }) => className.includes("recommande")), false);
  });

  test("une station choisie hors ligne : la page dit en clair qu'elle prend le projet à son retour (#3187)", () => {
    const setup = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "setup", attente: "lit", qui: "second" }, progression: "", station: "ajoutee", choix: [], absente: "atelier" }, actionsEmpty()) as unknown as Fake;
    assert.ok(setup.dessous("p").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
    // Prêt, au-dessus du rail, la question du premier ticket le dit aussi (ticket 3306).
    const ready = setFirstTicket(doc, { depot: REPOSITORY, etat: { etape: "question", reponse: "" }, absente: "atelier" }, { ecrire: () => {}, envoyer: () => {}, oui: () => {}, changer: () => {}, fermer: () => {} }) as unknown as Fake;
    assert.ok(ready.dessous("p").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
  });

  test("un choix qui s'écrit grise les boutons ; refusé, une ligne et son détail, les boutons rendus", () => {
    const inProgress = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: { enCours: HERE }, choix: [HERE_CHOICE] }, actionsEmpty()) as unknown as Fake;
    assert.equal(inProgress.dessous("button")[0]?.disabled, true);
    const refused = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: { ligne: "nothing was written: no station", detail: "gist refused" }, choix: [HERE_CHOICE] }, actionsEmpty()) as unknown as Fake;
    assert.ok(refused.dessous("span").some(({ textContent }) => textContent === "nothing was written: no station"));
    assert.equal(refused.dessous("button")[0]?.disabled, false);
  });

  test("chaque état de la mise en place se dit en mots simples, avec qui l'on attend ; le geste du chef est un bouton", () => {
    const sentences: Record<Wait, [string, string[]]> = {
      lecture: [READING(REPOSITORY), []],
      illisible: [UNREADABLE(REPOSITORY), [RETRY]],
      demarrage: [STARTUP, []],
      lit: [LIT, []],
      repondre: [ANSWER, []],
      merger: [MERGER, [OPEN_THE_CARD]],
      "en-route": [IN_ROUTE(REPOSITORY), []],
      refus: [REFUSAL("GitHub refused the labels."), [RETRY]],
      empeche: [PREVENTS, [PREPARE]],
    };
    for (const [wait, [sentence, actions]] of Object.entries(sentences) as [Wait, [string, string[]]][]) {
      const who = wait === "lecture" || wait === "en-route" ? "app" : wait === "demarrage" || wait === "lit" ? "second" : "toi";
      const card = setJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "setup", attente: wait, qui: who }, progression: "", station: "ajoutee", choix: [], illisible: "GitHub not reached", refus: "GitHub refused the labels." }, actionsEmpty()) as unknown as Fake;
      const said = sentenceOf(card) ?? assert.fail(`aucune phrase pour ${wait}`);
      assert.ok(said.textContent.startsWith(sentence), `${wait} : ${said.textContent}`);
      assert.equal(said.dataset.qui, who);
      // Qui l'on attend est dit dans la phrase même.
      assert.match(sentence, who === "toi" ? /\byou\b|\byour\b/ : who === "second" ? /\bthe second\b/i : /\bthe app\b|Nothing is awaited from you\./, wait);
      assert.deepEqual(buttons(card).filter((text) => text !== ""), actions, wait);
    }
    // Les mots du ticket : ce que le second fait, ce qu'il attend, ce que la PR attend.
    assert.match(LIT, /^The second is reading your repository/);
    assert.match(ANSWER, /^The second is waiting for your answer/);
    assert.match(MERGER, /^The setup pull request is waiting for your merge/);
  });
});

describe("ce que le parcours lit et tient", () => {
  test("le titre du terminal du second : au travail, au repos, ou rien qu'on sache lire", () => {
    assert.equal(workOfSecond("◐ Setting up cantine"), "travail");
    assert.equal(workOfSecond("◓ claude"), "travail");
    assert.equal(workOfSecond("✳ Claude Code"), "repos");
    assert.equal(workOfSecond("claude"), undefined);
    assert.equal(workOfSecond(undefined), undefined);
  });

  test("la carte de la PR de mise en place, par le titre que le runtime donne à son issue", () => {
    assert.equal(TITLE_OF_THE_CARD_OF_SETUP, TITLE_OF_THE_PR_OF_SETUP);
    assert.equal(cardOfSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }, { cartes: [], autres: [{ ticket: 40, fiche: { titre: TITLE_OF_THE_PR_OF_SETUP } }] }])?.ticket, 40);
    assert.equal(cardOfSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }]), undefined);
    assert.equal(cardOfSetup(undefined), undefined);
  });

  test("la station choisie par le geste de l'app : ajoutée, refusée en une ligne, ou injoignable", async () => {
    assert.equal(await addTheStation("this computer", async () => ({ depots: [REPOSITORY] })), "ajoutee");
    assert.equal(await addTheStation("atelier", async () => ({ selection: [REPOSITORY] })), "ajoutee");
    assert.deepEqual(await addTheStation("this computer", async () => ({ refus: "brigade: the station is not running — no pid" })), { ligne: "nothing was written: the station is not running", detail: "no pid" });
    // Le refus d'une station du compte dit sa cause et son geste sur la ligne même ; ce que GitHub a répondu, au survol (#3187).
    assert.deepEqual(await addTheStation("atelier", async () => ({ refus: REFUSAL_NETWORK, detail: "error connecting to api.github.com" })), {
      ligne: "nothing was written: GitHub could not be reached from this computer; check its network connection, then choose again",
      detail: "error connecting to api.github.com",
    });
    assert.deepEqual(await addTheStation("this computer", async () => Promise.reject(new Error("ipc closed"))), { ligne: "this computer could not be given the project.", detail: "ipc closed" });
  });

  test("le parcours tenu : commencé, répondu, prêt — le premier ticket seulement si le chef a répondu à quelque chose", () => {
    const renderedOnes: string[] = [];
    const heldOnes = holdTheJourney({ rendre: (project) => void renderedOnes.push(project) });
    heldOnes.commencer("cantine", REPOSITORY, false);
    assert.deepEqual(heldOnes.de("cantine"), { depot: REPOSITORY, station: "a-faire", setupVu: false });
    heldOnes.station("cantine", "ajoutee");
    heldOnes.illisible("cantine", "GitHub not reached");
    assert.equal(heldOnes.de("cantine")?.illisible, "GitHub not reached");
    heldOnes.illisible("cantine", undefined);
    assert.equal("illisible" in (heldOnes.de("cantine") ?? {}), false);
    heldOnes.pret("cantine");
    assert.deepEqual(heldOnes.de("cantine")?.pret, {});
    heldOnes.fermer("cantine");
    assert.equal(heldOnes.de("cantine"), undefined);
    // Rien demandé au chef — une station le cuisait, la mise en place était faite : prêt, rien ne reste.
    heldOnes.commencer("parade", "chef/parade", true);
    heldOnes.pret("parade");
    assert.equal(heldOnes.de("parade"), undefined);
    // La mise en place a attendu le chef : la ligne reste.
    heldOnes.commencer("parade", "chef/parade", true);
    heldOnes.setupMontre("parade");
    heldOnes.pret("parade");
    assert.deepEqual(heldOnes.de("parade")?.pret, {});
    assert.ok(renderedOnes.every((project) => project === "cantine" || project === "parade"));
  });
});

// La vue jouée entière.
const PATH = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
// Le rail de cantine : rien à cuire ; `setup`, la carte de la PR de mise en place attend le chef ; `lectureSeule`, le
// compte ne peut pas écrire dans son dépôt.
const facts = ({ setup = false, lectureSeule: readOnly = false } = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: setup ? 1 : 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: setup ? [{ ticket: 40, titre: TITLE_OF_THE_PR_OF_SETUP, url: `https://github.com/${REPOSITORY}/issues/40` }] : [],
  ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}),
});

const page = (vue: Played) => vue.element("parcours-premier-projet");
const question = (vue: Played) => page(vue).dessous("section").find(({ className }) => className.split(" ").includes("parcours-premier-projet")) ?? assert.fail("pas de question");
const button = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${buttons(or).join(", ")}`);
const principal = (vue: Played) => vue.element("main");

// Un ordinateur sans projet : « Add a project », puis le dépôt chef/cantine — la page de cantine s'ouvre.
async function chooseCantine(answers: Answers) {
  let vue: Played | undefined;
  vue = await playTheVue({
    demarrage: startup(),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    // Un projet sans issue ouverte : le départ (#3268) n'a rien à proposer, la page va à la question suivante.
    departDuProjet: () => ({ aucune: true }),
    ...answers,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  button(vue.element("ajout"), REPOSITORY).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "cantine");
  return vue;
}
// Une lecture de cantine arrive.
async function read(vue: Played, options: Parameters<typeof facts>[0] = {}) {
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(options)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const second = (vue: Played) => vue.xterms.at(-1) ?? assert.fail("pas de terminal");
const waitOf = (vue: Played) => sentenceOf(question(vue))?.dataset.attente;
const progressionOf = (vue: Played) => question(vue).dessous("p").find(({ className }) => className === "progression")?.textContent;

describe("la vue jouée : un dépôt choisi, sa page tant qu'il n'est pas prêt", () => {
  test("dans l'ordre : qui le cuit, puis la mise en place que fait le second, puis prêt — le rail reprend la page", async () => {
    const servedOnes: [string, boolean][] = [];
    let ready = false;
    const vue = await chooseCantine({
      servirUnProjet: (repository, served) => (servedOnes.push([repository, served]), { depots: [repository] }),
      checkRepoSetup: () => (ready ? READY : MISSING),
    });
    // Avant la lecture, rien n'est décidé : le compte peut-il écrire dans le dépôt ?
    assert.equal(page(vue).hidden, true);
    await read(vue);
    assert.equal(page(vue).hidden, false);
    // À la place du rail : `main` le porte, sa feuille de style cache le reste.
    assert.equal(principal(vue).dataset.parcours, "station");
    assert.equal(progressionOf(vue), "1 of 2: who cooks it");
    assert.equal(sentenceOf(question(vue))?.textContent, HERE_SAYS);
    assert.deepEqual(buttons(question(vue)), ["this computer", ADD_A_SERVER]);
    // L'avis d'un projet pas préparé n'ajoute pas un second geste.
    assert.equal(vue.poses().some((pose) => pose.className === "avis-depot"), false);

    // Un clic, et la page passe à la suite.
    button(question(vue), "this computer").click();
    await repos();
    assert.deepEqual(servedOnes, [[REPOSITORY, true]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.equal(progressionOf(vue), "2 of 2: its setup for Brigade");
    // Le second n'a encore rien dit de lui : il démarre. Puis son titre dit qu'il tourne, puis qu'il attend le chef.
    assert.equal(waitOf(vue), "demarrage");
    second(vue).titrer("◐ Setting up cantine");
    await repos();
    assert.equal(waitOf(vue), "lit");
    second(vue).titrer("✳ Claude Code");
    await repos();
    assert.equal(waitOf(vue), "repondre");
    // La PR de mise en place ouverte, sa carte dans Awaiting you : le chef la merge.
    second(vue).titrer("◐ Setting up cantine");
    await read(vue, { setup: true });
    assert.equal(waitOf(vue), "merger");
    assert.equal(vue.element("fiche").hidden, true);
    button(question(vue), OPEN_THE_CARD).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok([...vue.element("fiche").descendants()].some(({ textContent }) => textContent === TITLE_OF_THE_PR_OF_SETUP));
    // Mergée : la lecture suivante dit le projet prêt. Le rail reprend la page ; au-dessus, le second demande au chef ce
    // qu'il veut changer d'abord (ticket 3306, premier-ticket/).
    ready = true;
    await read(vue);
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).hidden, false);
    const first = page(vue).dessous("section").find(({ className }) => className.includes("premier-ticket")) ?? assert.fail("pas de premier ticket");
    assert.equal(first.dataset.etape, "question");
    assert.equal(first.dessous("h2")[0]?.textContent, QUESTION_OF_FIRST(REPOSITORY));
    button(page(vue), LATER).click();
    await repos();
    assert.equal(page(vue).hidden, true);
  });

  test("une station du compte en ligne est recommandée : un clic la lui confie", async () => {
    const chosen: [string, string[]][] = [];
    const vue = await chooseCantine({
      stationsDuCompte: () => ({ state: "listed", stations: [station("g1", "atelier", false, []), station("g2", "parade-box", true, ["chef/parade"])], unreadable: [] }),
      choisirLesProjets: (id, repositories) => (chosen.push([id, repositories]), { selection: repositories }),
      checkRepoSetup: () => MISSING,
    });
    await read(vue);
    await repos();
    assert.equal(sentenceOf(question(vue))?.textContent, STATION_SAYS("parade-box"));
    assert.deepEqual(buttons(question(vue)), ["this computer", "parade-box", "atelier", ADD_A_SERVER]);
    button(question(vue), "parade-box").click();
    await repos();
    assert.deepEqual(chosen, [["g2", ["chef/parade", REPOSITORY]]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
  });

  test("une station du compte hors ligne se choisit : sa sélection s'écrit, et la page dit qu'elle prend le projet à son retour (#3187)", async () => {
    const chosen: [string, string[]][] = [];
    const vue = await chooseCantine({
      stationsDuCompte: () => ({ state: "listed", stations: [station("g1", "atelier", false, [])], unreadable: [] }),
      choisirLesProjets: (id, repositories) => (chosen.push([id, repositories]), { selection: repositories }),
      checkRepoSetup: () => MISSING,
    });
    await read(vue);
    await repos();
    button(question(vue), "atelier").click();
    await repos();
    assert.deepEqual(chosen, [["g1", [REPOSITORY]]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.ok(question(vue).dessous("p").some(({ textContent }) => textContent === `atelier is offline: it takes ${REPOSITORY} when it comes back.`));
  });

  test("déjà prêt pour Brigade : la mise en place n'est pas posée, « qui le cuit » répondue mène à prêt", async () => {
    const vue = await chooseCantine({ servirUnProjet: (repository) => ({ depots: [repository] }), checkRepoSetup: () => READY });
    await read(vue);
    assert.equal(progressionOf(vue), "1 of 1: who cooks it");
    button(question(vue), "this computer").click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).dessous("section").some(({ className }) => className.includes("parcours-premier-projet")), false);
    assert.ok(page(vue).dessous("h2").some(({ textContent }) => textContent === QUESTION_OF_FIRST(REPOSITORY)));
  });

  test("une station le cuit déjà : « qui le cuit » n'est pas posée, la mise en place est la seule question", async () => {
    const vue = await chooseCantine({ projetsServis: () => ({ depots: [REPOSITORY] }), checkRepoSetup: () => MISSING });
    await read(vue);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.equal(progressionOf(vue), "1 of 1: its setup for Brigade");
  });

  test("le compte ne peut pas écrire dans le dépôt : rien de tout cela, la page s'ouvre en lecture seule", async () => {
    const vue = await chooseCantine({ checkRepoSetup: () => MISSING });
    await read(vue, { lectureSeule: true });
    assert.equal(page(vue).hidden, true);
    assert.equal(principal(vue).dataset.parcours, undefined);
    // Une lecture suivante n'y revient pas.
    await read(vue);
    assert.equal(page(vue).hidden, true);
  });

  test("une lecture ratée ne décide rien ; la suivante, qui dit le dépôt inscriptible, pose la question", async () => {
    const vue = await chooseCantine({ checkRepoSetup: () => MISSING });
    vue.dire("surFaits", { projet: "cantine", demande: vue.dernier("faits")[0] as number, a: A, atteinte: true, erreur: "GitHub refused: 502" } as never);
    await repos();
    assert.equal(page(vue).hidden, true);
    await read(vue);
    assert.equal(page(vue).hidden, false);
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("la mise en place qui ne se lit pas ne décide rien : la page le dit, et « Try again » la relit", async () => {
    let joined = false;
    const vue = await chooseCantine({ servirUnProjet: (repository) => ({ depots: [repository] }), checkRepoSetup: () => (joined ? MISSING : Promise.reject(new Error("GitHub not reached"))) });
    await read(vue);
    // Le compte n'est pas dit tant que la mise en place n'est pas lue.
    assert.equal(progressionOf(vue), "Who cooks it");
    button(question(vue), "this computer").click();
    await repos();
    assert.equal(waitOf(vue), "illisible");
    // Jamais « prêt » à sa place.
    assert.equal(principal(vue).dataset.parcours, "setup");
    joined = true;
    button(question(vue), RETRY).click();
    await repos();
    assert.equal(waitOf(vue), "demarrage");
  });
});

// Le départ d'un projet qui arrive avec des issues ouvertes (#3268) : l'écran des propositions du second, avant les questions.
const LINES = [
  { ticket: 12, titre: "Crash on login", priorite: 1, raison: "blocks every sign-in" },
  { ticket: 31, titre: "Dark mode", priorite: 3, raison: "nice to have" },
  { ticket: 44, titre: "Slow search", priorite: 2, raison: "hurts daily use" },
];
const screenOfDeparture = (vue: Played) => page(vue).dessous("section").find(({ dataset }) => dataset.etape === "depart") ?? assert.fail("pas d'écran de départ");
const lineOf = (vue: Played, ticket: number) => screenOfDeparture(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas de ligne #${ticket}`);

describe("le départ d'un projet avec des issues ouvertes (#3268)", () => {
  test("le titre dit le vrai nombre d'issues ouvertes, et chaque ligne a son titre, sa priorité et sa raison", async () => {
    const vue = await chooseCantine({ departDuProjet: () => ({ ouvertes: 7, lignes: LINES }) });
    await read(vue);
    assert.equal(principal(vue).dataset.parcours, "depart");
    assert.equal(screenOfDeparture(vue).dessous("h2")[0]?.textContent, "Brigade read your 7 open issues — here are the ones to cook first");
    assert.equal(TITLE_OF_DEPARTURE(1), "Brigade read your 1 open issue — here are the ones to cook first");
    const line = lineOf(vue, 12);
    assert.ok(line.textContent.includes("#12 Crash on login"));
    assert.ok(line.textContent.includes("blocks every sign-in"));
    assert.equal(line.dessous("select")[0]?.value, "1");
    // Les questions du parcours attendent : pas de « qui le cuit » tant que le départ est à l'écran.
    assert.equal(question(vue).dataset.etape, "depart");
  });

  test("un seul bouton met les lignes restantes sur le rail, avec les priorités changées à l'écran, sans celles lâchées — puis la page va à la question suivante", async () => {
    const vue = await chooseCantine({ departDuProjet: () => ({ ouvertes: 3, lignes: LINES }), mettreSurLeRail: (_, lines) => ({ fait: lines.map(({ ticket }) => ticket), refus: [] }) });
    await read(vue);
    const choice = lineOf(vue, 31).dessous("select")[0] ?? assert.fail("pas de liste");
    choice.value = "1";
    choice.declencher("change");
    await repos();
    button(lineOf(vue, 44), RELEASE).click();
    await repos();
    assert.equal(screenOfDeparture(vue).dessous("li").length, 2);
    button(screenOfDeparture(vue), PUT).click();
    await repos();
    assert.deepEqual(vue.dernier("mettreSurLeRail"), ["cantine", [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 1 }]]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "mettreSurLeRail").length, 1);
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("une ligne que GitHub refuse reste à l'écran avec sa cause ; les autres sont sur le rail", async () => {
    const vue = await chooseCantine({
      departDuProjet: () => ({ ouvertes: 3, lignes: LINES }),
      mettreSurLeRail: () => ({ fait: [12, 44], refus: [{ ticket: 31, refus: "#31 is not on the rail: GitHub did not put `product` and `fire` on it", detail: "HTTP 403" }] }),
    });
    await read(vue);
    button(screenOfDeparture(vue), PUT).click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, "depart");
    assert.deepEqual(screenOfDeparture(vue).dessous("li").map(({ dataset }) => dataset.ticket), ["31"]);
    assert.ok(screenOfDeparture(vue).textContent.includes("#31 is not on the rail"));
  });

  test("le triage qui ne répond pas se dit, sans liste inventée ; « not now » va à la question suivante", async () => {
    const vue = await chooseCantine({ departDuProjet: () => ({ sans: "the second's triage did not answer", detail: "no answer within 100 s" }) });
    await read(vue);
    assert.equal(screenOfDeparture(vue).dataset.phase, "sans");
    assert.ok(screenOfDeparture(vue).textContent.includes("the second's triage did not answer"));
    assert.equal(screenOfDeparture(vue).dessous("li").length, 0);
    button(screenOfDeparture(vue), PASS).click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("un projet sans issue ouverte n'a pas cet écran : il va droit à la question suivante du parcours", async () => {
    const vue = await chooseCantine({ departDuProjet: () => ({ aucune: true }) });
    await read(vue);
    assert.equal(principal(vue).dataset.parcours, "station");
    assert.equal(page(vue).dessous("section").some(({ dataset }) => dataset.etape === "depart"), false);
  });
});

describe("le délai du départ, de bout en bout (#3268)", () => {
  test("100 issues ouvertes : du projet ajouté à l'écran affiché, triage compris — un vrai processus pour le triage —, moins de deux minutes", async () => {
    const issues = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}`, body: "x".repeat(2_000), labels: [] }));
    const readGitHub: CallGitHub = async (path) => ({ status: 200, data: /[?&]page=1(&|$)/.test(path) ? issues : [] });
    // Le vrai chemin de l'app (proposerLeDepart) ; seul `claude` est remplacé par un faux processus, qui lit la consigne sur son entrée.
    // Un chemin du système, et non le `pathname` d'une URL : sous Windows, celui-ci (`/D:/a/…`) ne mène à aucun fichier (#3329).
    const launch: LaunchTheTriage = (_command, _args, entry, folder, delayMs) => launchTheTriage(process.execPath, [join(import.meta.dirname, "../helpers/fake-triage.ts")], entry, folder, delayMs);
    // Le chrono part avant que le dépôt soit choisi dans « Add a project » : le projet ajouté, sa lecture, le triage, l'écran.
    const start = performance.now();
    const vue = await chooseCantine({
      departDuProjet: () => proposeTheDeparture({ depot: REPOSITORY, dossier: process.cwd(), lire: readGitHub, claude: "claude", lancer: launch }),
    });
    await read(vue);
    // On attend le fait — l'écran des propositions — et non un temps : le garde est celui du critère, deux minutes. (`repos`, et non une minuterie : celles de la vue jouée ne retiennent pas le process.)
    while (!page(vue).dessous("section").some(({ dataset }) => dataset.etape === "depart" && dataset.phase === "propose") && performance.now() - start < 120_000) await repos();
    const duration = performance.now() - start;
    assert.equal(screenOfDeparture(vue).dessous("h2")[0]?.textContent, "Brigade read your 100 open issues — here are the ones to cook first");
    assert.equal(screenOfDeparture(vue).dessous("li").length, 100);
    assert.ok(duration < 120_000, `${Math.round(duration)} ms`);
  });
});

describe("l'écran du départ, ses morceaux", () => {
  const render = (state: StateOfDeparture) => {
    const calls: string[] = [];
    const root = setTheDeparture(doc, { depot: REPOSITORY, etat: state }, {
      changer: (ticket, priority) => calls.push(`changer ${ticket} ${priority}`),
      lacher: (ticket) => calls.push(`lacher ${ticket}`),
      mettre: () => calls.push("mettre"),
      passer: () => calls.push("passer"),
      relire: () => calls.push("relire"),
    });
    return { racine: root as Fake, appels: calls };
  };

  test("toutes les lignes lâchées : plus de bouton qui met, une phrase et « continue »", () => {
    const { racine: root } = render({ phase: "propose", ouvertes: 3, lignes: [] });
    assert.deepEqual(buttons(root), [CONTINUE]);
  });

  test("les lignes se changent et se lâchent dans l'état tenu ; une mise commencée rend celles qui restent", () => {
    const seenOnes: string[] = [];
    const departures = holdTheDepartures({ rendre: (name) => seenOnes.push(name) });
    departures.commencer("cantine");
    departures.recu("cantine", { ouvertes: 3, lignes: LINES });
    departures.changer("cantine", 31, 2);
    departures.lacher("cantine", 44);
    assert.deepEqual(departures.commencerLaMise("cantine"), { ouvertes: 3, lignes: [LINES[0], { ...LINES[1], priorite: 2 }] });
    // Pendant la mise, rien ne se change ni ne repart une seconde fois.
    departures.lacher("cantine", 12);
    assert.equal(departures.commencerLaMise("cantine"), undefined);
    departures.mise("cantine", [12, 31], []);
    assert.equal(departures.de("cantine"), undefined);
  });

  test("sans issue à proposer, ou toutes déjà sur le rail, le départ s'efface", () => {
    const departures = holdTheDepartures({ rendre: () => {} });
    departures.commencer("a");
    departures.recu("a", { ouvertes: 2, lignes: [] });
    assert.equal(departures.de("a"), undefined);
  });
});
