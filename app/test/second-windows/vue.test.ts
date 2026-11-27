// L'onglet du second sur un poste Windows (#1522, épique #1518) : la vue entière devant le faux pont, le poste dit
// « this computer » et n'est pas un Mac. Les flux de #1520 et #1521 — un clic sur un choix, un geste confirmé puis lancé, une
// réponse tapée, une proposition périmée — y font ce qu'ils font ailleurs, et ce qui part vers le terminal est ce que
// ConPTY attend : la commande à l'octet près, puis `\r` seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { CANCEL, LAUNCH } from "../../src/vue/second/action.js";
import { type Played, playTheVue, repos } from "../helpers/false-vue.ts";
import { WITH_QUOTES, button, CHOICE, choice, click, commands, confirmation, writtenOnes, action, LINE_STATION, MERGER, publish, answer, answers, STATION_UNDER_BANG, under } from "./helpers.ts";

const PARADE: Project = { nom: "parade", dossier: "C:\\Users\\chef\\parade" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "new session", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "PowerShell 1", note: "", arrete: false };
const ENTRY = "\r";

async function open(): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "C:\\Users\\chef\\AppData\\Roaming\\brigade\\app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      // Le poste Windows : son nom à l'écran, et ce n'est pas un Mac.
      poste: { nom: "this computer", mac: false },
    }),
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
    shell: () => SHELL,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée du projet")).click();
  await repos();
  return vue;
}
const terminal = (vue: Played) => vue.xterms[0] ?? assert.fail("pas de terminal");

describe("sous Windows : les choix du second", () => {
  test("un clic sur un choix envoie sa valeur puis `\\r` seul — pas `\\r\\n`, qui serait deux Entrées —, et les boutons partent", async () => {
    const vue = await open();
    await publish(vue, "parade", CHOICE);
    assert.equal(under(vue).hidden, false);
    const focuses = terminal(vue).focalise;
    await click(button(under(vue), "choix", (pose) => pose.dataset.valeur === "B"));
    assert.deepEqual(writtenOnes(vue), [[1, "B"], [1, ENTRY]]);
    assert.equal(writtenOnes(vue).flat().some((bytes) => typeof bytes === "string" && bytes.includes("\n")), false);
    assert.deepEqual(answers(vue), [["parade", { id: "c-1", by: "click", value: "B" }]]);
    assert.equal(under(vue).hidden, true);
    assert.equal(terminal(vue).focalise, focuses + 1);
  });

  test("une réponse tapée (`\\r` de ConPTY) fait partir les choix ; une frappe sans Entrée, ou un collage, les laisse", async () => {
    const vue = await open();
    await publish(vue, "parade", CHOICE);
    terminal(vue).taper("quelque chose");
    // Un collage de plusieurs lignes, avec les marques de xterm : `claude` le garde dans son champ.
    terminal(vue).taper("\x1b[200~line one\r\nline two\x1b[201~");
    await repos();
    assert.equal(under(vue).hidden, false);
    assert.deepEqual(answers(vue), []);
    terminal(vue).taper(ENTRY);
    await repos();
    assert.deepEqual(answers(vue), [["parade", { id: "c-1", by: "text" }]]);
    assert.equal(under(vue).hidden, true);
    // Rien n'est écrit par la vue : le terminal n'a reçu que ce que le chef a tapé.
    assert.deepEqual(writtenOnes(vue), [[1, "quelque chose"], [1, "\x1b[200~line one\r\nline two\x1b[201~"], [1, ENTRY]]);
  });

  test("une proposition nouvelle remplace les boutons, et le second arrêté ou effacé les retire", async () => {
    const vue = await open();
    await publish(vue, "parade", CHOICE);
    await publish(vue, "parade", choice("c-2", [{ value: "1", label: "Split" }, { value: "2", label: "Keep" }]));
    assert.deepEqual(under(vue).dessous("button").filter((b) => b.className === "choix").map((b) => b.dataset.valeur), ["1", "2"]);
    vue.dire("surEtat", { ...SECOND, arrete: true, note: "the second stopped (code 1) — a keypress restarts it" });
    await repos();
    assert.equal(under(vue).hidden, true);
    vue.dire("surEtat", SECOND);
    await repos();
    assert.equal(under(vue).hidden, false);
    await publish(vue, "parade", null);
    assert.equal(under(vue).hidden, true);
    assert.deepEqual(writtenOnes(vue), []);
  });

  // DÉFAUT trouvé dans app/src/vue/vue.js (`choisirAuSecond`, #1520), fichier d'un ticket précédent : non corrigé ici.
  // Contrairement à « run it » (`lancerLeGeste` vérifie l'id), un clic sur un choix n'est lié qu'au projet : un clic arrivé
  // d'un bouton que la proposition suivante a remplacé tape sa valeur dans le second, et répond à la nouvelle question.
  test("un clic sur le bouton d'une proposition remplacée n'écrit rien", { todo: "defect of #1520: choisirAuSecond does not check the proposal id, unlike lancerLeGeste" }, async () => {
    const vue = await open();
    await publish(vue, "parade", CHOICE);
    const old = button(under(vue), "choix", (pose) => pose.dataset.valeur === "A");
    await publish(vue, "parade", choice("c-2", [{ value: "1", label: "Split" }, { value: "2", label: "Keep" }]));
    await click(old);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
  });
});

describe("sous Windows : le geste que le second nomme", () => {
  test("le bouton, sa confirmation, puis « run it » : une commande à guillemets, espaces doublés et `!` part à l'octet près, puis `\\r` seul", async () => {
    const vue = await open();
    await publish(vue, "parade", action("g-q", WITH_QUOTES));
    assert.deepEqual(commands(under(vue)), [WITH_QUOTES]);
    assert.deepEqual(writtenOnes(vue), []);
    await click(button(under(vue), "geste"));
    assert.deepEqual(commands(under(vue)), [WITH_QUOTES, WITH_QUOTES]);
    assert.deepEqual(writtenOnes(vue), []);
    await click(answer(under(vue), LAUNCH));
    assert.deepEqual(writtenOnes(vue), [[1, WITH_QUOTES], [1, ENTRY]]);
    assert.deepEqual(answers(vue), [["parade", { id: "g-q", by: "click" }]]);
    assert.equal(under(vue).hidden, true);
  });

  test("une ligne du geste de la station — nue ou sous le `!` du second — part telle que publiée, ses guillemets intacts", async () => {
    for (const [rank, line] of [LINE_STATION, STATION_UNDER_BANG].entries()) {
      const vue = await open();
      await publish(vue, "parade", action(`g-s${rank}`, line));
      assert.deepEqual(commands(under(vue)), [line]);
      await click(button(under(vue), "geste"));
      await click(answer(under(vue), LAUNCH));
      assert.deepEqual(writtenOnes(vue), [[1, line], [1, ENTRY]]);
    }
  });

  test("« cancel » ne lance rien et ne touche pas au terminal ; rien ne part sans le « run it » du chef", async () => {
    const vue = await open();
    await publish(vue, "parade", action("g-q", WITH_QUOTES));
    const output = [...terminal(vue).ecrits];
    await click(button(under(vue), "geste"));
    await click(answer(under(vue), CANCEL));
    assert.equal(confirmation(under(vue)), undefined);
    assert.deepEqual(commands(under(vue)), [WITH_QUOTES]);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
    assert.deepEqual(terminal(vue).ecrits, output);
  });

  test("une réponse tapée fait partir le geste, sans que la vue y écrive rien", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    terminal(vue).taper("! gh pr merge 1480 --merge");
    await repos();
    assert.equal(under(vue).hidden, false);
    terminal(vue).taper(ENTRY);
    await repos();
    assert.equal(under(vue).hidden, true);
    assert.deepEqual(answers(vue), [["parade", { id: "g-1", by: "text" }]]);
    assert.deepEqual(writtenOnes(vue), [[1, "! gh pr merge 1480 --merge"], [1, ENTRY]]);
  });

  test("le second passe à autre chose : le bouton, sa confirmation ouverte et son « run it » partent, et rien n'est écrit", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    await click(button(under(vue), "geste"));
    const old = answer(under(vue), LAUNCH);
    await publish(vue, "parade", action("g-2", STATION_UNDER_BANG));
    assert.equal(confirmation(under(vue)), undefined);
    assert.deepEqual(commands(under(vue)), [STATION_UNDER_BANG]);
    await click(old);
    assert.deepEqual(writtenOnes(vue), []);
    // Des choix à la place, puis rien : plus de geste.
    await click(button(under(vue), "geste"));
    const second = answer(under(vue), LAUNCH);
    await publish(vue, "parade", CHOICE);
    assert.deepEqual(commands(under(vue)), []);
    await click(second);
    await publish(vue, "parade", null);
    assert.equal(under(vue).hidden, true);
    assert.deepEqual(writtenOnes(vue), []);
    assert.deepEqual(answers(vue), []);
  });

  test("un shell PowerShell ouvert à côté, ou le second arrêté, ne montre pas le geste : rien ne se lance ailleurs que dans le second", async () => {
    const vue = await open();
    await publish(vue, "parade", MERGER);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "+ shell") ?? assert.fail("pas de « + shell »")).click();
    await repos();
    assert.deepEqual(commands(under(vue)), []);
    (vue.element("terminaux").children.find((pose) => pose.textContent === "second · claude") ?? assert.fail("pas d'onglet du second")).click();
    await repos();
    assert.deepEqual(commands(under(vue)), ["! gh pr merge 1480 --merge"]);
  });
});
