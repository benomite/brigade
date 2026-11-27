// Le geste que le second nomme, sous son terminal (#1521, épique #1518) : quand le second publie un geste par son canal,
// l'onglet du second montre un bouton qui porte la commande exacte, entière même longue. Un clic ouvre une confirmation
// qui la redit entière ; « cancel » ne lance rien et ne touche pas au terminal ; « run it » la tape dans le terminal du
// second, puis Entrée, au nom du chef, telle que publiée. Lancé, remplacé ou effacé, le bouton part. Aucun chemin ne
// laisse le second la lancer : seuls le clic du chef puis son « run it ». Le module est joué seul, puis la vue entière
// devant le faux pont (helpers/false-vue.ts).
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
import { holdTheChoice } from "../../../src/vue/second/choice.js";
import { HELP, CANCEL, EXPECTED, BUTTON, LAUNCH, setActionOfSecond, TITLE, SEE } from "../../../src/vue/second/action.js";
import { Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const OTHER: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

// Ce que le canal du second rend (runtime/src/second-propositions/canal.ts) : un geste, sa commande telle quelle.
type Action = Extract<Proposition, { kind: "gesture" }>;
const action = (id: string, command: string): Action => ({ kind: "gesture", command, id, at: "2026-10-23T10:00:00.000Z" });
const MERGER = action("g-1", "! gh pr merge 1480 --merge");
// Une commande longue, avec ce qu'une commande porte : des espaces doublés, des guillemets, `$`, `&&`, un espace en tête
// et en queue. Elle se lit entière, à l'octet près.
const LONG = ` ! sh -c "cd ~/parade  &&  brigade parade pass 1480 --merge --delete-branch --comment 'approved by the chef after the review of #1482, \$HOME kept as is'" ${"--and-a-flag-that-goes-on ".repeat(6)}`;
const PASS = action("g-2", LONG);
const CHOICE: Proposition = { kind: "choices", choices: [{ value: "A", label: "Merge it now" }, { value: "B", label: "Wait" }], id: "c-1", at: "2026-10-23T10:00:00.000Z" };

// Le bouton du geste, sa confirmation, et ce qu'ils montrent de la commande.
const theButton = (or: Fake) => or.dessous("button").find((pose) => pose.className === "geste");
const button = (or: Fake) => theButton(or) ?? assert.fail("pas de bouton de geste");
const confirmation = (or: Fake) => or.dessous("section").find((pose) => pose.className === "confirmation");
const answer = (or: Fake, wording: string) => (confirmation(or) ?? assert.fail("pas de confirmation")).dessous("button").find((pose) => pose.textContent === wording) ?? assert.fail(`pas de « ${wording} »`);
const commands = (or: Fake) => [...or.descendants()].filter((pose) => pose.className === "commande mono").map((pose) => pose.textContent);

describe("le module : un bouton qui porte la commande, et sa confirmation", () => {
  test("ce qu'on attend du chef en tête, comment ça marche au survol, puis un bouton qui porte la commande exacte, sans confirmation ouverte", () => {
    const calls: string[] = [];
    const pose: Fake = setActionOfSecond(doc, MERGER, { ouverte: false, basculer: () => calls.push("basculer"), annuler: () => calls.push("annuler"), lancer: () => calls.push("lancer") });
    assert.equal(pose.className, "geste-du-second");
    assert.equal(pose.dataset.proposition, "g-1");
    assert.equal(pose.dessous("p")[0]?.textContent.startsWith(EXPECTED), true);
    const help = pose.dessous("button").filter((b) => b.className === "aide");
    assert.equal(help.length, 1);
    assert.equal(help[0]?.ariaLabel, HELP);
    // Le bouton parle au chef ; la commande exacte n'est nulle part à l'écran, elle est au survol du bouton.
    assert.equal(button(pose).textContent, BUTTON);
    assert.equal(button(pose).ariaLabel, "! gh pr merge 1480 --merge");
    assert.deepEqual(commands(pose), []);
    assert.equal(button(pose).ariaExpanded, "false");
    assert.equal(confirmation(pose), undefined);
    button(pose).click();
    assert.deepEqual(calls, ["basculer"]);
  });

  test("une commande longue se lit entière, à l'octet près — espaces, guillemets, `$` —, au survol du bouton et dans l'aide repliée de la confirmation", () => {
    const pose: Fake = setActionOfSecond(doc, PASS, { ouverte: true, basculer: () => {}, annuler: () => {}, lancer: () => {} });
    assert.equal(button(pose).ariaLabel, LONG);
    assert.deepEqual(commands(pose), [LONG]);
    // Elle ne passe à la ligne qu'entre ses mots : chacun d'un tenant, aucun n'est coupé ni réécrit.
    const words = (pose.dessous("p").find((p) => p.className === "commande mono") ?? assert.fail("pas de commande")).children.map((word) => word.textContent);
    assert.deepEqual(words, LONG.split(/ +/).filter((word) => word !== ""));
  });

  test("ouverte, la confirmation redit la commande sous sa question, puis « run it », recommandé, et « cancel »", () => {
    const calls: string[] = [];
    const pose: Fake = setActionOfSecond(doc, MERGER, { ouverte: true, basculer: () => calls.push("basculer"), annuler: () => calls.push("annuler"), lancer: () => calls.push("lancer") });
    const openOne = confirmation(pose) ?? assert.fail("pas de confirmation");
    assert.equal(button(pose).ariaExpanded, "true");
    // Sous sa question, la commande est dans une aide repliée — fermée —, puis les deux réponses.
    assert.deepEqual(
      openOne.children.map((pose) => pose.className === "replie" ? pose.dessous("summary")[0]?.textContent.startsWith(SEE) : pose.textContent),
      [TITLE, true, LAUNCH, CANCEL],
    );
    assert.deepEqual(commands(pose), ["! gh pr merge 1480 --merge"]);
    assert.equal(answer(pose, LAUNCH).className, "recommande");
    // Rien ne coûte : pas de ligne de prix.
    assert.equal(openOne.dessous("p").some((p) => p.className === "prix"), false);
    answer(pose, CANCEL).click();
    answer(pose, LAUNCH).click();
    assert.deepEqual(calls, ["annuler", "lancer"]);
  });

  test("la vue tient la confirmation d'un geste par sa proposition : « run it » ne rend le geste que s'il est encore là, sa confirmation ouverte", () => {
    const heldEntries = holdTheChoice();
    heldEntries.recevoir("parade", MERGER);
    assert.equal(heldEntries.geste("parade"), MERGER);
    assert.equal(heldEntries.aMontrer("parade"), undefined);
    // Sans confirmation ouverte, rien ne part.
    assert.equal(heldEntries.lancer("parade", "g-1"), undefined);
    heldEntries.confirmer("parade", true);
    assert.equal(heldEntries.confirmationOuverte("parade"), true);
    heldEntries.confirmer("parade", false);
    assert.equal(heldEntries.lancer("parade", "g-1"), undefined);
    // Une proposition nouvelle n'a pas de confirmation ouverte, et celle de l'ancienne ne lance rien.
    heldEntries.confirmer("parade", true);
    heldEntries.recevoir("parade", PASS);
    assert.equal(heldEntries.confirmationOuverte("parade"), false);
    assert.equal(heldEntries.lancer("parade", "g-1"), undefined);
    heldEntries.confirmer("parade", true);
    assert.equal(heldEntries.lancer("parade", "g-1"), undefined);
    assert.equal(heldEntries.lancer("parade", "g-2"), PASS);
    // Lancé, il ne se montre plus, ne se relance pas, et ne revient pas quand le canal le redit.
    assert.equal(heldEntries.geste("parade"), undefined);
    assert.equal(heldEntries.lancer("parade", "g-2"), undefined);
    heldEntries.recevoir("parade", PASS);
    assert.equal(heldEntries.geste("parade"), undefined);
    // Effacé par le second, il n'y a plus rien à lancer.
    heldEntries.recevoir("parade", MERGER);
    heldEntries.confirmer("parade", true);
    heldEntries.recevoir("parade", null);
    assert.equal(heldEntries.lancer("parade", "g-1"), undefined);
    // Une réponse tapée le fait partir aussi ; les choix ne répondent pas à un geste.
    heldEntries.recevoir("fanfare", action("g-3", "! true"));
    assert.equal(heldEntries.repondre("fanfare"), undefined);
    assert.equal(heldEntries.repondreAuClavier("fanfare")?.id, "g-3");
    assert.equal(heldEntries.geste("fanfare"), undefined);
  });
});

async function open(): Promise<Played> {
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
// Ce qui se voit sous le terminal : la commande du bouton, et celle de la confirmation si elle est ouverte.
const seenOne = (vue: Played) => (under(vue).hidden ? [] : commands(under(vue)));
// La commande que le bouton propose, au survol — rien quand aucun bouton n'est là.
const proposed = (vue: Played) => (under(vue).hidden ? [] : [theButton(under(vue))?.ariaLabel].filter((command) => command !== undefined));
const writtenOnes = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
const answers = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "repondreAuSecond").map(({ args }) => args);
const publish = async (vue: Played, project: string, proposal: Proposition | null) => {
  vue.dire("surProposition", project, proposal);
  await repos();
};
const click = async (pose: Fake) => {
  pose.click();
  await repos();
};
const terminal = (vue: Played) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("dans l'onglet du second", () => {
  test("le second nomme un geste : un bouton sous le terminal, en mots — la commande exacte, entière même longue, est à son survol —, et rien n'est lancé", async () => {
    const vue = await open();
    assert.equal(under(vue).hidden, true);
    await publish(vue, "parade", PASS);
    assert.equal(under(vue).hidden, false);
    // Aucune ligne de commande à l'écran : un bouton en mots, la commande au survol.
    assert.deepEqual(seenOne(vue), []);
    assert.equal(button(under(vue)).textContent, BUTTON);
    assert.equal(button(under(vue)).ariaLabel, LONG);
    assert.equal(under(vue).children[0]?.dessous("p")[0]?.textContent.startsWith(EXPECTED), true);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
  });

  test("un clic ouvre la confirmation qui redit la même commande ; « cancel » ne lance rien et laisse le terminal tel quel", async () => {
    const vue = await open();
    await publish(vue, "parade", PASS);
    const focuses = terminal(vue).focalise;
    const output = [...terminal(vue).ecrits];
    await click(button(under(vue)));
    assert.deepEqual(seenOne(vue), [LONG]);
    assert.equal((confirmation(under(vue)) ?? assert.fail("pas de confirmation")).dessous("p")[0]?.textContent, TITLE);
    await click(answer(under(vue), CANCEL));
    // La confirmation se referme ; le geste reste proposé, le chef peut y revenir.
    assert.equal(confirmation(under(vue)), undefined);
    assert.deepEqual(seenOne(vue), []);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
    assert.equal(terminal(vue).focalise, focuses);
    assert.deepEqual(terminal(vue).ecrits, output);
    // Le bouton recliqué rouvre la confirmation, et la referme encore — sans rien lancer.
    await click(button(under(vue)));
    assert.notEqual(confirmation(under(vue)), undefined);
    await click(button(under(vue)));
    assert.equal(confirmation(under(vue)), undefined);
    assert.deepEqual(writtenOnes(vue), []);
  });

  test("« run it » tape la commande dans le terminal du second, telle que publiée, puis Entrée ; le bouton part, et le canal l'apprend", async () => {
    const vue = await open();
    await publish(vue, "parade", PASS);
    const focuses = terminal(vue).focalise;
    await click(button(under(vue)));
    await click(answer(under(vue), LAUNCH));
    // Ce que le chef taperait : la commande, à l'octet près, puis Entrée, dans le terminal du second — pas dans un shell.
    assert.deepEqual(writtenOnes(vue), [[1, LONG], [1, "\r"]]);
    assert.deepEqual(answers(vue), [["parade", { id: "g-2", by: "click" }]]);
    assert.equal(under(vue).hidden, true);
    assert.deepEqual(seenOne(vue), []);
    // Le terminal reprend le clavier : la sortie de la commande s'y lit.
    assert.equal(terminal(vue).focalise, focuses + 1);
    // Le canal la redit avant de l'effacer : elle ne revient pas, et rien ne repart.
    await publish(vue, "parade", PASS);
    assert.deepEqual(seenOne(vue), []);
    await publish(vue, "parade", null);
    assert.equal(writtenOnes(vue).length, 2);
  });

  test("le second passe à autre chose ou publie une autre proposition : le bouton part, sa confirmation ouverte aussi, et son « run it » ne lance plus rien", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    await click(button(under(vue)));
    const old = answer(under(vue), LAUNCH);
    // Une proposition nouvelle : son bouton remplace l'autre, sans confirmation ouverte.
    await publish(vue, "parade", PASS);
    assert.deepEqual(seenOne(vue), []);
    assert.equal(button(under(vue)).ariaLabel, LONG);
    assert.equal(confirmation(under(vue)), undefined);
    await click(old);
    assert.deepEqual(writtenOnes(vue), []);
    // Des choix à la place : plus de geste.
    await click(button(under(vue)));
    const second = answer(under(vue), LAUNCH);
    await publish(vue, "parade", CHOICE);
    assert.equal(theButton(under(vue)), undefined);
    assert.deepEqual(seenOne(vue), []);
    await click(second);
    // Le second efface sa proposition : il ne reste rien sous le terminal.
    await publish(vue, "parade", MERGER);
    await click(button(under(vue)));
    const last = answer(under(vue), LAUNCH);
    await publish(vue, "parade", null);
    assert.equal(under(vue).hidden, true);
    assert.equal(under(vue).children.length, 0);
    await click(last);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
  });

  test("aucun chemin ne laisse le second lancer la commande : ni sa publication, ni sa répétition, ni sa sortie — seul le « run it » du chef", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    await publish(vue, "parade", MERGER);
    await publish(vue, "parade", PASS);
    await publish(vue, "parade", MERGER);
    // La commande écrite par le second dans son terminal n'est qu'une sortie.
    vue.dire("surSortie", SECOND.id, `run this: ${MERGER.command}\r\n`);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    vue.dire("surEtat", SECOND);
    await repos();
    // Le bouton cliqué n'ouvre que la confirmation.
    await click(button(under(vue)));
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
    await click(answer(under(vue), LAUNCH));
    assert.deepEqual(writtenOnes(vue), [[1, MERGER.command], [1, "\r"]]);
  });

  test("une réponse tapée dans le terminal fait partir le geste ; une frappe sans Entrée le laisse", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    terminal(vue).taper("not now");
    await repos();
    assert.deepEqual(proposed(vue), [MERGER.command]);
    terminal(vue).taper("\r");
    await repos();
    assert.deepEqual(answers(vue), [["parade", { id: "g-1", by: "text" }]]);
    assert.deepEqual(proposed(vue), []);
    // Le terminal n'a reçu que ce que le chef a tapé.
    assert.deepEqual(writtenOnes(vue), [[1, "not now"], [1, "\r"]]);
  });

  test("le geste d'un projet reste à son second : ni sur un autre projet, ni sous un shell, ni sous un second arrêté", async () => {
    const vue = await open();
    await publish(vue, "fanfare", MERGER);
    assert.deepEqual(seenOne(vue), []);
    await publish(vue, "parade", PASS);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.deepEqual(seenOne(vue), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(proposed(vue), [LONG]);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 0) — a keypress restarts it" });
    await repos();
    assert.deepEqual(seenOne(vue), []);
    vue.dire("surEtat", SECOND);
    await repos();
    await enter(vue, 2);
    assert.deepEqual(proposed(vue), [MERGER.command]);
  });
});
