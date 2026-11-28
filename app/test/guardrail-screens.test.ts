// Garde-fou (#835) : « l'app parle moins » doit tenir dans le temps. Chaque écran — l'accueil, la fiche d'une carte, la page des coûts de l'app, Settings, le bandeau du second — est joué tel que la vue
// le pose, dans deux états : une lecture en échec, et une décision qui attend le chef. Le texte *visible
// par défaut* (celui des éléments, sans le survol, sans un `details` replié) ne porte jamais une commande à
// recopier, un mode d'emploi, un code de sortie, ni une phrase de prix sous un bouton ; une lecture qui
// manque tient en une ligne, son détail au survol ; chaque geste attendu est un bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { header } from "../src/card.ts";
import { type Drawable, type Facts } from "../src/facts.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { HEADINGS } from "../src/tabs.ts";
import { lineOfProject, holdHome, type Home, type ProjectOfTheHome } from "../src/home.ts";
import type { Terminal } from "../src/terminals.ts";
import { Fake, type Played, playTheVue, type Answers, openRead, repos } from "./helpers/false-vue.ts";

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const A = "2026-10-16T10:00:00.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false, bandeau: "box parade-box · debian — not reachable" };

// Ce qu'une panne laisse derrière elle, et qui n'a sa place qu'au survol.
const DETAIL = "connect to host box port 22: Connection refused";
const RAW = `usage: brigade <projet> station\n${DETAIL}\n→ code de sortie 255`;
const NOT_JOINED = { projet: "parade", demande: 1, a: A, erreur: `$ brigade parade facts\n${RAW}`, atteinte: false, cas: null } as const;

// Les travers : une commande qui se recopie, un mode d'emploi, un code de sortie.
const THROUGH = /brigade\s*<|brigade\s+[a-z0-9-]+\s+(?:station|manager|status|facts|pass|rail|log|installation)\b|usage\s*:|exit code|code de sortie/i;
// Une phrase de prix écrite à plat. Les éléments se concatènent sans blanc : aucune de ces deux règles n'ancre son début sur une limite de mot.
const PRICE = /costs?\s*:|prix\s*:|price\s*:/i;

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

async function open(answers: Answers = {}, enter = true): Promise<Played> {
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [SECOND, SHELL],
    machines: () => [{ id: "poste", titre: "this computer" }],
    gestesDeFiche: (card) => actionsOfCard(card),
    ...answers,
  });
  if (enter) {
    (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
    await repos();
  }
  return vue;
}

// Le texte posé à plat : celui des éléments, moins ce qu'un `details` replié ou un élément caché ne montre
// pas. Un survol n'y est pas — son texte n'est dans l'élément qu'au passage du pointeur.
function visible(root: Fake): string {
  let text = root.textContent;
  for (const element of root.descendants()) {
    const folded = element.balise === "details" && !(element as Fake & { open?: boolean }).open;
    const cache = element.hidden;
    if (!folded && !cache) continue;
    for (const child of element.children) if (cache || child.balise !== "summary") text = text.replace(child.textContent, "");
    if (cache) text = text.replace(element.textContent, "");
  }
  return text.replace(/\s+/g, " ").trim();
}
// La fausse page ne rejoue pas la place des éléments : l'écran est ce que la vue pose dans ces éléments-là, ceux qui ne sont pas cachés.
function screen(vue: Played, ...ids: string[]): Fake {
  const root = new Fake("div");
  root.append(...ids.map((id) => vue.element(id)).filter(({ hidden }) => !hidden));
  return root;
}
const hovers = (or: Fake) => or.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
const linesInFailure = (or: Fake) => [or, ...or.descendants()].filter(({ className, balise }) => balise === "p" && className === "indisponible");
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide");

// ─── Les écrans ──────────────────────────────────────────────────────────────

type Plays = { vue: Played; racine: Fake };
type Screen = {
  nom: string;
  // L'écran, une lecture en échec.
  echec: () => Promise<Plays>;
  // Combien de lectures en échec il dit, chacune en une ligne.
  lectures: number;
};

// L'accueil : « Tous les projets », devant une box qui ne répond pas. Depuis #870, il ne pose plus de
// lecture en échec à part : la box injoignable se dit sur la ligne du projet, que le process principal
// calcule (home.ts) et redit par `surAccueil`.
const PARADE_AT_THE_HOME: ProjectOfTheHome = { nom: "parade", servi: true };
async function home(): Promise<Plays> {
  const vue = await open({}, false);
  vue.dire("surFaits", { ...NOT_JOINED, titre: "facts: the box did not answer", demande: vue.dernier("faits")[0] as number });
  vue.dire("surAccueil", holdHome({ projets: () => [PARADE_AT_THE_HOME] }).faits(NOT_JOINED) ?? assert.fail("l'accueil ne change pas"));
  await repos();
  return { vue, racine: vue.element("tous") };
}

// Une carte qui t'attend, sur le rail.
const card = { ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: header({ titre: "Validation SIRET" }), ouvrable: true, attendu: true, pr: true, attend: ["livraison verte, non mergée"], dit: [] };
const factsWithTile = (request: number): Drawable =>
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
  }) as unknown as Drawable;

async function openCard(answers: Answers): Promise<Plays> {
  const vue = await open(answers);
  vue.dire("surFaits", factsWithTile(vue.dernier("faits")[0] as number));
  const slip = vue.element("rail").dessous("li").find(({ className }) => className === "bon") ?? assert.fail("pas de carte sur le rail");
  slip.click();
  await repos();
  return { vue, racine: vue.element("fiche") };
}
const failedCard = () =>
  openCard({
    lireQuestion: () => ({ a: A, sans: `not read: ${RAW}` }),
  });

// Settings (#1700) : une seule page, qui ne lit rien : sa lecture ratée n'a rien à dire.
async function settings(): Promise<Plays> {
  const vue = await open();
  await openRead(vue, "Settings");
  const number = (vue.dernier("onglet") as [string, string, number])[2];
  vue.dire("surContenu", { projet: "parade", demande: number, a: A, erreur: RAW, atteinte: false, cas: null });
  await repos();
  return { vue, racine: screen(vue, ...READING) };
}

// Ce que pose une page ouverte par-dessus le rail : la lecture relayée, et Settings.
const READING = ["lu-onglet", "lecture-onglet", "etat"];

// Le bandeau du second : le shell dit où il est, son bandeau ne porte ni commande ni code.
async function second(): Promise<Plays> {
  const vue = await open();
  (vue.element("terminaux").children.find(({ textContent }) => textContent === "shell 1") ?? assert.fail("pas d'onglet de shell")).click();
  await repos();
  return { vue, racine: vue.element("second") };
}

const SCREENS: Screen[] = [
  // L'accueil n'a plus de ligne de lecture en échec à part : celle du projet le dit (plus bas).
  { nom: "accueil", echec: home, lectures: 0 },
  { nom: "fiche d'une carte", echec: failedCard, lectures: 1 },
  { nom: "Settings", echec: settings, lectures: 0 },
  { nom: "bandeau du second", echec: second, lectures: 0 },
];

describe("aucun écran n'écrit à plat une commande, un mode d'emploi, un code de sortie ou un prix", () => {
  for (const { nom: name, echec: failure } of SCREENS) {
    test(`${name} : une lecture en échec`, async () => {
      const { racine: root } = await failure();
      const said = visible(root);
      assert.doesNotMatch(said, THROUGH, `${name} écrit un travers à plat : ${said}`);
      assert.doesNotMatch(said, PRICE, `${name} écrit un prix à plat : ${said}`);
    });
  }
});

describe("une lecture en échec tient en une ligne, son détail n'est qu'au survol", () => {
  for (const { nom: name, echec: failure, lectures: readings } of SCREENS) {
    test(name, async () => {
      const { racine: root } = await failure();
      const lines = linesInFailure(root);
      assert.equal(lines.length, readings, `${name} : ${lines.length} ligne(s) de lecture en échec, ${readings} attendue(s)`);
      for (const line of lines) {
        const said = visible(line);
        assert.ok(said !== "" && said.length <= 80 && !said.includes("\n"), `${name} : la ligne n'est pas courte — « ${said} »`);
        assert.ok(hovers(line).some((detail) => detail.includes(DETAIL)), `${name} : le détail n'est pas au survol de la ligne`);
      }
      // Le détail n'est nulle part à plat sur l'écran, ni dans un `pre`.
      assert.ok(!visible(root).includes(DETAIL), `${name} écrit le détail à plat`);
      assert.deepEqual(root.dessous("pre").filter((pre) => pre.textContent.includes(DETAIL)), [], `${name} montre le détail dans un bloc de code`);
    });
  }

  // L'accueil (#870) n'écrit aucun texte brut d'erreur, même au survol : la box qui ne répond pas est la
  // ligne du projet, courte, rouge, et son survol le redit dans les mots de l'app.
  test("accueil : la box qui ne répond pas tient sur la ligne du projet, son survol dans les mots de l'app", async () => {
    const { vue, racine: root } = await home();
    const [line, ...others] = vue.element("accueil-projets").dessous("button").filter(({ className }) => className === "ligne");
    assert.ok(line !== undefined && others.length === 0, "une ligne par projet, et rien d'autre ne se clique");
    const said = visible(line);
    assert.ok(said !== "" && said.length <= 80, `la ligne n'est pas courte — « ${said} »`);
    assert.equal(line.children[0]?.dataset.ton, "rouge");
    assert.notEqual(line.title, "", "rien au survol de la ligne");
    for (const text of [visible(root), ...root.dessous("button").map(({ title, ariaLabel }) => `${title} ${ariaLabel}`)]) {
      assert.ok(!text.includes(DETAIL), `l'accueil écrit le détail brut : ${text}`);
      assert.doesNotMatch(text, THROUGH, `l'accueil écrit un travers : ${text}`);
    }
  });
});

// ─── L'état « en attente de décision » ───────────────────────────────────────

// L'accueil devant un projet où une décision attend : sa ligne, telle que home.ts la dit.
const ONE_DECISION = "attend     1 décision attend le chef depuis 5 h 28\n  #535  depuis 5 h 28  merge à faire  Titre\nfin attend\n";
const QUEUED_FACTS: Facts = { etat: "ouverte", lu: A, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, cooks: [], attend: [], livres: [] };
async function homeQueued(): Promise<Plays> {
  const vue = await open({}, false);
  const line = lineOfProject(PARADE_AT_THE_HOME, { a: A, faits: QUEUED_FACTS }, { texte: "cuisine    ouverte", attend: ONE_DECISION });
  const seenOne: Home = { ...holdHome({ projets: () => [PARADE_AT_THE_HOME] }).vu(), projets: [line] };
  vue.dire("surAccueil", seenOne);
  await repos();
  return { vue, racine: vue.element("tous") };
}
const queuedCard = () => openCard({ lireQuestion: () => ({ a: A, aucune: true }) });

describe("en attente de décision, aucun écran n'écrit à plat une commande ni un prix", () => {
  for (const [name, play] of [["accueil", homeQueued], ["fiche d'une carte", queuedCard]] as const) {
    test(name, async () => {
      const { racine: root } = await play();
      const said = visible(root);
      assert.ok(said !== "", `${name} est vide`);
      assert.doesNotMatch(said, THROUGH, `${name} écrit un travers à plat : ${said}`);
      assert.doesNotMatch(said, PRICE, `${name} écrit un prix à plat : ${said}`);
    });
  }
});

describe("en attente de décision, chaque geste attendu est un bouton, pas du texte", () => {
  // L'accueil (#870) : on n'y agit pas. Ce qu'on peut faire en premier, c'est ouvrir le projet qui
  // attend — toute sa ligne est ce bouton, et elle ne porte aucun autre geste.
  test("accueil : la ligne du projet qui attend est le bouton qui l'ouvre, sans autre geste", async () => {
    const { vue } = await homeQueued();
    const [line, ...others] = buttons(vue.element("accueil-projets")).filter(({ className }) => className === "ligne");
    assert.ok(line !== undefined && others.length === 0, "la ligne du projet n'est pas un bouton, ou elle porte un geste");
    assert.equal(line.children[0]?.dataset.ton, "jaune");
    assert.match(line.title, /1 decision awaits you/);
    assert.match(visible(line), /waiting for the chef/);
    line.click();
    await repos();
    assert.equal(vue.element("espace").textContent, "parade", "le clic n'ouvre pas le projet");
  });

  test("fiche : chaque geste que la table du chef propose pour la carte est un bouton, dans l'ordre de la table", async () => {
    const { racine: root } = await queuedCard();
    const proposes = actionsOfCard(card);
    assert.ok(proposes.length > 0, "la table ne propose aucun geste");
    const cardButtons = buttons(root).map(({ textContent }) => textContent);
    for (const { libelle: wording } of proposes) assert.ok(cardButtons.includes(wording), `« ${wording} » n'est pas un bouton de la fiche`);
    const [first] = proposes;
    const actions = root.dessous("section").find(({ className }) => className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
    assert.equal(buttons(actions)[0]?.textContent, first?.libelle);
    // Aucun geste n'est une ligne de texte : chaque ligne de geste porte son bouton.
    for (const line of actions.dessous("li")) assert.ok(buttons(line).length > 0 || line.dessous("select").length > 0, `le geste « ${line.dataset.geste} » n'est pas un bouton`);
  });

});
