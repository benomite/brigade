// L'onglet Agents (#4117) : le bloc seul devant un faux document, pour ce qu'une lecture ou un réglage qui échoue y laisse,
// puis la vue entière pour le badge de l'équipe qui y mène. Les tests gelés (acceptation-4117/) jouent l'onglet réussi ; ici,
// ce qui est refusé, illisible ou absent se dit — jamais un réglage passé pour changé, jamais une valeur inventée.
// Le module des données (agents/source.js) est remplacé par un faux, comme la vue l'appelle : par l'objet `source`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { tenirLesAgents } from "../../src/vue/agents/agents.js";
import { source, type Agent } from "../../src/vue/agents/source.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const boutons = (racine: Faux) => racine.dessous("button").filter(visible);
const agent = (nom: string, plus: Partial<Agent> = {}): Agent => ({
  agent: nom,
  role: `${nom} exists to do the job of ${nom}.`,
  state: "idle",
  nextRun: { text: `${nom}: next run in 3 h`, at: null },
  week: [{ label: "handled", value: "12", meaning: "tickets it handled this week" }],
  settings: [{ key: "model", label: "Model", value: "sonnet", options: ["sonnet", "opus"], editable: true }],
  gestures: [],
  ...plus,
});

// La source remplacée : ce que `lire` rend (une fonction, pour un rejet), ce que `regler` fait, et chaque appel reçu.
function faux(lire: () => Promise<unknown>, regler: (...args: unknown[]) => Promise<void> = async () => {}) {
  const appels: unknown[][] = [];
  Object.assign(source, {
    lire: (...args: unknown[]) => (appels.push(["lire", ...args]), lire()),
    regler: (...args: unknown[]) => (appels.push(["regler", ...args]), regler(...args)),
  });
  return appels;
}
async function bloc(projet = "parade") {
  const cadre = new Faux("section");
  const agents = tenirLesAgents(doc, cadre);
  agents.montrer(projet);
  await repos();
  return { cadre, agents };
}

test("nothing is read or shown until the tab is shown, and a project that is not the shown one hides it", async () => {
  const appels = faux(async () => [agent("closer")]);
  const cadre = new Faux("section");
  const agents = tenirLesAgents(doc, cadre);
  assert.equal(cadre.hidden, true);
  assert.deepEqual(appels, []);
  agents.montrer("parade");
  await repos();
  assert.deepEqual(appels, [["lire", "parade"]]);
  assert.equal(cadre.hidden, false);
  // Montré de nouveau pour le même projet — chaque rendu de la vue —, il ne se relit pas : seule l'ouverture relit.
  agents.montrer("parade");
  await repos();
  assert.equal(appels.length, 1);
  agents.montrer(undefined);
  assert.equal(cadre.hidden, true);
  agents.montrer("parade");
  await repos();
  assert.equal(appels.length, 2);
});

test("a reading that fails says so in one line, its detail on hover; a device that reads nothing says that", async () => {
  faux(() => Promise.reject(Object.assign(new Error("parade has no station"), { detail: "ssh refused" })));
  const { cadre } = await bloc();
  assert.match(cadre.textContent, /The agents not reached\./);
  assert.match(cadre.textContent, /The agents not reached\. parade has no station/);
  assert.deepEqual(boutons(cadre).map((un) => un.ariaLabel), ["ssh refused"]);
  faux(async () => null);
  assert.match((await bloc()).cadre.textContent, /This device does not read the agents\./);
});

test("a record that does not carry its fields makes the reading unreadable: nothing is made up in its place", async () => {
  for (const abime of [{ ...agent("closer"), role: undefined }, { ...agent("closer"), nextRun: { at: null } }, { ...agent("closer"), week: [{ label: "x", value: "1" }] }, { ...agent("closer"), settings: [{ key: "model", label: "Model", value: "sonnet", editable: "yes" }] }, { ...agent("closer"), gestures: [{ at: "x", line: "y" }] }, { ...agent("closer"), now: [{ label: "x" }] }, { ...agent("closer"), agent: "" }, "closer"]) {
    faux(async () => [agent("manager"), abime]);
    const { cadre } = await bloc();
    assert.match(cadre.textContent, /the agents' reading is not readable/, JSON.stringify(abime));
    assert.ok(!cadre.textContent.includes("manager exists"), "the others are not shown half");
  }
});

test("a setting the runtime refuses says why under its row and keeps the value in force; the same value clicked again sends nothing", async () => {
  const appels = faux(async () => [agent("closer")], () => Promise.reject(Object.assign(new Error("nothing was changed: the runtime refused it"), { detail: "empty log" })));
  const { cadre } = await bloc();
  const modele = (): Faux => cadre.dessous("div").find((un) => un.className === "reglage") ?? assert.fail("no row");
  const pose = (nom: string) => boutons(modele()).find((un) => un.textContent === nom) ?? assert.fail(`no ${nom}`);
  assert.deepEqual([pose("sonnet").ariaPressed, pose("opus").ariaPressed], ["true", "false"]);
  pose("sonnet").click();
  await repos();
  assert.equal(appels.filter(([quoi]) => quoi === "regler").length, 0);
  pose("opus").click();
  await repos();
  assert.deepEqual(appels.filter(([quoi]) => quoi === "regler"), [["regler", "closer", "model", "opus", "parade"]]);
  assert.match(modele().textContent, /closer's model was not changed: nothing was changed: the runtime refused it/);
  assert.equal(modele().dessous("p").find((un) => un.dataset.ligne === "erreur")?.role, "alert", "a refusal is read out at once");
  assert.deepEqual([pose("sonnet").ariaPressed, pose("opus").ariaPressed], ["true", "false"]);
  // Un nouveau clic efface le refus d'avant, et repart.
  pose("opus").click();
  await repos();
  assert.equal(appels.filter(([quoi]) => quoi === "regler").length, 2);
});

test("a setting that goes through while the answer is awaited cannot be sent twice, and its buttons wait", async () => {
  let repondre = () => {};
  const appels = faux(async () => [agent("closer")], () => new Promise<void>((fini) => (repondre = fini)));
  const { cadre } = await bloc();
  const opus = () => boutons(cadre).find((un) => un.textContent === "opus") ?? assert.fail("no opus");
  opus().click();
  opus().click();
  await repos();
  assert.equal(appels.filter(([quoi]) => quoi === "regler").length, 1);
  assert.equal(opus().disabled, true);
  repondre();
  await repos();
  assert.equal(opus().disabled, false);
});

test("a reading that fails after the change says so, and the old agents are not shown as if they were current", async () => {
  let lectures = 0;
  faux(async () => (++lectures === 1 ? [agent("closer")] : Promise.reject(new Error("the box does not answer"))));
  const { cadre } = await bloc();
  (boutons(cadre).find((un) => un.textContent === "opus") ?? assert.fail("no opus")).click();
  await repos();
  assert.match(cadre.textContent, /The agents not reached\./);
  assert.ok(!cadre.textContent.includes("closer exists"));
});

test("a setting that cannot be changed from here shows its value and where it lives, with no button, and says when it was changed", async () => {
  faux(async () => [agent("closer", { settings: [{ key: "autonomy", label: "Autonomy", value: "propose", editable: false, livesIn: "the levels file", from: "set by the chef", changedAt: "2026-10-13T09:30:00.000Z", changedBy: "the chef" }, { key: "x", label: "Cap", value: "5", editable: true, options: ["5"] }] })]);
  const { cadre } = await bloc();
  const rangee = cadre.dessous("div").find((un) => un.className === "reglage fixe") ?? assert.fail("no fixed row");
  assert.equal(rangee.textContent, "Autonomypropose" + "lives in the levels file" + "set by the chef" + "changed 2026-10-13 09:30 UTC by the chef");
  assert.equal(rangee.dessous("button").length, 0);
  // Sans options, un réglage qui se dit modifiable n'a pas de bouton non plus : il dit sa valeur.
  assert.equal(cadre.dessous("div").filter((un) => un.className === "reglage").length, 1);
  // Et des options sur un réglage qui ne se change pas n'en font pas des boutons.
  faux(async () => [agent("closer", { settings: [{ key: "a", label: "Fixed", value: "x", options: ["x", "y"], editable: false, livesIn: "the file" }, { key: "b", label: "Open", value: "1", editable: true }] })]);
  const autre = (await bloc()).cadre;
  assert.equal(boutons(autre).filter((un) => ["x", "y"].includes(un.textContent)).length, 0);
  assert.match(autre.textContent, /Open1/);
});

test("a thread shows at most the ten latest gestures, the newest first, and a gesture without a reason or an outcome says only its line", async () => {
  const gestes = Array.from({ length: 12 }, (_, i) => ({ at: `2026-10-13T08:${String(i).padStart(2, "0")}:00.000Z`, line: `gesture ${i}`, reason: i === 11 ? "" : "its reason", outcome: i === 11 ? "" : "done" }));
  faux(async () => [agent("manager", { gestures: gestes }), agent("closer", { gestures: [] })]);
  const { cadre } = await bloc();
  (boutons(cadre).find((un) => un.textContent.startsWith("manager")) ?? assert.fail("no manager")).click();
  const lignes = cadre.dessous("li").filter((un) => /gesture \d/.test(un.textContent)).map((un) => un.textContent);
  assert.equal(lignes.length, 10);
  assert.equal(lignes[0], "08:11 UTC · gesture 11");
  assert.equal(lignes[1], "08:10 UTC · gesture 10 (its reason): done");
  assert.equal(lignes.at(-1), "08:02 UTC · gesture 2 (its reason): done");
  assert.match(cadre.textContent, /2 older gestures are not shown\./);
  // Un agent sans geste le dit ; un second clic referme le fil.
  (boutons(cadre).find((un) => un.textContent.startsWith("closer")) ?? assert.fail("no closer")).click();
  assert.match(cadre.textContent, /No gesture kept for this agent yet\./);
  assert.ok(!cadre.textContent.includes("gesture 11"), "one thread is open at a time");
  (boutons(cadre).find((un) => un.textContent.startsWith("closer")) ?? assert.fail("no closer")).click();
  assert.ok(!cadre.textContent.includes("No gesture kept"));
});

test("figures that the agent keeps are shown with their meaning, and an agent with none says so; 'right now' figures come apart", async () => {
  faux(async () => [agent("closer", { week: [], now: [{ label: "Merges since its last pass", value: "14", meaning: "changes merged since it last cleaned up" }] }), agent("manager", { week: [{ label: "Done by itself", value: "3", meaning: "gestures it made alone" }] })]);
  const { cadre } = await bloc();
  assert.match(cadre.textContent, /No figure kept for this agent yet\./);
  assert.match(cadre.textContent, /14Merges since its last passchanges merged since it last cleaned up/);
  assert.match(cadre.textContent, /3Done by itselfgestures it made alone/);
  assert.match(cadre.textContent, /Right now/);
  assert.equal((cadre.textContent.match(/Right now/g) ?? []).length, 1);
  assert.equal((cadre.textContent.match(/Last 7 days/g) ?? []).length, 2);
});

test("a broken agent is marked, and an instant is told in UTC to the minute — one that is not a date as it was written", async () => {
  faux(async () => [agent("supervisor", { state: "broken: its log cannot be read" }), agent("closer", { settings: [{ key: "a", label: "Cap", value: "1", editable: false, changedAt: "2026-11-25T12:10:33.000Z" }, { key: "b", label: "Cut", value: "2", editable: false, changedAt: "yesterday", changedBy: "the second" }] })]);
  const { cadre } = await bloc();
  const marques = cadre.dessous("section").filter((un) => un.dataset.etat === "casse").map((un) => un.dataset.agent);
  assert.deepEqual(marques, ["supervisor"]);
  assert.match(cadre.textContent, /changed 2026-11-25 12:10 UTC(?!by)/);
  assert.match(cadre.textContent, /changed yesterday by the second/);
});

test("a badge of the team opens the Agents tab on its agent, its thread open, and keeps opening its own thread; a cook opens the cooks", async () => {
  const lire = faux(async () => [agent("closer", { gestures: [{ at: "2026-10-13T09:30:00.000Z", line: "closed pass #4100", reason: "dead code", outcome: "merged" }] }), agent("cooks", { gestures: [{ at: "2026-10-13T09:00:00.000Z", line: "took #4029", reason: "first in line", outcome: "done" }] })]);
  const badges = [
    { agent: "closer", state: "idle", lastGesture: { line: "opened pass", at: "2026-10-13T09:30:00.000Z" }, nextRun: { text: "closer: next pass in 3 h", at: "2026-10-13T13:00:00.000Z" }, thread: "Closer", autonomy: "propose", counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [], pending: [] },
    { agent: "cook #4029", state: "working on #4029", lastGesture: { line: "took #4029", at: "2026-10-13T09:00:00.000Z" }, nextRun: { text: "cook #4029: works until it delivers", at: "2026-10-13T13:00:00.000Z" }, thread: "Cook #4029", autonomy: "act", counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [], pending: [] },
  ];
  const faits = { etat: "ouverte", lu: "2026-10-13T10:04:11.000Z", dernierTick: "2026-10-13T10:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const demarrage = () => ({ configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES, gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES }, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined });
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], lireLesAgents: async () => badges as never } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] }), demande: demandes.at(-1)?.args[0] as number });
  await repos();
  const badge = (nom: string) => vue.element("equipe-du-projet").dessous("button").find((un) => un.dataset.agent === nom) ?? assert.fail(`pas de badge ${nom}`);
  const onglet = () => vue.element("onglets-du-projet").children.find((un) => un.textContent.trim() === "Agents") ?? assert.fail("no Agents tab");
  assert.equal(onglet().ariaSelected, "false");
  assert.equal(vue.element("contenu").hidden, true, "the rail alone: no page over it");
  badge("closer").click();
  await repos();
  assert.equal(onglet().ariaSelected, "true");
  assert.deepEqual([vue.element("contenu").hidden, vue.element("etat").hidden], [false, true], "the page is over the rail, Settings is not");
  assert.equal(vue.element("agents-du-projet").hidden, false);
  assert.match(vue.element("agents-du-projet").textContent, /closed pass #4100 \(dead code\): merged/);
  assert.equal(vue.element("equipe-du-projet").dessous("section").length, 1, "the badge still opens its own thread, where the level and the OK are");
  // Un cook de la rangée ouvre l'agent « cooks », qui tient leurs réglages : son fil s'ouvre, celui du closer se referme.
  badge("cook #4029").click();
  await repos();
  assert.match(vue.element("agents-du-projet").textContent, /took #4029 \(first in line\): done/);
  assert.ok(!vue.element("agents-du-projet").textContent.includes("closed pass #4100"));
  assert.equal(lire.filter(([quoi]) => quoi === "lire").length >= 1, true);
});
