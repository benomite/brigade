// L'écran de l'outil manquant (#4059, vue/outils-requis/) : ce qu'il dit de chaque outil, ses deux gestes, et ce que
// la vérification fait d'un outil installé, d'un second qui manque encore, d'une lecture qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEJA_INSTALLE, ILLISIBLE, INSTALLER, MANQUE, poserLesOutils, tenirLesOutils, TOUJOURS_ABSENT, VERIFICATION, type EtatDesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const pose = (etat: EtatDesOutils, geste = { installer: () => {}, verifier: () => {} }) => {
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, etat, geste) as Faux[]));
  return lieu;
};
const boutons = (lieu: Faux) => lieu.dessous("button").map((b) => b.textContent);
const installation = { moyen: "commande", texte: "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", lien: "https://code.claude.com/docs/en/setup", exige: [] };

test("chaque outil est dit par son produit — le binaire au détail —, avec pourquoi, son pas, « install … » et « I installed it »", () => {
  const lieu = pose({ lu: true, manque: { outil: "claude", installation } });
  assert.equal(lieu.dessous("h3")[0]?.textContent, "Claude Code is not installed on this computer.");
  assert.match(lieu.textContent, /needs Claude Code \(claude\) to cook/);
  assert.equal(lieu.dessous("code").map((c) => c.textContent).join(" "), "claude curl -fsSL https://claude.ai/install.sh | bash");
  assert.deepEqual(boutons(lieu), ["install Claude Code", DEJA_INSTALLE]);
  assert.equal(MANQUE("gh"), "The GitHub CLI is not installed on this computer.");
  assert.equal(INSTALLER("git"), "install Git");
  // Sans chemin connu, l'outil reste nommé, avec ses deux gestes.
  assert.deepEqual(boutons(pose({ lu: true, manque: { outil: "git" } })), ["install Git", DEJA_INSTALLE]);
});

test("en route, les gestes attendent et la ligne le dit ; fait, la ligne le dit ; refusé ou toujours absent, une ligne d'erreur", () => {
  const enRoute = pose({ lu: true, manque: { outil: "gh" }, enCours: "installation" });
  assert.match(enRoute.textContent, /Installing the GitHub CLI…/);
  assert.ok(enRoute.dessous("button").every((b) => b.disabled));
  assert.match(pose({ lu: true, manque: { outil: "gh" }, enCours: "verification" }).textContent, new RegExp(VERIFICATION));
  const libre = pose({ lu: true, manque: { outil: "gh" }, dit: { fait: "its download page is open in your browser" } });
  assert.ok(libre.dessous("button").every((b) => !b.disabled));
  assert.match(libre.textContent, /download page is open/);
  const refus = pose({ lu: true, manque: { outil: "gh" }, dit: { refus: "the install of the GitHub CLI did not finish (code 1)" } });
  assert.equal(refus.dessous("p").find((p) => p.dataset.ligne === "erreur")?.textContent.startsWith("the install of the GitHub CLI did not finish"), true);
  assert.match(pose({ lu: true, manque: { outil: "git" }, dit: { absent: true } }).textContent, new RegExp(TOUJOURS_ABSENT("git").slice(0, 20)));
});

test("sans outil qui manque, l'écran ne pose que la vérification en route, ou pourquoi elle ne se lit pas", () => {
  assert.deepEqual(boutons(pose({ lu: true })), []);
  assert.equal(pose({ lu: true }).textContent, "");
  assert.equal(pose({ lu: false, enCours: "verification" }).textContent, VERIFICATION);
  assert.match(pose({ lu: true, illisible: { refus: ILLISIBLE, detail: "boom" } }).textContent, new RegExp(ILLISIBLE));
});

test("installé par une commande, l'outil est relu aussitôt : là, le pas reprend ; un second outil qui manque prend sa place", async () => {
  let manque = [{ outil: "git" as const }, { outil: "gh" as const }];
  const demandes: unknown[] = [];
  let pret = 0;
  const outils = tenirLesOutils({
    pont: { outilsManquants: async (voulus) => (demandes.push(voulus), manque), installerOutil: async () => ((manque = manque.slice(1)), { fait: "Git is installed", installe: true }) },
    outils: ["git", "gh"],
    rendre: () => {},
    quandPret: () => pret++,
  });
  assert.equal(await outils.verifier(), false);
  assert.deepEqual(demandes, [["git", "gh"]]);
  assert.equal(outils.etat.manque?.outil, "git");
  await outils.installer();
  // Git là, le GitHub CLI manque encore : son écran, sans « still missing » qui parlerait de Git.
  assert.equal(outils.etat.manque?.outil, "gh");
  assert.equal(outils.etat.dit, undefined);
  assert.equal(pret, 0);
  await outils.installer();
  assert.equal(outils.etat.manque, undefined);
  assert.equal(pret, 1);
  // Déjà prêt, une relecture ne relance rien.
  assert.equal(await outils.verifier(), true);
  assert.equal(pret, 1);
});

test("un installeur ouvert ne relit pas : le chef dit « I installed it » ; un outil qui n'est pas là se dit encore absent", async () => {
  let lectures = 0;
  const outils = tenirLesOutils({ pont: { outilsManquants: async () => (lectures++, [{ outil: "gh" as const }]), installerOutil: async () => ({ fait: "its download page is open in your browser" }) }, rendre: () => {} });
  await outils.verifier();
  await outils.installer();
  assert.equal(lectures, 1);
  assert.deepEqual(outils.etat.dit, { fait: "its download page is open in your browser" });
  // Une relecture sans geste du chef ne dit pas « still missing ».
  await outils.verifier();
  assert.deepEqual(outils.etat.dit, { fait: "its download page is open in your browser" });
  await outils.verifier(true);
  assert.deepEqual(outils.etat.dit, { absent: true });
});

test("un geste qui lève, ou un pont qui ne sait pas installer, se dit refusé, et l'offre reste", async () => {
  const leve = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "claude" as const }], installerOutil: async () => Promise.reject(new Error("ipc closed")) }, rendre: () => {} });
  await leve.verifier();
  await leve.installer();
  assert.deepEqual(leve.etat.dit, { refus: "the install of Claude Code could not start", detail: "ipc closed" });
  assert.equal(leve.etat.manque?.outil, "claude");
  const sans = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "git" as const }] }, rendre: () => {} });
  await sans.verifier();
  await sans.installer();
  assert.deepEqual(sans.etat.dit, { refus: "the app cannot install Git here" });
});

test("une lecture qui lève se dit, et le pas reste offert ; un pont qui ne lit pas les outils n'en dit rien", async () => {
  const leve = tenirLesOutils({ pont: { outilsManquants: async () => Promise.reject(new Error("no runtime")) }, rendre: () => {} });
  assert.equal(await leve.verifier(), true);
  assert.deepEqual(leve.etat.illisible, { refus: ILLISIBLE, detail: "no runtime" });
  assert.equal(leve.etat.manque, undefined);
  const muet = tenirLesOutils({ pont: { outilsManquants: async () => undefined as never }, rendre: () => {} });
  assert.equal(await muet.verifier(), true);
  assert.equal(muet.etat.illisible, undefined);
  const sans = tenirLesOutils({ pont: {}, rendre: () => {} });
  assert.equal(await sans.verifier(), true);
  assert.equal(sans.etat.lu, true);
});

test("deux vérifications de front : seule la dernière demandée pose ce qu'elle a lu", async () => {
  const reponses: ((manque: { outil: "gh" }[]) => void)[] = [];
  const outils = tenirLesOutils({ pont: { outilsManquants: () => new Promise((rendre) => reponses.push(rendre)) }, rendre: () => {} });
  const premiere = outils.verifier();
  const seconde = outils.verifier();
  reponses[1]?.([]);
  assert.equal(await seconde, true);
  reponses[0]?.([{ outil: "gh" }]);
  assert.equal(await premiere, false);
  assert.equal(outils.etat.manque, undefined);
  await repos();
});
