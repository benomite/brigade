// L'écran de l'outil manquant (#4059, vue/tools-required/) : ce qu'il dit de chaque outil, son lien et « I installed it », et ce que
// la vérification fait d'un outil installé, d'un second qui manque encore, d'une lecture qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEJA_INSTALLE, ILLISIBLE, LA_PAGE, MANQUE, poserLesTools, holdLesTools, TOUJOURS_ABSENT, VERIFICATION, type StateDesTools } from "../../src/vue/tools-required/tools-required.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const pose = (state: StateDesTools, action = { ouvrir: (_: string) => {}, verifier: () => {} }) => {
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesTools(doc, state, action) as Faux[]));
  return lieu;
};
const boutons = (lieu: Faux) => lieu.dessous("button").map((b) => b.textContent);
const installation = { texte: "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", lien: "https://code.claude.com/docs/en/setup" };

test("chaque outil est dit par son produit — le binaire au détail —, avec pourquoi, un lien vers sa page d'installation et « I installed it » : aucun bouton n'installe", () => {
  const ouvertes: string[] = [];
  const lieu = pose({ lu: true, manque: { outil: "claude", installation } }, { ouvrir: (url) => void ouvertes.push(url), verifier: () => {} });
  assert.equal(lieu.dessous("h3")[0]?.textContent, "Claude Code is not installed on this computer.");
  assert.match(lieu.textContent, /needs Claude Code \(claude\) to cook/);
  assert.deepEqual(boutons(lieu), ["how to install Claude Code", DEJA_INSTALLE]);
  assert.deepEqual(lieu.dessous("button").map((b) => b.className), ["recommande", ""]);
  // Le lien ouvre la page officielle ; la commande du pas n'est pas montrée.
  lieu.dessous("button")[0]?.click();
  assert.deepEqual(ouvertes, ["https://code.claude.com/docs/en/setup"]);
  assert.equal(lieu.dessous("code").map((c) => c.textContent).join(" "), "claude");
  assert.equal(MANQUE("gh"), "The GitHub CLI is not installed on this computer.");
  assert.equal(LA_PAGE("git"), "how to install Git");
  // Sans page connue, l'outil reste nommé, avec « I installed it ».
  assert.deepEqual(boutons(pose({ lu: true, manque: { outil: "git" } })), [DEJA_INSTALLE]);
});

test("la vérification en route désactive « I installed it » ; un outil toujours absent se dit en une ligne d'erreur", () => {
  const enRoute = pose({ lu: true, manque: { outil: "gh" }, enCours: "verification" });
  assert.match(enRoute.textContent, new RegExp(VERIFICATION));
  assert.ok(enRoute.dessous("button").every((b) => b.textContent !== DEJA_INSTALLE || b.disabled));
  const free = pose({ lu: true, manque: { outil: "gh" } });
  assert.ok(free.dessous("button").every((b) => !b.disabled));
  assert.match(pose({ lu: true, manque: { outil: "git" }, dit: { absent: true } }).textContent, new RegExp(TOUJOURS_ABSENT("git").slice(0, 20)));
});

test("sans outil qui manque, l'écran ne pose que la vérification en route, ou pourquoi elle ne se lit pas", () => {
  assert.deepEqual(boutons(pose({ lu: true })), []);
  assert.equal(pose({ lu: true }).textContent, "");
  assert.equal(pose({ lu: false, enCours: "verification" }).textContent, VERIFICATION);
  assert.match(pose({ lu: true, illisible: { refus: ILLISIBLE, detail: "boom" } }).textContent, new RegExp(ILLISIBLE));
});

test("« I installed it » relit : l'outil trouvé, le pas reprend ; un second outil qui manque prend sa place ; toujours absent, il se dit", async () => {
  let manque = [{ outil: "git" as const }, { outil: "gh" as const }];
  const demandes: unknown[] = [];
  let pret = 0;
  const tools = holdLesTools({ pont: { outilsManquants: async (voulus) => (demandes.push(voulus), manque) }, outils: ["git", "gh"], rendre: () => {}, quandPret: () => pret++ });
  assert.equal(tools.etat.lu, false);
  assert.equal(await tools.verifier(), false);
  assert.equal(tools.etat.lu, true);
  assert.deepEqual(demandes, [["git", "gh"]]);
  assert.equal(tools.etat.manque?.outil, "git");
  // Une relecture sans geste du chef ne dit pas « still missing » ; « I installed it » le dit.
  await tools.verifier();
  assert.equal(tools.etat.dit, undefined);
  await tools.verifier(true);
  assert.deepEqual(tools.etat.dit, { absent: true });
  // Git là, le GitHub CLI manque encore : son écran, sans « still missing » qui parlerait de Git.
  manque = manque.slice(1);
  await tools.verifier(true);
  assert.equal(tools.etat.manque?.outil, "gh");
  assert.equal(tools.etat.dit, undefined);
  assert.equal(pret, 0);
  manque = [];
  await tools.verifier(true);
  assert.equal(tools.etat.manque, undefined);
  assert.equal(pret, 1);
  // Déjà prêt, une relecture ne relance rien.
  assert.equal(await tools.verifier(), true);
  assert.equal(pret, 1);
});

test("une lecture qui lève se dit, et le pas reste offert ; un pont qui ne lit pas les outils n'en dit rien", async () => {
  const leve = holdLesTools({ pont: { outilsManquants: async () => Promise.reject(new Error("no runtime")) }, rendre: () => {} });
  assert.equal(await leve.verifier(), true);
  assert.deepEqual(leve.etat.illisible, { refus: ILLISIBLE, detail: "no runtime" });
  assert.equal(leve.etat.lu, true);
  assert.equal(leve.etat.manque, undefined);
  const muet = holdLesTools({ pont: { outilsManquants: async () => undefined as never }, rendre: () => {} });
  assert.equal(await muet.verifier(), true);
  assert.equal(muet.etat.illisible, undefined);
  assert.equal(muet.etat.lu, true);
  const sans = holdLesTools({ pont: {}, rendre: () => {} });
  assert.equal(await sans.verifier(), true);
  assert.equal(sans.etat.lu, true);
});

test("deux vérifications de front : seule la dernière demandée pose ce qu'elle a lu", async () => {
  const answers: ((manque: { outil: "gh" }[]) => void)[] = [];
  const tools = holdLesTools({ pont: { outilsManquants: () => new Promise((rendre) => answers.push(rendre)) }, rendre: () => {} });
  const first = tools.verifier();
  const seconde = tools.verifier();
  answers[1]?.([]);
  assert.equal(await seconde, true);
  answers[0]?.([{ outil: "gh" }]);
  assert.equal(await first, false);
  assert.equal(tools.etat.manque, undefined);
  await repos();
});
