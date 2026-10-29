// Sur l'onglet Cooks (#1274) : les rôles de la cuisine du projet — le closer et les autres —, chacun avec la ligne qui
// dit ce qu'il fait et sa dernière action, son heure. La vue jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts), sur ce que le process principal range des faits de la box (faits.ts). Un rôle qui n'a rien fait
// dit « no action yet », jamais un blanc.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, rolesCuisineLus, tenirFaits, type Faits, type RoleDeCuisine } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { heureDeLAction, poserLesRoles, resumeDesRoles, SANS_ACTION, TITRE } from "../../src/vue/roles-cuisine.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const MERGE = "2026-10-21T09:41:00.000Z";
const NETTOYAGE = "2026-10-20T08:04:00.000Z";
const ROLES: RoleDeCuisine[] = [
  { role: "manager", does: "Judges the project's issues.", latest: { what: "put #16 on the rail", ticket: 16, at: "2026-10-21T10:00:00.000Z" } },
  { role: "pass", does: "Judges each delivery.", latest: { what: "merged #12", ticket: 12, at: MERGE } },
  { role: "second judge", does: "Checks that a delivery does not weaken its judges.", latest: null },
  { role: "closer", does: "Prunes and simplifies the project's code.", latest: { what: "delivered a cleanup PR removing 140 lines", ticket: null, at: NETTOYAGE } },
];

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 3 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  rolesCuisine: ROLES,
};

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
// Les faits que la box rend, en JSON, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function recevoir(vue: Jouee, faits: unknown = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const roles = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "roles-cuisine");
// La section telle qu'elle se lit : chaque rôle, son nom, ce qu'il fait et sa dernière action.
const lu = (pose: Faux) => pose.dessous("li").map((ligne) => ligne.children.map((morceau) => morceau.textContent));

describe("les rôles de la cuisine, sur l'onglet Cooks", () => {
  test("le closer et chaque autre rôle : son nom, une ligne de ce qu'il fait, sa dernière action et son heure", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Cooks");
    const pose = roles(vue) ?? assert.fail("pas de rôles sur Cooks");
    assert.deepEqual(lu(pose), [
      ["manager", "Judges the project's issues.", `put #16 on the rail · ${heureDeLAction("2026-10-21T10:00:00.000Z")}`],
      ["pass", "Judges each delivery.", `merged #12 · ${heureDeLAction(MERGE)}`],
      ["second judge", "Checks that a delivery does not weaken its judges.", SANS_ACTION],
      ["closer", "Prunes and simplifies the project's code.", `delivered a cleanup PR removing 140 lines · ${heureDeLAction(NETTOYAGE)}`],
    ]);
    assert.equal(pose.dessous("h4")[0]?.textContent?.startsWith(TITRE), true);
    // L'heure se lit pour une machine aussi : celle du fait.
    assert.deepEqual(pose.dessous("time").map((quand) => Reflect.get(quand, "dateTime")), ["2026-10-21T10:00:00.000Z", MERGE, NETTOYAGE]);
    // Sous le plafond de calibrage, au-dessus de ce que les cooks ont appris.
    const ids = vue.element("rail").children.map(({ id }) => id);
    assert.ok(ids.indexOf("roles-du-projet") > ids.indexOf("plafond-du-projet"), ids.join(", "));
    assert.ok(ids.indexOf("roles-du-projet") < ids.indexOf("appris-du-projet"), ids.join(", "));
    // Repliés derrière une ligne, fermés (#1456) : combien de rôles, la plus récente de leurs actions, et ceux qui n'ont
    // rien fait ; la liste est dessous, ouverte d'un clic, et reste ouverte d'une lecture à l'autre.
    const replie = () => vue.element("roles-du-projet").children[0] ?? assert.fail("pas de bloc replié");
    assert.deepEqual([replie().balise, replie().className, Reflect.get(replie(), "open")], ["details", "replie", false]);
    assert.equal(replie().dessous("summary")[0]?.textContent, `${TITRE}${resumeDesRoles(ROLES)}`);
    assert.ok(replie().contains(pose));
    Reflect.set(replie(), "open", true);
    replie().declencher("toggle");
    recevoir(vue);
    await repos();
    assert.equal(Reflect.get(replie(), "open"), true);
  });

  test("la ligne du bloc replié : leur nombre, la plus récente de leurs actions, les rôles muets", () => {
    assert.equal(resumeDesRoles(ROLES), `4 roles · latest: manager — put #16 on the rail, ${heureDeLAction("2026-10-21T10:00:00.000Z")} · ${SANS_ACTION}: second judge`);
    assert.equal(resumeDesRoles(ROLES.map((role) => ({ ...role, latest: null }))), `4 roles · ${SANS_ACTION}: manager, pass, second judge, closer`);
    assert.equal(resumeDesRoles([ROLES[1]!]), `1 role · latest: pass — merged #12, ${heureDeLAction(MERGE)}`);
  });

  test("un rôle qui n'a rien fait dit « no action yet », jamais un blanc", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...FAITS, rolesCuisine: ROLES.map((role) => ({ ...role, latest: null })) });
    await ouvrirOnglet(vue, "Cooks");
    const pose = roles(vue) ?? assert.fail("pas de rôles sur Cooks");
    assert.deepEqual(lu(pose).map(([, , action]) => action), ROLES.map(() => SANS_ACTION));
    assert.ok(pose.dessous("span").filter(({ className }) => className.includes("derniere-action")).every(({ textContent }) => textContent !== ""));
  });

  test("ils sont sur Cooks seulement : l'onglet Rail n'en pose rien", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Rail");
    assert.equal(roles(vue), undefined);
    await ouvrirOnglet(vue, "Cooks");
    assert.notEqual(roles(vue), undefined);
  });

  test("un runtime qui ne les donne pas, ou les donne sous une autre forme, n'en fait rien poser — le reste de Cooks se dessine", async () => {
    const vue = await ouvrir();
    const { rolesCuisine: _, ...sans } = FAITS;
    recevoir(vue, sans);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(roles(vue), undefined);
    assert.equal(vue.element("rail").children.some((pose) => pose.className === "carte"), true);
    recevoir(vue, { ...FAITS, rolesCuisine: "manager" });
    assert.equal(roles(vue), undefined);
  });

  test("la lecture du champ : un rôle sans nom, sans ligne, ou dont l'action n'a pas sa forme n'est pas lu", () => {
    assert.deepEqual(rolesCuisineLus(ROLES), ROLES);
    // Ce que le runtime pourrait y ajouter n'est pas repris.
    assert.deepEqual(rolesCuisineLus([{ ...ROLES[1], depuis: 3, latest: { ...ROLES[1]?.latest, run: "r" } }]), [ROLES[1]]);
    const mauvais = [
      { role: "", does: "x", latest: null },
      { role: "pass", does: 3, latest: null },
      { role: "pass", does: "x" },
      { role: "pass", does: "x", latest: { what: "", ticket: 1, at: MERGE } },
      { role: "pass", does: "x", latest: { what: "merged #1", ticket: "1", at: MERGE } },
      { role: "pass", does: "x", latest: { what: "merged #1", ticket: 1, at: "yesterday" } },
      null,
    ];
    assert.deepEqual(rolesCuisineLus([...mauvais, ROLES[0]]), [ROLES[0]]);
    for (const pas of [undefined, null, 3, {}, "pass"]) assert.equal(rolesCuisineLus(pas), undefined, JSON.stringify(pas));
  });

  test("le module se lit seul, sur un faux document : un titre, une ligne par rôle — rien d'une liste vide ou absente", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const pose = poserLesRoles(doc as never, ROLES) as Faux | null;
    assert.deepEqual(pose?.dessous("li").map((ligne) => ligne.dataset.role), ROLES.map(({ role }) => role));
    assert.equal(poserLesRoles(doc as never, undefined), null);
    assert.equal(poserLesRoles(doc as never, []), null);
  });
});
