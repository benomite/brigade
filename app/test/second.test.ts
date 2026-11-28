// Le second est à droite, en permanence : ce n'est pas une page. Il est visible en même temps
// que le rail ; à côté de lui, au même niveau, les shells — un shell montré ne le remplace
// jamais, son onglet le rend en un clic. Changer de page au centre ne le ferme ni ne le vide ; et
// un clic à gauche (une carte, un bouton, un geste) écrit dans lui sans que le centre change.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { HEADINGS } from "../src/tabs.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Fake, type Played, playTheVue, type Answers, openRead, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const OTHER: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

async function open(answers: Answers = {}, projects: Project[] = [PARADE, FANFARE], workstation?: { nom: string; mac: boolean }): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      ...(workstation === undefined ? {} : { poste: workstation }),
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      }),
    espace: (project) => (project === "fanfare" ? [OTHER] : [SECOND]),
    machines: () => [{ id: "poste", titre: "this computer" }],
    shell: () => SHELL,
    ...answers,
  });
  await enter(vue, 1);
  return vue;
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier, puis « + ».
const enter = async (vue: Played, rank: number) => {
  (vue.element("projets").children.at(rank) ?? assert.fail(`pas d'entrée ${rank}`)).click();
  await repos();
};
const click = async (vue: Played, or: Fake, text: string) => {
  (or.dessous("button").find((pose) => pose.textContent === text) ?? or.children.find((pose) => pose.textContent === text) ?? assert.fail(`pas de « ${text} »`)).click();
  await repos();
};
// En haut, les onglets de pages ; à droite, ceux des terminaux.
const titles = (vue: Played) => vue.element("onglets-du-projet").children.map((pose) => pose.textContent);
const selected = (vue: Played) => vue.element("onglets-du-projet").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
const terminals = (vue: Played) => vue.element("terminaux").children.map((pose) => pose.textContent);
const shows = (vue: Played) => vue.element("terminaux").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
// Les cadres des terminaux, là où la vue les a posés : dans la colonne de droite, et nulle part ailleurs.
const frames = (vue: Played) => vue.element("fil").children;
// Ce qui se voit à droite pour le projet affiché : la colonne, ses cadres montrés, le titre de l'onglet du second, la note.
function seenOfSecond(vue: Played) {
  const shown = frames(vue).filter((frame) => !frame.hidden);
  return { colonne: !vue.element("second").hidden, cadres: shown.length, titre: terminals(vue)[0], note: vue.element("note-second").textContent };
}

describe("le second est une colonne à droite, pas une page", () => {
  test("dans la page, il a sa colonne à lui : hors de la zone centrale, au bord droit du cadre — les onglets des terminaux en tête", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const frame = html.slice(html.indexOf('<div id="cadre">'), html.indexOf('<p id="relecture"'));
    const ranks = ["<main>", "</main>", '<aside id="second"', 'id="terminaux"', 'id="fil"'].map((marker) => frame.indexOf(marker));

    assert.ok(ranks.every((rank) => rank !== -1), "le cadre ne porte pas la colonne du second");
    assert.deepEqual(ranks, ranks.toSorted((a, b) => a - b));
    // Rien n'est posé après elle dans le cadre : c'est la dernière colonne.
    assert.match(frame.slice(frame.indexOf('<aside id="second"')), /^<aside id="second"[^]*?<\/aside>\s*<\/div>\s*$/);
  });

  test("il est visible dès que l'espace s'ouvre, en même temps que le rail : aucun onglet de page ne le nomme", async () => {
    const vue = await open();

    assert.deepEqual(seenOfSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
    assert.equal(vue.element("rail").hidden, false);
    // En haut, un onglet de pages, Paramètres : ni « Second », ni shell — ni Cost, qui vit au niveau de l'app (#1022).
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    // À droite, le second, montré, et au même niveau, de quoi ouvrir un shell.
    assert.deepEqual(terminals(vue), ["second · claude", "+ shell"]);
    assert.deepEqual(shows(vue), ["second · claude"]);
    // Aucune page n'est ouverte : le rail a le centre pour lui.
    assert.deepEqual(selected(vue), ["Rail"]);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("il reste monté quand la vue change : le même terminal, dans sa colonne, avec ce qu'il avait reçu — rien n'est rouvert ni vidé", async () => {
    const vue = await open();
    vue.dire("surSortie", SECOND.id, "> une conversation en cours\r\n");
    const [terminal] = vue.xterms;
    const [frame] = frames(vue);
    const held = () => {
      assert.deepEqual(seenOfSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
      // Le même cadre et le même terminal, à leur place : rien n'a été recréé, ni déplacé, ni effacé.
      assert.equal(frames(vue)[0], frame);
      assert.equal(frame?.parentElement, vue.element("fil"));
      assert.equal(vue.xterms[0], terminal);
      assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n"]);
    };

    // Settings se pose par-dessus le centre : le terminal ne bouge pas.
    await openRead(vue, "Settings");
    held();
    // Un shell s'ouvre à droite, à côté du second : il a son cadre à lui, montré à la place de
    // celui du second, qui reste posé, caché, avec ce qu'il avait reçu. La page ouverte ne bouge pas.
    const page = selected(vue);
    await click(vue, vue.element("terminaux"), "+ shell");
    assert.deepEqual(terminals(vue), ["second · claude", "shell 1", "+ shell"]);
    assert.deepEqual(shows(vue), ["shell 1"]);
    assert.deepEqual(selected(vue), page);
    assert.equal(frames(vue).length, 2);
    assert.equal(frame?.hidden, true);
    assert.equal(frames(vue).filter((pose) => !pose.hidden).length, 1);
    assert.equal(vue.xterms[0], terminal);
    // Un clic sur son onglet rend le second, et sa conversation ; le shell reste, caché.
    await click(vue, vue.element("terminaux"), "second · claude");
    assert.deepEqual(shows(vue), ["second · claude"]);
    assert.deepEqual(terminals(vue), ["second · claude", "shell 1", "+ shell"]);
    held();
    // Et l'inverse : le shell revient tel quel, sans en ouvrir un autre.
    await click(vue, vue.element("terminaux"), "shell 1");
    assert.deepEqual(shows(vue), ["shell 1"]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "shell").length, 1);
    await click(vue, vue.element("terminaux"), "second · claude");
    held();
    // Ce qui lui arrive pendant ce temps s'y écrit à la suite.
    vue.dire("surSortie", SECOND.id, "suite\r\n");
    assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n", "suite\r\n"]);
    // L'espace n'a été ouvert qu'une fois : changer de vue ne relance rien.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, 1);
  });

  test("Shift+Entrée revient à la ligne, dans le second comme dans un shell : Entrée, elle, reste envoyée", async () => {
    const vue = await open();
    vue.dire("surSortie", SECOND.id, "> ");
    await click(vue, vue.element("terminaux"), "+ shell");
    vue.dire("surSortie", SHELL.id, "$ ");
    const [second, shell] = vue.xterms;
    const writtenOnes = () => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
    const key = (key: string, shiftKey: boolean, type = "keydown") => ({ key, shiftKey, type });
    assert.equal(second?.filtre?.(key("Enter", true)), false);
    assert.equal(shell?.filtre?.(key("Enter", true)), false);
    // Au relâchement, rien de plus n'est écrit ; Entrée seule et les autres touches restent à xterm.
    assert.equal(second?.filtre?.(key("Enter", true, "keyup")), false);
    assert.equal(second?.filtre?.(key("Enter", false)), true);
    assert.equal(second?.filtre?.(key("a", true)), true);
    assert.deepEqual(writtenOnes(), [[SECOND.id, "\x1b\r"], [SHELL.id, "\x16\n"]]);
  });

  test("Option/Cmd/Ctrl/Shift + flèche et + ⌫ déplacent ou effacent, dans le second comme dans un shell", async () => {
    const vue = await open();
    vue.dire("surSortie", SECOND.id, "> ");
    await click(vue, vue.element("terminaux"), "+ shell");
    vue.dire("surSortie", SHELL.id, "$ ");
    const [second, shell] = vue.xterms;
    const writtenOnes = () => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);
    const t = (key: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, type = "keydown") => ({ key, shiftKey: false, type, ...mods });
    const theCase: [string, object, string][] = [
      ["ArrowLeft", { altKey: true }, "\x1bb"],
      ["ArrowRight", { altKey: true }, "\x1bf"],
      ["ArrowLeft", { ctrlKey: true }, "\x1bb"],
      ["ArrowLeft", { metaKey: true }, "\x01"],
      ["ArrowRight", { metaKey: true }, "\x05"],
      ["ArrowLeft", { shiftKey: true }, "\x1b[D"],
      ["ArrowRight", { shiftKey: true, altKey: true }, "\x1bf"],
      ["ArrowUp", { shiftKey: true }, "\x1b[A"],
      ["Backspace", { altKey: true }, "\x1b\x7f"],
      ["Backspace", { metaKey: true }, "\x15"],
    ];
    for (const [key, mods, expected] of theCase) {
      const before = writtenOnes().length;
      assert.equal(shell?.filtre?.(t(key, mods)), false);
      assert.equal(shell?.filtre?.(t(key, mods, "keyup")), false);
      assert.deepEqual(writtenOnes().slice(before), [[SHELL.id, expected]]);
    }
    assert.equal(second?.filtre?.(t("ArrowLeft", { altKey: true })), false);
    assert.deepEqual(writtenOnes().at(-1), [SECOND.id, "\x1bb"]);
    // Sans modificateur, les flèches et ⌫ restent à xterm.
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace"]) assert.equal(second?.filtre?.(t(key, {})), true);
  });

  test("hors d'un Mac, Ctrl copie et colle comme dans le Terminal de Windows ; sur un Mac, Ctrl reste au shell", async (t) => {
    const copies: string[] = [];
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (text: string) => void copies.push(text) }, configurable: true });
    t.after(() => Reflect.deleteProperty(globalThis.navigator, "clipboard"));
    const ctrl = (key: string, shiftKey = false, type = "keydown") => ({ key, shiftKey, ctrlKey: true, type });
    const writtenOnes = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "ecrire").map(({ args }) => args);

    const pc = await open({}, [PARADE, FANFARE], { nom: "this computer", mac: false });
    const [second] = pc.xterms;
    // Sans sélection, Ctrl+C reste au shell — il interrompt ; Ctrl+Shift+C ne copie rien.
    assert.equal(second?.filtre?.(ctrl("c")), true);
    assert.equal(second?.filtre?.(ctrl("C", true)), false);
    assert.deepEqual(copies, []);
    // Avec une sélection, Ctrl+C et Ctrl+Shift+C la copient, et rien n'est écrit dans le terminal.
    if (second !== undefined) second.selection = "brigade parade status";
    assert.equal(second?.filtre?.(ctrl("c")), false);
    assert.equal(second?.filtre?.(ctrl("c", false, "keyup")), false);
    assert.equal(second?.filtre?.(ctrl("C", true)), false);
    assert.deepEqual(copies, ["brigade parade status", "brigade parade status"]);
    // Ctrl+V et Ctrl+Shift+V sont laissés au navigateur, qui colle.
    assert.equal(second?.filtre?.(ctrl("v")), false);
    assert.equal(second?.filtre?.(ctrl("V", true)), false);
    assert.deepEqual(writtenOnes(pc), []);

    const mac = await open();
    const [itsOwnOne] = mac.xterms;
    if (itsOwnOne !== undefined) itsOwnOne.selection = "brigade parade status";
    assert.equal(itsOwnOne?.filtre?.(ctrl("c")), true);
    assert.equal(itsOwnOne?.filtre?.(ctrl("v")), true);
    assert.equal(copies.length, 2);
  });

  test("la molette d'un shell persistant que tmux tient sur l'écran alterné remonte l'historique de sa session ; ailleurs, elle reste à xterm", async () => {
    const vue = await open({ shell: () => ({ ...SHELL, scrollsSession: true }) });
    await click(vue, vue.element("terminaux"), "+ shell");
    const [second, shell] = vue.xterms;
    const scrolled = () => vue.appels.filter(({ geste: action }) => action === "scroll").map(({ args }) => args);
    const LINES = 1;
    const PIXELS = 0;

    // Sur l'écran normal — un shell sous `screen` —, xterm garde ce qui a défilé : la molette lui reste.
    assert.equal(shell?.molette?.({ deltaY: -3, deltaMode: LINES }), true);
    shell!.buffer.active.type = "alternate";
    // Vers le haut, elle remonte ; vers le bas, elle redescend. Les fractions d'un trackpad s'additionnent.
    assert.equal(shell?.molette?.({ deltaY: -3, deltaMode: LINES }), false);
    assert.equal(shell?.molette?.({ deltaY: 2, deltaMode: LINES }), false);
    assert.equal(shell?.molette?.({ deltaY: -8, deltaMode: PIXELS }), false);
    assert.equal(shell?.molette?.({ deltaY: -8, deltaMode: PIXELS }), false);
    assert.deepEqual(scrolled(), [[SHELL.id, 3], [SHELL.id, -2], [SHELL.id, 1]]);
    // Le second, même sur l'écran alterné, défile comme xterm le fait.
    second!.buffer.active.type = "alternate";
    assert.equal(second?.molette?.({ deltaY: -3, deltaMode: LINES }), true);
    assert.equal(scrolled().length, 3);
  });

  test("chaque projet montre son second ; revenir sur un projet rend le sien, tel qu'il était", async () => {
    const vue = await open();
    vue.dire("surSortie", SECOND.id, "le fil de parade\r\n");
    await enter(vue, 2);

    assert.deepEqual(seenOfSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "session neuve" });
    assert.equal(frames(vue).length, 2);
    await enter(vue, 1);

    assert.deepEqual(seenOfSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
    assert.deepEqual(vue.xterms.find((xterm) => xterm.ecrits.length > 0)?.ecrits, ["le fil de parade\r\n"]);
    // « Tous les projets » n'a pas d'espace : la colonne s'efface avec lui, et revient avec le projet.
    await enter(vue, 0);
    assert.equal(vue.element("second").hidden, true);
    await enter(vue, 1);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(frames(vue).length, 2);
  });

  test("un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi, à sa place", async () => {
    const vue = await open({}, [{ ...PARADE, refus: "son dossier est déjà celui d'un autre projet" }]);

    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("fil").hidden, true);
    assert.equal(vue.element("note-second").textContent, "“parade” does not open: son dossier est déjà celui d'un autre projet — it has no second");
    assert.equal(vue.element("rail").hidden, false);
    assert.ok(!terminals(vue).includes("+ shell"));
  });
});

describe("à droite, les shells à côté du second : un shell ne remplace jamais le second", () => {
  test("chaque shell ouvert a son onglet, au même niveau que le second ; « + shell » reste en bout de rangée", async () => {
    let n = 0;
    const vue = await open({ shell: () => ({ ...SHELL, id: 10 + ++n, titre: `shell ${n}` }) });

    await click(vue, vue.element("terminaux"), "+ shell");
    await click(vue, vue.element("terminaux"), "+ shell");

    assert.deepEqual(terminals(vue), ["second · claude", "shell 1", "shell 2", "+ shell"]);
    assert.deepEqual(shows(vue), ["shell 2"]);
    // Le shell montré prend le clavier ; le second, rendu d'un clic, le reprend.
    assert.equal(vue.xterms[2]?.focalise, 1);
    const before = vue.xterms[0]?.focalise ?? 0;
    await click(vue, vue.element("terminaux"), "second · claude");
    assert.equal(vue.xterms[0]?.focalise, before + 1);
    // Rien ne s'ouvre au centre : ni page, ni zone sous le rail ; Rail reste l'onglet montré.
    assert.deepEqual(selected(vue), ["Rail"]);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("« + shell » demande sur quelle machine ouvrir : ce poste, la box et chaque station, sous leurs noms — le choix part au process principal, qui ouvre le shell", async () => {
    const MACHINES = [
      { id: "poste", titre: "this computer" },
      { id: "box", titre: "box parade-box — station box/claude" },
      { id: "station:studio", titre: "station studio/claude" },
    ];
    const vue = await open({ machines: () => MACHINES, shell: () => ({ ...SHELL, titre: "shell 1 · parade-box" }) });
    const machines = vue.element("machines");
    assert.equal(machines.hidden, true);

    await click(vue, vue.element("terminaux"), "+ shell");

    assert.equal(machines.hidden, false);
    assert.deepEqual(machines.children.map((pose) => pose.textContent), ["open a shell on", ...MACHINES.map(({ titre: title }) => title), "Cancel"]);
    assert.deepEqual(vue.dernier("machines"), ["parade"]);
    // Rien ne s'ouvre avant le choix.
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "shell"), []);
    await click(vue, machines, "box parade-box — station box/claude");

    assert.deepEqual(vue.dernier("shell"), ["parade", "box"]);
    assert.equal(machines.hidden, true);
    assert.deepEqual(terminals(vue), ["second · claude", "shell 1 · parade-box", "+ shell"]);
    assert.deepEqual(shows(vue), ["shell 1 · parade-box"]);

    // « cancel » referme le choix sans rien ouvrir ; recliquer « + shell » aussi.
    await click(vue, vue.element("terminaux"), "+ shell");
    await click(vue, machines, "Cancel");
    assert.equal(machines.hidden, true);
    await click(vue, vue.element("terminaux"), "+ shell");
    await click(vue, vue.element("terminaux"), "+ shell");
    assert.equal(machines.hidden, true);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "shell").length, 1);
  });

  test("là où il n'y a que ce poste, rien n'est à choisir : le shell s'y ouvre", async () => {
    const vue = await open();
    await click(vue, vue.element("terminaux"), "+ shell");
    assert.equal(vue.element("machines").hidden, true);
    assert.deepEqual(vue.dernier("shell"), ["parade", "poste"]);
  });

  test("le shell montré se ferme pour de bon par son bouton ; le second n'en a pas", async () => {
    const vue = await open({ fermerShell: () => ({ ferme: true }) });
    const close = vue.element("fermer-shell");
    assert.equal(close.hidden, true);

    await click(vue, vue.element("terminaux"), "+ shell");
    assert.equal(close.hidden, false);
    assert.equal(close.textContent, "close shell 1");
    close.click();
    await repos();
    assert.deepEqual(vue.dernier("fermerShell"), [SHELL.id]);
    // Le process principal dit le shell arrêté : son onglet s'en va, le second revient.
    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();
    assert.deepEqual(terminals(vue), ["second · claude", "+ shell"]);
    assert.equal(close.hidden, true);
  });

  test("une session qui n'a pas pu être détruite : la note du terminal dit où elle reste", async () => {
    const refusal = "shell 1 · parade-box is closed, but its session `brigade-parade-1` could not be destroyed: it is no longer listed, and stays there until it is destroyed";
    const vue = await open({ fermerShell: () => ({ refus: refusal }) });
    await click(vue, vue.element("terminaux"), "+ shell");
    vue.element("fermer-shell").click();
    await repos();
    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();
    assert.equal(vue.element("note-second").textContent, refusal);
  });

  test("un shell dont on sort ferme son onglet, et le second reprend sa place à droite", async () => {
    const vue = await open();
    await click(vue, vue.element("terminaux"), "+ shell");

    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();

    assert.deepEqual(terminals(vue), ["second · claude", "+ shell"]);
    assert.deepEqual(seenOfSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
  });

  test("chaque projet garde le terminal où il a été laissé : revenir dessus rend le shell montré", async () => {
    const vue = await open();
    await click(vue, vue.element("terminaux"), "+ shell");
    await enter(vue, 2);
    assert.deepEqual(shows(vue), ["second · claude"]);
    await enter(vue, 1);
    assert.deepEqual(shows(vue), ["shell 1"]);
  });
});

describe("l'écran principal ne garde que la bande, le rail et les terminaux ; le reste est derrière un onglet, en haut", () => {
  const RELAYS = "sauvegarde       il y a 10 h\nrail             2 tickets";

  test("à l'ouverture : ni l'état du projet, ni le consommé, ni le journal ; un onglet, et le geste du journal", async () => {
    const vue = await open();

    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    assert.equal(vue.element("etat").hidden, true);
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("second").hidden, false);
  });

  test("Settings est une seule page, sans sous-pages ni lecture de `status` (#1700) ; recliqué, il se referme", async () => {
    const vue = await open();

    await click(vue, vue.element("onglets-du-projet"), "Settings");
    assert.equal(vue.element("etat").hidden, false);
    assert.equal(vue.element("contenu").hidden, false);
    assert.deepEqual(selected(vue), ["Settings"]);
    assert.throws(() => vue.element("parametres-onglets"));
    assert.throws(() => vue.element("lecture"));
    assert.deepEqual(vue.element("etat").dessous("pre"), []);
    assert.doesNotMatch(vue.element("etat").textContent, /sauvegarde|il y a 10 h/);
    // Recliqué, il se referme.
    await click(vue, vue.element("onglets-du-projet"), "Settings");
    assert.equal(vue.element("etat").hidden, true);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("une page s'ouvre par-dessus le rail, qui reste posé dessous ; fermée, elle le rend tel qu'il était", async () => {
    const vue = await open();
    const rail = vue.element("rail");
    const before = rail.textContent;
    assert.equal(rail.inert, false);

    for (const page of ["Settings"]) {
      await click(vue, vue.element("onglets-du-projet"), page);
      assert.equal(vue.element("contenu").hidden, false, page);
      // Couvert, pas défait : il est encore là, et rien de lui ne se clique au travers.
      assert.equal(rail.hidden, false, page);
      assert.equal(rail.inert, true, page);
      await click(vue, vue.element("onglets-du-projet"), page);
      assert.equal(vue.element("contenu").hidden, true, page);
      assert.equal(rail.inert, false, page);
      assert.equal(rail.textContent, before, page);
    }
    // La page et le rail sont dans le même centre, la page après lui : elle se pose sur lui. Rien dessous.
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const center = html.slice(html.indexOf('<div id="centre">'));
    assert.ok(center.indexOf('id="rail"') < center.indexOf('id="contenu"'));
    assert.match(html.slice(html.indexOf('<section id="contenu"')), /^<section id="contenu"[^]*?<\/section>\s*<\/div>\s*<pre id="message" hidden><\/pre>\s*<\/main>/);
  });

  test("la barre du projet n'a plus de bouton « log » (#3048)", async () => {
    const vue = await open();

    assert.throws(() => vue.element("journal"));
    assert.doesNotMatch(readFileSync(join(VUE, "index.html"), "utf8"), /id="journal"/);
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
  });
});
