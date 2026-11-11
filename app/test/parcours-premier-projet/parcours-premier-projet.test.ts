// La page d'un projet pas encore prêt (#3166, épique #3164). D'abord ses morceaux, devant un faux document : où en est le
// parcours d'après ce qui est lu — « qui le cuit » d'abord, la mise en place seulement si le projet ne l'a pas —, la ligne
// de progression, le choix recommandé, et à chaque état de la mise en place ce qui est attendu et de qui. Puis la vue jouée
// entière (vue.js tel qu'il est, un faux pont) : « Add a project », un dépôt choisi, sa page s'ouvre sur la question à la
// place du rail, puis la mise en place, puis prêt ; un projet déjà prêt passe la mise en place ; un projet qu'une station
// cuit déjà passe « qui le cuit » ; un projet où le compte ne peut pas écrire n'ouvre rien de tout cela.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TITRE as TITRE_DE_LA_PR_DE_SETUP } from "../../../runtime/src/second-init/pr-de-setup.ts";
import type { StationEnregistree } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { PREPARER } from "../../src/vue/page-projet/depot-non-prepare.js";
import {
  ajouterLaStation,
  carteDeSetup,
  choixDeStation,
  DEMANDE_DU_PREMIER,
  DEMARRAGE,
  ECRIRE_LE_PREMIER,
  ECRIT,
  EMPECHE,
  EN_ROUTE,
  FERMER,
  AUCUNE_EN_LIGNE,
  ICI,
  ICI_DIT,
  ILLISIBLE,
  LECTURE,
  LIT,
  MERGER,
  OUVRIR_LA_CARTE,
  poserParcoursPremierProjet,
  poserPret,
  PRET,
  progression,
  REFUS,
  REPONDRE,
  SECOND_ABSENT,
  STATION_DIT,
  tenirLesParcours,
  TITRE_DE_LA_CARTE_DE_SETUP,
  travailDuSecond,
  vuDuParcours,
  type Attente,
  type Choix,
  type GestesDuParcours,
} from "../../src/vue/parcours-premier-projet/parcours-premier-projet.js";
import { REESSAYER } from "../../src/vue/lexique.js";
import { REFUS_RESEAU } from "../../src/stations-du-compte.ts";
import { Faux, jouerLaVue, type Jouee, type Reponses, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/cantine";
const MANQUE = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const PRETE = { ready: true, missingBindings: [], missingLabels: [] };
const NON_PRETE = { etape: "manque" as const, verif: { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] } };
const ICI_CHOIX: Choix = { cle: ICI, nom: "this computer", horsLigne: false, recommande: true };
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

const gestesVides = (): GestesDuParcours & { faits: string[] } => {
  const faits: string[] = [];
  return { faits, choisir: (un) => void faits.push(`choisir ${un.cle}`), relire: () => void faits.push("relire"), preparer: () => void faits.push("preparer"), ouvrirLaCarte: () => void faits.push("carte") };
};
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const phraseDe = (carte: Faux) => carte.dessous("p").find((pose) => pose.className === "phrase");

describe("où en est le parcours, d'après ce qui est lu", () => {
  test("« qui le cuit » d'abord, tant qu'elle n'est pas répondue — quoi que dise la mise en place", () => {
    assert.deepEqual(vuDuParcours({ station: "a-faire", second: {} }), { etape: "station" });
    assert.deepEqual(vuDuParcours({ station: { enCours: ICI }, preparation: { etape: "prepare" }, second: {} }), { etape: "station" });
    assert.deepEqual(vuDuParcours({ station: { ligne: "nothing was written", detail: "" }, preparation: NON_PRETE, second: {} }), { etape: "station" });
  });

  test("répondue, ou pas à poser : un projet prêt va à prêt ; sinon, la mise en place", () => {
    assert.deepEqual(vuDuParcours({ station: "ajoutee", preparation: { etape: "prepare" }, second: { titre: "repos" } }), { etape: "pret" });
    assert.deepEqual(vuDuParcours({ station: "inutile", preparation: { etape: "prepare" }, second: {} }), { etape: "pret" });
    assert.equal(vuDuParcours({ station: "ajoutee", preparation: NON_PRETE, second: {} }).etape, "setup");
    assert.equal(vuDuParcours({ station: "inutile", preparation: NON_PRETE, second: {} }).etape, "setup");
  });

  test("chaque état de la mise en place dit qui est attendu : l'app, le second, ou toi", () => {
    const cas: [Parameters<typeof vuDuParcours>[0], Attente, string][] = [
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
    for (const [lu, attente, qui] of cas) assert.deepEqual(vuDuParcours(lu), { etape: "setup", attente, qui }, attente);
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
    const recommande = (choix: Choix[]) => choix.filter((un) => un.recommande).map(({ cle }) => cle);
    assert.deepEqual(choixDeStation({ ici: true, stations: [atelier, box], maintenant: VINGT_DEUX }).map(({ cle }) => cle), [ICI, "g2", "g1"]);
    assert.deepEqual(recommande(choixDeStation({ ici: true, stations: [atelier, box], maintenant: VINGT_DEUX })), ["g2"]);
    assert.deepEqual(choixDeStation({ ici: true, stations: [atelier], maintenant: VINGT_DEUX }).map(({ cle }) => cle), [ICI, "g1"]);
    assert.deepEqual(recommande(choixDeStation({ ici: true, stations: [atelier], maintenant: VINGT_DEUX })), [ICI]);
    assert.deepEqual(choixDeStation({ ici: true, stations: [] }), [ICI_CHOIX]);
    assert.deepEqual(choixDeStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [] }), [{ ...ICI_CHOIX, hote: "MacBook-Air-de-Chef" }]);
    // Une station hors ligne n'est jamais recommandée : sans aucune en ligne ni cet ordinateur, rien ne l'est. Elle dit depuis
    // quand, et comment la ramener (#3187).
    assert.deepEqual(choixDeStation({ ici: false, stations: [atelier], maintenant: VINGT_DEUX }), [{ cle: "g1", nom: "atelier", horsLigne: true, recommande: false, absente: ATELIER_ABSENT }]);
  });
});

describe("ce que la page dit", () => {
  test("« qui le cuit » : la progression, la question, la phrase du recommandé, un bouton par choix — le recommandé en tête", () => {
    const gestes = gestesVides();
    const choix = choixDeStation({ ici: true, hote: "MacBook-Air-de-Chef", stations: [station("g1", "atelier", false)], maintenant: VINGT_DEUX });
    const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix }, gestes) as unknown as Faux;
    assert.equal(carte.dessous("p")[0]?.textContent, "1 of 2: who cooks it");
    assert.equal(carte.dessous("h2")[0]?.textContent, "Who cooks chef/cantine?");
    assert.equal(phraseDe(carte)?.textContent, ICI_DIT);
    assert.equal(ICI_DIT, "This computer cooks the project's tickets while it is on; you can add a server or another computer later.");
    assert.deepEqual(boutons(carte), ["this computer", "atelier"]);
    assert.equal(carte.dessous("button")[0]?.className.includes("recommande"), true);
    assert.equal(carte.dessous("button")[1]?.className.includes("recommande"), false);
    // Cet ordinateur, puis son nom d'hôte ; la station hors ligne dit depuis quand, et le geste qui la ramène.
    assert.deepEqual(carte.dessous("li")[0]?.dessous("span").map(({ textContent }) => textContent).filter((texte) => texte !== "this computer"), ["MacBook-Air-de-Chef"]);
    assert.ok(carte.dessous("span").some(({ textContent }) => textContent === ATELIER_ABSENT));
    carte.dessous("button")[0]?.click();
    assert.deepEqual(gestes.faits, [`choisir ${ICI}`]);
  });

  test("une station du compte en ligne, recommandée : sa phrase la nomme", () => {
    const choix = choixDeStation({ ici: true, stations: [station("g2", "parade-box", true)] });
    const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station" }, progression: "", station: "a-faire", choix }, gestesVides()) as unknown as Faux;
    assert.equal(phraseDe(carte)?.textContent, STATION_DIT("parade-box"));
    assert.deepEqual(boutons(carte), ["this computer", "parade-box"]);
    // Le recommandé se distingue où qu'il soit dans la liste.
    assert.equal(carte.dessous("button")[0]?.className.includes("recommande"), false);
    assert.equal(carte.dessous("button")[1]?.className.includes("recommande"), true);
  });

  test("aucune station en ligne, ni cet ordinateur : rien n'est recommandé, et la phrase le dit (#3187)", () => {
    const choix = choixDeStation({ ici: false, stations: [station("g1", "atelier", false)], maintenant: VINGT_DEUX });
    const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station" }, progression: "", station: "a-faire", choix }, gestesVides()) as unknown as Faux;
    assert.equal(phraseDe(carte)?.textContent, AUCUNE_EN_LIGNE);
    assert.equal(carte.dessous("button").some(({ className }) => className.includes("recommande")), false);
  });

  test("une station choisie hors ligne : la page dit en clair qu'elle prend le projet à son retour (#3187)", () => {
    const setup = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "setup", attente: "lit", qui: "second" }, progression: "", station: "ajoutee", choix: [], absente: "atelier" }, gestesVides()) as unknown as Faux;
    assert.ok(setup.dessous("p").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
    const pret = poserPret(doc, DEPOT, { absente: "atelier" }, { ecrire: () => {}, fermer: () => {} }) as unknown as Faux;
    assert.ok(pret.dessous("span").some(({ textContent }) => textContent === "atelier is offline: it takes chef/cantine when it comes back."));
  });

  test("un choix qui s'écrit grise les boutons ; refusé, une ligne et son détail, les boutons rendus", () => {
    const enCours = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station" }, progression: "", station: { enCours: ICI }, choix: [ICI_CHOIX] }, gestesVides()) as unknown as Faux;
    assert.equal(enCours.dessous("button")[0]?.disabled, true);
    const refusee = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station" }, progression: "", station: { ligne: "nothing was written: no station", detail: "gist refused" }, choix: [ICI_CHOIX] }, gestesVides()) as unknown as Faux;
    assert.ok(refusee.dessous("span").some(({ textContent }) => textContent === "nothing was written: no station"));
    assert.equal(refusee.dessous("button")[0]?.disabled, false);
  });

  test("chaque état de la mise en place se dit en mots simples, avec qui l'on attend ; le geste du chef est un bouton", () => {
    const phrases: Record<Attente, [string, string[]]> = {
      lecture: [LECTURE(DEPOT), []],
      illisible: [ILLISIBLE(DEPOT), [REESSAYER]],
      demarrage: [DEMARRAGE, []],
      lit: [LIT, []],
      repondre: [REPONDRE, []],
      merger: [MERGER, [OUVRIR_LA_CARTE]],
      "en-route": [EN_ROUTE(DEPOT), []],
      refus: [REFUS("GitHub refused the labels."), [REESSAYER]],
      empeche: [EMPECHE, [PREPARER]],
    };
    for (const [attente, [phrase, gestes]] of Object.entries(phrases) as [Attente, [string, string[]]][]) {
      const qui = attente === "lecture" || attente === "en-route" ? "app" : attente === "demarrage" || attente === "lit" ? "second" : "toi";
      const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "setup", attente, qui }, progression: "", station: "ajoutee", choix: [], illisible: "GitHub not reached", refus: "GitHub refused the labels." }, gestesVides()) as unknown as Faux;
      const dit = phraseDe(carte) ?? assert.fail(`aucune phrase pour ${attente}`);
      assert.ok(dit.textContent.startsWith(phrase), `${attente} : ${dit.textContent}`);
      assert.equal(dit.dataset.qui, qui);
      // Qui l'on attend est dit dans la phrase même.
      assert.match(phrase, qui === "toi" ? /\byou\b|\byour\b/ : qui === "second" ? /\bthe second\b/i : /\bthe app\b|Nothing is awaited from you\./, attente);
      assert.deepEqual(boutons(carte).filter((texte) => texte !== ""), gestes, attente);
    }
    // Les mots du ticket : ce que le second fait, ce qu'il attend, ce que la PR attend.
    assert.match(LIT, /^The second is reading your repository/);
    assert.match(REPONDRE, /^The second is waiting for your answer/);
    assert.match(MERGER, /^The setup pull request is waiting for your merge/);
  });

  test("prêt : une seule ligne, écrire le premier ticket avec le second ; écrit, elle le dit ; sans second, pourquoi", () => {
    const faits: string[] = [];
    const geste = { ecrire: () => void faits.push("ecrire"), fermer: () => void faits.push("fermer") };
    const ligne = poserPret(doc, DEPOT, {}, geste) as unknown as Faux;
    assert.equal(ligne.balise, "p");
    assert.equal(ligne.dessous("span").find(({ className }) => className === "phrase")?.textContent, PRET(DEPOT));
    assert.deepEqual(boutons(ligne), [ECRIRE_LE_PREMIER, FERMER]);
    ligne.dessous("button")[0]?.click();
    assert.deepEqual(faits, ["ecrire"]);
    assert.deepEqual(boutons(poserPret(doc, DEPOT, { ecrit: true }, geste) as unknown as Faux), [FERMER]);
    assert.ok((poserPret(doc, DEPOT, { ecrit: true }, geste) as unknown as Faux).dessous("span").some(({ textContent }) => textContent === ECRIT));
    assert.ok((poserPret(doc, DEPOT, { ecrit: SECOND_ABSENT }, geste) as unknown as Faux).dessous("span").some(({ textContent }) => textContent === SECOND_ABSENT));
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
    assert.equal(TITRE_DE_LA_CARTE_DE_SETUP, TITRE_DE_LA_PR_DE_SETUP);
    assert.equal(carteDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }, { cartes: [], autres: [{ ticket: 40, fiche: { titre: TITRE_DE_LA_PR_DE_SETUP } }] }])?.ticket, 40);
    assert.equal(carteDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }]), undefined);
    assert.equal(carteDeSetup(undefined), undefined);
  });

  test("la station choisie par le geste de l'app : ajoutée, refusée en une ligne, ou injoignable", async () => {
    assert.equal(await ajouterLaStation("this computer", async () => ({ depots: [DEPOT] })), "ajoutee");
    assert.equal(await ajouterLaStation("atelier", async () => ({ selection: [DEPOT] })), "ajoutee");
    assert.deepEqual(await ajouterLaStation("this computer", async () => ({ refus: "brigade: the station is not running — no pid" })), { ligne: "nothing was written: the station is not running", detail: "no pid" });
    // Le refus d'une station du compte dit sa cause et son geste sur la ligne même ; ce que GitHub a répondu, au survol (#3187).
    assert.deepEqual(await ajouterLaStation("atelier", async () => ({ refus: REFUS_RESEAU, detail: "error connecting to api.github.com" })), {
      ligne: "nothing was written: GitHub could not be reached from this computer; check its network connection, then choose again",
      detail: "error connecting to api.github.com",
    });
    assert.deepEqual(await ajouterLaStation("this computer", async () => Promise.reject(new Error("ipc closed"))), { ligne: "this computer could not be given the project.", detail: "ipc closed" });
  });

  test("le parcours tenu : commencé, répondu, prêt — la ligne du premier ticket seulement si le chef a répondu à quelque chose", () => {
    const rendus: string[] = [];
    const tenus = tenirLesParcours({ rendre: (projet) => void rendus.push(projet) });
    tenus.commencer("cantine", DEPOT, false);
    assert.deepEqual(tenus.de("cantine"), { depot: DEPOT, station: "a-faire", setupVu: false });
    tenus.station("cantine", "ajoutee");
    tenus.illisible("cantine", "GitHub not reached");
    assert.equal(tenus.de("cantine")?.illisible, "GitHub not reached");
    tenus.illisible("cantine", undefined);
    assert.equal("illisible" in (tenus.de("cantine") ?? {}), false);
    tenus.pret("cantine");
    assert.deepEqual(tenus.de("cantine")?.pret, {});
    tenus.ecrit("cantine", true);
    assert.deepEqual(tenus.de("cantine")?.pret, { ecrit: true });
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
    assert.ok(rendus.every((projet) => projet === "cantine" || projet === "parade"));
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
// Le rail de cantine : rien à cuire ; `setup`, la carte de la PR de mise en place attend le chef ; `lectureSeule`, le
// compte ne peut pas écrire dans son dépôt.
const faits = ({ setup = false, lectureSeule = false } = {}): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: setup ? 1 : 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: setup ? [{ ticket: 40, titre: TITRE_DE_LA_PR_DE_SETUP, url: `https://github.com/${DEPOT}/issues/40` }] : [],
  ...(lectureSeule ? { lectureSeule: { depot: DEPOT } } : {}),
});

const page = (vue: Jouee) => vue.element("parcours-premier-projet");
const question = (vue: Jouee) => page(vue).dessous("section").find(({ className }) => className.split(" ").includes("parcours-premier-projet")) ?? assert.fail("pas de question");
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).join(", ")}`);
const principal = (vue: Jouee) => vue.element("main");

// Un ordinateur sans projet : « Add a project », puis le dépôt chef/cantine — la page de cantine s'ouvre.
async function choisirCantine(reponses: Reponses) {
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage: demarrage(),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
    ouvrirDUneStation: (nom, depot, base) => {
      vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
      return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    ...reponses,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  bouton(vue.element("ajout"), DEPOT).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "cantine");
  return vue;
}
// Une lecture de cantine arrive.
async function lire(vue: Jouee, options: Parameters<typeof faits>[0] = {}) {
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(options)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const second = (vue: Jouee) => vue.xterms.at(-1) ?? assert.fail("pas de terminal");
const attenteDe = (vue: Jouee) => phraseDe(question(vue))?.dataset.attente;
const progressionDe = (vue: Jouee) => question(vue).dessous("p").find(({ className }) => className === "progression")?.textContent;

describe("la vue jouée : un dépôt choisi, sa page tant qu'il n'est pas prêt", () => {
  test("dans l'ordre : qui le cuit, puis la mise en place que fait le second, puis prêt — le rail reprend la page", async () => {
    const servis: [string, boolean][] = [];
    let pret = false;
    const vue = await choisirCantine({
      servirUnProjet: (depot, servi) => (servis.push([depot, servi]), { depots: [depot] }),
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
    bouton(question(vue), "this computer").click();
    await repos();
    assert.deepEqual(servis, [[DEPOT, true]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.equal(progressionDe(vue), "2 of 2: its setup for Brigade");
    // Le second n'a encore rien dit de lui : il démarre. Puis son titre dit qu'il tourne, puis qu'il attend le chef.
    assert.equal(attenteDe(vue), "demarrage");
    second(vue).titrer("◐ Setting up cantine");
    await repos();
    assert.equal(attenteDe(vue), "lit");
    second(vue).titrer("✳ Claude Code");
    await repos();
    assert.equal(attenteDe(vue), "repondre");
    // La PR de mise en place ouverte, sa carte dans Awaiting you : le chef la merge.
    second(vue).titrer("◐ Setting up cantine");
    await lire(vue, { setup: true });
    assert.equal(attenteDe(vue), "merger");
    assert.equal(vue.element("fiche").hidden, true);
    bouton(question(vue), OUVRIR_LA_CARTE).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok([...vue.element("fiche").descendants()].some(({ textContent }) => textContent === TITRE_DE_LA_PR_DE_SETUP));
    // Mergée : la lecture suivante dit le projet prêt. Le rail reprend la page, une ligne propose le premier ticket.
    pret = true;
    await lire(vue);
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).hidden, false);
    assert.equal(page(vue).dessous("p").find(({ className }) => className.includes("pret-du-projet"))?.dataset.etape, "pret");
    assert.ok(page(vue).dessous("span").some(({ textContent }) => textContent === PRET(DEPOT)));
    bouton(page(vue), ECRIRE_LE_PREMIER).click();
    await repos();
    assert.deepEqual(vue.dernier("ecrire"), [SECOND.id, DEMANDE_DU_PREMIER]);
    assert.ok(page(vue).dessous("span").some(({ textContent }) => textContent === ECRIT));
    bouton(page(vue), FERMER).click();
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
    bouton(question(vue), "parade-box").click();
    await repos();
    assert.deepEqual(choisis, [["g2", ["chef/parade", DEPOT]]]);
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
    bouton(question(vue), "atelier").click();
    await repos();
    assert.deepEqual(choisis, [["g1", [DEPOT]]]);
    assert.equal(principal(vue).dataset.parcours, "setup");
    assert.ok(question(vue).dessous("p").some(({ textContent }) => textContent === `atelier is offline: it takes ${DEPOT} when it comes back.`));
  });

  test("déjà prêt pour Brigade : la mise en place n'est pas posée, « qui le cuit » répondue mène à prêt", async () => {
    const vue = await choisirCantine({ servirUnProjet: (depot) => ({ depots: [depot] }), checkRepoSetup: () => PRETE });
    await lire(vue);
    assert.equal(progressionDe(vue), "1 of 1: who cooks it");
    bouton(question(vue), "this computer").click();
    await repos();
    assert.equal(principal(vue).dataset.parcours, undefined);
    assert.equal(page(vue).dessous("section").some(({ className }) => className.includes("parcours-premier-projet")), false);
    assert.ok(page(vue).dessous("span").some(({ textContent }) => textContent === PRET(DEPOT)));
  });

  test("une station le cuit déjà : « qui le cuit » n'est pas posée, la mise en place est la seule question", async () => {
    const vue = await choisirCantine({ projetsServis: () => ({ depots: [DEPOT] }), checkRepoSetup: () => MANQUE });
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
    const vue = await choisirCantine({ servirUnProjet: (depot) => ({ depots: [depot] }), checkRepoSetup: () => (joint ? MANQUE : Promise.reject(new Error("GitHub not reached"))) });
    await lire(vue);
    // Le compte n'est pas dit tant que la mise en place n'est pas lue.
    assert.equal(progressionDe(vue), "Who cooks it");
    bouton(question(vue), "this computer").click();
    await repos();
    assert.equal(attenteDe(vue), "illisible");
    // Jamais « prêt » à sa place.
    assert.equal(principal(vue).dataset.parcours, "setup");
    joint = true;
    bouton(question(vue), REESSAYER).click();
    await repos();
    assert.equal(attenteDe(vue), "demarrage");
  });

  test("le second ne tourne pas : « write its first ticket with the second » n'écrit rien et dit pourquoi", async () => {
    const vue = await choisirCantine({ espace: () => [{ ...SECOND, arrete: true }], servirUnProjet: (depot) => ({ depots: [depot] }), checkRepoSetup: () => PRETE });
    await lire(vue);
    bouton(question(vue), "this computer").click();
    await repos();
    bouton(page(vue), ECRIRE_LE_PREMIER).click();
    await repos();
    assert.equal(vue.appels.some(({ geste }) => geste === "ecrire"), false);
    assert.ok(page(vue).dessous("span").some(({ textContent }) => textContent === SECOND_ABSENT));
  });
});
