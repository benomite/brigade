// Test d'acceptation gelé (#4241), critère 4. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : le savoir-faire du projet passe par UN petit module,
// `app/src/vue/savoir-faire/source.js`, qui exporte l'objet `source` — `source.lire()` rend les entrées `{ id, text, ticket }`
// (le ticket d'où l'entrée est née), `source.modifier(id, texte)` en change le texte, `source.retirer(id)` la retire. La vue les appelle
// par l'objet, à chaque usage : le test les remplace par un faux qui tient son état. L'entrée du menu est un bouton « Know-how » de
// `onglets-du-projet`, voisin de Stations ; l'écran se rouvre en montrant un autre onglet puis celui-là. Une entrée se modifie dans un
// champ (`textarea` ou `input`) qui porte son texte, un bouton « save » l'enregistre ; elle se retire d'un bouton « remove » (ou « delete »).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { source } from "../../src/vue/savoir-faire/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
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
  const etat = structuredClone(depart);
  Object.assign(source, {
    lire: async () => structuredClone(etat),
    modifier: async (id: string, texte: string) => {
      const cible = etat.find((entree) => entree.id === id);
      if (cible !== undefined) cible.text = texte;
    },
    retirer: async (id: string) => {
      const i = etat.findIndex((entree) => entree.id === id);
      if (i >= 0) etat.splice(i, 1);
    },
  });
}
async function ouvrirLeProjet(): Promise<Jouee> {
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
async function ouvrirLeSavoirFaire(vue: Jouee): Promise<void> {
  onglet(vue, "Know-how").click();
  await repos();
}
async function rouvrir(vue: Jouee): Promise<void> {
  onglet(vue, "Rail").click();
  await repos();
  await ouvrirLeSavoirFaire(vue);
}
const boutons = (vue: Jouee, mot: RegExp): Faux[] => tout(vue).filter((p) => p.balise === "button" && mot.test(p.textContent.trim()));
const champ = (vue: Jouee, valeur: string): Faux | undefined => tout(vue).find((p) => (p.balise === "textarea" || p.balise === "input") && p.value === valeur);
// Le bouton « mot » de l'entrée : celui du plus bas ancêtre du texte de l'entrée qui n'en porte qu'un.
function boutonDeLEntree(vue: Jouee, texte: string, mot: RegExp): Faux {
  const ancre = tout(vue).find((p) => p.children.length === 0 && p.textContent.includes(texte)) ?? champ(vue, texte) ?? assert.fail(`pas d'entrée « ${texte} »`);
  for (let r: Faux | null = ancre; r !== null; r = r.parentElement) {
    const trouves = r.descendants().filter((d) => d.balise === "button" && !d.hidden && mot.test(d.textContent.trim()));
    if (trouves.length === 1) return trouves[0] as Faux;
    if (trouves.length > 1) break;
  }
  return assert.fail(`pas de bouton ${mot} pour « ${texte} »`);
}

// #4241, critère 4 : retirer une entrée, ne plus la voir à la réouverture.
test("the chef removes an entry, and it no longer appears after reopening the screen", async () => {
  fauxModule(ENTREES);
  const vue = await ouvrirLeProjet();
  await ouvrirLeSavoirFaire(vue);
  const cible = ENTREES[0] as Entree;
  boutonDeLEntree(vue, cible.text, /^(remove|delete)/i).click();
  await repos();
  // Une confirmation éventuelle : un seul bouton « confirm » ou « yes » s'offre alors.
  const confirmer = boutons(vue, /^(confirm|yes)/i);
  if (confirmer.length === 1) {
    confirmer[0]?.click();
    await repos();
  }
  await rouvrir(vue);
  const texte = montre(vue);
  assert.ok(!texte.includes(cible.text), "l'entrée retirée ne revient pas");
  assert.ok(texte.includes((ENTREES[1] as Entree).text) && texte.includes((ENTREES[2] as Entree).text), "les autres restent");
});
