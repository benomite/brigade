// Garde-fou (#835) : « l'app parle moins » doit tenir dans le temps. Chaque écran — l'accueil, la bande
// d'alertes, la fiche d'une carte, la page des coûts de l'app, Settings, le bandeau du second — est joué tel que la vue
// le pose, dans deux états : une lecture en échec, et une décision qui attend le chef. Le texte *visible
// par défaut* (celui des éléments, sans le survol, sans un `details` replié) ne porte jamais une commande à
// recopier, un mode d'emploi, un code de sortie, ni une phrase de prix sous un bouton ; une lecture qui
// manque tient en une ligne, son détail au survol ; chaque geste attendu est un bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { entete } from "../src/card.ts";
import { BANNIERE, type Dessinable, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { actionsDeCard } from "../src/card-actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { lineDeProject, holdHome, type Home, type ProjectDeLHome } from "../src/home.ts";
import { holdBandes, type Alert } from "../src/alerts.ts";
import type { Terminal } from "../src/terminaux.ts";
import { Faux, type Jouee, jouerLaVue, type Answers, ouvrirRead, ouvrirLesCouts, repos } from "./aides/fausse-vue.ts";

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const A = "2026-10-16T10:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false, bandeau: "box parade-box · debian — not reachable" };

// Ce qu'une panne laisse derrière elle, et qui n'a sa place qu'au survol.
const DETAIL = "connect to host box port 22: Connection refused";
const BRUT = `usage: brigade <projet> station\n${DETAIL}\n→ code de sortie 255`;
const PAS_JOINT = { projet: "parade", demande: 1, a: A, erreur: `$ brigade parade facts\n${BRUT}`, atteinte: false, cas: null } as const;

// Les travers : une commande qui se recopie, un mode d'emploi, un code de sortie.
const TRAVERS = /brigade\s*<|brigade\s+[a-z0-9-]+\s+(?:station|manager|status|facts|pass|rail|log|installation)\b|usage\s*:|exit code|code de sortie/i;
// Une phrase de prix écrite à plat. Les éléments se concatènent sans blanc : aucune de ces deux règles n'ancre son début sur une limite de mot.
const PRIX = /costs?\s*:|prix\s*:|price\s*:/i;

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(answers: Answers = {}, entrer = true): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND, SHELL],
    machines: () => [{ id: "poste", titre: "this computer" }],
    gestesDeFiche: (card) => actionsDeCard(card),
    ...answers,
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
function screen(vue: Jouee, ...ids: string[]): Faux {
  const racine = new Faux("div");
  racine.append(...ids.map((id) => vue.element(id)).filter(({ hidden }) => !hidden));
  return racine;
}
const survols = (ou: Faux) => ou.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
const linesEnFailure = (ou: Faux) => [ou, ...ou.descendants()].filter(({ className, balise }) => balise === "p" && className === "indisponible");
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide");

// ─── Les écrans ──────────────────────────────────────────────────────────────

type Joue = { vue: Jouee; racine: Faux };
type Screen = {
  nom: string;
  // L'écran, une lecture en échec.
  echec: () => Promise<Joue>;
  // Combien de lectures en échec il dit, chacune en une ligne.
  lectures: number;
};

// L'accueil : « Tous les projets », devant une box qui ne répond pas. Depuis #870, il ne pose plus de
// lecture en échec à part : la box injoignable se dit sur la ligne du projet, que le process principal
// calcule (home.ts) et redit par `surAccueil`.
const PARADE_A_L_HOME: ProjectDeLHome = { nom: "parade", servi: true };
async function home(): Promise<Joue> {
  const vue = await ouvrir({}, false);
  vue.dire("surFaits", { ...PAS_JOINT, titre: "facts: the box did not answer", demande: vue.dernier("faits")[0] as number });
  const bandes = holdBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  vue.dire("surAlertes", bandes.faits(PAS_JOINT));
  vue.dire("surAccueil", holdHome({ projets: () => [PARADE_A_L_HOME] }).faits(PAS_JOINT) ?? assert.fail("l'accueil ne change pas"));
  await repos();
  return { vue, racine: vue.element("tous") };
}

async function alerts(): Promise<Joue> {
  const vue = await ouvrir();
  const bandes = holdBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  vue.dire("surAlertes", bandes.faits(PAS_JOINT));
  return { vue, racine: vue.element("alertes") };
}

// Une carte qui t'attend, sur le rail.
const decisionFermee = { quoi: "fermee", motif: "still-red", cause: null, pr: "https://github.com/benomite/brigade/pull/31" };
const card = { ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: entete({ titre: "Validation SIRET" }), ouvrable: true, attendu: true, decision: decisionFermee, pr: true, attend: ["livraison verte, non mergée"], dit: [] };
const factsWithTile = (request: number): Dessinable =>
  ({
    projet: "parade",
    demande: request,
    a: A,
    tableau: {
      etat: "ouverte",
      ton: "vert",
      arretee: false,
      tick: "dernier tick il y a 12 s",
      compteurs: [{ libelle: "rail", nombre: 1 }],
      cooks: { enCours: [], vide: "aucun cook en cours" },
      evenement: "rien",
      rail: { colonnes: [{ nom: "T'attend", ton: "rouge", compte: "1", cartes: [card], vide: "aucun ticket" }], hors: [], attendLu: A },
    },
  }) as unknown as Dessinable;

async function openCard(answers: Answers): Promise<Joue> {
  const vue = await ouvrir(answers);
  vue.dire("surFaits", factsWithTile(vue.dernier("faits")[0] as number));
  const slip = vue.element("rail").dessous("li").find(({ className }) => className === "bon") ?? assert.fail("pas de carte sur le rail");
  slip.click();
  await repos();
  return { vue, racine: vue.element("fiche") };
}
const failedCard = () =>
  openCard({
    lireQuestion: () => ({ a: A, sans: `not read: ${BRUT}` }),
    lireDiscussion: () => ({ sans: `not read: ${BRUT}` }),
    lireHistoire: () => ({ sans: `not read: ${BRUT}` }) as never,
  });

// Settings (#1700) : une seule page, qui ne lit rien : sa lecture ratée n'a rien à dire.
async function settings(): Promise<Joue> {
  const vue = await ouvrir();
  await ouvrirRead(vue, "Settings");
  const numero = (vue.dernier("onglet") as [string, string, number])[2];
  vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur: BRUT, atteinte: false, cas: null }, undefined);
  await repos();
  return { vue, racine: screen(vue, ...READ) };
}

// La page des coûts de l'app (#1022), dont la box ne répond pas : ses chiffres disent ce qui n'est pas communiqué. Les
// chiffres d'autonomie de tous les projets (#3222), que GitHub ne rend pas, le disent en une ligne.
async function couts(): Promise<Joue> {
  const vue = await ouvrir({ lireAutonomie: (_projects, jours) => ({ jours, sans: "Autonomy figures not reached.", detail: BRUT }) }, false);
  const page = await ouvrirLesCouts(vue);
  const numero = (vue.dernier("onglet") as [undefined, string, number])[2];
  vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur: BRUT, atteinte: false, cas: null }, undefined);
  await repos();
  return { vue, racine: page };
}

// Ce que pose une page ouverte par-dessus le rail : la lecture relayée, et Settings.
const READ = ["lu-onglet", "lecture-onglet", "etat"];

// Le bandeau du second : le shell dit où il est, son bandeau ne porte ni commande ni code.
async function second(): Promise<Joue> {
  const vue = await ouvrir();
  (vue.element("terminaux").children.find(({ textContent }) => textContent === "shell 1") ?? assert.fail("pas d'onglet de shell")).click();
  await repos();
  return { vue, racine: vue.element("second") };
}

const SCREENS: Screen[] = [
  // L'accueil n'a plus de ligne de lecture en échec à part : celle du projet le dit (plus bas).
  { nom: "accueil", echec: home, lectures: 0 },
  { nom: "bande d'alertes", echec: alerts, lectures: 0 },
  { nom: "fiche d'une carte", echec: failedCard, lectures: 3 },
  { nom: "Cost, au niveau de l'app", echec: couts, lectures: 1 },
  { nom: "Settings", echec: settings, lectures: 0 },
  { nom: "bandeau du second", echec: second, lectures: 0 },
];

describe("aucun écran n'écrit à plat une commande, un mode d'emploi, un code de sortie ou un prix", () => {
  for (const { nom: name, echec: failure } of SCREENS) {
    test(`${name} : une lecture en échec`, async () => {
      const { racine } = await failure();
      const dit = visible(racine);
      assert.doesNotMatch(dit, TRAVERS, `${name} écrit un travers à plat : ${dit}`);
      assert.doesNotMatch(dit, PRIX, `${name} écrit un prix à plat : ${dit}`);
    });
  }
});

describe("une lecture en échec tient en une ligne, son détail n'est qu'au survol", () => {
  for (const { nom: name, echec: failure, lectures } of SCREENS) {
    test(name, async () => {
      const { racine } = await failure();
      const lines = linesEnFailure(racine);
      assert.equal(lines.length, lectures, `${name} : ${lines.length} ligne(s) de lecture en échec, ${lectures} attendue(s)`);
      for (const line of lines) {
        const dit = visible(line);
        assert.ok(dit !== "" && dit.length <= 80 && !dit.includes("\n"), `${name} : la ligne n'est pas courte — « ${dit} »`);
        assert.ok(survols(line).some((detail) => detail.includes(DETAIL)), `${name} : le détail n'est pas au survol de la ligne`);
      }
      // Le détail n'est nulle part à plat sur l'écran, ni dans un `pre`.
      assert.ok(!visible(racine).includes(DETAIL), `${name} écrit le détail à plat`);
      assert.deepEqual(racine.dessous("pre").filter((pre) => pre.textContent.includes(DETAIL)), [], `${name} montre le détail dans un bloc de code`);
    });
  }

  // L'accueil (#870) n'écrit aucun texte brut d'erreur, même au survol : la box qui ne répond pas est la
  // ligne du projet, courte, rouge, et son survol le redit dans les mots de l'app.
  test("accueil : la box qui ne répond pas tient sur la ligne du projet, son survol dans les mots de l'app", async () => {
    const { vue, racine } = await home();
    const [line, ...autres] = vue.element("accueil-projets").dessous("button").filter(({ className }) => className === "ligne");
    assert.ok(line !== undefined && autres.length === 0, "une ligne par projet, et rien d'autre ne se clique");
    const dit = visible(line);
    assert.ok(dit !== "" && dit.length <= 80, `la ligne n'est pas courte — « ${dit} »`);
    assert.equal(line.children[0]?.dataset.ton, "rouge");
    assert.notEqual(line.title, "", "rien au survol de la ligne");
    for (const texte of [visible(racine), ...racine.dessous("button").map(({ title, ariaLabel }) => `${title} ${ariaLabel}`)]) {
      assert.ok(!texte.includes(DETAIL), `l'accueil écrit le détail brut : ${texte}`);
      assert.doesNotMatch(texte, TRAVERS, `l'accueil écrit un travers : ${texte}`);
    }
  });
});

// ─── L'état « en attente de décision » ───────────────────────────────────────

const COMMAND_DE_LA_BOX = "do what #535 waits for, as the box writes it";
const URGENTE: Alert = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: COMMAND_DE_LA_BOX, bouton: "ask the second", appel: { demande: true }, prix: "none" };
const REPRENDRE: Alert = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen: `brigade parade garde-fous -- resume`", bouton: "resume the kitchen", appel: { geste: "reprendre" }, prix: "cost: queued tickets start again at once, on your quota" };
const QUEUED = [URGENTE, REPRENDRE];

async function bandQueued(): Promise<Joue> {
  const vue = await ouvrir();
  vue.dire("surAlertes", { projet: "parade", alertes: QUEUED, signal: { etat: "urgence", dit: "x" } });
  return { vue, racine: vue.element("alertes") };
}
// L'accueil devant un projet où une décision attend : sa ligne, telle que home.ts la dit.
const UNE_DECISION = "attend     1 décision attend le chef depuis 5 h 28\n  #535  depuis 5 h 28  merge à faire  Titre\nfin attend\n";
const QUEUED_FACTS: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], urgence: null };
async function homeQueued(): Promise<Joue> {
  const vue = await ouvrir({}, false);
  vue.dire("surAlertes", { projet: "parade", alertes: QUEUED, signal: { etat: "urgence", dit: "x" } });
  const line = lineDeProject(PARADE_A_L_HOME, { a: A, faits: QUEUED_FACTS }, { texte: "cuisine    ouverte", attend: UNE_DECISION });
  const vu: Home = { ...holdHome({ projets: () => [PARADE_A_L_HOME] }).vu(), projets: [line] };
  vue.dire("surAccueil", vu);
  await repos();
  return { vue, racine: vue.element("tous") };
}
const queuedCard = () => openCard({ lireQuestion: () => ({ a: A, aucune: true }), lireDiscussion: () => undefined });

describe("en attente de décision, aucun écran n'écrit à plat une commande ni un prix", () => {
  for (const [name, jouer] of [["accueil", homeQueued], ["bande d'alertes", bandQueued], ["fiche d'une carte", queuedCard]] as const) {
    test(name, async () => {
      const { racine } = await jouer();
      const dit = visible(racine);
      assert.ok(dit !== "", `${name} est vide`);
      assert.doesNotMatch(dit, TRAVERS, `${name} écrit un travers à plat : ${dit}`);
      assert.doesNotMatch(dit, PRIX, `${name} écrit un prix à plat : ${dit}`);
    });
  }
});

describe("en attente de décision, chaque geste attendu est un bouton, pas du texte", () => {
  test("bande d'alertes : une ligne, un contrôle — la commande écrite nulle part, pas même derrière « detail », le prix dans la confirmation", async () => {
    const { racine } = await bandQueued();
    for (const alert of QUEUED) {
      const line = () => racine.children.find((pose) => pose.dataset.sujet === alert.sujet) ?? assert.fail(`pas de ligne « ${alert.sujet} »`);
      const [controle, ...autres] = boutons(line()).filter(({ className }) => className !== "detail");
      assert.ok(controle?.textContent.startsWith(alert.bouton ?? "") === true && autres.length === 0, `« ${alert.bouton} » n'est pas le seul contrôle de sa ligne`);
      assert.ok(!visible(line()).includes(alert.geste), `${alert.sujet} : le geste est écrit à plat`);
      assert.ok(!survols(line()).some((dit) => dit.includes(alert.prix)), `${alert.sujet} : le prix est posé à côté du bouton`);
      // Déplié, le détail montre le brut de la box, jamais le geste à recopier.
      const deplier = boutons(line()).find(({ className }) => className === "detail");
      if (deplier === undefined) continue;
      deplier.click();
      assert.ok(!visible(line()).includes(alert.geste), `${alert.sujet} : le geste est écrit derrière « detail »`);
    }
  });

  // L'accueil (#870) : on n'y agit pas. Ce qu'on peut faire en premier, c'est ouvrir le projet qui
  // attend — toute sa ligne est ce bouton, et elle ne porte aucun autre geste.
  test("accueil : la ligne du projet qui attend est le bouton qui l'ouvre, sans autre geste", async () => {
    const { vue } = await homeQueued();
    const [line, ...autres] = boutons(vue.element("accueil-projets")).filter(({ className }) => className === "ligne");
    assert.ok(line !== undefined && autres.length === 0, "la ligne du projet n'est pas un bouton, ou elle porte un geste");
    assert.equal(line.children[0]?.dataset.ton, "jaune");
    assert.match(line.title, /1 decision awaits you/);
    assert.match(visible(line), /waiting for the chef/);
    assert.ok(!visible(vue.element("tous")).includes(COMMAND_DE_LA_BOX), "le geste de la box est écrit sur l'accueil");
    line.click();
    await repos();
    assert.equal(vue.element("espace").textContent, "parade", "le clic n'ouvre pas le projet");
  });

  test("fiche : chaque geste que la table du chef propose pour la carte est un bouton, dans l'ordre de la table", async () => {
    const { racine } = await queuedCard();
    const proposes = actionsDeCard(card);
    assert.ok(proposes.some(({ id }) => id === "retirer"), "la décision attendue se tranche par le retrait : le geste manque à la table");
    const cardButtons = boutons(racine).map(({ textContent }) => textContent);
    for (const { libelle } of proposes.filter(({ id }) => id !== "priorite")) assert.ok(cardButtons.includes(libelle), `« ${libelle} » n'est pas un bouton de la fiche`);
    const [first] = proposes;
    const actions = racine.dessous("section").find(({ className }) => className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
    assert.equal(boutons(actions)[0]?.textContent, first?.libelle);
    // Aucun geste n'est une ligne de texte : chaque ligne de geste porte son bouton.
    for (const line of actions.dessous("li")) assert.ok(boutons(line).length > 0 || line.dessous("select").length > 0, `le geste « ${line.dataset.geste} » n'est pas un bouton`);
  });

});
