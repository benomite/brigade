// L'onglet Rail d'un projet lu de son tableau de la cuisine sur GitHub (#1588, épique 1580) : ce qui attend le chef —
// chaque ligne avec son geste — et l'état de la cuisine, sans `ssh` ni tailnet ; l'âge de la lecture, qui suit chaque
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
import { RELIRE } from "../../src/vue/premier-lancement.js";
import {
  COLONNE_DE_LA_CUISINE,
  COLONNE_DE_LA_FILE,
  GESTE_DE_LA_LIGNE,
  gesteDe,
  LECTURE_DU_TABLEAU,
  LIEN_DIRECT,
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
  const geste: GestesDuTableau = { relire: () => void faits.push("relire"), prendreLeLienDirect: () => void faits.push("direct") };
  return { faits, geste };
}
const sous = (pose: Faux | undefined): Faux[] => (pose === undefined ? [] : [...pose.descendants()]);
const boutons = (poses: Faux[]) => poses.flatMap((pose) => [pose, ...sous(pose)]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
const bouton = (poses: Faux[], texte: string) => boutons(poses).find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const aides = (pose: Faux | undefined) => sous(pose).filter((enfant) => enfant.className === "aide").map((enfant) => enfant.ariaLabel);
const poser = (etat: Partial<Parameters<typeof poserLeTableauDeCuisine>[1]>, geste = gestesNotes().geste) =>
  poserLeTableauDeCuisine(doc, { projet: PARADE, lienDirect: true, maintenant: LU_LE.getTime(), ...etat }, geste) as Faux[];

describe("le tableau de la cuisine, posé par son module", () => {
  test("lu : ce qui t'attend en tête, d'où il vient au survol ; l'âge de la lecture ; la file, chaque ligne et son geste ; la cuisine", () => {
    const poses = poser({ lu: LU });
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
    // Le nom, le titre, ce qui attend — sans commande à plat : le geste est au survol de sa ligne, mot pour mot.
    assert.match(cartes[0]?.textContent ?? "", /^#18waiting 2 hShow the queue on the phonegreen, waiting for your merge\?$/);
    assert.equal(cartes[0]?.textContent.includes("brigade"), false);
    assert.deepEqual(aides(cartes[0]), [`${GESTE_DE_LA_LIGNE} brigade parade pass 18`]);
    assert.deepEqual(aides(cartes[1]), [`${GESTE_DE_LA_LIGNE} brigade parade rail choose 21 <n>`]);
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
    const avec = poser({ lu: LU }, geste);
    assert.deepEqual(boutons(avec).map((pose) => [pose.textContent, pose.className]), [[RELIRE, ""], [LIEN_DIRECT, ""]]);
    bouton(avec, RELIRE).click();
    bouton(avec, LIEN_DIRECT).click();
    assert.deepEqual(faits, ["relire", "direct"]);
    assert.deepEqual(boutons(poser({ lu: LU, lienDirect: false })).map((pose) => pose.textContent), [RELIRE]);
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
    assert.deepEqual(boutons([rail]).map((pose) => pose.textContent), [RELIRE]);
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
    // Lu, le lien direct reste offert, en second geste.
    assert.deepEqual(boutons([rail]).map((pose) => [pose.textContent, pose.className]), [[RELIRE, ""], [LIEN_DIRECT, ""]]);
  });

  test("l'onglet Cooks reste celui du lien direct : le tableau ne s'y pose pas", async () => {
    const vue = await ouvrir(AVEC_BOX, () => LU);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(vue.element("rail").textContent.includes("things await you"), false);
    await ouvrirOnglet(vue, "Rail");
    assert.match(vue.element("rail").textContent, /^2 things await you on parade\./);
  });

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
