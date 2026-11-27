// Les choix du second, sous son terminal (#1520, épique #1518) : quand le second publie une liste de choix par son
// canal, l'onglet du second montre un bouton par choix, son libellé d'une ligne. Un clic envoie le choix au second
// comme s'il était tapé ; une réponse tapée dans le terminal fait partir les boutons aussi ; une proposition nouvelle
// remplace la précédente, et le second passé à autre chose, il ne reste rien. Sans proposition, le terminal est tel
// qu'avant. Le module est joué seul, puis la vue entière devant le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Proposition } from "../../../src/second/proposals.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { EXPECTED, setChoiceOfSecond, answerTyped, holdTheChoice } from "../../../src/vue/second/choice.js";
import { Fake, type Played, playTheVue, type Answers, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const OTHER: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

// Ce que le canal du second rend (runtime/src/second-propositions/canal.ts) : des choix, chacun sa valeur et son libellé.
type Choice = Extract<Proposition, { kind: "choices" }>;
const choice = (id: string, choices: { value: string; label: string }[]): Choice => ({ kind: "choices", choices, id, at: "2026-10-23T10:00:00.000Z" });
const MERGER = choice("p-1", [
  { value: "A", label: "Merge it now" },
  { value: "B", label: "Wait for the review of #1482 first" },
  { value: "C", label: "Send it back to its cook" },
]);
const SPLIT = choice("p-2", [
  { value: "1", label: "Split the ticket in two" },
  { value: "2", label: "Keep it whole" },
]);
const ACTION: Proposition = { kind: "gesture", command: "! gh pr merge 1480 --merge", id: "p-3", at: "2026-10-23T10:00:00.000Z" };

const wordings = (or: Fake) => or.dessous("button").filter((button) => button.className === "choix").map((button) => button.dessous("span").find((span) => span.className === "libelle")?.textContent);
const button = (or: Fake, value: string) => or.dessous("button").find((pose) => pose.className === "choix" && pose.dataset.valeur === value) ?? assert.fail(`pas de choix « ${value} »`);

describe("le module : un bouton par choix", () => {
  test("ce qu'on attend du chef en tête, puis un bouton par choix, dans l'ordre publié, avec sa valeur et son libellé entiers", () => {
    const chosen: string[] = [];
    const pose: Fake = setChoiceOfSecond(doc, choice("p-9", [...MERGER.choices, { value: "D", label: `A label that is long ${"and goes on ".repeat(12)}` }]), { choisir: (value) => chosen.push(value) });
    assert.equal(pose.className, "choix-du-second");
    assert.equal(pose.dataset.proposition, "p-9");
    assert.equal(pose.dessous("p")[0]?.textContent.startsWith(EXPECTED), true);
    // Comment répondre est au survol, pas écrit à plat.
    assert.equal(pose.dessous("button").filter((b) => b.className === "aide").length, 1);
    assert.deepEqual(wordings(pose), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook", `A label that is long ${"and goes on ".repeat(12)}`]);
    assert.deepEqual(
      pose.dessous("button").filter((b) => b.className === "choix").map((b) => b.dessous("span")[0]?.textContent),
      ["A", "B", "C", "D"],
    );
    button(pose, "B").click();
    assert.deepEqual(chosen, ["B"]);
  });

  test("une réponse tapée porte une Entrée ; une frappe sans Entrée, un retour à la ligne de claude ou un collage n'en sont pas", () => {
    assert.equal(answerTyped("\r"), true);
    assert.equal(answerTyped("B\r"), true);
    assert.equal(answerTyped("B"), false);
    assert.equal(answerTyped("\x1b[A"), false);
    assert.equal(answerTyped("\x1b[200~a pasted\rtext\x1b[201~"), false);
  });

  test("la vue tient la dernière proposition de chaque projet : remplacée, effacée, répondue", () => {
    const heldEntries = holdTheChoice();
    assert.equal(heldEntries.aMontrer("parade"), undefined);
    heldEntries.recevoir("parade", MERGER);
    heldEntries.recevoir("fanfare", SPLIT);
    assert.equal(heldEntries.aMontrer("parade"), MERGER);
    heldEntries.recevoir("parade", SPLIT);
    assert.equal(heldEntries.aMontrer("parade"), SPLIT);
    // Un geste n'est pas une liste de choix : pas de choix pour lui — son bouton est celui de action.test.ts (#1521).
    heldEntries.recevoir("parade", ACTION);
    assert.equal(heldEntries.aMontrer("parade"), undefined);
    heldEntries.recevoir("parade", MERGER);
    assert.equal(heldEntries.repondre("parade"), MERGER);
    assert.equal(heldEntries.aMontrer("parade"), undefined);
    assert.equal(heldEntries.repondre("parade"), undefined);
    // Le canal la redit avant de l'effacer : elle ne revient pas.
    heldEntries.recevoir("parade", MERGER);
    assert.equal(heldEntries.aMontrer("parade"), undefined);
    heldEntries.recevoir("fanfare", null);
    assert.equal(heldEntries.aMontrer("fanfare"), undefined);
  });
});

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, FANFARE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: (project) => (project === "fanfare" ? [OTHER] : [SECOND]),
    machines: () => [{ id: "poste", titre: "this computer" }],
    shell: () => SHELL,
    ...answers,
  });
  await enter(vue, 1);
  return vue;
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier.
const enter = async (vue: Played, rank: number) => {
  (vue.element("projets").children.at(rank) ?? assert.fail(`pas d'entrée ${rank}`)).click();
  await repos();
};
const under = (vue: Played) => vue.element("choix-du-second");
// Ce qui se voit sous le terminal : rien, ou les libellés des boutons.
const seenOne = (vue: Played) => (under(vue).hidden ? [] : wordings(under(vue)));
const writtenOnes = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
const answers = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "repondreAuSecond").map(({ args }) => args);
const publish = async (vue: Played, project: string, proposal: Proposition | null) => {
  vue.dire("surProposition", project, proposal);
  await repos();
};
const terminal = (vue: Played) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("dans l'onglet du second", () => {
  test("sans proposition, rien sous le terminal, et le terminal se comporte comme avant", async () => {
    const vue = await open();
    assert.equal(under(vue).hidden, true);
    assert.equal(under(vue).children.length, 0);
    terminal(vue).taper("B");
    terminal(vue).taper("\r");
    assert.deepEqual(writtenOnes(vue), [[1, "B"], [1, "\r"]]);
    assert.deepEqual(answers(vue), []);
  });

  test("le second publie des choix : un bouton par choix sous le terminal, avec son libellé", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    assert.deepEqual(seenOne(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    assert.equal(under(vue).children[0]?.dessous("p")[0]?.textContent.startsWith(EXPECTED), true);
  });

  test("un clic envoie le choix au second comme s'il était tapé, puis les boutons partent et le canal l'apprend", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    const before = terminal(vue).focalise;
    button(under(vue), "B").click();
    await repos();
    // Ce qu'un chef taperait : la valeur, puis Entrée, dans le terminal du second.
    assert.deepEqual(writtenOnes(vue), [[1, "B"], [1, "\r"]]);
    assert.deepEqual(answers(vue), [["parade", { id: "p-1", by: "click", value: "B" }]]);
    assert.deepEqual(seenOne(vue), []);
    assert.equal(under(vue).hidden, true);
    // Le terminal reprend le clavier, pour la suite de la conversation.
    assert.equal(terminal(vue).focalise, before + 1);
    // Le canal efface la proposition : rien ne revient.
    await publish(vue, "parade", null);
    assert.deepEqual(seenOne(vue), []);
  });

  test("une réponse tapée dans le terminal fait partir les boutons ; une frappe sans Entrée les laisse", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    terminal(vue).taper("ok, let's do ");
    assert.deepEqual(seenOne(vue).length, 3);
    terminal(vue).taper("A but squash it\r");
    await repos();
    assert.deepEqual(writtenOnes(vue), [[1, "ok, let's do "], [1, "A but squash it\r"]]);
    assert.deepEqual(answers(vue), [["parade", { id: "p-1", by: "text" }]]);
    assert.deepEqual(seenOne(vue), []);
    // Une autre Entrée ne répond à rien de plus.
    terminal(vue).taper("\r");
    assert.equal(answers(vue).length, 1);
  });

  test("une proposition nouvelle remplace les boutons de la précédente ; le second passé à autre chose, il n'en reste aucun", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    await publish(vue, "parade", SPLIT);
    assert.deepEqual(seenOne(vue), ["Split the ticket in two", "Keep it whole"]);
    button(under(vue), "2").click();
    await repos();
    assert.deepEqual(answers(vue), [["parade", { id: "p-2", by: "click", value: "2" }]]);
    await publish(vue, "parade", MERGER);
    assert.deepEqual(seenOne(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    await publish(vue, "parade", null);
    assert.deepEqual(seenOne(vue), []);
    // Un geste n'a pas de bouton de choix : le sien, qui porte sa commande, est dans action.test.ts (#1521).
    await publish(vue, "parade", ACTION);
    assert.deepEqual(seenOne(vue), []);
  });

  test("les choix d'un projet restent à son second : ni sur un autre projet, ni sous un shell", async () => {
    const vue = await open();
    await publish(vue, "fanfare", SPLIT);
    assert.deepEqual(seenOne(vue), []);
    await publish(vue, "parade", MERGER);
    const parShell = vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »");
    parShell.click();
    await repos();
    // Une seule machine : le shell s'ouvre d'un clic, et se montre à la place du second.
    assert.deepEqual(vue.element("terminaux").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent), ["shell 1"]);
    assert.deepEqual(seenOne(vue), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(seenOne(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
    await enter(vue, 2);
    assert.deepEqual(seenOne(vue), ["Split the ticket in two", "Keep it whole"]);
  });

  test("un second arrêté n'a pas de boutons : un clic le relancerait sans rien taper", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    assert.deepEqual(seenOne(vue), []);
    vue.dire("surEtat", SECOND);
    await repos();
    assert.equal(seenOne(vue).length, 3);
  });

  test("ce que le second proposait déjà à l'ouverture de l'app se montre dès que son espace s'ouvre", async () => {
    const vue = await open({ propositionsDuSecond: () => ({ parade: MERGER }) });
    assert.deepEqual(seenOne(vue), ["Merge it now", "Wait for the review of #1482 first", "Send it back to its cook"]);
  });
});
