// Le parcours guidé du premier projet à soi (#3166, épique #3164). D'abord ses morceaux, devant un faux document : où en
// est le parcours d'après ce qui est lu — la station d'abord, la mise en place seulement si le projet n'est pas prêt, et
// à chacun de ses états ce qui est attendu et de qui ; le premier projet à soi ; le titre du terminal du second. Puis la
// vue jouée entière (vue.js tel qu'il est, un faux pont) : un ordinateur neuf ajoute son premier projet, son espace s'ouvre
// sur la station, puis la mise en place, puis prêt ; un projet déjà prêt passe la mise en place ; un projet où le compte
// ne peut pas écrire, ou qui n'est pas le premier à soi, n'ouvre pas le parcours.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TITRE as TITRE_DE_LA_PR_DE_SETUP } from "../../../runtime/src/second-init/pr-de-setup.ts";
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
import { CUIT_PAR, ATTENDU as QUI_CUIT_CE_PROJET } from "../../src/vue/parcours-projet/etape-station.js";
import { ATTENDU as PRET } from "../../src/vue/parcours-projet/etape-recap.js";
import {
  AJOUTER_ICI,
  ajouterLaStation,
  carteDeSetup,
  DEMARRAGE,
  EMPECHE,
  EN_ROUTE,
  estUnPremierProjet,
  FERMER,
  ILLISIBLE,
  LECTURE,
  LIT,
  MERGER,
  OUVRIR_LA_CARTE,
  poserParcoursPremierProjet,
  QUI_CUIT,
  REFUS,
  REPONDRE,
  tenirLeParcoursPremierProjet,
  TITRE_DE_LA_CARTE_DE_SETUP,
  travailDuSecond,
  vuDuParcours,
  type Attente,
  type GestesDuParcours,
  type Vu,
} from "../../src/vue/parcours-premier-projet/parcours-premier-projet.js";
import { DEPOT_DE_LA_VISITE } from "../../src/vue/visite/visite.js";
import { REESSAYER } from "../../src/vue/lexique.js";
import { Faux, jouerLaVue, type Jouee, type Reponses, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/cantine";
const MANQUE = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const PRETE = { ready: true, missingBindings: [], missingLabels: [] };
const NON_PRETE = { etape: "manque" as const, verif: { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] } };

const gestesVides = (): GestesDuParcours & { faits: string[] } => {
  const faits: string[] = [];
  return { faits, ajouterCetOrdinateur: () => void faits.push("station"), relire: () => void faits.push("relire"), preparer: () => void faits.push("preparer"), ouvrirLaCarte: () => void faits.push("carte"), fermer: () => void faits.push("fermer") };
};
const etapes = (carte: Faux) => carte.dessous("li").map((ligne) => [ligne.dataset.etape, ligne.dataset.etat]);
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const attendu = (carte: Faux) => carte.dessous("p").find((pose) => pose.className === "attendu" && pose.dataset.attente !== undefined);

describe("où en est le parcours, d'après ce qui est lu", () => {
  test("la station d'abord, tant que cet ordinateur ne l'est pas — quoi que dise la mise en place", () => {
    assert.deepEqual(vuDuParcours({ station: "a-faire", second: {} }), { etape: "station", station: "a-faire", setup: false });
    assert.deepEqual(vuDuParcours({ station: "en-cours", preparation: { etape: "prepare" }, second: {} }), { etape: "station", station: "en-cours", setup: false });
    // La lecture dit déjà le projet pas prêt : la mise en place s'annonce, à venir.
    assert.deepEqual(vuDuParcours({ station: "a-faire", preparation: NON_PRETE, second: {} }), { etape: "station", station: "a-faire", setup: true });
  });

  test("la station ajoutée : un projet prêt passe la mise en place et va à prêt ; sinon, la mise en place", () => {
    assert.deepEqual(vuDuParcours({ station: "ajoutee", preparation: { etape: "prepare" }, second: { titre: "repos" } }), { etape: "pret" });
    assert.equal(vuDuParcours({ station: "ajoutee", preparation: NON_PRETE, second: {} }).etape, "setup");
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

  test("chaque état se dit en mots simples, avec qui l'on attend ; le geste du chef est un bouton", () => {
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
      const vu: Vu = { etape: "setup", attente, qui };
      const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu, illisible: "GitHub not reached", refus: "GitHub refused the labels." }, gestesVides()) as unknown as Faux;
      const dit = attendu(carte) ?? assert.fail(`aucune phrase pour ${attente}`);
      assert.ok(dit.textContent.startsWith(phrase), `${attente} : ${dit.textContent}`);
      assert.equal(dit.dataset.qui, qui);
      // Qui l'on attend est dit dans la phrase même.
      assert.match(phrase, qui === "toi" ? /\byou\b/ : qui === "second" ? /\bthe second\b/i : /\bthe app\b|Nothing is awaited from you\./, attente);
      assert.deepEqual(boutons(etapeDe(carte, "setup")), gestes, attente);
    }
  });

  test("l'étape de la station : la phrase — cet ordinateur cuira, d'autres stations plus tard — et un seul bouton", () => {
    const gestes = gestesVides();
    const carte = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station", station: "a-faire", setup: false } }, gestes) as unknown as Faux;
    assert.deepEqual(etapes(carte), [["station", "courante"], ["pret", "a-venir"]]);
    const station = etapeDe(carte, "station");
    assert.ok(station.dessous("p").some(({ textContent }) => textContent === QUI_CUIT(DEPOT)));
    assert.match(QUI_CUIT(DEPOT), /^This computer will cook the tickets of chef\/cantine; other stations — a server, another computer — can be added later/);
    assert.deepEqual(boutons(station), [AJOUTER_ICI]);
    station.dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.click();
    assert.deepEqual(gestes.faits, ["station"]);
  });

  test("la station en route : son bouton attend ; refusée, une ligne et son détail, le bouton rendu", () => {
    const enCours = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station", station: "en-cours", setup: false } }, gestesVides()) as unknown as Faux;
    assert.equal(enCours.dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.disabled, true);
    const refusee = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "station", station: { ligne: "nothing was written: no station", detail: "gist refused" }, setup: false } }, gestesVides()) as unknown as Faux;
    assert.ok(refusee.dessous("span").some(({ textContent }) => textContent === "nothing was written: no station"));
    assert.equal(refusee.dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.disabled, false);
  });

  test("prêt : le récap, et la mise en place faite si elle a été montrée — jamais si le projet l'était déjà", () => {
    const passee = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "pret" } }, gestesVides()) as unknown as Faux;
    assert.deepEqual(etapes(passee), [["station", "faite"], ["pret", "courante"]]);
    assert.ok(passee.dessous("p").some(({ textContent }) => textContent === PRET));
    assert.deepEqual(boutons(etapeDe(passee, "pret")), [FERMER]);
    const faite = poserParcoursPremierProjet(doc, { depot: DEPOT, vu: { etape: "pret" }, setupVu: true }, gestesVides()) as unknown as Faux;
    assert.deepEqual(etapes(faite), [["station", "faite"], ["setup", "faite"], ["pret", "courante"]]);
  });
});

function etapeDe(carte: Faux, id: string): Faux {
  return carte.dessous("li").find((ligne) => ligne.dataset.etape === id) ?? assert.fail(`pas d'étape « ${id} »`);
}

describe("ce que le parcours lit", () => {
  test("le titre du terminal du second : au travail, au repos, ou rien qu'on sache lire", () => {
    assert.equal(travailDuSecond("◐ Setting up cantine"), "travail");
    assert.equal(travailDuSecond("◓ claude"), "travail");
    assert.equal(travailDuSecond("✳ Claude Code"), "repos");
    assert.equal(travailDuSecond("claude"), undefined);
    assert.equal(travailDuSecond(undefined), undefined);
  });

  test("le premier projet à soi : ni la cuisine de la visite, ni un projet en lecture seule ne comptent", () => {
    const projets = [{ nom: "brigade", depot: DEPOT_DE_LA_VISITE }, { nom: "lu", depot: "autre/lu" }, { nom: "cantine", depot: DEPOT }];
    assert.equal(estUnPremierProjet(projets, "cantine", ({ nom }) => nom === "lu"), true);
    assert.equal(estUnPremierProjet(projets, "cantine", () => false), false);
    assert.equal(estUnPremierProjet([{ nom: "cantine", depot: DEPOT }], "cantine", () => false), true);
  });

  test("la carte de la PR de mise en place, par le titre que le runtime donne à son issue", () => {
    assert.equal(TITRE_DE_LA_CARTE_DE_SETUP, TITRE_DE_LA_PR_DE_SETUP);
    assert.equal(carteDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }, { cartes: [], autres: [{ ticket: 40, fiche: { titre: TITRE_DE_LA_PR_DE_SETUP } }] }])?.ticket, 40);
    assert.equal(carteDeSetup([{ cartes: [{ ticket: 3, titre: "Other" }] }]), undefined);
    assert.equal(carteDeSetup(undefined), undefined);
  });

  test("la station ajoutée par le geste de l'app : ajoutée, refusée en une ligne, ou injoignable", async () => {
    assert.equal(await ajouterLaStation(async () => ({ depots: [DEPOT] })), "ajoutee");
    assert.deepEqual(await ajouterLaStation(async () => ({ refus: "brigade: the station is not running — no pid" })), { ligne: "nothing was written: the station is not running", detail: "no pid" });
    assert.deepEqual(await ajouterLaStation(async () => Promise.reject(new Error("ipc closed"))), { ligne: "this computer could not be given the project.", detail: "ipc closed" });
  });

  test("le parcours tenu : commencé, sa station, fermé ; une station déjà choisie le fait partir de la suite", () => {
    let rendus = 0;
    const tenu = tenirLeParcoursPremierProjet({ rendre: () => void rendus++ });
    tenu.commencer("cantine", DEPOT);
    assert.deepEqual(tenu.etat, { projet: "cantine", depot: DEPOT, station: "a-faire", setupVu: false });
    tenu.station("ajoutee");
    tenu.illisible("GitHub not reached");
    assert.equal(tenu.etat?.illisible, "GitHub not reached");
    tenu.illisible(undefined);
    assert.equal(tenu.etat !== undefined && "illisible" in tenu.etat, false);
    tenu.fermer();
    assert.equal(tenu.etat, undefined);
    tenu.commencer("cantine", DEPOT, "parade-box");
    assert.deepEqual(tenu.etat, { projet: "cantine", depot: DEPOT, station: "ajoutee", cuitPar: "parade-box", setupVu: false });
    assert.equal(rendus, 6);
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const CANTINE: Projet = { nom: "cantine", dossier: "/home/chef/code/cantine", depot: DEPOT, base: "main" };
const PARADE: Projet = { nom: "parade", dossier: "/home/chef/code/parade", depot: "chef/parade", base: "main" };
const SECOND: Terminal = { id: 1, projet: CANTINE.nom, genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = (projets: Projet[]) => () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets }),
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

const carte = (vue: Jouee) => vue.element("parcours-premier-projet");
const ajout = (vue: Jouee) => [...vue.element("parcours-de-l-ajout").descendants()].find((pose) => pose.className === "parcours-projet carte") ?? assert.fail("pas de parcours d'ajout");

// Un ordinateur sans projet ; `projets` : ceux que le fichier a déjà. Le chef ajoute cantine par son dossier.
async function ajouterCantine(reponses: Reponses, projets: Projet[] = []) {
  const vue = await jouerLaVue({
    demarrage: demarrage(projets),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    ajouter: () => ({ etat: "ajoute", nom: CANTINE.nom }),
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    ...reponses,
  });
  vue.poses().find((pose) => pose.id === "entree-ajout")?.click();
  await repos();
  vue.element("depot").value = DEPOT;
  vue.element("base").value = "main";
  vue.element("formulaire").declencher("submit");
  vue.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [...projets, CANTINE] }), []);
  await repos();
  return vue;
}
// Une lecture de cantine arrive.
async function lire(vue: Jouee, options: Parameters<typeof faits>[0] = {}) {
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: CANTINE.nom, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(options)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const second = (vue: Jouee) => vue.xterms.at(-1) ?? assert.fail("pas de terminal");
const attenteDe = (vue: Jouee) => attendu(carte(vue))?.dataset.attente;

describe("la vue jouée : le premier projet à soi", () => {
  test("ajouté, lu, le compte peut y écrire : son espace s'ouvre sur la station, puis la mise en place, puis prêt", async () => {
    const servis: [string, boolean][] = [];
    let pret = false;
    const vue = await ajouterCantine({
      servirUnProjet: (depot, servi) => (servis.push([depot, servi]), { depots: [depot] }),
      checkRepoSetup: () => (pret ? PRETE : MANQUE),
    });
    // Avant la lecture, rien n'est décidé : l'écran d'ajout reste.
    assert.equal(carte(vue).hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    await lire(vue);
    assert.equal(vue.element("espace").textContent, CANTINE.nom);
    assert.equal(carte(vue).hidden, false);
    const premiere = carte(vue).children[0] as Faux;
    // La lecture dit le projet pas prêt : la mise en place s'annonce, à venir, après la station.
    assert.deepEqual(etapes(premiere), [["station", "courante"], ["setup", "a-venir"], ["pret", "a-venir"]]);
    assert.deepEqual(boutons(etapeDe(premiere, "station")), [AJOUTER_ICI]);
    // L'avis d'un projet pas préparé n'ajoute pas un second geste tant que le parcours est ouvert.
    assert.equal(vue.poses().some((pose) => pose.className === "avis-depot"), false);

    etapeDe(premiere, "station").dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.click();
    await repos();
    assert.deepEqual(servis, [[DEPOT, true]]);
    assert.deepEqual(etapes(carte(vue).children[0] as Faux), [["station", "faite"], ["setup", "courante"], ["pret", "a-venir"]]);
    assert.ok(etapeDe(carte(vue).children[0] as Faux, "station").dessous("p").some(({ textContent }) => textContent === CUIT_PAR("this computer", DEPOT)));
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
    assert.deepEqual(boutons(etapeDe(carte(vue).children[0] as Faux, "setup")), [OUVRIR_LA_CARTE]);
    // « open its card » : la fiche de la carte s'ouvre par-dessus le rail.
    assert.equal(vue.element("fiche").hidden, true);
    etapeDe(carte(vue).children[0] as Faux, "setup").dessous("button").find(({ textContent }) => textContent === OUVRIR_LA_CARTE)?.click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok([...vue.element("fiche").descendants()].some(({ textContent }) => textContent === TITRE_DE_LA_PR_DE_SETUP));
    // Mergée : la lecture suivante dit le projet prêt.
    pret = true;
    await lire(vue);
    await repos();
    assert.deepEqual(etapes(carte(vue).children[0] as Faux), [["station", "faite"], ["setup", "faite"], ["pret", "courante"]]);
    (carte(vue).dessous("button").find(({ textContent }) => textContent === FERMER) ?? assert.fail("pas de « close »")).click();
    await repos();
    assert.equal(carte(vue).hidden, true);
  });

  test("déjà prêt pour Brigade : la station ajoutée, le parcours passe la mise en place et va à prêt", async () => {
    const vue = await ajouterCantine({ servirUnProjet: (depot) => ({ depots: [depot] }), checkRepoSetup: () => PRETE });
    await lire(vue);
    assert.deepEqual(etapes(carte(vue).children[0] as Faux), [["station", "courante"], ["pret", "a-venir"]]);
    carte(vue).dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.click();
    await repos();
    assert.deepEqual(etapes(carte(vue).children[0] as Faux), [["station", "faite"], ["pret", "courante"]]);
    assert.equal(carte(vue).dessous("li").some((ligne) => ligne.dataset.etape === "setup"), false);
  });

  test("la mise en place qui ne se lit pas ne décide rien : le parcours le dit, et « Try again » la relit", async () => {
    let joint = false;
    const vue = await ajouterCantine({ servirUnProjet: (depot) => ({ depots: [depot] }), checkRepoSetup: () => (joint ? MANQUE : Promise.reject(new Error("GitHub not reached"))) });
    await lire(vue);
    carte(vue).dessous("button").find(({ textContent }) => textContent === AJOUTER_ICI)?.click();
    await repos();
    assert.equal(attenteDe(vue), "illisible");
    // Jamais « prêt » à sa place : la station est ajoutée, la mise en place reste à lire.
    assert.equal(carte(vue).dessous("li").find((ligne) => ligne.dataset.etape === "pret")?.dataset.etat, "a-venir");
    joint = true;
    (carte(vue).dessous("button").find(({ textContent }) => textContent === REESSAYER) ?? assert.fail("pas de « Try again »")).click();
    await repos();
    assert.equal(attenteDe(vue), "demarrage");
  });

  test("le compte ne peut pas écrire dans le dépôt : le parcours ne s'ouvre pas, l'ajout garde sa station à choisir", async () => {
    const vue = await ajouterCantine({ checkRepoSetup: () => MANQUE });
    await lire(vue, { lectureSeule: true });
    assert.equal(carte(vue).hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    assert.ok(ajout(vue).dessous("p").some(({ textContent }) => textContent === QUI_CUIT_CE_PROJET));
    // Une lecture suivante n'y revient pas.
    await lire(vue);
    assert.equal(carte(vue).hidden, true);
  });

  test("une lecture ratée ne décide rien ; la suivante, qui dit le dépôt inscriptible, ouvre le parcours", async () => {
    const vue = await ajouterCantine({ checkRepoSetup: () => MANQUE });
    vue.dire("surFaits", { projet: CANTINE.nom, demande: vue.dernier("faits")[0] as number, a: A, atteinte: true, erreur: "GitHub refused: 502" } as never);
    await repos();
    assert.equal(carte(vue).hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    await lire(vue);
    assert.equal(carte(vue).hidden, false);
  });

  test("pas le premier projet à soi : un autre du fichier l'est déjà — le parcours ne s'ouvre pas", async () => {
    const vue = await ajouterCantine({ checkRepoSetup: () => MANQUE }, [PARADE]);
    await lire(vue);
    assert.equal(carte(vue).hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
  });
});
