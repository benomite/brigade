// Les onglets Rail et Second d'un projet ouvert sur un ordinateur neuf ne restent jamais vides (#1435, épique 1427) :
// Rail montre le rail du projet — celui que ses issues, labels et PR disent sur GitHub, le même que pour un projet servi ici, TODO en tête
// avec ses cartes et leurs gestes (#2076) —, ou, tant qu'il ne se lit pas, la phrase qui dit pourquoi, d'après le rail
// que sa station publie (#1432) ; Second montre le second qui part, ou, s'il ne part pas, pourquoi et
// chaque outil qui manque, et le bouton de la page qui dit comment l'obtenir (#1433). Les modules sont joués devant un faux document, puis la vue
// entière devant un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connexionGitHub } from "../../../runtime/src/appairage/stations-du-chef.ts";
import type { RailDuProjet } from "../../../runtime/src/appairage/rail-du-projet.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { GESTES_D_ATTENTE } from "../../src/attente.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits, type RailDuProjetLu } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { gestesDeCarte } from "../../src/gestes-fiche.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { DitDuSecond, Terminal } from "../../src/terminaux.ts";
import { poserOutilsDuSecond, PAGE_DE, REESSAYER_LE_SECOND } from "../../src/vue/outils-du-second.js";
import { RELIRE } from "../../src/vue/premier-lancement.js";
import { LECTURE_PUBLIEE, poserRailPublie, TABLEAU_EN_LECTURE, TABLEAU_NON_LU, type GestesDuRailPublie } from "../../src/vue/rail-publie.js";
import { carteDuTicket, Faux, jouerLaVue, ouvrirOnglet, repos, type Jouee, type Reponses } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARADE = "parade";
const PUBLIE = "2026-10-22T09:12:00.000Z";

// Le rail que parade-box publie pour parade, tel que le runtime le rend.
const TICKETS = [
  { ticket: 14, state: "en attente", title: "Login page", url: "https://github.com/benomite/parade/issues/14" },
  { ticket: 15, state: "pris", title: "Search the menu", url: "https://github.com/benomite/parade/issues/15" },
];
const liste = (tickets = TICKETS, online = true): RailDuProjetLu => ({
  state: "listed",
  project: PARADE,
  repository: "benomite/parade",
  station: { id: "gbox", name: "parade-box", online },
  publishedAt: PUBLIE,
  tickets,
  ...(tickets.length === 0 ? { reason: "The rail of parade holds no ticket." } : {}),
});
const CONNEXION_REQUISE: RailDuProjetLu = { state: "sign-in-required", project: PARADE, reason: "This computer is not signed in to GitHub, so brigade cannot read the rail of parade.", action: connexionGitHub("gh") };
const SANS_GH: RailDuProjetLu = {
  state: "unavailable",
  project: PARADE,
  cause: "gh-missing",
  reason: "The GitHub CLI `gh` is not installed on this computer, so brigade cannot read the rail of parade.",
  link: "https://cli.github.com",
  detail: "spawn gh ENOENT",
};
const NON_PUBLIE: RailDuProjetLu = { state: "unavailable", project: PARADE, cause: "not-published", reason: "The rail of parade is not published yet: update brigade on the stations that serve it." };
const SANS_TABLEAU = "There is no open Kitchen board in benomite/parade: the box serving it has not published one yet, or it was closed.";

function gestesNotes() {
  const faits: string[] = [];
  const geste: GestesDuRailPublie = {
    relire: () => void faits.push("relire"),
    seConnecter: () => void faits.push("seConnecter"),
    ouvrirLaPage: (url) => void faits.push(`page ${url}`),
  };
  return { faits, geste };
}
const texteDe = (poses: Faux[]) => poses.map((pose) => pose.textContent).join(" | ");
// Ce qui est posé sous un élément, en tableau : `descendants()` le rend un à un.
const sous = (pose: Faux | undefined): Faux[] => (pose === undefined ? [] : [...pose.descendants()]);
const boutons = (poses: Faux[]) => poses.flatMap((pose) => [pose, ...sous(pose)]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
const bouton = (poses: Faux[], texte: string) => boutons(poses).find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

describe("le rail que sa station publie dit pourquoi le tableau ne se dessine pas encore — sans colonnes à lui (#2076)", () => {
  test("publié, son tableau en lecture : une phrase le dit, la publication au survol, sans station ; aucune colonne", () => {
    const poses = poserRailPublie(doc, { lu: liste() }, gestesNotes().geste) as Faux[];
    // Une seule ligne, et son survol (« ? »).
    assert.deepEqual(poses.map((pose) => pose.textContent), [`${TABLEAU_EN_LECTURE(PARADE)}?`]);
    const survol = sous(poses[0]).find((pose) => pose.className === "aide")?.ariaLabel ?? "";
    assert.match(survol, /^last published at 2026-10-22 09:12 UTC, for benomite\/parade/);
    assert.doesNotMatch(texteDe(poses) + survol, /parade-box/);
    assert.equal(poses.flatMap((pose) => [pose, ...sous(pose)]).some((pose) => pose.className === "colonne"), false);
  });

  test("publié, son tableau illisible : la raison du tableau en une ligne, et « read again »", () => {
    const { faits, geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: liste([]), nonLu: SANS_TABLEAU }, geste) as Faux[];
    assert.match(texteDe(poses), new RegExp(`^${TABLEAU_NON_LU("There is no open Kitchen board")}`));
    bouton(poses, RELIRE).click();
    assert.deepEqual(faits, ["relire"]);
  });

  test("connexion requise : la phrase du runtime, et le bouton qui lance son geste, recommandé", () => {
    const { faits, geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: CONNEXION_REQUISE }, geste) as Faux[];
    assert.match(poses[0]?.textContent ?? "", /^This computer is not signed in to GitHub/);
    const connexion = bouton(poses, connexionGitHub("gh").label);
    assert.equal(connexion.className, "recommande");
    connexion.click();
    assert.deepEqual(faits, ["seConnecter"]);
  });

  test("indisponible : la phrase en une ligne — `gh` en code, son détail au survol —, la page qui la lève, et « read again »", () => {
    const { faits, geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: SANS_GH }, geste) as Faux[];
    const tete = poses[0] ?? assert.fail("pas de tête");
    assert.equal(sous(tete).find((pose) => pose.balise === "code")?.textContent, "gh");
    assert.equal(sous(tete).find((pose) => pose.className === "aide")?.ariaLabel, "spawn gh ENOENT");
    assert.deepEqual(boutons(poses).map((pose) => [pose.textContent, pose.className]), [["get the GitHub CLI", "recommande"], [RELIRE, ""]]);
    bouton(poses, "get the GitHub CLI").click();
    bouton(poses, RELIRE).click();
    assert.deepEqual(faits, ["page https://cli.github.com", "relire"]);

    // Sans page qui la lève : « read again » est le geste recommandé.
    const nonPublie = poserRailPublie(doc, { lu: NON_PUBLIE }, geste) as Faux[];
    assert.match(nonPublie[0]?.textContent ?? "", /^The rail of parade is not published yet/);
    assert.deepEqual(boutons(nonPublie).map((pose) => [pose.textContent, pose.className]), [[RELIRE, "recommande"]]);
  });

  test("la lecture en route le dit : l'onglet n'est jamais vide", () => {
    const poses = poserRailPublie(doc, {}, gestesNotes().geste) as Faux[];
    assert.deepEqual(poses.map((pose) => pose.textContent), [LECTURE_PUBLIEE]);
  });
});

// Ce que le runtime dit d'un second sans `claude` ni `gh`, sur ce poste (runtime/src/second/lancement.ts).
const EMPECHE: DitDuSecond = {
  reason: "The second cannot start: `claude` is missing on this computer.",
  tools: [
    { tool: "claude", reason: "`claude` is not on the PATH, and the second is a Claude Code session.", install: "Install Claude Code by running `curl -fsSL https://claude.ai/install.sh | bash` in a terminal, then restart brigade.", link: "https://code.claude.com/docs/en/setup" },
    { tool: "gh", reason: "`gh` is not on the PATH, and the second reads the tickets with it.", install: "Install the GitHub CLI by running `brew install gh` in a terminal, then restart brigade.", link: "https://cli.github.com" },
  ],
};
const MANQUE: DitDuSecond = { reason: "The second starts, but `gh` is missing on this computer, and what needs it will fail until it is installed.", tools: EMPECHE.tools.slice(1) };

describe("le second qui ne part pas, ou part sans tous ses outils", () => {
  test("empêché : chaque outil qui manque, nommé, et le bouton de sa page ; comment l'obtenir au survol, jamais à plat ; « try again », recommandé", () => {
    const faits: string[] = [];
    const pose = poserOutilsDuSecond(doc, EMPECHE, { bloque: true, reessayer: () => void faits.push("reessayer"), ouvrirLaPage: (url) => void faits.push(url) }) as unknown as Faux;
    const outils = sous(pose).filter((enfant) => enfant.className === "outil-manquant");
    assert.deepEqual(
      outils.map((outil) => sous(outil).find((enfant) => enfant.balise === "strong")?.textContent),
      ["claude", "gh"],
    );
    // Aucune commande à recopier à plat (#830) : le bouton de sa page porte le geste. Pourquoi le second en a besoin,
    // et comment l'obtenir, sont au survol seulement — sans accents graves.
    assert.equal(outils[0]?.textContent.includes("curl"), false);
    assert.equal(sous(outils[0]).some((enfant) => enfant.balise === "code"), false);
    assert.equal(
      sous(outils[0]).find((enfant) => enfant.className === "aide")?.ariaLabel,
      "claude is not on the PATH, and the second is a Claude Code session. Install Claude Code by running curl -fsSL https://claude.ai/install.sh | bash in a terminal, then restart brigade.",
    );
    // La raison est dans la note du second : elle ne se redit pas ici.
    assert.equal(pose.textContent.includes("The second cannot start"), false);
    assert.deepEqual(boutons([pose]).map((enfant) => [enfant.textContent, enfant.className]), [[PAGE_DE("claude"), ""], [PAGE_DE("gh"), ""], [REESSAYER_LE_SECOND, "recommande"]]);
    bouton([pose], PAGE_DE("gh")).click();
    bouton([pose], REESSAYER_LE_SECOND).click();
    assert.deepEqual(faits, ["https://cli.github.com", "reessayer"]);
  });

  test("parti sans `gh` : la raison en tête, `gh` et ce qui l'obtient — pas de « try again », il tourne", () => {
    const pose = poserOutilsDuSecond(doc, MANQUE, { bloque: false, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Faux;
    assert.match(pose.textContent, /^The second starts, but gh is missing on this computer/);
    assert.deepEqual(boutons([pose]).map((enfant) => enfant.textContent), [PAGE_DE("gh")]);
  });

  test("empêché sans outil nommé — un dossier absent, un lancement refusé : la note suffit, et « try again » reste", () => {
    const pose = poserOutilsDuSecond(doc, { reason: "The second cannot start: the project's folder /tmp/parade does not exist on this computer.", tools: [] }, { bloque: true, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Faux;
    assert.deepEqual(boutons([pose]).map((enfant) => enfant.textContent), [REESSAYER_LE_SECOND]);
  });
});

// La vue entière, pour un projet ouvert depuis le premier lancement : ni box, ni station sur cet ordinateur.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "new session", arrete: false };

async function ouvrir(reponses: Reponses) {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Le tableau de la cuisine de parade, tel que le process principal le passe à la vue (faits.ts) : #14 attend le chef, #15
// cuit. `rien` : rien n'attend le chef, et le bloc le dit.
const A = "2026-11-02T09:00:00.000Z";
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-02T08:59:00.000Z",
  dernierTick: "2026-11-02T08:58:00.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "en attente", titre: "Login page", url: "https://github.com/benomite/parade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: "Search the menu", url: "https://github.com/benomite/parade/issues/15", activite: null },
  ],
  cooks: [{ ticket: 15, titre: "Search the menu", station: "parade-box/claude" }],
  attend: [{ ticket: 14, titre: "Login page", url: "https://github.com/benomite/parade/issues/14" }],
};
const STATUS = ["awaiting   1 decision awaits the chef — for 2 h", "  #14  for 2 h  question — answer it on the issue  Login page", "end awaiting", ""].join("\n");
const RIEN = ["awaiting   nothing awaits the chef", "end awaiting", ""].join("\n");
function duTableau(faits: Faits, status: string): Dessinable {
  const tenus = tenirFaits(() => new Map());
  tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
}
const recevoir = (vue: Jouee, recue: Dessinable) => vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
const NON_LU: Dessinable = { projet: PARADE, demande: 0, a: A, titre: "NOT READ FROM GITHUB", erreur: SANS_TABLEAU, atteinte: true, cas: null, duTableau: true };
const colonnesDe = (vue: Jouee) => vue.element("rail").dessous("section").filter((section) => section.className === "colonne");
const nomsEtComptes = (vue: Jouee) => colonnesDe(vue).map((colonne) => colonne.children[0]?.children.map((pose) => pose.textContent));

describe("dans la vue : un projet servi par une autre station a le même rail, TODO en tête (#2076)", () => {
  test("le tableau lu : les six colonnes du rail, TODO en premier avec la carte qui attend le chef et son geste ; aucun rail publié", async () => {
    const vue = await ouvrir({ railDuProjet: () => liste(), gestesDeFiche: (carte) => gestesDeCarte(carte) });
    assert.deepEqual(vue.dernier("railDuProjet"), [PARADE]);
    // Tant que le tableau n'est pas lu, la page le dit — sans les colonnes du rail publié.
    assert.equal(vue.element("rail").textContent.startsWith(TABLEAU_EN_LECTURE(PARADE)), true);
    assert.deepEqual(colonnesDe(vue), []);

    recevoir(vue, duTableau(FAITS, STATUS));
    assert.deepEqual(nomsEtComptes(vue), [["On the rail", "0"], ["Taken", "1"], ["Pass", "0"], ["Todo", "1"], ["Waiting", "0"], ["Served", "0"]]);
    const todo = colonnesDe(vue)[3] ?? assert.fail("pas de Todo");
    const carte = carteDuTicket(vue, 14) ?? assert.fail("pas de carte #14");
    assert.equal(todo.contains(carte), true);
    // Son geste, comme sur un projet servi ici : le chef dit ce qu'elle attend d'un tiers.
    assert.ok(carte.dessous("button").some(({ textContent }) => textContent === "waiting for…"));
    assert.doesNotMatch(vue.element("rail").textContent, /last published|Reading the/);
  });

  test("rien n'attend le chef : TODO reste en tête, et le dit en une ligne", async () => {
    const vue = await ouvrir({ railDuProjet: () => liste() });
    recevoir(vue, duTableau({ ...FAITS, attend: [] }, RIEN));
    const todo = colonnesDe(vue)[3] ?? assert.fail("pas de Todo");
    assert.deepEqual(todo.children[0]?.children.map((pose) => pose.textContent), ["Todo", "0"]);
    assert.deepEqual(todo.dessous("p").map((pose) => pose.textContent), ["nothing awaits you"]);
  });

  test("le tableau ne se lit pas : sa raison en une ligne ; « read again » relit le tableau et le rail publié", async () => {
    let lectures = 0;
    const vue = await ouvrir({ railDuProjet: () => (++lectures, liste()) });
    recevoir(vue, NON_LU);
    const rail = vue.element("rail");
    assert.equal(rail.textContent.startsWith(TABLEAU_NON_LU(SANS_TABLEAU)), true);
    assert.deepEqual(colonnesDe(vue), []);
    bouton([rail], RELIRE).click();
    await repos();
    assert.equal(lectures, 2);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, 1);
    // Relu, le tableau pose le rail.
    recevoir(vue, duTableau(FAITS, STATUS));
    assert.equal(nomsEtComptes(vue)[3]?.[0], "Todo");
  });

  test("indisponible, la phrase du runtime ; « read again » relit — et Cooks garde sa phrase", async () => {
    let lectures = 0;
    const vue = await ouvrir({ railDuProjet: () => (++lectures === 1 ? SANS_GH : liste()) });
    const rail = vue.element("rail");
    assert.match(rail.textContent, /^The GitHub CLI gh is not installed on this computer/);
    bouton([rail], RELIRE).click();
    await repos();
    assert.equal(lectures, 2);
    assert.equal(rail.textContent.startsWith(TABLEAU_EN_LECTURE(PARADE)), true);
    await ouvrirOnglet(vue, "Cooks");
    assert.match(vue.element("rail").textContent, /^the rail is not read: no station is known to serve this project yet/);
  });

  test("connexion requise, son bouton lance la connexion du runtime ; connecté, le rail et le tableau sont relus", async () => {
    let lectures = 0;
    const vue = await ouvrir({ railDuProjet: () => (++lectures === 1 ? CONNEXION_REQUISE : liste()), seConnecterAGitHub: () => ({ connecte: true }) as never });
    bouton([vue.element("rail")], connexionGitHub("gh").label).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "seConnecterAGitHub").length, 1);
    assert.equal(lectures, 2);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, 1);
    assert.equal(vue.element("rail").textContent.startsWith(TABLEAU_EN_LECTURE(PARADE)), true);
  });
});

describe("dans la vue : l'onglet Second dit ce qui manque", () => {
  test("Second empêché : sa note dit pourquoi, chaque outil qui manque est sous elle, le terminal n'est pas montré ; « try again » le relance", async () => {
    const empeche: Terminal = { ...SECOND, arrete: true, note: EMPECHE.reason, empeche: EMPECHE };
    const vue = await ouvrir({ railDuProjet: () => liste(), espace: () => [empeche], ouvrirLaPage: () => true });
    // Sa phrase pose ses outils en code, sans accents graves.
    const note = vue.element("note-second");
    assert.equal(note.textContent, EMPECHE.reason.replaceAll("`", ""));
    assert.equal(sous(note).find((pose) => pose.balise === "code")?.textContent, "claude");
    const outils = vue.element("outils-du-second");
    assert.equal(outils.hidden, false);
    assert.equal(vue.element("fil").hidden, true);
    assert.match(outils.textContent, /^claude.*how to get claude/);
    assert.equal(outils.textContent.includes("Install Claude Code"), false);
    bouton([outils], PAGE_DE("claude")).click();
    bouton([outils], REESSAYER_LE_SECOND).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaPage"), ["https://code.claude.com/docs/en/setup"]);
    assert.deepEqual(vue.dernier("ecrire"), [1, ""]);
    // Reparti : le terminal revient, la colonne des outils s'en va.
    vue.dire("surEtat", { ...SECOND });
    assert.equal(outils.hidden, true);
    assert.equal(vue.element("fil").hidden, false);
  });

  test("Second parti sans `gh` : le terminal est montré, et ce qui manque se dit au-dessus", async () => {
    const vue = await ouvrir({ railDuProjet: () => liste(), espace: () => [{ ...SECOND, manque: MANQUE }] });
    assert.equal(vue.element("fil").hidden, false);
    assert.equal(vue.element("outils-du-second").hidden, false);
    assert.match(vue.element("outils-du-second").textContent, /^The second starts, but gh is missing/);
  });
});
