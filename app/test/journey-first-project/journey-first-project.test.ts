// La page d'un projet pas encore prêt (#3166, épique #3164). D'abord ses morceaux, devant un faux document : où en est le
// parcours d'après ce qui est lu — « qui le cuit » d'abord, la mise en place seulement si le projet ne l'a pas —, la ligne
// de progression, le choix recommandé, et à chaque état de la mise en place ce qui est attendu et de qui. Puis la vue jouée
// entière (vue.js tel qu'il est, un faux pont) : « Add a project », un dépôt choisi, sa page s'ouvre sur la question à la
// place du rail, puis la mise en place, puis prêt ; un projet déjà prêt passe la mise en place ; un projet qu'une station
// cuit déjà passe « qui le cuit » ; un projet où le compte ne peut pas écrire n'ouvre rien de tout cela.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { TITRE as TITRE_DE_LA_PR_DE_SETUP } from "../../../runtime/src/second-init/pr-de-setup.ts";
import type { StationEnregistree } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { PREPARER } from "../../src/vue/page-project/repository-non-prepare.js";
import {
  ajouterLaStation,
  cardDeSetup,
  choiceDeStation,
  DEMARRAGE,
  EMPECHE,
  EN_ROUTE,
  AUCUNE_EN_LINE,
  ICI,
  ICI_DIT,
  ILLISIBLE,
  READ,
  LIT,
  MERGER,
  OUVRIR_LA_CARD,
  poserJourneyFirstProject,
  progression,
  REFUSAL,
  REPONDRE,
  STATION_DIT,
  holdLesJourney,
  TITRE_DE_LA_CARD_DE_SETUP,
  travailDuSecond,
  vuDuJourney,
  type Wait,
  type Choice,
  type ActionsDuJourney,
} from "../../src/vue/journey-first-project/journey-first-project.js";
import { REESSAYER } from "../../src/vue/lexique.js";
import { PLUS_TARD, poserFirstTicket, QUESTION as QUESTION_DU_FIRST } from "../../src/vue/first-ticket/first-ticket.js";
import { REFUSAL_RESEAU } from "../../src/stations-du-account.ts";
import { CONTINUER, LACHER, METTRE, PASSER, poserLeDepart, holdLesDeparts, TITRE as TITRE_DU_DEPART, type State as StateDuDepart } from "../../src/vue/journey-first-project/depart.js";
import { lancerLeTriage, proposerLeDepart, type LancerLeTriage } from "../../src/depart-du-project.ts";
import type { CallGitHub } from "../../src/tableau/client.ts";
import { Faux, jouerLaVue, type Jouee, type Answers, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const REPOSITORY = "chef/cantine";
const MANQUE = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const PRETE = { ready: true, missingBindings: [], missingLabels: [] };
const NON_PRETE = { etape: "manque" as const, verif: { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] } };
const ICI_CHOICE: Choice = { cle: ICI, nom: "this computer", horsLigne: false, recommande: true };
// 22 min après le dernier signe de vie des stations hors ligne.
const VINGT_DEUX = Date.parse("2026-11-11T10:22:00.000Z");
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

const actionsVides = (): ActionsDuJourney & { faits: string[] } => {
  const facts: string[] = [];
  return { faits: facts, choisir: (un) => void facts.push(`choisir ${un.cle}`), relire: () => void facts.push("relire"), preparer: () => void facts.push("preparer"), ouvrirLaCarte: () => void facts.push("carte") };
};
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const phraseDe = (card: Faux) => card.dessous("p").find((pose) => pose.className === "phrase");

describe("où en est le parcours, d'après ce qui est lu", () => {
  test("« qui le cuit » d'abord, tant qu'elle n'est pas répondue — quoi que dise la mise en place", () => {
    assert.deepEqual(vuDuJourney({ station: "a-faire", second: {} }), { etape: "station" });
    assert.deepEqual(vuDuJourney({ station: { enCours: ICI }, preparation: { etape: "prepare" }, second: {} }), { etape: "station" });
    assert.deepEqual(vuDuJourney({ station: { ligne: "nothing was written", detail: "" }, preparation: NON_PRETE, second: {} }), { etape: "station" });
  });

  test("répondue, ou pas à poser : un projet prêt va à prêt ; sinon, la mise en place", () => {
    assert.deepEqual(vuDuJourney({ station: "ajoutee", preparation: { etape: "prepare" }, second: { titre: "repos" } }), { etape: "pret" });
    assert.deepEqual(vuDuJourney({ station: "inutile", preparation: { etape: "prepare" }, second: {} }), { etape: "pret" });
    assert.equal(vuDuJourney({ station: "ajoutee", preparation: NON_PRETE, second: {} }).etape, "setup");
    assert.equal(vuDuJourney({ station: "inutile", preparation: NON_PRETE, second: {} }).etape, "setup");
  });

  test("chaque état de la mise en place dit qui est attendu : l'app, le second, ou toi", () => {
    const cas: [Parameters<typeof vuDuJourney>[0], Wait, string][] = [
      [{ station: "ajoutee", second: {} }, "lecture", "app"],
      [{ station: "ajoutee", preparation: { etape: "inconnu" }, second: {} }, "lecture", "app"],
      [{ station: "ajoutee", illisible: "GitHub not reached", second: {} }, "illisible", "toi"],
      [{ station: "ajoutee", preparation: NON_PRETE, second: {} }, "demarrage", "second"],
      [{ station: "ajoutee", preparation: NON_PRETE, second: { titre: "travail" } }, "lit", "second"],
      [{ station: "ajoutee", preparation: NON_PRETE, second: { titre: "repos" } }, "repondre", "toi"],
      [{ station: "ajoutee", preparation: NON_PRETE, second: { titre: "travail", propose: true } }, "repondre", "toi"],
      [{ station: "ajoutee", preparation: NON_PRETE, carte: true, second: { titre: "repos" } }, "merger", "toi"],
      [{ station: "ajoutee", preparation: { ...NON_PRETE, etape: "en-route" }, second: { titre: "travail" } }, "en-route", "app"],
      [{ station: "ajoutee", preparation: { ...NON_PRETE, etape: "refus", dit: "GitHub refused the labels." }, second: {} }, "refus", "toi"],
      [{ station: "ajoutee", preparation: NON_PRETE, second: { empeche: true } }, "empeche", "toi"],
    ];
    for (const [lu, wait, qui] of cas) assert.deepEqual(vuDuJourney(lu), { etape: "setup", attente: wait, qui }, wait);
  });

  test("la ligne de progression : le rang, et combien de questions le projet pose — jamais une question sans rien à faire", () => {
    const station = { etape: "station" } as const;
    const setup = { etape: "setup", attente: "lit", qui: "second" } as const;
    assert.equal(progression(station, { station: "a-faire", preparation: NON_PRETE }), "1 of 2: who cooks it");
    assert.equal(progression(setup, { station: "ajoutee", preparation: NON_PRETE }), "2 of 2: its setup for Brigade");
    // Déjà prêt pour Brigade : une seule question.
    assert.equal(progression(station, { station: "a-faire", preparation: { etape: "prepare" } }), "1 of 1: who cooks it");
    // Une station le cuit déjà : la mise en place est la seule.
    assert.equal(progression(setup, { station: "inutile", preparation: NON_PRETE }), "1 of 1: its setup for Brigade");
    // La mise en place pas encore lue : le compte n'est pas dit.
    assert.equal(progression(station, { station: "a-faire" }), "Who cooks it");
    assert.equal(progression(station, { station: "a-faire", preparation: { etape: "inconnu" } }), "Who cooks it");
  });

  test("cet ordinateur d'abord, son nom d'hôte après lui ; le choix recommandé : une station du compte en ligne, sinon cet ordinateur", () => {
    const atelier = station("g1", "atelier", false);
    const box = station("g2", "parade-box", true);
    const recommande = (choice: Choice[]) => choice.filter((un) => un.recommande).map(({ cle }) => cle);
    assert.deepEqual(choiceDeStation({ ici: true, stations: [atelier, box], maintenant: VINGT_DEUX }).map(({ cle }) => cle), [ICI, "g2", "g1"]);
    assert.deepEqual(recommande(choiceDeStation({ ici: true, stations: [atelier, box], maintenant: VINGT_DEUX })), ["g2"]);
    assert.deepEqual(choiceDeStation({ ici: true, stations: [atelier], maintenant: VINGT_DEUX }).map(({ cle }) => cle), [ICI, "g1"]);
    assert.deepEqual(recommande(choiceDeStation({ ici: true, stations: [atelier], maintenant: VINGT_DEUX })), [ICI]);
    assert.deepEqual(choiceDeStation({ ici: true, stations: [] }), [ICI_CHOICE]);
    assert.deepEqual(choiceDeStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [] }), [{ ...ICI_CHOICE, hote: "MacBook-Air-de-Chef" }]);
    // Une station hors ligne n'est jamais recommandée : sans aucune en ligne ni cet ordinateur, rien ne l'est. Elle dit depuis
    // quand, et comment la ramener (#3187).
    assert.deepEqual(choiceDeStation({ ici: false, stations: [atelier], maintenant: VINGT_DEUX }), [{ cle: "g1", nom: "atelier", horsLigne: true, recommande: false, absente: ATELIER_ABSENT }]);
  });
});

describe("ce que la page dit", () => {
  test("« qui le cuit » : la progression, la question, la phrase du recommandé, un bouton par choix — le recommandé en tête", () => {
    const actions = actionsVides();
    const choice = choiceDeStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [station("g1", "atelier", false)], maintenant: VINGT_DEUX });
    const card = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix: choice }, actions) as unknown as Faux;
    assert.equal(card.dessous("p")[0]?.textContent, "1 of 2: who cooks it");
    assert.equal(card.dessous("h2")[0]?.textContent, "Who cooks chef/cantine?");
    assert.equal(phraseDe(card)?.textContent, ICI_DIT);
    assert.equal(ICI_DIT, "This computer cooks the project's tickets while it is on; you can add a server or another computer later.");
    assert.deepEqual(boutons(card), ["this computer", "atelier"]);
    assert.equal(card.dessous("button")[0]?.className.includes("recommande"), true);
    assert.equal(card.dessous("button")[1]?.className.includes("recommande"), false);
    // Cet ordinateur, puis son nom d'hôte ; la station hors ligne dit depuis quand, et le geste qui la ramène.
    assert.deepEqual(card.dessous("li")[0]?.dessous("span").map(({ textContent }) => textContent).filter((texte) => texte !== "this computer"), ["MacBook-Air-de-Chef"]);
    assert.ok(card.dessous("span").some(({ textContent }) => textContent === ATELIER_ABSENT));
    card.dessous("button")[0]?.click();
    assert.deepEqual(actions.faits, [`choisir ${ICI}`]);
  });

  test("une station du compte en ligne, recommandée : sa phrase la nomme", () => {
    const choice = choiceDeStation({ ici: true, stations: [station("g2", "parade-box", true)] });
    const card = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: "a-faire", choix: choice }, actionsVides()) as unknown as Faux;
    assert.equal(phraseDe(card)?.textContent, STATION_DIT("parade-box"));
    assert.deepEqual(boutons(card), ["this computer", "parade-box"]);
    // Le recommandé se distingue où qu'il soit dans la liste.
    assert.equal(card.dessous("button")[0]?.className.includes("recommande"), false);
    assert.equal(card.dessous("button")[1]?.className.includes("recommande"), true);
  });

  test("aucune station en ligne, ni cet ordinateur : rien n'est recommandé, et la phrase le dit (#3187)", () => {
    const choice = choiceDeStation({ ici: false, stations: [station("g1", "atelier", false)], maintenant: VINGT_DEUX });
    const card = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: "a-faire", choix: choice }, actionsVides()) as unknown as Faux;
    assert.equal(phraseDe(card)?.textContent, AUCUNE_EN_LINE);
    assert.equal(card.dessous("button").some(({ className }) => className.includes("recommande")), false);
  });

  test("une station choisie hors ligne : la page dit en clair qu'elle prend le projet à son retour (#3187)", () => {
    const setup = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "setup", attente: "lit", qui: "second" }, progression: "", station: "ajoutee", choix: [], absente: "atelier" }, actionsVides()) as unknown as Faux;
    assert.ok(setup.dessous("p").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
    // Prêt, au-dessus du rail, la question du premier ticket le dit aussi (ticket 3306).
    const pret = poserFirstTicket(doc, { depot: REPOSITORY, etat: { etape: "question", reponse: "" }, absente: "atelier" }, { ecrire: () => {}, envoyer: () => {}, oui: () => {}, changer: () => {}, fermer: () => {} }) as unknown as Faux;
    assert.ok(pret.dessous("p").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
  });

  test("un choix qui s'écrit grise les boutons ; refusé, une ligne et son détail, les boutons rendus", () => {
    const enCours = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: { enCours: ICI }, choix: [ICI_CHOICE] }, actionsVides()) as unknown as Faux;
    assert.equal(enCours.dessous("button")[0]?.disabled, true);
    const refusee = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "station" }, progression: "", station: { ligne: "nothing was written: no station", detail: "gist refused" }, choix: [ICI_CHOICE] }, actionsVides()) as unknown as Faux;
    assert.ok(refusee.dessous("span").some(({ textContent }) => textContent === "nothing was written: no station"));
    assert.equal(refusee.dessous("button")[0]?.disabled, false);
  });

  test("chaque état de la mise en place se dit en mots simples, avec qui l'on attend ; le geste du chef est un bouton", () => {
    const phrases: Record<Wait, [string, string[]]> = {
      lecture: [READ(REPOSITORY), []],
      illisible: [ILLISIBLE(REPOSITORY), [REESSAYER]],
      demarrage: [DEMARRAGE, []],
      lit: [LIT, []],
      repondre: [REPONDRE, []],
      merger: [MERGER, [OUVRIR_LA_CARD]],
      "en-route": [EN_ROUTE(REPOSITORY), []],
      refus: [REFUSAL("GitHub refused the labels."), [REESSAYER]],
      empeche: [EMPECHE, [PREPARER]],
    };
    for (const [wait, [phrase, actions]] of Object.entries(phrases) as [Wait, [string, string[]]][]) {
      const qui = wait === "lecture" || wait === "en-route" ? "app" : wait === "demarrage" || wait === "lit" ? "second" : "toi";
      const card = poserJourneyFirstProject(doc, { depot: REPOSITORY, vu: { etape: "setup", attente: wait, qui }, progression: "", station: "ajoutee", choix: [], illisible: "GitHub not reached", refus: "GitHub refused the labels." }, actionsVides()) as unknown as Faux;
      const dit = phraseDe(card) ?? assert.fail(`aucune phrase pour ${wait}`);
      assert.ok(dit.textContent.startsWith(phrase), `${wait} : ${dit.textContent}`);
      assert.equal(dit.dataset.qui, qui);
      // Qui l'on attend est dit dans la phrase même.
      assert.match(phrase, qui === "toi" ? /\byou\b|\byour\b/ : qui === "second" ? /\bthe second\b/i : /\bthe app\b|Nothing is awaited from you\./, wait);
      assert.deepEqual(boutons(card).filter((texte) => texte !== ""), actions, wait);
    }
    // Les mots du ticket : ce que le second fait, ce qu'il attend, ce que la PR attend.
    assert.match(LIT, /^The second is reading your repository/);
    assert.match(REPONDRE, /^The second is waiting for your answer/);
    assert.match(MERGER, /^The setup pull request is waiting for your merge/);
  });
});

describe("ce que le parcours lit et tient", () => {
  test("le titre du terminal du second : au travail, au repos, ou rien qu'on sache lire", () => {
    assert.equal(travailDuSecond("◐ Setting up cantine"), "travail");
    assert.equal(travailDuSecond("◓ claude"), "travail");
    assert.equal(travailDuSecond("✳ Claude Code"), "repos");
    assert.equal(travailDuSecond("claude"), undefined);
    assert.equal(travailDuSecond(undefined), undefined);
  });

  test("la carte de la PR de mise en place, par le titre que le runtime donne à son issue", () => {
    assert.equal(TITRE_DE_LA_CARD_DE_SETUP, TITRE_DE_LA_PR_DE_SETUP);
    assert.equal(cardDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }, { cartes: [], autres: [{ ticket: 40, fiche: { titre: TITRE_DE_LA_PR_DE_SETUP } }] }])?.ticket, 40);
    assert.equal(cardDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }]), undefined);
    assert.equal(cardDeSetup(undefined), undefined);
  });

  test("la station choisie par le geste de l'app : ajoutée, refusée en une ligne, ou injoignable", async () => {
    assert.equal(await ajouterLaStation("this computer", async () => ({ depots: [REPOSITORY] })), "ajoutee");
    assert.equal(await ajouterLaStation("atelier", async () => ({ selection: [REPOSITORY] })), "ajoutee");
    assert.deepEqual(await ajouterLaStation("this computer", async () => ({ refus: "brigade: the station is not running — no pid" })), { ligne: "nothing was written: the station is not running", detail: "no pid" });
    // Le refus d'une station du compte dit sa cause et son geste sur la ligne même ; ce que GitHub a répondu, au survol (#3187).
    assert.deepEqual(await ajouterLaStation("atelier", async () => ({ refus: REFUSAL_RESEAU, detail: "error connecting to api.github.com" })), {
      ligne: "nothing was written: GitHub could not be reached from this computer; check its network connection, then choose again",
      detail: "error connecting to api.github.com",
    });
    assert.deepEqual(await ajouterLaStation("this computer", async () => Promise.reject(new Error("ipc closed"))), { ligne: "this computer could not be given the project.", detail: "ipc closed" });
  });

  test("le parcours tenu : commencé, répondu, prêt — le premier ticket seulement si le chef a répondu à quelque chose", () => {
    const rendus: string[] = [];
    const tenus = holdLesJourney({ rendre: (project) => void rendus.push(project) });
    tenus.commencer("cantine", REPOSITORY, false);
    assert.deepEqual(tenus.de("cantine"), { depot: REPOSITORY, station: "a-faire", setupVu: false });
    tenus.station("cantine", "ajoutee");
    tenus.illisible("cantine", "GitHub not reached");
    assert.equal(tenus.de("cantine")?.illisible, "GitHub not reached");
    tenus.illisible("cantine", undefined);
    assert.equal("illisible" in (tenus.de("cantine") ?? {}), false);
    tenus.pret("cantine");
    assert.deepEqual(tenus.de("cantine")?.pret, {});
    tenus.fermer("cantine");
    assert.equal(tenus.de("cantine"), undefined);
    // Rien demandé au chef — une station le cuisait, la mise en place était faite : prêt, rien ne reste.
    tenus.commencer("parade", "chef/parade", true);
    tenus.pret("parade");
    assert.equal(tenus.de("parade"), undefined);
    // La mise en place a attendu le chef : la ligne reste.
    tenus.commencer("parade", "chef/parade", true);
    tenus.setupMontre("parade");
    tenus.pret("parade");
    assert.deepEqual(tenus.de("parade")?.pret, {});
    assert.ok(rendus.every((project) => project === "cantine" || project === "parade"));
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => () => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
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
  attend: setup ? [{ ticket: 40, titre: TITRE_DE_LA_PR_DE_SETUP, url: `https://github.com/${REPOSITORY}/issues/40` }] : [],
  ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}),
});

const page = (vue: Jouee) => vue.element("parcours-premier-projet");
const question = (vue: Jouee) => page(vue).dessous("section").find(({ className }) => className.split(" ").includes("parcours-premier-projet")) ?? assert.fail("pas de question");
const button = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).join(", ")}`);
const principal = (vue: Jouee) => vue.element("main");

// Un ordinateur sans projet : « Add a project », puis le dépôt chef/cantine — la page de cantine s'ouvre.
async function choisirCantine(answers: Answers) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage: demarrage(),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      vue?.dire("surConfiguration", pourLaBar({ chemin: CHEMIN, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
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
async function lire(vue: Jouee, options: Parameters<typeof facts>[0] = {}) {
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(options)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const second = (vue: Jouee) => vue.xterms.at(-1) ?? assert.fail("pas de terminal");
const waitDe = (vue: Jouee) => phraseDe(question(vue))?.dataset.attente;
const progressionDe = (vue: Jouee) => question(vue).dessous("p").find(({ className }) => className === "progression")?.textContent;

describe("la vue jouée : un dépôt choisi, sa page tant qu'il n'est pas prêt", () => {
  test("dans l'ordre : qui le cuit, puis la mise en place que fait le second, puis prêt — le rail reprend la page", async () => {
    const servedOnes: [string, boolean][] = [];
    let pret = false;
    const vue = await choisirCantine({
      servirUnProjet: (repository, served) => (servedOnes.push([repository, served]), { depots: [repository] }),
      checkRepoSetup: () => (pret ? PRETE : MANQUE),
    });
    // Avant la lecture, rien n'est décidé : le compte peut-il écrire dans le dépôt ?
    assert.equal(page(vue).hidden, true);
    await lire(vue);
    assert.equal(page(vue).hidden, false);
    // À la place du rail : `main` le porte, sa feuille de style cache le reste.
    assert.equal(principal(vue).dataset.parcours, "station");
    assert.equal(progressionDe(vue), "1 of 2: who cooks it");
    assert.equal(phraseDe(question(vue))?.textContent, ICI_DIT);
    assert.deepEqual(boutons(question(vue)), ["this computer"]);
    // L'avis d'un projet pas préparé n'ajoute pas un second geste.
    assert.equal(vue.poses().some((pose) => pose.className === "avis-depot"), false);

    // Un clic, et la page passe à la suite.
    button(question(vue), "this computer").click();
    await repos();
    assert.deepEqual(servedOnes, [[REPOSITORY, true]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.equal(progressionDe(vue), "2 of 2: its setup for Brigade");
    // Le second n'a encore rien dit de lui : il démarre. Puis son titre dit qu'il tourne, puis qu'il attend le chef.
    assert.equal(waitDe(vue), "demarrage");
    second(vue).titrer("◐ Setting up cantine");
    await repos();
    assert.equal(waitDe(vue), "lit");
    second(vue).titrer("✳ Claude Code");
    await repos();
    assert.equal(waitDe(vue), "repondre");
    // La PR de mise en place ouverte, sa carte dans Awaiting you : le chef la merge.
    second(vue).titrer("◐ Setting up cantine");
    await lire(vue, { setup: true });
    assert.equal(waitDe(vue), "merger");
    assert.equal(vue.element("fiche").hidden, true);
    button(question(vue), OUVRIR_LA_CARD).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok([...vue.element("fiche").descendants()].some(({ textContent }) => textContent === TITRE_DE_LA_PR_DE_SETUP));
    // Mergée : la lecture suivante dit le projet prêt. Le rail reprend la page ; au-dessus, le second demande au chef ce
    // qu'il veut changer d'abord (ticket 3306, premier-ticket/).
    pret = true;
    await lire(vue);
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).hidden, false);
    const first = page(vue).dessous("section").find(({ className }) => className.includes("premier-ticket")) ?? assert.fail("pas de premier ticket");
    assert.equal(first.dataset.etape, "question");
    assert.equal(first.dessous("h2")[0]?.textContent, QUESTION_DU_FIRST(REPOSITORY));
    button(page(vue), PLUS_TARD).click();
    await repos();
    assert.equal(page(vue).hidden, true);
  });

  test("une station du compte en ligne est recommandée : un clic la lui confie", async () => {
    const choisis: [string, string[]][] = [];
    const vue = await choisirCantine({
      stationsDuCompte: () => ({ state: "listed", stations: [station("g1", "atelier", false, []), station("g2", "parade-box", true, ["chef/parade"])], unreadable: [] }),
      choisirLesProjets: (id, depots) => (choisis.push([id, depots]), { selection: depots }),
      checkRepoSetup: () => MANQUE,
    });
    await lire(vue);
    await repos();
    assert.equal(phraseDe(question(vue))?.textContent, STATION_DIT("parade-box"));
    assert.deepEqual(boutons(question(vue)), ["this computer", "parade-box", "atelier"]);
    button(question(vue), "parade-box").click();
    await repos();
    assert.deepEqual(choisis, [["g2", ["chef/parade", REPOSITORY]]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
  });

  test("une station du compte hors ligne se choisit : sa sélection s'écrit, et la page dit qu'elle prend le projet à son retour (#3187)", async () => {
    const choisis: [string, string[]][] = [];
    const vue = await choisirCantine({
      stationsDuCompte: () => ({ state: "listed", stations: [station("g1", "atelier", false, [])], unreadable: [] }),
      choisirLesProjets: (id, depots) => (choisis.push([id, depots]), { selection: depots }),
      checkRepoSetup: () => MANQUE,
    });
    await lire(vue);
    await repos();
    button(question(vue), "atelier").click();
    await repos();
    assert.deepEqual(choisis, [["g1", [REPOSITORY]]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.ok(question(vue).dessous("p").some(({ textContent }) => textContent === `atelier is offline: it takes ${REPOSITORY} when it comes back.`));
  });

  test("déjà prêt pour Brigade : la mise en place n'est pas posée, « qui le cuit » répondue mène à prêt", async () => {
    const vue = await choisirCantine({ servirUnProjet: (repository) => ({ depots: [repository] }), checkRepoSetup: () => PRETE });
    await lire(vue);
    assert.equal(progressionDe(vue), "1 of 1: who cooks it");
    button(question(vue), "this computer").click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).dessous("section").some(({ className }) => className.includes("parcours-premier-projet")), false);
    assert.ok(page(vue).dessous("h2").some(({ textContent }) => textContent === QUESTION_DU_FIRST(REPOSITORY)));
  });

  test("une station le cuit déjà : « qui le cuit » n'est pas posée, la mise en place est la seule question", async () => {
    const vue = await choisirCantine({ projetsServis: () => ({ depots: [REPOSITORY] }), checkRepoSetup: () => MANQUE });
    await lire(vue);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.equal(progressionDe(vue), "1 of 1: its setup for Brigade");
  });

  test("le compte ne peut pas écrire dans le dépôt : rien de tout cela, la page s'ouvre en lecture seule", async () => {
    const vue = await choisirCantine({ checkRepoSetup: () => MANQUE });
    await lire(vue, { lectureSeule: true });
    assert.equal(page(vue).hidden, true);
    assert.equal(principal(vue).dataset.parcours, undefined);
    // Une lecture suivante n'y revient pas.
    await lire(vue);
    assert.equal(page(vue).hidden, true);
  });

  test("une lecture ratée ne décide rien ; la suivante, qui dit le dépôt inscriptible, pose la question", async () => {
    const vue = await choisirCantine({ checkRepoSetup: () => MANQUE });
    vue.dire("surFaits", { projet: "cantine", demande: vue.dernier("faits")[0] as number, a: A, atteinte: true, erreur: "GitHub refused: 502" } as never);
    await repos();
    assert.equal(page(vue).hidden, true);
    await lire(vue);
    assert.equal(page(vue).hidden, false);
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("la mise en place qui ne se lit pas ne décide rien : la page le dit, et « Try again » la relit", async () => {
    let joint = false;
    const vue = await choisirCantine({ servirUnProjet: (repository) => ({ depots: [repository] }), checkRepoSetup: () => (joint ? MANQUE : Promise.reject(new Error("GitHub not reached"))) });
    await lire(vue);
    // Le compte n'est pas dit tant que la mise en place n'est pas lue.
    assert.equal(progressionDe(vue), "Who cooks it");
    button(question(vue), "this computer").click();
    await repos();
    assert.equal(waitDe(vue), "illisible");
    // Jamais « prêt » à sa place.
    assert.equal(principal(vue).dataset.parcours, "setup");
    joint = true;
    button(question(vue), REESSAYER).click();
    await repos();
    assert.equal(waitDe(vue), "demarrage");
  });
});

// Le départ d'un projet qui arrive avec des issues ouvertes (#3268) : l'écran des propositions du second, avant les questions.
const LINES = [
  { ticket: 12, titre: "Crash on login", priorite: 1, raison: "blocks every sign-in" },
  { ticket: 31, titre: "Dark mode", priorite: 3, raison: "nice to have" },
  { ticket: 44, titre: "Slow search", priorite: 2, raison: "hurts daily use" },
];
const screenDuDepart = (vue: Jouee) => page(vue).dessous("section").find(({ dataset }) => dataset.etape === "depart") ?? assert.fail("pas d'écran de départ");
const lineDe = (vue: Jouee, ticket: number) => screenDuDepart(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas de ligne #${ticket}`);

describe("le départ d'un projet avec des issues ouvertes (#3268)", () => {
  test("le titre dit le vrai nombre d'issues ouvertes, et chaque ligne a son titre, sa priorité et sa raison", async () => {
    const vue = await choisirCantine({ departDuProjet: () => ({ ouvertes: 7, lignes: LINES }) });
    await lire(vue);
    assert.equal(principal(vue).dataset.parcours, "depart");
    assert.equal(screenDuDepart(vue).dessous("h2")[0]?.textContent, "Brigade read your 7 open issues — here are the ones to cook first");
    assert.equal(TITRE_DU_DEPART(1), "Brigade read your 1 open issue — here are the ones to cook first");
    const line = lineDe(vue, 12);
    assert.ok(line.textContent.includes("#12 Crash on login"));
    assert.ok(line.textContent.includes("blocks every sign-in"));
    assert.equal(line.dessous("select")[0]?.value, "1");
    // Les questions du parcours attendent : pas de « qui le cuit » tant que le départ est à l'écran.
    assert.equal(question(vue).dataset.etape, "depart");
  });

  test("un seul bouton met les lignes restantes sur le rail, avec les priorités changées à l'écran, sans celles lâchées — puis la page va à la question suivante", async () => {
    const vue = await choisirCantine({ departDuProjet: () => ({ ouvertes: 3, lignes: LINES }), mettreSurLeRail: (_, lines) => ({ fait: lines.map(({ ticket }) => ticket), refus: [] }) });
    await lire(vue);
    const choice = lineDe(vue, 31).dessous("select")[0] ?? assert.fail("pas de liste");
    choice.value = "1";
    choice.declencher("change");
    await repos();
    button(lineDe(vue, 44), LACHER).click();
    await repos();
    assert.equal(screenDuDepart(vue).dessous("li").length, 2);
    button(screenDuDepart(vue), METTRE).click();
    await repos();
    assert.deepEqual(vue.dernier("mettreSurLeRail"), ["cantine", [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 1 }]]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "mettreSurLeRail").length, 1);
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("une ligne que GitHub refuse reste à l'écran avec sa cause ; les autres sont sur le rail", async () => {
    const vue = await choisirCantine({
      departDuProjet: () => ({ ouvertes: 3, lignes: LINES }),
      mettreSurLeRail: () => ({ fait: [12, 44], refus: [{ ticket: 31, refus: "#31 is not on the rail: GitHub did not put `product` and `fire` on it", detail: "HTTP 403" }] }),
    });
    await lire(vue);
    button(screenDuDepart(vue), METTRE).click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, "depart");
    assert.deepEqual(screenDuDepart(vue).dessous("li").map(({ dataset }) => dataset.ticket), ["31"]);
    assert.ok(screenDuDepart(vue).textContent.includes("#31 is not on the rail"));
  });

  test("le triage qui ne répond pas se dit, sans liste inventée ; « not now » va à la question suivante", async () => {
    const vue = await choisirCantine({ departDuProjet: () => ({ sans: "the second's triage did not answer", detail: "no answer within 100 s" }) });
    await lire(vue);
    assert.equal(screenDuDepart(vue).dataset.phase, "sans");
    assert.ok(screenDuDepart(vue).textContent.includes("the second's triage did not answer"));
    assert.equal(screenDuDepart(vue).dessous("li").length, 0);
    button(screenDuDepart(vue), PASSER).click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, "station");
  });

  test("un projet sans issue ouverte n'a pas cet écran : il va droit à la question suivante du parcours", async () => {
    const vue = await choisirCantine({ departDuProjet: () => ({ aucune: true }) });
    await lire(vue);
    assert.equal(principal(vue).dataset.parcours, "station");
    assert.equal(page(vue).dessous("section").some(({ dataset }) => dataset.etape === "depart"), false);
  });
});

describe("le délai du départ, de bout en bout (#3268)", () => {
  test("100 issues ouvertes : du projet ajouté à l'écran affiché, triage compris — un vrai processus pour le triage —, moins de deux minutes", async () => {
    const issues = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: `Issue ${i + 1}`, body: "x".repeat(2_000), labels: [] }));
    const lireGitHub: CallGitHub = async (chemin) => ({ status: 200, data: /[?&]page=1(&|$)/.test(chemin) ? issues : [] });
    // Le vrai chemin de l'app (proposerLeDepart) ; seul `claude` est remplacé par un faux processus, qui lit la consigne sur son entrée.
    // Un chemin du système, et non le `pathname` d'une URL : sous Windows, celui-ci (`/D:/a/…`) ne mène à aucun fichier (#3329).
    const lancer: LancerLeTriage = (_command, _args, entree, dossier, delayMs) => lancerLeTriage(process.execPath, [join(import.meta.dirname, "../aides/faux-triage.ts")], entree, dossier, delayMs);
    // Le chrono part avant que le dépôt soit choisi dans « Add a project » : le projet ajouté, sa lecture, le triage, l'écran.
    const debut = performance.now();
    const vue = await choisirCantine({
      departDuProjet: () => proposerLeDepart({ depot: REPOSITORY, dossier: process.cwd(), lire: lireGitHub, claude: "claude", lancer }),
    });
    await lire(vue);
    // On attend le fait — l'écran des propositions — et non un temps : le garde est celui du critère, deux minutes. (`repos`, et non une minuterie : celles de la vue jouée ne retiennent pas le process.)
    while (!page(vue).dessous("section").some(({ dataset }) => dataset.etape === "depart" && dataset.phase === "propose") && performance.now() - debut < 120_000) await repos();
    const duree = performance.now() - debut;
    assert.equal(screenDuDepart(vue).dessous("h2")[0]?.textContent, "Brigade read your 100 open issues — here are the ones to cook first");
    assert.equal(screenDuDepart(vue).dessous("li").length, 100);
    assert.ok(duree < 120_000, `${Math.round(duree)} ms`);
  });
});

describe("l'écran du départ, ses morceaux", () => {
  const rendre = (state: StateDuDepart) => {
    const calls: string[] = [];
    const racine = poserLeDepart(doc, { depot: REPOSITORY, etat: state }, {
      changer: (ticket, priority) => calls.push(`changer ${ticket} ${priority}`),
      lacher: (ticket) => calls.push(`lacher ${ticket}`),
      mettre: () => calls.push("mettre"),
      passer: () => calls.push("passer"),
      relire: () => calls.push("relire"),
    });
    return { racine: racine as Faux, appels: calls };
  };

  test("toutes les lignes lâchées : plus de bouton qui met, une phrase et « continue »", () => {
    const { racine } = rendre({ phase: "propose", ouvertes: 3, lignes: [] });
    assert.deepEqual(boutons(racine), [CONTINUER]);
  });

  test("les lignes se changent et se lâchent dans l'état tenu ; une mise commencée rend celles qui restent", () => {
    const vus: string[] = [];
    const departs = holdLesDeparts({ rendre: (name) => vus.push(name) });
    departs.commencer("cantine");
    departs.recu("cantine", { ouvertes: 3, lignes: LINES });
    departs.changer("cantine", 31, 2);
    departs.lacher("cantine", 44);
    assert.deepEqual(departs.commencerLaMise("cantine"), { ouvertes: 3, lignes: [LINES[0], { ...LINES[1], priorite: 2 }] });
    // Pendant la mise, rien ne se change ni ne repart une seconde fois.
    departs.lacher("cantine", 12);
    assert.equal(departs.commencerLaMise("cantine"), undefined);
    departs.mise("cantine", [12, 31], []);
    assert.equal(departs.de("cantine"), undefined);
  });

  test("sans issue à proposer, ou toutes déjà sur le rail, le départ s'efface", () => {
    const departs = holdLesDeparts({ rendre: () => {} });
    departs.commencer("a");
    departs.recu("a", { ouvertes: 2, lignes: [] });
    assert.equal(departs.de("a"), undefined);
  });
});
