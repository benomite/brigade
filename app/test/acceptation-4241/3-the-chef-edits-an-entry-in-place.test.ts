// Test d'acceptation gelé (#4241), critère 3. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : le savoir-faire du projet passe par UN petit module,
// `app/src/vue/know-how-tab/source.js`, qui exporte l'objet `source` — `source.lire()` rend les entrées `{ id, text, ticket }`
// (le ticket d'où l'entrée est née), `source.modifier(id, texte)` en change le texte, `source.retirer(id)` la retire. La vue les appelle
// par l'objet, à chaque usage : le test les remplace par un faux qui tient son état. L'entrée du menu est un bouton « Know-how » de
// `onglets-du-projet`, voisin de Stations ; l'écran se rouvre en montrant un autre onglet puis celui-là. Une entrée se modifie dans un
// champ (`textarea` ou `input`) qui porte son texte, un bouton « save » l'enregistre ; elle se retire d'un bouton « remove » (ou « delete »).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/know-how-tab/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
type Entree = { id: string; text: string; ticket: number };
const ENTREES: Entree[] = [
  { id: "L1", text: "Run the typecheck before pushing", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name", ticket: 4002 },
  { id: "L3", text: "Fakes live in test/aides", ticket: 4003 },
];

// Le faux tient son état : une relecture rend ce que l'écran rouvert doit montrer.
function fauxModule(depart: Entree[]) {
  const state = structuredClone(depart);
  Object.assign(source, {
    lire: async () => structuredClone(state),
    modifier: async (id: string, texte: string) => {
      const cible = state.find((entree) => entree.id === id);
      if (cible !== undefined) cible.text = texte;
    },
    retirer: async (id: string) => {
      const i = state.findIndex((entree) => entree.id === id);
      if (i >= 0) state.splice(i, 1);
    },
  });
}
async function ouvrirLeProject(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const onglets = (vue: Jouee): Faux[] => vue.element("onglets-du-projet").children;
const onglet = (vue: Jouee, titre: string): Faux => onglets(vue).find((o) => o.textContent.trim() === titre) ?? assert.fail(`pas d'onglet « ${titre} »`);
const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const tout = (vue: Jouee): Faux[] => vue.poses().filter(visible);
const montre = (vue: Jouee): string => tout(vue).map((p) => p.textContent).join("\n");
async function ouvrirLeKnowHow(vue: Jouee): Promise<void> {
  onglet(vue, "Know-how").click();
  await repos();
}
async function rouvrir(vue: Jouee): Promise<void> {
  onglet(vue, "Rail").click();
  await repos();
  await ouvrirLeKnowHow(vue);
}
const boutons = (vue: Jouee, word: RegExp): Faux[] => tout(vue).filter((p) => p.balise === "button" && word.test(p.textContent.trim()));
const champ = (vue: Jouee, valeur: string): Faux | undefined => tout(vue).find((p) => (p.balise === "textarea" || p.balise === "input") && p.value === valeur);
// Le bouton « mot » de l'entrée : celui du plus bas ancêtre du texte de l'entrée qui n'en porte qu'un.
function buttonDeLEntree(vue: Jouee, texte: string, word: RegExp): Faux {
  const ancre = tout(vue).find((p) => p.children.length === 0 && p.textContent.includes(texte)) ?? champ(vue, texte) ?? assert.fail(`pas d'entrée « ${texte} »`);
  for (let r: Faux | null = ancre; r !== null; r = r.parentElement) {
    const trouves = r.descendants().filter((d) => d.balise === "button" && !d.hidden && word.test(d.textContent.trim()));
    if (trouves.length === 1) return trouves[0] as Faux;
    if (trouves.length > 1) break;
  }
  return assert.fail(`pas de bouton ${word} pour « ${texte} »`);
}

// #4241, critère 3 : modifier une entrée sur place, l'enregistrer, la retrouver à la réouverture de l'écran.
test("the chef edits an entry in place, saves it, and the new text shows after reopening the screen", async () => {
  fauxModule(ENTREES);
  const vue = await ouvrirLeProject();
  await ouvrirLeKnowHow(vue);
  const cible = ENTREES[1] as Entree;
  buttonDeLEntree(vue, cible.text, /^edit/i).click();
  await repos();
  const zone = champ(vue, cible.text) ?? assert.fail("un champ porte le texte de l'entrée");
  zone.value = "Never kill a process by name, use its pid";
  zone.declencher("input");
  buttonDeLEntree(vue, cible.text, /^save/i).click();
  await repos();
  await rouvrir(vue);
  const texte = montre(vue);
  assert.ok(texte.includes("use its pid"), "le nouveau texte se montre à la réouverture");
  assert.ok(texte.includes((ENTREES[0] as Entree).text), "les autres entrées sont intactes");
});
