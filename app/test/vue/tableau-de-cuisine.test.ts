// L'onglet Rail d'un projet lu de son tableau de la cuisine sur GitHub (#1588, épique 1580) : ce qui attend le chef —
// chaque ligne avec son bouton, sa page sur GitHub — et l'état de la cuisine, sans `ssh` ni tailnet ; l'âge de la lecture, qui suit chaque
// relecture ; et, quand le tableau ne se lit pas, une phrase et le lien direct — seulement quand le projet en a un —,
// jamais un écran vide. Le module est joué devant un faux document, puis la vue entière devant un faux pont
// (aides/fausse-vue.ts), avec des lectures rendues par le module même de l'app (app/src/tableau/lecture.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { ENVOYER } from "../../src/vue/carte-todo.js";
import { EFFACER, EN_ATTENTE, MERGER, PRIS, PRIX, RAISON, REFUSE, RENVOYER, RETIRER } from "../../src/vue/gestes-du-tableau.js";
import { RELIRE } from "../../src/vue/premier-lancement.js";
import {
  COLONNE_DE_LA_CUISINE,
  COLONNE_DE_LA_FILE,
  gesteDe,
  LECTURE_DU_TABLEAU,
  LIEN_DIRECT,
  OUVRIR_L_ISSUE,
  OUVRIR_LA_PR,
  OUVRIR_LE_TABLEAU,
  PAR_LE_LIEN_DIRECT,
  poserLeTableauDeCuisine,
  RETOUR_AU_TABLEAU,
  RIEN_N_ATTEND,
  type GestesDuTableau,
} from "../../src/vue/tableau-de-cuisine.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";
import { GENERE_LE, ISSUE, TABLEAU } from "../tableau/fixture.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARADE = "parade";
// L'app lit le tableau 125 s après que la box l'a écrit.
const LU_LE = new Date(GENERE_LE.getTime() + 125_000);

// Ce que la lecture de l'app rend devant un GitHub qui répond `reponse`, ou qui ne répond pas.
const lire = (reponse: ReponseGitHub | Error, maintenant = LU_LE): Promise<LectureDuTableauDuDepot> =>
  lireLeTableauDuDepot({
    depot: "chef/parade",
    appeler: async () => {
      if (reponse instanceof Error) throw reponse;
      return reponse;
    },
    maintenant: () => maintenant,
  });
const LU = (await lire({ status: 200, data: [ISSUE] })) as TableauLu;
const INJOIGNABLE = await lire(new Error("getaddrinfo ENOTFOUND api.github.com"));
const PRIVE = await lire({ status: 404, data: { message: "Not Found" } });
const SANS_TABLEAU = await lire({ status: 200, data: [] });

function gestesNotes() {
  const faits: string[] = [];
  const geste: GestesDuTableau = { relire: () => void faits.push("relire"), prendreLeLienDirect: () => void faits.push("direct"), ouvrir: (url) => void faits.push(url) };
  return { faits, geste };
}
const sous = (pose: Faux | undefined): Faux[] => (pose === undefined ? [] : [...pose.descendants()]);
const boutons = (poses: Faux[]) => poses.flatMap((pose) => [pose, ...sous(pose)]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
const bouton = (poses: Faux[], texte: string) => boutons(poses).find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const aides = (pose: Faux | undefined) => sous(pose).filter((enfant) => enfant.className === "aide").map((enfant) => enfant.ariaLabel);
const poser = (etat: Partial<Parameters<typeof poserLeTableauDeCuisine>[1]>, geste = gestesNotes().geste) =>
  poserLeTableauDeCuisine(doc, { projet: PARADE, lienDirect: true, maintenant: LU_LE.getTime(), ...etat }, geste) as Faux[];

describe("le tableau de la cuisine, posé par son module", () => {
  test("lu : ce qui t'attend en tête, d'où il vient au survol ; l'âge de la lecture ; la file, chaque ligne et son bouton ; la cuisine", () => {
    const { faits, geste } = gestesNotes();
    const poses = poser({ lu: LU }, geste);
    const [tete, gestes, grille] = poses;
    assert.equal(tete?.className, "attendu");
    assert.match(tete?.textContent ?? "", /^2 things await you on parade\./);
    assert.match(aides(tete)[0] ?? "", /^From the Kitchen board of chef\/parade \(issue 7\), written by the box at 10:04 UTC and read on GitHub at 10:06 UTC/);
    assert.equal(sous(gestes).find((pose) => pose.className === "age")?.textContent, "read 2 min ago");
    const [file, cuisine] = grille?.children ?? [];
    assert.deepEqual(file?.children[0]?.children.map((pose) => pose.textContent), [COLONNE_DE_LA_FILE, "2"]);
    assert.equal(file?.dataset.attend, "");
    const cartes = sous(file).filter((pose) => pose.className === "bon");
    assert.equal(cartes.length, 2);
    // Le nom, le titre, ce qui attend, puis le bouton de la ligne — aucune commande, ni à plat ni au survol : la PR à
    // merger, l'issue où répondre à la carte, chacune sa page sur GitHub, son adresse au survol du bouton.
    assert.match(cartes[0]?.textContent ?? "", new RegExp(`^#18waiting 2 hShow the queue on the phonegreen, waiting for your merge${OUVRIR_LA_PR}$`));
    assert.equal(cartes.some((carte) => carte.textContent.includes("brigade")), false);
    assert.deepEqual([...aides(cartes[0]), ...aides(cartes[1])], []);
    assert.deepEqual(boutons(cartes.slice(0, 1)).map((pose) => pose.textContent), [OUVRIR_LA_PR]);
    assert.deepEqual(boutons(cartes.slice(1)).map((pose) => pose.textContent), [OUVRIR_L_ISSUE]);
    assert.equal(boutons(cartes.slice(0, 1))[0]?.title, "https://github.com/chef/parade/pull/40");
    bouton(cartes.slice(0, 1), OUVRIR_LA_PR).click();
    bouton(cartes.slice(1), OUVRIR_L_ISSUE).click();
    assert.deepEqual(faits, ["https://github.com/chef/parade/pull/40", "https://github.com/chef/parade/issues/21"]);
    // Le titre d'un ticket reste du texte : `<the>` n'est pas une balise.
    assert.equal(sous(cartes[1]).find((pose) => pose.balise === "strong")?.textContent, "Pick a colour for <the> board");
    assert.match(file?.textContent ?? "", /without a grant, 1 green delivery stopped at the pass$/);
    // La cuisine : son état en un mot, puis chaque rubrique de `status`, son titre et ses lignes.
    assert.deepEqual(cuisine?.children[0]?.children.map((pose) => pose.textContent), [COLONNE_DE_LA_CUISINE, "open"]);
    assert.equal(cuisine?.dataset.ton, "vert");
    const rubriques = sous(cuisine).find((pose) => pose.balise === "dl");
    assert.deepEqual(
      rubriques?.children.map((pose) => pose.textContent),
      ["project", "parade (chef/parade) · open", "base", "GREEN on abc1234, 4 min ago", "cooks", "1 running — box/claude: 2 at most\n#31  31-aa  opus / high"],
    );
  });

  test("l'âge suit l'heure de l'écran : la lecture vieillit sans qu'aucune n'arrive", () => {
    const age = (maintenant: number) => sous(poser({ lu: LU, maintenant })[1]).find((pose) => pose.className === "age")?.textContent;
    assert.equal(age(LU_LE.getTime()), "read 2 min ago");
    // Une horloge d'écran en retard sur la lecture ne la rajeunit pas.
    assert.equal(age(LU_LE.getTime() - 85_000), "read 2 min ago");
    assert.equal(age(LU_LE.getTime() + 300_000), "read 7 min ago");
    assert.equal(age(LU_LE.getTime() + 3_600_000), "read 1 h ago");
  });

  test("lu, avec un lien direct : « read again » et « use the direct link », aucun recommandé ; sans lien, « read again » seul", () => {
    const { faits, geste } = gestesNotes();
    const avec = poser({ lu: LU }, geste).slice(0, 2);
    assert.deepEqual(boutons(avec).map((pose) => [pose.textContent, pose.className]), [[RELIRE, ""], [LIEN_DIRECT, ""]]);
    bouton(avec, RELIRE).click();
    bouton(avec, LIEN_DIRECT).click();
    assert.deepEqual(faits, ["relire", "direct"]);
    assert.deepEqual(boutons(poser({ lu: LU, lienDirect: false }).slice(0, 2)).map((pose) => pose.textContent), [RELIRE]);
  });

  test("une ligne qui n'est à aucun ticket s'ouvre sur le tableau même : son bouton le dit", () => {
    const panne = { ...TABLEAU.file[0]!, nom: "breaker", ticket: null, titre: null, quoi: "disjoncteur", decision: null, ligne: "the breaker is open — `brigade parade guardrails resume`" };
    const lu: TableauLu = { ...LU, file: [panne], pages: ["https://github.com/chef/parade/issues/7"] };
    const carte = sous(poser({ lu })[2]).find((pose) => pose.className === "bon");
    assert.equal(carte?.textContent, `breakerwaiting 2 hthe breaker is open${OUVRIR_LE_TABLEAU}`);
  });

  test("rien n'attend : la tête le dit, et TODO aussi", () => {
    const vide: TableauLu = { ...LU, file: [], bilans: [] };
    const poses = poser({ lu: vide });
    assert.match(poses[0]?.textContent ?? "", /^Nothing awaits you on parade\./);
    const file = poses[2]?.children[0];
    assert.deepEqual(file?.children[0]?.children.map((pose) => pose.textContent), [COLONNE_DE_LA_FILE, "0"]);
    assert.equal(file?.children[1]?.textContent, RIEN_N_ATTEND);
  });

  test("illisible, avec un lien direct : la phrase de la lecture, « use the direct link » recommandé, puis « read again »", () => {
    const { faits, geste } = gestesNotes();
    const poses = poser({ lu: PRIVE }, geste);
    assert.match(poses[0]?.textContent ?? "", /^GitHub does not show chef\/parade \(HTTP 404\): the repository is private/);
    assert.match(aides(poses[0])[0] ?? "", /^tried at 10:06 UTC — the app reads the Kitchen board on GitHub/);
    assert.deepEqual(boutons(poses).map((pose) => [pose.textContent, pose.className]), [[LIEN_DIRECT, "recommande"], [RELIRE, ""]]);
    bouton(poses, LIEN_DIRECT).click();
    assert.deepEqual(faits, ["direct"]);
    assert.equal(poses.length, 2);
  });

  test("illisible, sans lien direct : la phrase, et « read again » seul, recommandé — l'écran n'est jamais vide", () => {
    const poses = poser({ lu: SANS_TABLEAU, lienDirect: false });
    assert.equal(poses[0]?.textContent, "There is no open Kitchen board in chef/parade: the box serving it has not published one yet, or it was closed.?");
    assert.deepEqual(boutons(poses).map((pose) => [pose.textContent, pose.className]), [[RELIRE, "recommande"]]);
  });

  test("GitHub injoignable : la phrase sans l'erreur du réseau, qui passe au survol", () => {
    const poses = poser({ lu: INJOIGNABLE });
    assert.equal(sous(poses[0]).find((pose) => pose.balise === "span")?.textContent, "GitHub could not be reached to read the Kitchen board of chef/parade.");
    assert.equal(poses[0]?.textContent.includes("ENOTFOUND"), false);
    assert.match(aides(poses[0])[0] ?? "", /^getaddrinfo ENOTFOUND api\.github\.com — tried at/);
  });

  test("une relecture qui échoue garde la dernière lecture réussie dessous, avec son âge", () => {
    const poses = poser({ lu: INJOIGNABLE, dernier: LU, maintenant: LU_LE.getTime() + 60_000 });
    assert.equal(poses.length, 4);
    assert.equal(sous(poses[2]).find((pose) => pose.className === "age")?.textContent, "read 3 min ago");
    assert.equal(sous(poses[3]).filter((pose) => pose.className === "bon").length, 2);
  });

  test("la première lecture en route le dit", () => {
    assert.deepEqual(poser({}).map((pose) => pose.textContent), [LECTURE_DU_TABLEAU]);
  });

  test("le geste qui finit une ligne se détache ; une ligne sans geste final reste entière", () => {
    assert.deepEqual(gesteDe("green, waiting for your merge — `brigade parade pass 18`"), { dit: "green, waiting for your merge", geste: "brigade parade pass 18" });
    assert.deepEqual(gesteDe("PR closed without merge — to decide: remove `fire`, or close the issue — `brigade parade pass 9`"), { dit: "PR closed without merge — to decide: remove `fire`, or close the issue", geste: "brigade parade pass 9" });
    assert.deepEqual(gesteDe("the station has no Max connection"), { dit: "the station has no Max connection", geste: "" });
    assert.deepEqual(gesteDe("`brigade parade guardrails resume`"), { dit: "`brigade parade guardrails resume`", geste: "" });
  });
});

// La vue entière : `parade`, avec sa box (un lien direct) ou sans rien qui la joigne — ni box ni station sur ce poste.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "new session", arrete: false };
const demarrage = (projet: Projet) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [projet], hotes: projet.box === undefined ? [] : [projet.box.hote] }),
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
const SANS_LIEN: Projet = { nom: PARADE, dossier: "/tmp/parade", depot: "chef/parade" };
const AVEC_BOX: Projet = { ...SANS_LIEN, box: { hote: "box" } };

async function ouvrir(projet: Projet, lectures: () => LectureDuTableauDuDepot | undefined) {
  const vue = await jouerLaVue({ demarrage: demarrage(projet), espace: () => [SECOND], tableauDuProjet: lectures, railDuProjet: () => assert.fail("le rail publié n'est pas montré") as never });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

describe("dans la vue : l'onglet Rail lit le tableau de la cuisine", () => {
  test("sans ssh ni tailnet : le tableau est lu à l'ouverture, la file et la cuisine posées, sans lien direct à offrir", async () => {
    const vue = await ouvrir(SANS_LIEN, () => LU);
    assert.deepEqual(vue.dernier("tableauDuProjet"), [PARADE]);
    const rail = vue.element("rail");
    assert.equal(rail.hidden, false);
    assert.match(rail.textContent, /^2 things await you on parade\./);
    assert.match(rail.textContent, /read \d+ (s|min|h|d) ago/);
    assert.equal(sous(rail).filter((pose) => pose.className === "bon").length, 2);
    assert.match(rail.textContent, /Kitchenopenprojectparade \(chef\/parade\) · open/);
    // Chaque ligne : sa page, puis ses décisions (#1590) — la livraison de #18 se merge, se renvoie ou se retire ; la carte
    // de #21 a ses choix, son champ et « send », et se retire.
    assert.deepEqual(boutons([rail]).map((pose) => pose.textContent), [RELIRE, OUVRIR_LA_PR, MERGER, RENVOYER, RETIRER, OUVRIR_L_ISSUE, "Green", "Blue", ENVOYER, RETIRER]);
    // Le bouton d'une ligne ouvre sa page par le pont, qui ne l'ouvre que si la lecture l'a donnée.
    bouton([rail], OUVRIR_LA_PR).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirDuTableau"), [PARADE, "https://github.com/chef/parade/pull/40"]);
    // Aucun `ssh` n'est demandé pour ce projet : il n'en a pas.
    assert.equal(vue.appels.some(({ geste }) => geste === "relireBox"), false);
  });

  test("« read again » relit le tableau, et l'âge dit celui de la nouvelle lecture", async () => {
    const plusRecent: TableauLu = { ...LU, age: 40, luLe: new Date().toISOString() };
    const ancien: TableauLu = { ...LU, age: 7200, luLe: new Date().toISOString() };
    let lectures = 0;
    const vue = await ouvrir(SANS_LIEN, () => (++lectures === 1 ? ancien : plusRecent));
    const rail = vue.element("rail");
    assert.equal(sous(rail).find((pose) => pose.className === "age")?.textContent, "read 2 h ago");
    bouton([rail], RELIRE).click();
    await repos();
    assert.equal(lectures, 2);
    assert.equal(sous(rail).find((pose) => pose.className === "age")?.textContent, "read 40 s ago");
  });

  test("illisible, sans lien direct : une phrase, « read again » — et le rail publié n'est pas montré à sa place", async () => {
    const vue = await ouvrir(SANS_LIEN, () => PRIVE);
    const rail = vue.element("rail");
    assert.match(rail.textContent, /^GitHub does not show chef\/parade \(HTTP 404\)/);
    assert.deepEqual(boutons([rail]).map((pose) => [pose.textContent, pose.className]), [[RELIRE, "recommande"]]);
  });

  test("illisible, avec sa box : « use the direct link » lit le rail par ssh, une ligne en tête ramène au tableau, relu", async () => {
    let lectures = 0;
    const vue = await ouvrir(AVEC_BOX, () => (++lectures === 1 ? INJOIGNABLE : LU));
    const rail = vue.element("rail");
    assert.match(rail.textContent, /^GitHub could not be reached to read the Kitchen board of chef\/parade\./);
    bouton([rail], LIEN_DIRECT).click();
    await repos();
    // Le rail se lit comme avant le tableau : par `facts` sur la box, relue tout de suite.
    assert.ok(vue.appels.some(({ geste }) => geste === "relireBox"));
    assert.match(rail.textContent, new RegExp(`^${PAR_LE_LIEN_DIRECT.replace(".", "\\.")}${RETOUR_AU_TABLEAU}`));
    assert.equal(rail.textContent.includes("Kitchen board of chef/parade"), false);
    bouton([rail], RETOUR_AU_TABLEAU).click();
    await repos();
    assert.equal(lectures, 2);
    assert.match(rail.textContent, /^2 things await you on parade\./);
    // Lu, le lien direct reste offert, en second geste ; puis le bouton de chaque ligne.
    // Merger la livraison verte de #18 est le geste recommandé (#1590).
    assert.deepEqual(boutons([rail]).map((pose) => [pose.textContent, pose.className]), [
      [RELIRE, ""],
      [LIEN_DIRECT, ""],
      [OUVRIR_LA_PR, "pr"],
      [MERGER, "recommande"],
      [RENVOYER, ""],
      [RETIRER, ""],
      [OUVRIR_L_ISSUE, "pr"],
      ["Green", "choix"],
      ["Blue", "choix"],
      [ENVOYER, ""],
      [RETIRER, ""],
    ]);
  });

  test("l'onglet Cooks reste celui du lien direct : le tableau ne s'y pose pas", async () => {
    const vue = await ouvrir(AVEC_BOX, () => LU);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(vue.element("rail").textContent.includes("things await you"), false);
    await ouvrirOnglet(vue, "Rail");
    assert.match(vue.element("rail").textContent, /^2 things await you on parade\./);
  });

});

// Les décisions du chef, prises sur les lignes du tableau (#1590) : postées par le pont en commentaire sur l'issue du
// tableau — ni `ssh` ni tailnet —, puis suivies dans les lectures du tableau par l'id du commentaire posté.
const POSTE = { etat: "pending", commentaire: { id: 4242, url: "https://github.com/chef/parade/issues/7#issuecomment-4242" } } as const;
const repondu = (etat: "pris" | "refuse", reponse: string, base: TableauLu = LU): TableauLu => ({
  ...base,
  gestes: [{ commentaire: 4242, url: POSTE.commentaire.url, le: "2026-10-23T10:05:00.000Z", geste: "merge", ticket: 18, etat, traiteLe: "2026-10-23T10:05:30.000Z", reponse }],
});
const bonDe = (rail: Faux, nom: string) => sous(rail).find((pose) => pose.className === "bon" && pose.children[0]?.children[0]?.textContent === nom) ?? assert.fail(`pas de ligne ${nom}`);
const ligneDuGesteDe = (rail: Faux, nom: string) => sous(bonDe(rail, nom)).find((pose) => pose.className === "geste-du-tableau");

describe("dans la vue : les décisions de la file du tableau", () => {
  test("merger d'une ligne, sans ssh ni tailnet : confirmé avec son prix, posté, `pending` ; puis `taken into account` à la lecture qui le dit", async () => {
    let lu: TableauLu = LU;
    const vue = await jouerLaVue({ demarrage: demarrage(SANS_LIEN), espace: () => [SECOND], tableauDuProjet: () => lu, gesteAuTableau: () => POSTE });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const rail = vue.element("rail");
    bouton([bonDe(rail, "#18")], MERGER).click();
    await repos();
    // La confirmation : ce que fait le geste, son prix en une ligne ; rien n'est parti.
    const confirmation = sous(bonDe(rail, "#18")).find((pose) => pose.className === "confirmation");
    assert.equal(confirmation?.children[0]?.textContent, "Merge the PR of #18?");
    assert.equal(confirmation?.children[1]?.textContent, PRIX.merge);
    assert.equal(vue.appels.some(({ geste }) => geste === "gesteAuTableau"), false);
    bouton([bonDe(rail, "#18")], "yes, merge it").click();
    await repos();
    assert.deepEqual(vue.dernier("gesteAuTableau"), [PARADE, { geste: "merge", ticket: 18 }]);
    assert.match(ligneDuGesteDe(rail, "#18")?.textContent ?? "", new RegExp(`^${MERGER}: ${EN_ATTENTE}`));
    // En attente de la box, la ligne n'offre plus ses décisions : un second merge ne part pas.
    assert.deepEqual(boutons([bonDe(rail, "#18")]).map((pose) => pose.textContent), [OUVRIR_LA_PR]);
    assert.equal(vue.appels.some(({ geste }) => geste === "relireBox"), false);
    lu = repondu("pris", "**Done** — [merge #18](https://github.com/chef/parade/issues/7#issuecomment-4242) — cost: the PR is merged");
    bouton([rail], RELIRE).click();
    await repos();
    const pris = ligneDuGesteDe(rail, "#18");
    assert.match(pris?.textContent ?? "", new RegExp(`^${MERGER}: ${PRIS}`));
    // La ligne de la box, et ce qu'elle a coûté, passent au survol.
    assert.deepEqual(aides(pris), ["Done — merge #18 — cost: the PR is merged"]);
  });

  test("refusé par la box : `refused` et sa ligne, et les décisions reviennent", async () => {
    let lu: TableauLu = LU;
    const vue = await jouerLaVue({ demarrage: demarrage(SANS_LIEN), espace: () => [SECOND], tableauDuProjet: () => lu, gesteAuTableau: () => POSTE });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const rail = vue.element("rail");
    bouton([bonDe(rail, "#18")], MERGER).click();
    await repos();
    bouton([bonDe(rail, "#18")], "yes, merge it").click();
    await repos();
    lu = repondu("refuse", "**Not done** — [merge #18](https://github.com/chef/parade/issues/7#issuecomment-4242): GitHub refused the merge of https://github.com/chef/parade/pull/40: the base branch moved");
    bouton([rail], RELIRE).click();
    await repos();
    assert.equal(ligneDuGesteDe(rail, "#18")?.textContent, `${MERGER}: ${REFUSE} — Not done — merge #18: GitHub refused the merge of https://github.com/chef/parade/pull/40: the base branch moved`);
    assert.deepEqual(boutons([bonDe(rail, "#18")]).map((pose) => [pose.textContent, pose.disabled]), [[OUVRIR_LA_PR, false], [MERGER, false], [RENVOYER, false], [RETIRER, false]]);
  });

  test("un post qui échoue : une phrase sur la ligne, ce que GitHub a dit au survol, et les boutons restent", async () => {
    let posts = 0;
    const vue = await jouerLaVue({
      demarrage: demarrage(SANS_LIEN),
      espace: () => [SECOND],
      tableauDuProjet: () => LU,
      gesteAuTableau: () => (++posts === 1 ? { etat: "failed", raison: "The gesture could not be posted on the Kitchen board of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration." } : POSTE),
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const rail = vue.element("rail");
    bouton([bonDe(rail, "#18")], RETIRER).click();
    await repos();
    bouton([bonDe(rail, "#18")], "yes, remove it").click();
    await repos();
    const echec = ligneDuGesteDe(rail, "#18");
    assert.equal(echec?.dataset.etat, "echec");
    assert.equal(sous(echec).find((pose) => pose.balise === "span" && pose.className === "")?.textContent, "The gesture could not be posted on the Kitchen board of chef/parade.");
    assert.deepEqual(aides(echec), ["GitHub refused the comment (HTTP 403): Resource not accessible by integration"]);
    assert.deepEqual(boutons([bonDe(rail, "#18")]).map((pose) => [pose.textContent, pose.disabled]), [[OUVRIR_LA_PR, false], [MERGER, false], [RENVOYER, false], [RETIRER, false]]);
    // Ils resservent : le même geste, posté cette fois.
    bouton([bonDe(rail, "#18")], RETIRER).click();
    await repos();
    bouton([bonDe(rail, "#18")], "yes, remove it").click();
    await repos();
    assert.equal(posts, 2);
    assert.deepEqual(vue.dernier("gesteAuTableau"), [PARADE, { geste: "set-aside", ticket: 18 }]);
    assert.equal(ligneDuGesteDe(rail, "#18")?.dataset.etat, "pending");
  });

  test("renvoyer en cuisine avec sa raison ; répondre à la carte dans ses mots, ou d'un choix", async () => {
    const vue = await jouerLaVue({ demarrage: demarrage(SANS_LIEN), espace: () => [SECOND], tableauDuProjet: () => LU, gesteAuTableau: () => POSTE });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const rail = vue.element("rail");
    bouton([bonDe(rail, "#18")], RENVOYER).click();
    await repos();
    const raison = sous(bonDe(rail, "#18")).find((pose) => pose.balise === "textarea") ?? assert.fail("pas de champ de raison");
    assert.equal(raison.placeholder, RAISON);
    raison.value = "  the header row is missing ";
    raison.declencher("input");
    bouton([bonDe(rail, "#18")], "yes, send it back").click();
    await repos();
    assert.deepEqual(vue.dernier("gesteAuTableau"), [PARADE, { geste: "send-back", ticket: 18, raison: "the header row is missing" }]);
    // La carte de #21 : le texte libre part par « send ».
    const reponse = sous(bonDe(rail, "#21")).find((pose) => pose.balise === "textarea") ?? assert.fail("pas de champ de réponse");
    reponse.value = "Neither: a dark grey";
    reponse.declencher("input");
    bouton([bonDe(rail, "#21")], ENVOYER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteAuTableau"), [PARADE, { geste: "answer", ticket: 21, reponse: "Neither: a dark grey" }]);
    assert.match(ligneDuGesteDe(rail, "#21")?.textContent ?? "", /^your answer: pending/);
  });

  test("un choix de la carte est la réponse, sans confirmation ; la ligne qui quitte la file garde son geste jusqu'à « clear »", async () => {
    let lu: TableauLu = LU;
    const vue = await jouerLaVue({ demarrage: demarrage(SANS_LIEN), espace: () => [SECOND], tableauDuProjet: () => lu, gesteAuTableau: () => POSTE });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const rail = vue.element("rail");
    bouton([bonDe(rail, "#21")], "Blue").click();
    await repos();
    assert.deepEqual(vue.dernier("gesteAuTableau"), [PARADE, { geste: "choose", ticket: 21, choix: 2 }]);
    assert.match(ligneDuGesteDe(rail, "#21")?.textContent ?? "", /^“Blue”: pending/);
    // La box l'a pris, et la carte a quitté la file : le geste se dit encore, sous elle.
    lu = repondu("pris", "**Done** — [choose #21](…)", { ...LU, file: LU.file.slice(0, 1), pages: LU.pages.slice(0, 1) });
    bouton([rail], RELIRE).click();
    await repos();
    const parti = sous(rail).find((pose) => pose.className === "gestes-partis") ?? assert.fail("pas de geste parti");
    assert.match(parti.textContent, new RegExp(`^#21no longer in the queuechoice 2: ${PRIS}`));
    bouton([parti], EFFACER).click();
    await repos();
    assert.equal(sous(rail).some((pose) => pose.className === "gestes-partis"), false);
  });
});

describe("dans la vue : un pont d'avant le tableau", () => {
  test("un pont qui ne lit pas de tableau : l'onglet garde son rail d'avant, et le tableau n'est plus demandé", async () => {
    const vue = await jouerLaVue({ demarrage: demarrage(AVEC_BOX), espace: () => [SECOND] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.match(vue.element("rail").textContent, /^the rail: first read of/);
    await ouvrirOnglet(vue, "Cooks");
    await ouvrirOnglet(vue, "Rail");
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "tableauDuProjet").length, 1);
  });
});
