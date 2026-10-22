// Les onglets Rail et Second d'un projet ouvert sur un ordinateur neuf ne restent jamais vides (#1435, épique 1427) :
// Rail montre les tickets que sa station publie sur GitHub (#1432), rangés dans les colonnes du Mac, ou la phrase du
// runtime qui dit pourquoi ils ne se lisent pas ; Second montre le second qui part, ou, s'il ne part pas, pourquoi et
// chaque outil qui manque, et le bouton de la page qui dit comment l'obtenir (#1433). Les modules sont joués devant un faux document, puis la vue
// entière devant un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connexionGitHub } from "../../../runtime/src/appairage/stations-du-chef.ts";
import type { RailDuProjet } from "../../../runtime/src/appairage/rail-du-projet.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, rangerLeRailPublie, type RailDuProjetLu } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { DitDuSecond, Terminal } from "../../src/terminaux.ts";
import { poserOutilsDuSecond, PAGE_DE, REESSAYER_LE_SECOND } from "../../src/vue/outils-du-second.js";
import { RELIRE } from "../../src/vue/premier-lancement.js";
import { AUCUN, HORS_DES_COLONNES, LECTURE_PUBLIEE, poserRailPublie, PUBLIE_HORS_LIGNE, PUBLIE_PAR, type GestesDuRailPublie } from "../../src/vue/rail-publie.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos, type Reponses } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARADE = "parade";
const PUBLIE = "2026-10-22T09:12:00.000Z";

// Le rail que parade-box publie pour parade, tel que le runtime le rend, puis rangé par le process principal (faits.ts).
const TICKETS = [
  { ticket: 14, state: "en attente", title: "Login page", url: "https://github.com/benomite/parade/issues/14" },
  { ticket: 15, state: "pris", title: "Search the menu", url: "https://github.com/benomite/parade/issues/15" },
  { ticket: 16, state: "en pass", title: "Cart total", url: "https://github.com/benomite/parade/issues/16" },
  { ticket: 17, state: "WAITING", title: "Payment provider", url: "https://github.com/benomite/parade/issues/17" },
  { ticket: 18, state: "servi", title: "Footer links", url: "https://github.com/benomite/parade/issues/18" },
  { ticket: 19, state: "86", title: "Old prototype", url: "http://example.org/19" },
];
const liste = (tickets = TICKETS, online = true): Extract<RailDuProjet, { state: "listed" }> => ({
  state: "listed",
  project: PARADE,
  repository: "benomite/parade",
  station: { id: "gbox", name: "parade-box", online },
  publishedAt: PUBLIE,
  tickets,
  ...(tickets.length === 0 ? { reason: "The rail of parade, as parade-box publishes it, holds no ticket." } : {}),
});
const lu = (rail: Extract<RailDuProjet, { state: "listed" }>): RailDuProjetLu => ({ ...rail, range: rangerLeRailPublie(rail.tickets) });
const CONNEXION_REQUISE: RailDuProjetLu = { state: "sign-in-required", project: PARADE, reason: "This computer is not signed in to GitHub, so brigade cannot read the rail of parade, which its station publishes there.", action: connexionGitHub("gh") };
const SANS_GH: RailDuProjetLu = {
  state: "unavailable",
  project: PARADE,
  cause: "gh-missing",
  reason: "The GitHub CLI `gh` is not installed on this computer, so brigade cannot read the rail of parade.",
  link: "https://cli.github.com",
  detail: "spawn gh ENOENT",
};
const NON_PUBLIE: RailDuProjetLu = { state: "unavailable", project: PARADE, cause: "not-published", reason: "parade-box serves parade but publishes no rail yet: update brigade on parade-box." };

function gestesNotes() {
  const faits: string[] = [];
  const geste: GestesDuRailPublie = {
    relire: () => void faits.push("relire"),
    seConnecter: () => void faits.push("seConnecter"),
    ouvrirLaPage: (url) => void faits.push(`page ${url}`),
    ouvrirIssue: (ticket) => void faits.push(`issue ${ticket}`),
  };
  return { faits, geste };
}
const texteDe = (poses: Faux[]) => poses.map((pose) => pose.textContent).join(" | ");
// Ce qui est posé sous un élément, en tableau : `descendants()` le rend un à un.
const sous = (pose: Faux | undefined): Faux[] => (pose === undefined ? [] : [...pose.descendants()]);
const boutons = (poses: Faux[]) => poses.flatMap((pose) => [pose, ...sous(pose)]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
const bouton = (poses: Faux[], texte: string) => boutons(poses).find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);

describe("le rail que sa station publie, sur un ordinateur qui ne sert pas le projet", () => {
  test("listé : la tête dit d'où il vient, d'où au survol ; ses tickets dans les colonnes du Mac, un mot inconnu hors d'elles", () => {
    const { faits, geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: lu(liste()) }, geste) as Faux[];

    assert.equal(poses[0]?.className, "attendu");
    assert.match(poses[0]?.textContent ?? "", new RegExp(`^${PUBLIE_PAR("parade-box").replace(".", "\\.")}`));
    assert.match(sous(poses[0]).find((pose) => pose.className === "aide")?.ariaLabel ?? "", /^published by parade-box at 2026-10-22 09:12 UTC, for benomite\/parade/);
    const colonnes = (poses[1] ?? assert.fail("pas de colonnes")).children;
    assert.deepEqual(
      colonnes.map((colonne) => colonne.children[0]?.children.map((pose) => pose.textContent)),
      [["On the rail", "1"], ["Taken", "1"], ["Pass", "1"], ["WAITING", "1"], ["Served", "1"]],
    );
    assert.equal(colonnes[1]?.textContent.includes("#15"), true);
    assert.equal(colonnes[1]?.textContent.includes("Search the menu"), true);
    // TODO n'y est pas : ce qui attend le chef ne se publie pas. « 86 » se dit en mots, hors des colonnes, sans lien.
    assert.equal(poses[2]?.textContent, HORS_DES_COLONNES);
    assert.match(poses[3]?.textContent ?? "", /^#19set aside/);
    assert.equal(sous(poses[3]).some((pose) => pose.balise === "button"), false);
    // Le numéro d'une carte ouvre son issue.
    bouton(poses, "#15").click();
    assert.deepEqual(faits, ["issue 15"]);
  });

  test("une colonne vide le dit ; une station hors ligne aussi, en tête — c'est le dernier rail qu'elle a publié", () => {
    const { geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: lu(liste(TICKETS.slice(1, 2), false)) }, geste) as Faux[];
    assert.match(poses[0]?.textContent ?? "", new RegExp(`^${PUBLIE_HORS_LIGNE("parade-box").replace(".", "\\.")}`));
    assert.equal(poses[1]?.children[0]?.children[1]?.textContent, AUCUN);
  });

  test("aucun ticket : la phrase du runtime, et « read again »", () => {
    const { faits, geste } = gestesNotes();
    const poses = poserRailPublie(doc, { lu: lu(liste([])) }, geste) as Faux[];
    assert.match(texteDe(poses), /^The rail of parade, as parade-box publishes it, holds no ticket\./);
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
    assert.match(nonPublie[0]?.textContent ?? "", /^parade-box serves parade but publishes no rail yet/);
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
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }], hotes: [] }),
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
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "new session", arrete: false };

async function ouvrir(reponses: Reponses) {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

describe("dans la vue : l'onglet Rail lit le rail publié, l'onglet Second dit ce qui manque", () => {
  test("Rail : le rail publié est lu à l'ouverture, ses colonnes posées ; un numéro ouvre son issue", async () => {
    const vue = await ouvrir({ railDuProjet: () => lu(liste()), ouvrirIssue: () => true });
    assert.deepEqual(vue.dernier("railDuProjet"), [PARADE]);
    const rail = vue.element("rail");
    assert.equal(rail.hidden, false);
    assert.match(rail.textContent, /^The rail as parade-box publishes it on GitHub\./);
    assert.equal(sous(rail).filter((pose) => pose.className === "colonne").length, 5);
    bouton([rail], "#16").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 16]);
  });

  test("Rail : indisponible, la phrase du runtime ; « read again » relit — et Cooks garde sa phrase", async () => {
    let lectures = 0;
    const vue = await ouvrir({ railDuProjet: () => (++lectures === 1 ? SANS_GH : lu(liste())) });
    const rail = vue.element("rail");
    assert.match(rail.textContent, /^The GitHub CLI gh is not installed on this computer/);
    bouton([rail], RELIRE).click();
    await repos();
    assert.equal(lectures, 2);
    assert.match(rail.textContent, /^The rail as parade-box publishes it on GitHub\./);
    await ouvrirOnglet(vue, "Cooks");
    assert.match(vue.element("rail").textContent, /^the rail is not read: no station is known to serve this project yet/);
  });

  test("Rail : connexion requise, son bouton lance la connexion du runtime ; connecté, le rail est relu", async () => {
    let lectures = 0;
    const vue = await ouvrir({ railDuProjet: () => (++lectures === 1 ? CONNEXION_REQUISE : lu(liste())), seConnecterAGitHub: () => ({ connecte: true }) as never });
    bouton([vue.element("rail")], connexionGitHub("gh").label).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "seConnecterAGitHub").length, 1);
    assert.equal(lectures, 2);
    assert.match(vue.element("rail").textContent, /^The rail as parade-box publishes it on GitHub\./);
  });

  test("Second empêché : sa note dit pourquoi, chaque outil qui manque est sous elle, le terminal n'est pas montré ; « try again » le relance", async () => {
    const empeche: Terminal = { ...SECOND, arrete: true, note: EMPECHE.reason, empeche: EMPECHE };
    const vue = await ouvrir({ railDuProjet: () => lu(liste()), espace: () => [empeche], ouvrirLaPage: () => true });
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
    const vue = await ouvrir({ railDuProjet: () => lu(liste()), espace: () => [{ ...SECOND, manque: MANQUE }] });
    assert.equal(vue.element("fil").hidden, false);
    assert.equal(vue.element("outils-du-second").hidden, false);
    assert.match(vue.element("outils-du-second").textContent, /^The second starts, but gh is missing/);
  });
});
