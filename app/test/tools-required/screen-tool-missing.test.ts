// L'écran de l'outil manquant (#4059, vue/tools-required/) : ce qu'il dit de chaque outil, son lien et « I installed it », et ce que
// la vérification fait d'un outil installé, d'un second qui manque encore, d'une lecture qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALREADY_INSTALLS, UNREADABLE, THE_PAGE, MISSING, setTheTools, holdTheTools, ALWAYS_ABSENT, VERIFICATION, type StateOfTools } from "../../src/vue/tools-required/tools-required.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) } as never;
const pose = (state: StateOfTools, action = { ouvrir: (_: string) => {}, verifier: () => {} }) => {
  const place = new Fake("div");
  place.replaceChildren(...(setTheTools(doc, state, action) as Fake[]));
  return place;
};
const buttons = (place: Fake) => place.dessous("button").map((b) => b.textContent);
const installation = { texte: "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", lien: "https://code.claude.com/docs/en/setup" };

test("chaque outil est dit par son produit — le binaire au détail —, avec pourquoi, un lien vers sa page d'installation et « I installed it » : aucun bouton n'installe", () => {
  const openEntries: string[] = [];
  const place = pose({ lu: true, manque: { outil: "claude", installation } }, { ouvrir: (url) => void openEntries.push(url), verifier: () => {} });
  assert.equal(place.dessous("h3")[0]?.textContent, "Claude Code is not installed on this computer.");
  assert.match(place.textContent, /needs Claude Code \(claude\) to cook/);
  assert.deepEqual(buttons(place), ["how to install Claude Code", ALREADY_INSTALLS]);
  assert.deepEqual(place.dessous("button").map((b) => b.className), ["recommande", ""]);
  // Le lien ouvre la page officielle ; la commande du pas n'est pas montrée.
  place.dessous("button")[0]?.click();
  assert.deepEqual(openEntries, ["https://code.claude.com/docs/en/setup"]);
  assert.equal(place.dessous("code").map((c) => c.textContent).join(" "), "claude");
  assert.equal(MISSING("gh"), "The GitHub CLI is not installed on this computer.");
  assert.equal(THE_PAGE("git"), "how to install Git");
  // Sans page connue, l'outil reste nommé, avec « I installed it ».
  assert.deepEqual(buttons(pose({ lu: true, manque: { outil: "git" } })), [ALREADY_INSTALLS]);
});

test("la vérification en route désactive « I installed it » ; un outil toujours absent se dit en une ligne d'erreur", () => {
  const enRoute = pose({ lu: true, manque: { outil: "gh" }, enCours: "verification" });
  assert.match(enRoute.textContent, new RegExp(VERIFICATION));
  assert.ok(enRoute.dessous("button").every((b) => b.textContent !== ALREADY_INSTALLS || b.disabled));
  const free = pose({ lu: true, manque: { outil: "gh" } });
  assert.ok(free.dessous("button").every((b) => !b.disabled));
  assert.match(pose({ lu: true, manque: { outil: "git" }, dit: { absent: true } }).textContent, new RegExp(ALWAYS_ABSENT("git").slice(0, 20)));
});

test("sans outil qui manque, l'écran ne pose que la vérification en route, ou pourquoi elle ne se lit pas", () => {
  assert.deepEqual(buttons(pose({ lu: true })), []);
  assert.equal(pose({ lu: true }).textContent, "");
  assert.equal(pose({ lu: false, enCours: "verification" }).textContent, VERIFICATION);
  assert.match(pose({ lu: true, illisible: { refus: UNREADABLE, detail: "boom" } }).textContent, new RegExp(UNREADABLE));
});

test("« I installed it » relit : l'outil trouvé, le pas reprend ; un second outil qui manque prend sa place ; toujours absent, il se dit", async () => {
  let lack = [{ outil: "git" as const }, { outil: "gh" as const }];
  const requests: unknown[] = [];
  let ready = 0;
  const tools = holdTheTools({ pont: { outilsManquants: async (wantedOnes) => (requests.push(wantedOnes), lack) }, outils: ["git", "gh"], rendre: () => {}, quandPret: () => ready++ });
  assert.equal(tools.etat.lu, false);
  assert.equal(await tools.verifier(), false);
  assert.equal(tools.etat.lu, true);
  assert.deepEqual(requests, [["git", "gh"]]);
  assert.equal(tools.etat.manque?.outil, "git");
  // Une relecture sans geste du chef ne dit pas « still missing » ; « I installed it » le dit.
  await tools.verifier();
  assert.equal(tools.etat.dit, undefined);
  await tools.verifier(true);
  assert.deepEqual(tools.etat.dit, { absent: true });
  // Git là, le GitHub CLI manque encore : son écran, sans « still missing » qui parlerait de Git.
  lack = lack.slice(1);
  await tools.verifier(true);
  assert.equal(tools.etat.manque?.outil, "gh");
  assert.equal(tools.etat.dit, undefined);
  assert.equal(ready, 0);
  lack = [];
  await tools.verifier(true);
  assert.equal(tools.etat.manque, undefined);
  assert.equal(ready, 1);
  // Déjà prêt, une relecture ne relance rien.
  assert.equal(await tools.verifier(), true);
  assert.equal(ready, 1);
});

test("une lecture qui lève se dit, et le pas reste offert ; un pont qui ne lit pas les outils n'en dit rien", async () => {
  const lifted = holdTheTools({ pont: { outilsManquants: async () => Promise.reject(new Error("no runtime")) }, rendre: () => {} });
  assert.equal(await lifted.verifier(), true);
  assert.deepEqual(lifted.etat.illisible, { refus: UNREADABLE, detail: "no runtime" });
  assert.equal(lifted.etat.lu, true);
  assert.equal(lifted.etat.manque, undefined);
  const silent = holdTheTools({ pont: { outilsManquants: async () => undefined as never }, rendre: () => {} });
  assert.equal(await silent.verifier(), true);
  assert.equal(silent.etat.illisible, undefined);
  assert.equal(silent.etat.lu, true);
  const without = holdTheTools({ pont: {}, rendre: () => {} });
  assert.equal(await without.verifier(), true);
  assert.equal(without.etat.lu, true);
});

test("deux vérifications de front : seule la dernière demandée pose ce qu'elle a lu", async () => {
  const answers: ((lack: { outil: "gh" }[]) => void)[] = [];
  const tools = holdTheTools({ pont: { outilsManquants: () => new Promise((render) => answers.push(render)) }, rendre: () => {} });
  const first = tools.verifier();
  const second = tools.verifier();
  answers[1]?.([]);
  assert.equal(await second, true);
  answers[0]?.([{ outil: "gh" }]);
  assert.equal(await first, false);
  assert.equal(tools.etat.manque, undefined);
  await repos();
});
