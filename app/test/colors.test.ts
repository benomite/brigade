// Chaque projet a sa couleur d'onglet et sa couleur d'accent : tirées quand il entre dans le
// fichier des projets — ajouté depuis l'app, ou déclaré avant que les couleurs existent —, écrites
// dans ce fichier, réglables depuis l'app. L'onglet teint sa case dans la barre, l'accent son
// espace ; les couleurs d'état de la peau n'en dépendent jamais.
// Le fichier est un vrai fichier écrit par le test ; la vue est jouée telle qu'elle est, devant un
// faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { addProject, changeColor, colorProjects, EXAMPLE, readConfiguration, type Project } from "../src/config.ts";
import { choice, colorsRead, DISTINCT, gap, gapLab, STATES, PALETTE, CLOSE, close, ROLES, draw } from "../src/colors.ts";

import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { followConfiguration } from "../src/tracking.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Fake, type Played, tokensOf, playTheVue, openRead, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const VALUES = PALETTE.map(({ valeur: value }) => value);
// Un hasard qui rend toujours la même chose : c'est la palette qui doit écarter ce qui est pris.
const always = (pulls: number) => () => pulls;

function file(t: TestContext, content: unknown): { racine: string; chemin: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "app.json");
  writeFileSync(path, JSON.stringify(content));
  return { racine: root, chemin: path };
}
const readOne = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { projets: { nom: string; couleurs?: Record<string, string> }[] };

// La luminance relative d'une couleur `#rrggbb`, et le contraste de deux (WCAG 2) : de quoi dire
// qu'une teinte se lit sur le fond sombre, et sous le texte foncé d'une case choisie.
const luminance = (color: string) => {
  const [r = 0, v = 0, b = 0] = [1, 3, 5].map((rank) => Number.parseInt(color.slice(rank, rank + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
};
const contrast = (one: string, other: string) => {
  const [claire, sombre] = [luminance(one), luminance(other)].sort((a, b) => b - a) as [number, number];
  return (claire + 0.05) / (sombre + 0.05);
};

describe("la palette", () => {
  const tokens = tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8"));

  test("l'écart est celui de CIEDE2000 : les paires de référence de Sharma, Wu et Dalal (2005), à 10⁻⁴ près", () => {
    const pairs: [[number, number, number], [number, number, number], number][] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 0, 0], [50, -1, 2], 2.3669],
      [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
      [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
      [[50, 2.5, 0], [73, 25, -18], 27.1492],
      [[50, 2.5, 0], [61, -5, 29], 22.8977],
      [[50, 2.5, 0], [56, -27, -3], 31.903],
      [[50, 2.5, 0], [58, 24, 15], 19.4535],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
      [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
      [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    ];
    for (const [one, other, expected] of pairs) {
      assert.equal(Number(gapLab(one, other).toFixed(4)), expected, `${one} — ${other}`);
      assert.equal(Number(gapLab(other, one).toFixed(4)), expected, `${other} — ${one}`);
    }
    assert.equal(gap("#A98CF2", "#a98cf2"), 0);
  });

  test("les couleurs d'état mesurées sont celles de la peau, et le fond est celui de l'app", () => {
    const byName: Record<string, string> = { green: "--vert", yellow: "--jaune", red: "--rouge", blue: "--bleu", gray: "--gris" };
    assert.deepEqual(
      STATES.map(({ nom: name, valeur: value }) => [name, value]),
      Object.entries(byName).map(([name, token]) => [name, tokens.get(token)]),
    );
    assert.equal(tokens.get("--fond"), "#121418");
  });

  test(`au moins seize teintes, deux à deux à ΔE ≥ ${DISTINCT}, et chacune à ΔE ≥ ${DISTINCT} de chaque couleur d'état`, () => {
    assert.ok(PALETTE.length >= 16, `${PALETTE.length} teintes`);
    const too: string[] = [];
    for (const [rank, one] of PALETTE.entries()) {
      for (const other of PALETTE.slice(rank + 1)) if (gap(one.valeur, other.valeur) < DISTINCT) too.push(`${one.nom} — ${other.nom} : ${gap(one.valeur, other.valeur).toFixed(1)}`);
      for (const state of STATES) if (gap(one.valeur, state.valeur) < DISTINCT) too.push(`${one.nom} — ${state.nom} (état) : ${gap(one.valeur, state.valeur).toFixed(1)}`);
    }
    assert.deepEqual(too, []);
  });

  test("chaque teinte se lit sur le fond sombre de la peau, et sous le texte foncé d'une case choisie", () => {
    const background = tokens.get("--fond") ?? assert.fail("pas de --fond");
    for (const { nom: name, valeur: value } of PALETTE) assert.ok(contrast(value, background) >= 4.5, `${name} : ${contrast(value, background).toFixed(2)}`);
  });

  test("aucune couleur de projet n'est une couleur d'état de la peau : une alerte se lit pareil partout", () => {
    const states = ["--vert", "--jaune", "--rouge", "--rouge-clair", "--bleu", "--gris"].map((name) => tokens.get(name));
    assert.ok(states.every((value) => value?.startsWith("#")), states.join());
    for (const value of VALUES) assert.ok(!states.includes(value), `${value} est une couleur d'état`);
    assert.equal(new Set(VALUES).size, VALUES.length, "une couleur est deux fois dans la palette");
    assert.equal(new Set(PALETTE.map(({ nom: name }) => name)).size, PALETTE.length, "un nom est deux fois dans la palette");
    for (const value of VALUES) assert.match(value, /^#[0-9a-f]{6}$/);
  });

  test("un tirage écarte ce que les autres projets portent, tant que la palette n'est pas épuisée", () => {
    const taken: string[] = [];
    for (let rank = 0; rank < PALETTE.length; rank++) taken.push(draw(taken, always(0)));
    assert.deepEqual([...taken].sort(), [...VALUES].sort());
    // Épuisée : l'une des moins portées — ici, toutes le sont une fois, sauf la dernière tirée deux fois.
    const still = draw([...taken, VALUES[0]], always(0));
    assert.notEqual(still, VALUES[0]);
    // Le hasard choisit parmi les libres, jusqu'au bout de la liste.
    assert.equal(draw([], always(0.999999)), VALUES.at(-1));
    assert.equal(draw([VALUES[0]?.toUpperCase()], always(0)), VALUES[1], "une couleur écrite en capitales est la même");
  });

  test("le fichier dit une couleur en `#rrggbb` ; ce qui n'en est pas une est refusé, et dit", () => {
    assert.equal(colorsRead(undefined), undefined);
    assert.equal(colorsRead({}), undefined);
    assert.deepEqual(colorsRead({ onglet: "#A98CF2" }), { onglet: "#a98cf2" });
    assert.deepEqual(colorsRead({ onglet: "#a98cf2", accent: "#4fc7b5", autre: "gardé ailleurs" }), { onglet: "#a98cf2", accent: "#4fc7b5" });
    assert.match(String(colorsRead("violet")), /^“couleurs” must be an object/);
    assert.match(String(colorsRead({ accent: "violet" })), /“accent” must be a color written `#rrggbb` — “violet” is not one/);
    assert.match(String(colorsRead({ onglet: "#fff" })), /“onglet” must be a color/);
  });

  test("la vue nomme un rôle, et une couleur de la palette par son nom ou une couleur libre `#rrggbb` : rien d'autre ne s'écrit depuis elle", () => {
    assert.deepEqual(choice("onglet", "purple"), { role: "onglet", valeur: "#a98cf2" });
    assert.deepEqual(choice("accent", "orange"), { role: "accent", valeur: "#f2994a" });
    assert.deepEqual(choice("onglet", "#12AB56"), { role: "onglet", valeur: "#12ab56" });
    assert.match((choice("fond", "violet") as { refus: string }).refus, /^“fond” is not a project color: onglet or accent/);
    assert.match((choice("onglet", "violet") as { refus: string }).refus, /^“violet” is neither in the palette \(orange, .*\) nor a color written `#rrggbb`/);
    assert.match((choice("onglet", "#fff") as { refus: string }).refus, /^“#fff” is neither in the palette/);
  });

  test(`une couleur libre à ΔE < ${CLOSE} d'une couleur d'état ou de celle d'un autre projet se le voit dire, en nommant laquelle — et reste`, () => {
    const fanfare = { nom: "fanfare", couleurs: { onglet: "#3c5a8f", accent: "#f2994a" } };
    // Près du vert d'état, sur l'onglet ; près de l'onglet de fanfare, sur l'accent.
    const parade = { nom: "parade", couleurs: { onglet: "#70c08c", accent: "#3e5d92" } };
    assert.ok(gap("#70c08c", "#6cc28a") < CLOSE && gap("#3e5d92", "#3c5a8f") < CLOSE);
    assert.deepEqual(close(parade, [parade, fanfare]), { onglet: "close to green, a state color — kept anyway", accent: "close to the tab of fanfare — kept anyway" });
    // La plus proche est nommée : le jaune, plutôt que l'accent d'un autre un peu plus loin.
    const yellow = { nom: "parade", couleurs: { onglet: "#e8c56c" } };
    assert.deepEqual(close(yellow, [yellow, { nom: "cantine", couleurs: { accent: "#e5c070" } }]), { onglet: "close to yellow, a state color — kept anyway" });
    // Loin de tout : rien à dire. Une teinte de la palette n'en dit rien, même portée par un autre.
    assert.equal(close({ nom: "parade", couleurs: { onglet: "#123456", accent: "#ffffff" } }, [fanfare]), undefined);
    assert.equal(close({ nom: "parade", couleurs: { onglet: "#f2994a" } }, [fanfare]), undefined);
    // Ses propres couleurs ne comptent pas : un projet n'est pas trop près de lui-même.
    assert.equal(close({ nom: "fanfare", couleurs: { onglet: "#3c5a8f", accent: "#3e5d92" } }, [fanfare]), undefined);
    assert.equal(close({ nom: "nue" }, [fanfare]), undefined);
  });
});

describe("les couleurs dans le fichier des projets", () => {
  test("un projet qui les porte les garde à la lecture ; une couleur mal écrite refuse le fichier en le disant", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: "#A98CF2", accent: "#4fc7b5" } }] });
    assert.deepEqual(readConfiguration(path).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: "#a98cf2", accent: "#4fc7b5" } }]);

    writeFileSync(path, JSON.stringify({ projets: [{ nom: "a", dossier: root, couleurs: { onglet: "rouge" } }] }));
    assert.equal(readConfiguration(path).refus, "project #1 (a): “couleurs”: “onglet” must be a color written `#rrggbb` — “rouge” is not one");
  });

  test("les projets déclarés avant les couleurs en reçoivent, une chacun, toutes différentes — et le reste du fichier ne bouge pas", (t) => {
    const { racine: root, chemin: path } = file(t, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/", couleurs: { onglet: VALUES[0], inconnue: "gardée" } }] });

    assert.equal(colorProjects(path, root, always(0)), undefined);

    const written = readOne(path);
    assert.deepEqual({ ...written, projets: written.projets.map(({ couleurs: colors, ...remains }) => remains) }, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/" }] });
    // Celle qui y était n'a pas changé, ni ce que l'app n'y lit pas.
    assert.equal(written.projets[2]?.couleurs?.onglet, VALUES[0]);
    assert.equal(written.projets[2]?.couleurs?.inconnue, "gardée");
    for (const role of ROLES) {
      const scopes = written.projets.map(({ couleurs: colors }) => colors?.[role]);
      assert.ok(scopes.every((value) => VALUES.includes(value ?? "")), `${role} : ${scopes.join()}`);
      assert.equal(new Set(scopes).size, scopes.length, `${role} : deux projets portent la même — ${scopes.join()}`);
    }
    // Elles restent : c'est le fichier qui les tient, relu comme au lancement suivant.
    assert.deepEqual(
      readConfiguration(path).projets.map(({ couleurs: colors }) => colors),
      written.projets.map(({ couleurs: colors }) => ({ onglet: colors?.onglet, accent: colors?.accent })),
    );
  });

  test("un nouveau projet reçoit une teinte de la palette qu'aucun projet ne porte, dans aucun rôle, tant qu'il en reste une", (t) => {
    // Quinze teintes déjà portées, en onglet ou en accent : il n'en reste qu'une.
    const scopes = VALUES.slice(0, 15);
    const projects = Array.from({ length: 8 }, (_, rank) => ({ nom: `p${rank}`, dossier: "/", couleurs: { onglet: scopes[rank * 2] ?? scopes[0], accent: scopes[rank * 2 + 1] ?? scopes[0] } }));
    const { racine: root, chemin: path } = file(t, { projets: [...projects, { nom: "neuf", dossier: "/" }] });
    for (const chance of [0, 0.5, 0.999999]) {
      writeFileSync(path, JSON.stringify({ projets: [...projects, { nom: "neuf", dossier: "/" }] }));
      assert.equal(colorProjects(path, root, always(chance)), undefined);
      assert.deepEqual(readOne(path).projets.at(-1)?.couleurs, { onglet: VALUES[15], accent: VALUES[15] }, `hasard ${chance}`);
    }
    // Toutes portées : l'une des moins portées.
    writeFileSync(path, JSON.stringify({ projets: [...projects, { nom: "seize", dossier: "/", couleurs: { onglet: VALUES[15], accent: VALUES[15] } }, { nom: "neuf", dossier: "/" }] }));
    assert.equal(colorProjects(path, root, always(0)), undefined);
    const pulled = readOne(path).projets.at(-1)?.couleurs?.onglet ?? "";
    assert.ok(VALUES.includes(pulled) && pulled !== VALUES[15], pulled);
  });

  test("les couleurs déjà choisies restent, même hors de la nouvelle palette — tirer celles qui manquent n'y touche pas", (t) => {
    // Celles de l'ancienne palette à sept teintes (turquoise, sand, indigo, orchid) et une écrite à la main.
    const old = [
      { nom: "a", dossier: "/", couleurs: { onglet: "#4fc7b5", accent: "#d9b98a" } },
      { nom: "b", dossier: "/", couleurs: { onglet: "#8a84f0", accent: "#d77ee0" } },
      { nom: "c", dossier: "/", couleurs: { onglet: "#123456" } },
    ];
    const { racine: root, chemin: path } = file(t, { projets: old });
    assert.equal(colorProjects(path, root, always(0)), undefined);
    const writtenOnes = readOne(path).projets;
    assert.deepEqual(writtenOnes.slice(0, 2), old.slice(0, 2));
    assert.equal(writtenOnes[2]?.couleurs?.onglet, "#123456");
    assert.equal(writtenOnes[2]?.couleurs?.accent, VALUES[0]);
    assert.deepEqual(readConfiguration(path).projets.map(({ couleurs: colors }) => colors?.onglet), ["#4fc7b5", "#8a84f0", "#123456"]);
  });

  test("rien ne manque : rien n'est écrit — et un fichier que l'app n'a pas compris n'est pas touché", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: VALUES[1], accent: VALUES[2] } }] });
    const before = readFileSync(path, "utf8");
    const date = statSync(path).mtimeMs;
    assert.equal(colorProjects(path, root), undefined);
    assert.equal(readFileSync(path, "utf8"), before);
    assert.equal(statSync(path).mtimeMs, date);

    writeFileSync(path, '{ "projets": [');
    assert.match(colorProjects(path, root) ?? "", /^the app does not write into a file it has not understood — unreadable JSON/);
    assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
  });

  test("deux projets ajoutés l'un après l'autre n'ont pas la même couleur, tant que la palette n'est pas épuisée", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [] });
    for (const [rank, name] of PALETTE.map((_, rank) => `p${rank}`).entries()) {
      assert.equal(addProject(path, { nom: name, dossier: root }), undefined);
      // Le même hasard à chaque ajout : c'est ce que les autres portent qui l'écarte.
      assert.equal(colorProjects(path, root, always(0.5)), undefined);
      const projects = readOne(path).projets;
      assert.equal(projects.length, rank + 1);
      for (const role of ROLES) assert.equal(new Set(projects.map(({ couleurs: colors }) => colors?.[role])).size, rank + 1, `${role}, au ${rank + 1}e projet`);
    }
  });

  test("une couleur se change : celle-là, et rien d'autre du fichier", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", couleurs: { onglet: VALUES[1], accent: VALUES[2] } }, { nom: "b", dossier: "/" }] });

    assert.equal(changeColor(path, "a", "accent", "#D77EE0", root), undefined);
    assert.deepEqual(readOne(path).projets, [{ nom: "a", dossier: "/", couleurs: { onglet: VALUES[1], accent: "#d77ee0" } }, { nom: "b", dossier: "/" }]);
    assert.equal(changeColor(path, "b", "onglet", VALUES[3] ?? "", root), undefined);
    assert.deepEqual(readOne(path).projets[1], { nom: "b", dossier: "/", couleurs: { onglet: VALUES[3] } });

    const before = readFileSync(path, "utf8");
    assert.equal(changeColor(path, "z", "onglet", VALUES[0] ?? "", root), "“z” is not in this file: nothing was changed there");
    assert.equal(changeColor(path, "a", "onglet", "violet", root), "“violet” is not a color written as `#rrggbb`");
    assert.equal(readFileSync(path, "utf8"), before);
  });

  test("suivi, le fichier dit tout de suite les couleurs tirées et changées", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/" }] });
    const saidOnes: Project[][] = [];
    const tracked = followConfiguration({ chemin: path, maison: root, surChangement: (configuration) => void saidOnes.push(configuration.projets) });
    t.after(() => tracked.fermer());
    assert.equal(tracked.configuration().projets[0]?.couleurs, undefined);

    assert.equal(tracked.colorer(always(0)), undefined);
    assert.deepEqual(tracked.configuration().projets[0]?.couleurs, { onglet: VALUES[0], accent: VALUES[0] });
    assert.deepEqual(saidOnes.at(-1)?.[0]?.couleurs, { onglet: VALUES[0], accent: VALUES[0] });

    assert.equal(tracked.changerCouleur("a", "onglet", VALUES[4] ?? ""), undefined);
    assert.deepEqual(tracked.configuration().projets[0]?.couleurs, { onglet: VALUES[4], accent: VALUES[0] });
    // Plus rien ne manque : le suivi n'écrit plus rien.
    const before = readFileSync(path, "utf8");
    assert.equal(tracked.colorer(), undefined);
    assert.equal(readFileSync(path, "utf8"), before);
  });
});

describe("les couleurs dans la vue", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#a98cf2", accent: "#25c0c5" } };
  const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare", couleurs: { onglet: "#f28cbf", accent: "#d9b98a" } };
  const BARE: Project = { nom: "nue", dossier: "/tmp/nue" };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const play = (projects: Project[], tint?: (project: string, role: string, color: string) => string | undefined) =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: {},
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        }),
      espace: () => [SECOND],
      ...(tint === undefined ? {} : { colorer: tint }),
    });
  // La case de la barre : « T », puis les projets dans l'ordre du fichier, puis « + ».
  const caseOf = (vue: Played, rank: number): Fake => vue.element("projets").children.at(rank) ?? assert.fail(`pas d'entrée ${rank}`);
  const accent = () => (globalThis as unknown as { document: { documentElement: Fake } }).document.documentElement.style.getPropertyValue("--accent");
  // Une ligne de réglage par rôle (#1700) : son nom, sa couleur, puis la palette — ses seuls boutons.
  const pills = (vue: Played, row: number) => (vue.element("couleurs").children.filter(({ className }) => className === "reglage")[row] ?? assert.fail(`pas de rangée ${row}`)).dessous("button");
  const saidOnes = (vue: Played) => vue.element("couleurs").dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent);

  test("dans la barre, chaque case porte la couleur d'onglet de son projet — celle d'un projet qui n'en a pas reste celle de la peau", async () => {
    const vue = await play([PARADE, FANFARE, BARE]);
    assert.deepEqual(
      [1, 2, 3].map((rank) => [caseOf(vue, rank).classList.contains("teinte"), caseOf(vue, rank).style.getPropertyValue("--teinte")]),
      [
        [true, "#a98cf2"],
        [true, "#f28cbf"],
        [false, ""],
      ],
    );
  });

  test("l'espace d'un projet porte son accent, à la place de celui de la peau ; « Tous les projets » reprend celui de la peau", async () => {
    const vue = await play([PARADE, FANFARE, BARE]);
    assert.equal(accent(), "");
    caseOf(vue, 1).click();
    await repos();
    assert.equal(accent(), "#25c0c5");
    caseOf(vue, 2).click();
    await repos();
    assert.equal(accent(), "#d9b98a");
    caseOf(vue, 3).click();
    await repos();
    assert.equal(accent(), "", "un projet sans couleur a l'accent de la peau");
    caseOf(vue, 0).click();
    await repos();
    assert.equal(accent(), "");
  });

  test("dans Settings, sous toi, les couleurs se choisissent dans la palette, et le choix se voit dès que le fichier l'a pris", async () => {
    const vue = await play([PARADE, FANFARE], () => undefined);
    caseOf(vue, 1).click();
    await repos();
    await openRead(vue, "Settings");
    const colors = vue.element("couleurs");
    assert.equal(colors.hidden, false);
    for (const [row, scope] of [[0, "purple"], [1, "turquoise"]] as const) {
      const poses = pills(vue, row);
      assert.deepEqual(poses.map(({ style }) => style.getPropertyValue("--teinte")), VALUES);
      assert.deepEqual(poses.filter(({ ariaPressed }) => ariaPressed === "true").map(({ title }) => title.split(": ")[1]), [scope]);
    }

    (pills(vue, 0).find(({ title }) => title.endsWith(": pink")) ?? assert.fail("no pink")).click();
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "onglet", "pink"]);
    (pills(vue, 1).find(({ title }) => title.endsWith(": orange")) ?? assert.fail("pas d'orange")).click();
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "accent", "orange"]);

    // Le fichier l'a pris : la case et l'espace changent tout de suite.
    const repainted = { ...PARADE, couleurs: { onglet: "#f28cbf", accent: "#f2994a" } };
    vue.dire("surConfiguration", forTheBar({ chemin: "/tmp/app.json", projets: [repainted, FANFARE] }, () => true), []);
    await repos();
    assert.equal(caseOf(vue, 1).style.getPropertyValue("--teinte"), "#f28cbf");
    assert.equal(accent(), "#f2994a");
    assert.deepEqual(pills(vue, 0).filter(({ ariaPressed }) => ariaPressed === "true").map(({ title }) => title), ["tab, in the bar: pink"]);
  });

  test("un choix refusé le dit sous les couleurs ; une couleur libre se montre au bout de la palette, pressée, sans geste", async () => {
    const vue = await play([{ ...PARADE, couleurs: { onglet: "#123456" } }], () => "ce fichier n'a pas pu être écrit : EACCES");
    caseOf(vue, 1).click();
    await repos();
    await openRead(vue, "Settings");
    const own = pills(vue, 0).at(-1);
    assert.equal(own?.style.getPropertyValue("--teinte"), "#123456");
    assert.equal(own?.title, "tab, in the bar: #123456, your own color");
    assert.equal(own?.ariaPressed, "true");
    assert.equal(own?.disabled, true);
    assert.equal(pills(vue, 0).length, PALETTE.length + 1);
    assert.equal(pills(vue, 1).length, PALETTE.length);

    pills(vue, 1)[0]?.click();
    await repos();
    assert.deepEqual(saidOnes(vue), ["ce fichier n'a pas pu être écrit : EACCES"]);
  });

  test("une couleur libre se choisit au sélecteur, au bout de chaque rangée : elle part telle quelle, `#rrggbb`", async () => {
    const vue = await play([PARADE, FANFARE], () => undefined);
    caseOf(vue, 1).click();
    await repos();
    await openRead(vue, "Settings");
    const free = vue.element("couleurs").dessous("input");
    assert.deepEqual(free.map(({ type, title, value }) => [type, title, value]), [
      ["color", "tab, in the bar: another color…", "#a98cf2"],
      ["color", "accent, in the space: another color…", "#25c0c5"],
    ]);
    assert.deepEqual(vue.element("couleurs").dessous("label").map(({ textContent }) => textContent), ["other…", "other…"]);
    const [tab, accentFree] = free;
    if (tab === undefined || accentFree === undefined) assert.fail("pas de sélecteur");
    tab.value = "#70c08c";
    tab.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "onglet", "#70c08c"]);
    accentFree.value = "#123456";
    accentFree.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("colorer"), ["parade", "accent", "#123456"]);
  });

  test("trop proche d'une couleur d'état ou d'un autre projet, une couleur libre reste, et une ligne sous sa rangée dit laquelle", async () => {
    // Le vert d'état à ΔE 1 sur l'onglet, l'onglet de fanfare à ΔE 1 sur l'accent.
    const near = { ...PARADE, couleurs: { onglet: "#70c08c", accent: "#f08dbe" } };
    const vue = await play([near, FANFARE], () => undefined);
    caseOf(vue, 1).click();
    await repos();
    await openRead(vue, "Settings");
    // Chaque avertissement sous la ligne de son rôle.
    assert.deepEqual(
      vue.element("couleurs").children.map((line) => line.dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent)),
      [["tab, in the bar: close to green, a state color — kept anyway"], ["accent, in the space: close to the tab of fanfare — kept anyway"]],
    );
    // Gardée : pressée au bout de sa rangée, et sur la case de la barre.
    assert.equal(pills(vue, 0).at(-1)?.ariaPressed, "true");
    assert.equal(caseOf(vue, 1).style.getPropertyValue("--teinte"), "#70c08c");

    // Une teinte de la palette choisie à sa place : plus rien à dire.
    vue.dire("surConfiguration", forTheBar({ chemin: "/tmp/app.json", projets: [{ ...near, couleurs: { onglet: "#a98cf2", accent: "#f08dbe" } }, FANFARE] }, () => true), []);
    await repos();
    assert.deepEqual(saidOnes(vue), ["accent, in the space: close to the tab of fanfare — kept anyway"]);
  });

  test("la vue ne pose que deux variables — l'accent et la teinte d'un projet — et aucune règle d'état ne les nomme", () => {
    const source = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.deepEqual([...new Set([...source.matchAll(/(?:setProperty|removeProperty)\("(--[a-z-]+)"/g)].map(([, name]) => name))].sort(), ["--accent", "--teinte"]);
    const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, head = "", body = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/data-ton|\.pastille|data-etat|data-verdict|\.refus|\.alerte/.test(head)) continue;
      assert.doesNotMatch(body, /var\(--(accent|teinte)\)/, `${head.trim()} nomme une couleur de projet`);
    }
  });
});
