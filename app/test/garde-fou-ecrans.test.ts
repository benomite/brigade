// Garde-fou (#835) : « l'app parle moins » doit tenir dans le temps. Chaque écran — l'accueil, la bande
// d'alertes, la fiche d'une carte, la page des coûts de l'app, Settings, le bandeau du second — est joué tel que la vue
// le pose, dans deux états : une lecture en échec, et une décision qui attend le chef. Le texte *visible
// par défaut* (celui des éléments, sans le survol, sans un `details` replié) ne porte jamais une commande à
// recopier, un mode d'emploi, un code de sortie, ni une phrase de prix sous un bouton ; une lecture qui
// manque tient en une ligne, son détail au survol ; chaque geste attendu est un bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { entete } from "../src/fiche.ts";
import { BANNIERE, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { ligneDeProjet, tenirAccueil, type Accueil, type ProjetDeLAccueil } from "../src/accueil.ts";
import { tenirBandes, type Alerte } from "../src/alertes.ts";
import type { Terminal } from "../src/terminaux.ts";
import { Faux, type Jouee, jouerLaVue, type Reponses, ouvrirLecture, ouvrirLesCouts, repos } from "./aides/fausse-vue.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const A = "2026-10-16T10:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false, bandeau: "box parade-box · debian — not reachable" };

// Ce qu'une panne laisse derrière elle, et qui n'a sa place qu'au survol.
const DETAIL = "ssh: connect to host box port 22: Connection refused";
const BRUT = `usage: brigade <projet> station\n${DETAIL}\n→ code de sortie 255`;
const PAS_JOINT = { projet: "parade", demande: 1, a: A, erreur: `$ ssh box brigade parade facts\n${BRUT}`, atteinte: false, cas: "ssh-en-echec" } as const;

// Les travers : une commande qui se recopie, un mode d'emploi, un code de sortie.
const TRAVERS = /ssh\b|brigade\s*<|brigade\s+[a-z0-9-]+\s+(?:station|manager|status|facts|pass|grant|rail|log|installation)\b|usage\s*:|exit code|code de sortie/i;
// Une phrase de prix écrite à plat. Les éléments se concatènent sans blanc : aucune de ces deux règles n'ancre son début sur une limite de mot.
const PRIX = /costs?\s*:|prix\s*:|price\s*:/i;

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
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

async function ouvrir(reponses: Reponses = {}, entrer = true): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND, SHELL],
    machines: () => [{ id: "poste", titre: "this Mac" }],
    gestesDeFiche: (carte) => gestesDeCarte(carte),
    ...reponses,
  });
  if (entrer) {
    (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
    await repos();
  }
  return vue;
}

// Le texte posé à plat : celui des éléments, moins ce qu'un `details` replié ou un élément caché ne montre
// pas. Un survol n'y est pas — son texte n'est dans l'élément qu'au passage du pointeur.
function visible(racine: Faux): string {
  let texte = racine.textContent;
  for (const element of racine.descendants()) {
    const replie = element.balise === "details" && !(element as Faux & { open?: boolean }).open;
    const cache = element.hidden;
    if (!replie && !cache) continue;
    for (const enfant of element.children) if (cache || enfant.balise !== "summary") texte = texte.replace(enfant.textContent, "");
    if (cache) texte = texte.replace(element.textContent, "");
  }
  return texte.replace(/\s+/g, " ").trim();
}
// La fausse page ne rejoue pas la place des éléments : l'écran est ce que la vue pose dans ces éléments-là, ceux qui ne sont pas cachés.
function ecran(vue: Jouee, ...ids: string[]): Faux {
  const racine = new Faux("div");
  racine.append(...ids.map((id) => vue.element(id)).filter(({ hidden }) => !hidden));
  return racine;
}
const survols = (ou: Faux) => ou.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
const lignesEnEchec = (ou: Faux) => [ou, ...ou.descendants()].filter(({ className, balise }) => balise === "p" && className === "indisponible");
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");

// ─── Les écrans ──────────────────────────────────────────────────────────────

type Joue = { vue: Jouee; racine: Faux };
type Ecran = {
  nom: string;
  // L'écran, une lecture en échec.
  echec: () => Promise<Joue>;
  // Combien de lectures en échec il dit, chacune en une ligne.
  lectures: number;
};

// L'accueil : « Tous les projets », devant une box qui ne répond pas. Depuis #870, il ne pose plus de
// lecture en échec à part : la box injoignable se dit sur la ligne du projet, que le process principal
// calcule (accueil.ts) et redit par `surAccueil`.
const PARADE_A_L_ACCUEIL: ProjetDeLAccueil = { nom: "parade", box: true, desinstalle: false };
async function accueil(): Promise<Joue> {
  const vue = await ouvrir({}, false);
  vue.dire("surFaits", { ...PAS_JOINT, titre: "facts: the box did not answer", demande: vue.dernier("faits")[0] as number });
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  vue.dire("surAlertes", bandes.faits(PAS_JOINT));
  vue.dire("surAccueil", tenirAccueil({ projets: () => [PARADE_A_L_ACCUEIL] }).faits(PAS_JOINT) ?? assert.fail("l'accueil ne change pas"));
  await repos();
  return { vue, racine: vue.element("tous") };
}

async function alertes(): Promise<Joue> {
  const vue = await ouvrir();
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  vue.dire("surAlertes", bandes.faits(PAS_JOINT));
  return { vue, racine: vue.element("alertes") };
}

// Une carte qui t'attend, sur le rail.
const decisionMerge = { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/benomite/brigade/pull/31" };
const carte = { ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: entete({ titre: "Validation SIRET" }), ouvrable: true, attendu: true, decision: decisionMerge, pr: true, attend: ["livraison verte, non mergée"], dit: [] };
const faitsAvecCarte = (demande: number): Dessinable =>
  ({
    projet: "parade",
    demande,
    a: A,
    tableau: {
      etat: "ouverte",
      ton: "vert",
      arretee: false,
      tick: "dernier tick il y a 12 s",
      compteurs: [{ libelle: "rail", nombre: 1 }],
      cooks: { enCours: [], vide: "aucun cook en cours" },
      evenement: "rien",
      rail: { colonnes: [{ nom: "T'attend", ton: "rouge", compte: "1", cartes: [carte], vide: "aucun ticket" }], hors: [], attendLu: A },
    },
  }) as unknown as Dessinable;

async function ficheOuverte(reponses: Reponses): Promise<Joue> {
  const vue = await ouvrir(reponses);
  vue.dire("surFaits", faitsAvecCarte(vue.dernier("faits")[0] as number));
  const bon = vue.element("rail").dessous("li").find(({ className }) => className === "bon") ?? assert.fail("pas de carte sur le rail");
  bon.click();
  await repos();
  return { vue, racine: vue.element("fiche") };
}
const ficheEnEchec = () =>
  ficheOuverte({
    lireQuestion: () => ({ a: A, sans: `not read: ${BRUT}` }),
    lireDiscussion: () => ({ sans: `not read: ${BRUT}` }),
    lireHistoire: () => ({ sans: `not read: ${BRUT}` }) as never,
  });

async function cooks(): Promise<Joue> {
  const vue = await ouvrir();
  await ouvrirLecture(vue, "Cooks");
  const numero = (vue.dernier("onglet") as [string, string, number])[2];
  vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur: BRUT, atteinte: false, cas: "ssh-en-echec" }, undefined, undefined);
  await repos();
  // L'onglet Cooks (#1184) : sa lecture de `station` est posée au centre, sous ses colonnes.
  return { vue, racine: ecran(vue, "rail", ...LECTURE) };
}

// Settings (#1700) : une seule page, qui lit les grants — chaque grant nommé garde sa ligne, sa lecture ratée en une ligne.
async function settings(): Promise<Joue> {
  const vue = await ouvrir();
  await ouvrirLecture(vue, "Settings");
  const numero = (vue.dernier("onglet") as [string, string, number])[2];
  const sans = { projet: "parade", demande: numero, a: A, sans: BRUT };
  vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur: BRUT, atteinte: false, cas: "ssh-en-echec" }, undefined, sans);
  await repos();
  return { vue, racine: ecran(vue, ...LECTURE) };
}

// La page des coûts de l'app (#1022), dont la box ne répond pas : ses chiffres disent ce qui n'est pas communiqué.
async function couts(): Promise<Joue> {
  const vue = await ouvrir({}, false);
  const page = await ouvrirLesCouts(vue);
  const numero = (vue.dernier("onglet") as [undefined, string, number])[2];
  vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur: BRUT, atteinte: false, cas: "ssh-en-echec" }, undefined, undefined);
  await repos();
  return { vue, racine: page };
}

// Ce que pose une page ouverte par-dessus le rail : la lecture relayée, Settings et ses grants.
const LECTURE = ["lu-onglet", "gestes-onglet", "lecture-onglet", "etat", "grants"];

// Le bandeau du second : le shell dit où il est, son bandeau ne porte ni commande ni code.
async function second(): Promise<Joue> {
  const vue = await ouvrir();
  (vue.element("terminaux").children.find(({ textContent }) => textContent === "shell 1") ?? assert.fail("pas d'onglet de shell")).click();
  await repos();
  return { vue, racine: vue.element("second") };
}

const ECRANS: Ecran[] = [
  // L'accueil n'a plus de ligne de lecture en échec à part : celle du projet le dit (plus bas).
  { nom: "accueil", echec: accueil, lectures: 0 },
  { nom: "bande d'alertes", echec: alertes, lectures: 0 },
  { nom: "fiche d'une carte", echec: ficheEnEchec, lectures: 3 },
  { nom: "Cost, au niveau de l'app", echec: couts, lectures: 0 },
  { nom: "Cooks", echec: cooks, lectures: 1 },
  { nom: "Settings", echec: settings, lectures: 1 },
  { nom: "bandeau du second", echec: second, lectures: 0 },
];

describe("aucun écran n'écrit à plat une commande, un mode d'emploi, un code de sortie ou un prix", () => {
  for (const { nom, echec } of ECRANS) {
    test(`${nom} : une lecture en échec`, async () => {
      const { racine } = await echec();
      const dit = visible(racine);
      assert.doesNotMatch(dit, TRAVERS, `${nom} écrit un travers à plat : ${dit}`);
      assert.doesNotMatch(dit, PRIX, `${nom} écrit un prix à plat : ${dit}`);
    });
  }
});

describe("une lecture en échec tient en une ligne, son détail n'est qu'au survol", () => {
  for (const { nom, echec, lectures } of ECRANS) {
    test(nom, async () => {
      const { racine } = await echec();
      const lignes = lignesEnEchec(racine);
      assert.equal(lignes.length, lectures, `${nom} : ${lignes.length} ligne(s) de lecture en échec, ${lectures} attendue(s)`);
      for (const ligne of lignes) {
        const dit = visible(ligne);
        assert.ok(dit !== "" && dit.length <= 80 && !dit.includes("\n"), `${nom} : la ligne n'est pas courte — « ${dit} »`);
        assert.ok(survols(ligne).some((detail) => detail.includes(DETAIL)), `${nom} : le détail n'est pas au survol de la ligne`);
      }
      // Le détail n'est nulle part à plat sur l'écran, ni dans un `pre`.
      assert.ok(!visible(racine).includes(DETAIL), `${nom} écrit le détail à plat`);
      assert.deepEqual(racine.dessous("pre").filter((pre) => pre.textContent.includes(DETAIL)), [], `${nom} montre le détail dans un bloc de code`);
    });
  }

  // L'accueil (#870) n'écrit aucun texte brut d'erreur, même au survol : la box qui ne répond pas est la
  // ligne du projet, courte, rouge, et son survol le redit dans les mots de l'app.
  test("accueil : la box qui ne répond pas tient sur la ligne du projet, son survol dans les mots de l'app", async () => {
    const { vue, racine } = await accueil();
    const [ligne, ...autres] = vue.element("accueil-projets").dessous("button");
    assert.ok(ligne !== undefined && autres.length === 0, "une ligne par projet, et rien d'autre ne se clique");
    const dit = visible(ligne);
    assert.ok(dit !== "" && dit.length <= 80, `la ligne n'est pas courte — « ${dit} »`);
    assert.equal(ligne.children[0]?.dataset.ton, "rouge");
    assert.notEqual(ligne.title, "", "rien au survol de la ligne");
    for (const texte of [visible(racine), ...racine.dessous("button").map(({ title, ariaLabel }) => `${title} ${ariaLabel}`)]) {
      assert.ok(!texte.includes(DETAIL), `l'accueil écrit le détail brut : ${texte}`);
      assert.doesNotMatch(texte, TRAVERS, `l'accueil écrit un travers : ${texte}`);
    }
  });
});

// ─── L'état « en attente de décision » ───────────────────────────────────────

const COMMANDE_DE_LA_BOX = "do what #535 waits for, as the box writes it";
const URGENTE: Alerte = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: COMMANDE_DE_LA_BOX, bouton: "ask the second", appel: { demande: true }, prix: "none" };
const REPRENDRE: Alerte = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen: `brigade parade garde-fous -- resume`", bouton: "resume the kitchen", appel: { geste: "reprendre" }, prix: "cost: queued tickets start again at once, on your quota" };
const EN_ATTENTE = [URGENTE, REPRENDRE];

async function bandeEnAttente(): Promise<Joue> {
  const vue = await ouvrir();
  vue.dire("surAlertes", { projet: "parade", alertes: EN_ATTENTE, signal: { etat: "urgence", dit: "x" } });
  return { vue, racine: vue.element("alertes") };
}
// L'accueil devant un projet où une décision attend : sa ligne, telle que accueil.ts la dit.
const UNE_DECISION = "attend     1 décision attend le chef depuis 5 h 28\n  #535  depuis 5 h 28  merge à faire  Titre\nfin attend\n";
const FAITS_EN_ATTENTE: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], urgence: null };
async function accueilEnAttente(): Promise<Joue> {
  const vue = await ouvrir({}, false);
  vue.dire("surAlertes", { projet: "parade", alertes: EN_ATTENTE, signal: { etat: "urgence", dit: "x" } });
  const ligne = ligneDeProjet(PARADE_A_L_ACCUEIL, { a: A, faits: FAITS_EN_ATTENTE }, { texte: "cuisine    ouverte", attend: UNE_DECISION });
  const vu: Accueil = { ...tenirAccueil({ projets: () => [PARADE_A_L_ACCUEIL] }).vu(), projets: [ligne] };
  vue.dire("surAccueil", vu);
  await repos();
  return { vue, racine: vue.element("tous") };
}
const ficheEnAttente = () => ficheOuverte({ lireQuestion: () => ({ a: A, aucune: true }), lireDiscussion: () => undefined });

describe("en attente de décision, aucun écran n'écrit à plat une commande ni un prix", () => {
  for (const [nom, jouer] of [["accueil", accueilEnAttente], ["bande d'alertes", bandeEnAttente], ["fiche d'une carte", ficheEnAttente]] as const) {
    test(nom, async () => {
      const { racine } = await jouer();
      const dit = visible(racine);
      assert.ok(dit !== "", `${nom} est vide`);
      assert.doesNotMatch(dit, TRAVERS, `${nom} écrit un travers à plat : ${dit}`);
      assert.doesNotMatch(dit, PRIX, `${nom} écrit un prix à plat : ${dit}`);
    });
  }
});

describe("en attente de décision, chaque geste attendu est un bouton, pas du texte", () => {
  test("bande d'alertes : une ligne, un contrôle — la commande écrite nulle part, pas même derrière « detail », le prix dans la confirmation", async () => {
    const { racine } = await bandeEnAttente();
    for (const alerte of EN_ATTENTE) {
      const ligne = () => racine.children.find((pose) => pose.dataset.sujet === alerte.sujet) ?? assert.fail(`pas de ligne « ${alerte.sujet} »`);
      const [controle, ...autres] = boutons(ligne()).filter(({ className }) => className !== "detail");
      assert.ok(controle?.textContent.startsWith(alerte.bouton ?? "") === true && autres.length === 0, `« ${alerte.bouton} » n'est pas le seul contrôle de sa ligne`);
      assert.ok(!visible(ligne()).includes(alerte.geste), `${alerte.sujet} : le geste est écrit à plat`);
      assert.ok(!survols(ligne()).some((dit) => dit.includes(alerte.prix)), `${alerte.sujet} : le prix est posé à côté du bouton`);
      // Déplié, le détail montre le brut de la box, jamais le geste à recopier.
      const deplier = boutons(ligne()).find(({ className }) => className === "detail");
      if (deplier === undefined) continue;
      deplier.click();
      assert.ok(!visible(ligne()).includes(alerte.geste), `${alerte.sujet} : le geste est écrit derrière « detail »`);
    }
  });

  // L'accueil (#870) : on n'y agit pas. Ce qu'on peut faire en premier, c'est ouvrir le projet qui
  // attend — toute sa ligne est ce bouton, et elle ne porte aucun autre geste.
  test("accueil : la ligne du projet qui attend est le bouton qui l'ouvre, sans autre geste", async () => {
    const { vue } = await accueilEnAttente();
    const [ligne, ...autres] = boutons(vue.element("accueil-projets"));
    assert.ok(ligne !== undefined && autres.length === 0, "la ligne du projet n'est pas un bouton, ou elle porte un geste");
    assert.equal(ligne.children[0]?.dataset.ton, "jaune");
    assert.match(visible(ligne), /1 decision awaits you/);
    assert.ok(!visible(vue.element("tous")).includes(COMMANDE_DE_LA_BOX), "le geste de la box est écrit sur l'accueil");
    ligne.click();
    await repos();
    assert.equal(vue.element("espace").textContent, "parade", "le clic n'ouvre pas le projet");
  });

  test("fiche : chaque geste que la table du chef propose pour la carte est un bouton, le recommandé en tête", async () => {
    const { racine } = await ficheEnAttente();
    const proposes = gestesDeCarte(carte);
    assert.ok(proposes.some(({ id }) => id === "merger"), "la décision attendue est de merger : le geste manque à la table");
    const boutonsDeLaFiche = boutons(racine).map(({ textContent }) => textContent);
    for (const { libelle } of proposes) assert.ok(boutonsDeLaFiche.includes(libelle), `« ${libelle} » n'est pas un bouton de la fiche`);
    const [premier] = proposes;
    assert.equal(premier?.recommande, true);
    const gestes = racine.dessous("section").find(({ className }) => className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
    assert.equal(boutons(gestes)[0]?.textContent, premier?.libelle);
    // Aucun geste n'est une ligne de texte : chaque ligne de geste porte son bouton.
    for (const ligne of gestes.dessous("li")) assert.ok(boutons(ligne).length > 0, `le geste « ${ligne.dataset.geste} » n'est pas un bouton`);
  });

});
