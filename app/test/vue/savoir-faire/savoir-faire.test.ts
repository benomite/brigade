// L'onglet Know-how, posé seul devant un faux document (#4241) : ce que les tests gelés ne disent pas — une lecture qui
// échoue se dit et se relance, une lecture dépassée ne dit plus rien, un geste en route grise les siens, un refus se dit
// sous son entrée et garde le texte tapé, « Cancel » ne change rien, et un geste qui répond après une relecture est oublié.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Faux, repos } from "../../aides/fausse-vue.ts";
import { poserLeSavoirFaire, relireLeSavoirFaire } from "../../../src/vue/savoir-faire/savoir-faire.js";
import { source } from "../../../src/vue/savoir-faire/source.js";

const doc = { createElement: (balise: string) => new Faux(balise) };
type Entree = { id: string; text: string; ticket: number };
const ENTREES: Entree[] = [
  { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name.", ticket: 4002 },
];

// Une fausse source : chaque appel est noté, et ne répond que quand le test le dit.
function fausseSource() {
  const appels: unknown[][] = [];
  const attentes: { resoudre: (valeur?: unknown) => void; rejeter: (erreur: unknown) => void }[] = [];
  const attendre = (...args: unknown[]) => {
    appels.push(args);
    return new Promise((resoudre, rejeter) => attentes.push({ resoudre, rejeter }));
  };
  Object.assign(source, { lire: (projet: string) => attendre("lire", projet), modifier: (id: string, texte: string, projet: string) => attendre("modifier", id, texte, projet), retirer: (id: string, projet: string) => attendre("retirer", id, projet) });
  const prochaine = () => attentes.shift() ?? assert.fail("aucun appel en attente");
  return {
    appels,
    reussir: async (valeur?: unknown) => (prochaine().resoudre(valeur), await repos()),
    echouer: async (message: string, detail = "") => (prochaine().rejeter(Object.assign(new Error(message), { detail })), await repos()),
  };
}

let rang = 0;
// Un projet neuf à chaque test, et l'onglet qu'il pose — reposé à chaque `reposer`, comme la vue le fait.
function onglet() {
  const projet = `p${++rang}`;
  const vu = { section: undefined as Faux | undefined, reposes: 0 };
  const reposer = () => {
    vu.reposes++;
    vu.section = poserLeSavoirFaire(doc, projet, reposer) as Faux;
  };
  return { projet, vu, reposer };
}
const tout = (section: Faux | undefined) => [...(section?.descendants() ?? [])];
const textes = (section: Faux | undefined) => tout(section).filter((n) => n.children.length === 0 && n.textContent !== "").map((n) => n.textContent);
const entrees = (section: Faux | undefined) => tout(section).filter((n) => n.className === "entree");
const bouton = (ligne: Faux | undefined, libelle: string) => ligne?.dessous("button").find((b) => b.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const libelles = (ligne: Faux | undefined) => ligne?.dessous("button").map((b) => b.textContent) ?? [];

test("never read: posing the tab reads it once, says so meanwhile, then lists each entry with its ticket", async () => {
  const { appels, reussir } = fausseSource();
  const { projet, vu, reposer } = onglet();
  reposer();
  assert.ok(textes(vu.section).includes("Reading the know-how…"));
  reposer();
  assert.deepEqual(appels, [["lire", projet]], "une seule lecture part");
  await reussir(ENTREES);
  assert.deepEqual(entrees(vu.section).map((ligne) => textes(ligne)), [
    ["Run the typecheck before pushing.", "from #4001", "edit", "remove"],
    ["Never kill a process by name.", "from #4002", "edit", "remove"],
  ]);
});

test("a reading that fails says so on one line, the detail on hover, and Try again reads again", async () => {
  const { appels, echouer, reussir } = fausseSource();
  const { projet, vu, reposer } = onglet();
  reposer();
  await echouer("know-how unavailable", "$ know-how\nboom");
  const ligne = tout(vu.section).find((n) => n.dataset.ligne === "erreur") ?? assert.fail("pas de ligne d'erreur");
  assert.equal(ligne.dessous("span")[0]?.textContent, "know-how unavailable");
  assert.ok(tout(ligne).some((n) => n.ariaLabel === "$ know-how\nboom" || n.title === "$ know-how\nboom" || n.textContent.includes("boom")), "le détail est au survol");
  bouton(vu.section, "Try again").click();
  await reussir([]);
  assert.deepEqual(appels, [["lire", projet], ["lire", projet]]);
  assert.ok(textes(vu.section).includes("No know-how yet. The project has no entry."));
  assert.deepEqual(vu.section?.dessous("button"), []);
});

test("an older reading that answers after a newer one says nothing", async () => {
  const appels: unknown[] = [];
  const reponses: ((entrees: Entree[]) => void)[] = [];
  Object.assign(source, { lire: (projet: string) => (appels.push(projet), new Promise<Entree[]>((resoudre) => reponses.push(resoudre))) });
  const { projet, vu, reposer } = onglet();
  relireLeSavoirFaire(projet, reposer);
  relireLeSavoirFaire(projet, reposer);
  reponses[1]?.([ENTREES[1] as Entree]);
  await repos();
  reponses[0]?.(ENTREES);
  await repos();
  assert.deepEqual(appels, [projet, projet]);
  assert.deepEqual(entrees(vu.section).map((ligne) => textes(ligne)[0]), ["Never kill a process by name."]);
});

test("edit: the text in a field, typed text kept across redraws, save sends it once and greys the gestures meanwhile", async () => {
  const { appels, reussir } = fausseSource();
  const { projet, vu, reposer } = onglet();
  reposer();
  await reussir(ENTREES);
  bouton(entrees(vu.section)[1], "edit").click();
  const [premiere, seconde] = entrees(vu.section);
  assert.deepEqual(libelles(premiere), ["edit", "remove"], "l'autre entrée reste fermée");
  assert.deepEqual(libelles(seconde), ["save", "Cancel"]);
  assert.equal(bouton(seconde, "save").className, "recommande", "« save » est le geste recommandé");
  const champ = seconde?.dessous("textarea")[0] ?? assert.fail("pas de champ");
  assert.equal(champ.value, "Never kill a process by name.");
  champ.value = "Never kill a process by name,\n use its pid.";
  champ.declencher("input");
  reposer();
  const repose = entrees(vu.section)[1]?.dessous("textarea")[0] ?? assert.fail("pas de champ reposé");
  assert.equal(repose.value, "Never kill a process by name,\n use its pid.", "le texte tapé tient au rendu suivant");
  assert.equal(repose.dataset.champ, "savoir-faire");
  bouton(entrees(vu.section)[1], "save").click();
  assert.deepEqual(appels.at(-1), ["modifier", "L2", "Never kill a process by name,\n use its pid.", projet]);
  const enRoute = entrees(vu.section)[1];
  assert.deepEqual(libelles(enRoute), ["Saving…", "Cancel"]);
  assert.ok(enRoute?.dessous("button").every((b) => b.disabled), "ses gestes sont gris");
  assert.equal(enRoute?.dessous("textarea")[0]?.readOnly, true);
  assert.ok(entrees(vu.section)[0]?.dessous("button").every((b) => !b.disabled), "ceux de l'autre entrée, non");
  await reussir();
  assert.deepEqual(entrees(vu.section).map((ligne) => textes(ligne)[0]), ["Run the typecheck before pushing.", "Never kill a process by name, use its pid."]);
  assert.deepEqual(libelles(entrees(vu.section)[1]), ["edit", "remove"]);
});

test("a refused save says its reason under its entry only, and keeps the typed text in the field; Cancel leaves the entry as it was", async () => {
  const { appels, reussir, echouer } = fausseSource();
  const { vu, reposer } = onglet();
  reposer();
  await reussir(ENTREES);
  bouton(entrees(vu.section)[0], "edit").click();
  const champ = entrees(vu.section)[0]?.dessous("textarea")[0] ?? assert.fail("pas de champ");
  champ.value = "Typed.";
  champ.declencher("input");
  bouton(entrees(vu.section)[0], "save").click();
  await echouer("“L1” is not an entry of the project's know-how", "$ know-how edit L1 Typed.");
  const [premiere, seconde] = entrees(vu.section);
  assert.equal(premiere?.dessous("textarea")[0]?.value, "Typed.");
  assert.ok(premiere?.dessous("button").every((b) => !b.disabled));
  assert.ok(tout(premiere).some((n) => n.role === "alert" && n.textContent.includes("“L1” is not an entry of the project's know-how")));
  assert.ok(!tout(seconde).some((n) => n.role === "alert"), "rien sous l'autre entrée");
  bouton(premiere, "Cancel").click();
  assert.deepEqual(textes(entrees(vu.section)[0]), ["Run the typecheck before pushing.", "from #4001", "edit", "remove"]);
  assert.equal(appels.filter(([geste]) => geste === "modifier").length, 1);
});

test("remove asks first; Cancel keeps the entry, Yes removes it and only it; a refusal keeps it and says why", async () => {
  const { appels, reussir, echouer } = fausseSource();
  const { projet, vu, reposer } = onglet();
  reposer();
  await reussir(ENTREES);
  bouton(entrees(vu.section)[0], "remove").click();
  assert.ok(textes(entrees(vu.section)[0]).includes("Remove this entry? No cook will receive it any more."));
  assert.deepEqual(libelles(entrees(vu.section)[0]), ["Yes, remove", "Cancel"]);
  assert.deepEqual(libelles(entrees(vu.section)[1]), ["edit", "remove"]);
  bouton(entrees(vu.section)[0], "Cancel").click();
  assert.deepEqual(libelles(entrees(vu.section)[0]), ["edit", "remove"]);
  // Une confirmation ouverte se referme quand une autre entrée s'ouvre.
  bouton(entrees(vu.section)[0], "remove").click();
  bouton(entrees(vu.section)[1], "edit").click();
  assert.deepEqual(libelles(entrees(vu.section)[0]), ["edit", "remove"]);
  bouton(entrees(vu.section)[0], "remove").click();
  assert.deepEqual(libelles(entrees(vu.section)[1]), ["edit", "remove"], "et l'entrée ouverte se referme");
  bouton(entrees(vu.section)[0], "Yes, remove").click();
  assert.deepEqual(appels.at(-1), ["retirer", "L1", projet]);
  await echouer("nothing was changed: the runtime's answer could not be read");
  assert.equal(entrees(vu.section).length, 2);
  assert.ok(tout(entrees(vu.section)[0]).some((n) => n.role === "alert" && n.textContent.includes("could not be read")));
  bouton(entrees(vu.section)[0], "Yes, remove").click();
  await reussir();
  assert.deepEqual(entrees(vu.section).map((ligne) => textes(ligne)[0]), ["Never kill a process by name."]);
});

test("a gesture that answers after the tab was read again is forgotten, success or refusal", async () => {
  const { reussir, echouer } = fausseSource();
  const { projet, vu, reposer } = onglet();
  reposer();
  await reussir(ENTREES);
  bouton(entrees(vu.section)[0], "remove").click();
  bouton(entrees(vu.section)[0], "Yes, remove").click();
  bouton(entrees(vu.section)[1], "edit").click();
  bouton(entrees(vu.section)[1], "save").click();
  relireLeSavoirFaire(projet, reposer);
  await reussir();
  await echouer("refused");
  await reussir(ENTREES);
  assert.deepEqual(entrees(vu.section).map((ligne) => textes(ligne)), [
    ["Run the typecheck before pushing.", "from #4001", "edit", "remove"],
    ["Never kill a process by name.", "from #4002", "edit", "remove"],
  ]);
});
