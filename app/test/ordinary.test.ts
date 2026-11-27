// Le réglage « prendre aussi les tickets ordinaires » de la station Mac (#852) : écrit dans le
// fichier des projets, conservé à la relecture, remplacé hors d'un Mac par la raison pour laquelle ce
// poste n'en prend pas, et — quand la station dit son
// bac à sable indisponible — le message, avec la raison. Le fichier est un vrai fichier écrit par
// le test ; la vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { changeOrdinary, EXAMPLE, readConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { blockOfOrdinary, explanation, withoutSandbox, type FactsStation } from "../src/ordinary.ts";
import { followConfiguration } from "../src/tracking.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Fake, playTheVue, openRead, repos } from "./helpers/false-vue.ts";

function file(t: TestContext, content: unknown): { racine: string; chemin: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "app.json");
  writeFileSync(path, JSON.stringify(content));
  return { racine: root, chemin: path };
}
const readOne = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { projets: Record<string, unknown>[] };

const MAC = {};
const station = (sandbox: FactsStation["bacASable"]): FactsStation => ({ station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: sandbox, prendOrdinaires: sandbox?.disponible === true });
const UNAVAILABLE = { disponible: false, raison: "Seatbelt (/usr/bin/sandbox-exec) is missing", version: null, depuis: "2026-10-16T10:00:00Z" };
const EXPLANATION = explanation("this computer");
const AVAILABLE = { disponible: true, raison: null, version: "2.1.0", depuis: "2026-10-16T10:00:00Z" };

describe("le bloc des tickets ordinaires", () => {
  test("il existe pour un Mac dont la station cuit le projet, avec son réglage et la ligne d'explication", () => {
    assert.deepEqual(blockOfOrdinary({ ...MAC }, "darwin", undefined, true), { reglable: true, actif: false, limite: null, explication: EXPLANATION });
    assert.deepEqual(blockOfOrdinary({ ...MAC, ordinaires: true, limiteCooks: 3 }, "darwin", [station(AVAILABLE)], true), { reglable: true, actif: true, limite: 3, explication: EXPLANATION });
    assert.equal(EXPLANATION, "Cooks on this computer run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.");
  });

  test("hors d'un Mac, il n'est pas réglable : il dit, au nom de ce poste, qu'il ne prend aucun ticket ordinaire, et pourquoi — option cochée ou non", () => {
    for (const ordinary of [true, false]) {
      assert.deepEqual(blockOfOrdinary({ ...MAC, ordinaires: ordinary, limiteCooks: 2 }, "win32", [station(AVAILABLE)], true), {
        reglable: false,
        actif: false,
        limite: null,
        explication: "This computer takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's sandbox, which the station sets up only on macOS.",
      });
    }
    assert.equal(blockOfOrdinary({ ...MAC }, "linux", undefined, true)?.explication, withoutSandbox("this computer"));
    assert.match(withoutSandbox("this computer"), /^This computer takes no ordinary ticket/);
  });

  test("il n'existe pas pour un projet que la station de ce poste ne cuit pas, quelle que soit la plateforme", () => {
    for (const platform of ["darwin", "win32", "linux"]) {
      assert.equal(blockOfOrdinary({}, platform, undefined, false), undefined, platform);
    }
  });

  test("bac à sable indisponible : le message dit que le Mac ne prend pas de ticket ordinaire, avec la raison — option cochée ou non", () => {
    for (const ordinary of [true, false]) {
      const block = blockOfOrdinary({ ...MAC, ordinaires: ordinary }, "darwin", [station(UNAVAILABLE)], true);
      assert.equal(block?.indisponible, "The sandbox is unavailable on this computer — Seatbelt (/usr/bin/sandbox-exec) is missing. This computer takes no ordinary ticket.");
    }
    assert.equal(blockOfOrdinary({ ...MAC }, "darwin", [station(AVAILABLE)], true)?.indisponible, undefined);
    // Elle n'en a rien dit : l'app ne devine pas.
    assert.equal(blockOfOrdinary({ ...MAC }, "darwin", [station(null)], true)?.indisponible, undefined);
  });
});

describe("les tickets ordinaires dans le fichier des projets", () => {
  test("le réglage s'écrit, se relit à la lecture suivante, et rien d'autre du fichier ne bouge", (t) => {
    const { racine: root, chemin: path } = file(t, { note: "à moi", projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
    assert.equal(changeOrdinary(path, "a", true, 3, root), undefined);
    assert.deepEqual(readOne(path).projets[0], { nom: "a", dossier: "/", ordinaires: true, limiteCooks: 3 });
    assert.deepEqual(readOne(path).projets[1], { nom: "b", dossier: "/" });
    const reread = readConfiguration(path).projets[0];
    assert.equal(reread?.ordinaires, true);
    assert.equal(reread?.limiteCooks, 3);

    // Sans limite : celle qui était écrite s'en va.
    assert.equal(changeOrdinary(path, "a", false, null, root), undefined);
    assert.deepEqual(readOne(path).projets[0], { nom: "a", dossier: "/", ordinaires: false });
  });

  test("une valeur qui n'en est pas une, ou un projet absent, n'écrit rien — et le dit", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/" }] });
    const before = readFileSync(path, "utf8");
    assert.match(changeOrdinary(path, "a", "oui", 2, root) ?? "", /^nothing was written: .*true or false/);
    for (const limit of [0, -1, 1.5, "2", Number.NaN]) assert.match(changeOrdinary(path, "a", true, limit, root) ?? "", /^nothing was written: .*whole number/, String(limit));
    assert.equal(changeOrdinary(path, "z", true, 2, root), "“z” is not in this file: nothing was changed there");
    assert.equal(readFileSync(path, "utf8"), before);
  });

  test("un fichier écrit à la main avec un réglage mal formé est refusé, en le disant", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", ordinaires: "oui" }] });
    assert.match(readConfiguration(path).refus ?? "", /^project #1 \(a\): “ordinaires” must be true or false/);
    writeFileSync(path, JSON.stringify({ projets: [{ nom: "a", dossier: root, limiteCooks: 0 }] }));
    assert.match(readConfiguration(path).refus ?? "", /^project #1 \(a\): “limiteCooks” must be a whole number/);
  });

  test("suivi, le fichier dit tout de suite le réglage écrit", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/" }] });
    const saidOnes: Project[][] = [];
    const tracked = followConfiguration({ chemin: path, maison: root, surChangement: (configuration) => void saidOnes.push(configuration.projets) });
    t.after(() => tracked.fermer());
    assert.equal(tracked.changerOrdinaires("a", true, 2), undefined);
    assert.equal(tracked.configuration().projets[0]?.ordinaires, true);
    assert.equal(saidOnes.at(-1)?.[0]?.limiteCooks, 2);
  });
});

describe("les tickets ordinaires dans la vue", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

  const play = (project: Project, block: ReturnType<typeof blockOfOrdinary>, set: (...args: unknown[]) => string | undefined = () => undefined, workstation?: { nom: string; mac: boolean }) =>
    playTheVue({
      demarrage: () => ({
        ...(workstation === undefined ? {} : { poste: workstation }),
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [project] }, () => true, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [SECOND],
      ordinaires: () => block,
      reglerOrdinaires: set,
    });
  const open = async (vue: Awaited<ReturnType<typeof play>>) => {
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case")).click();
    await repos();
    await openRead(vue, "Settings");
  };
  const fields = (block: Fake) => block.dessous("input");
  // L'option est l'interrupteur de l'app (components/switch) ; la limite est le seul champ.
  const toggle = (block: Fake) => block.dessous("button").find(({ role }) => role === "switch");

  // Les lignes du bloc : le nom de chaque réglage, sans son étiquette de niveau (« this computer », que la rangée pose à
  // côté de son nom — components/setting), et sa valeur.
  const nameOf = (name: Fake | undefined) => name?.textContent.slice(0, name.textContent.length - (name.children.find(({ className }) => className === "niveau")?.textContent.length ?? 0));
  const lines = (block: Fake) => block.dessous("div").filter(({ className }) => className === "reglage").map((line) => [nameOf(line.children[0]), line.children[1]?.children[0]?.textContent]);
  const refusal = (block: Fake) => block.dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent);

  test("dans Settings, sous cette machine : deux lignes — les prendre, et combien de cooks à la fois —, l'explication au survol", async () => {
    const vue = await play(PARADE, blockOfOrdinary({ ...PARADE, ordinaires: true, limiteCooks: 2 }, "darwin", undefined, true));
    await open(vue);
    const block = vue.element("ordinaires");
    assert.equal(block.hidden, false);
    const [limit] = fields(block);
    const option = toggle(block);
    assert.equal(option?.ariaChecked, "true");
    assert.equal(limit?.value, "2");
    assert.deepEqual(lines(block), [["ordinary tickets", "taken"], ["cooks at once", "2"]]);
    // Ni titre ni paragraphe : l'explication est au survol de la valeur.
    assert.deepEqual(block.dessous("h3"), []);
    assert.ok(block.dessous("button").some(({ ariaLabel }) => ariaLabel === EXPLANATION));
    assert.deepEqual(refusal(block), []);
    assert.equal(limit?.ariaLabel, "Cooks this computer runs at once");
    assert.equal(option?.ariaLabel, "Take the ordinary tickets on this computer");
  });

  test("régler l'option ou la limite l'envoie au process principal, qui l'écrit", async () => {
    const vue = await play(PARADE, blockOfOrdinary(PARADE, "darwin", undefined, true));
    await open(vue);
    const [limit] = fields(vue.element("ordinaires"));
    const option = toggle(vue.element("ordinaires"));
    assert.equal(option?.ariaChecked, "false");
    assert.equal(limit?.value, "");
    if (option === undefined || limit === undefined) return assert.fail("pas de champs");
    option.click();
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, null]);
    limit.value = "4";
    limit.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, 4]);
  });

  test("un réglage refusé dit pourquoi, sous sa ligne", async () => {
    const vue = await play(PARADE, blockOfOrdinary(PARADE, "darwin", undefined, true), () => "nothing was written: EACCES");
    await open(vue);
    const option = toggle(vue.element("ordinaires"));
    if (option === undefined) return assert.fail("pas d'interrupteur");
    option.click();
    await repos();
    assert.deepEqual(refusal(vue.element("ordinaires")), ["nothing was written: EACCES"]);
  });

  test("bac à sable indisponible : le message est à côté de l'option, avec la raison, et dit que le Mac ne prend pas de ticket ordinaire", async () => {
    const vue = await play(PARADE, blockOfOrdinary({ ...PARADE, ordinaires: true }, "darwin", [station(UNAVAILABLE)], true));
    await open(vue);
    const saidOnes = refusal(vue.element("ordinaires"));
    assert.equal(saidOnes.length, 1);
    assert.match(saidOnes[0] ?? "", /sandbox is unavailable.*Seatbelt \(\/usr\/bin\/sandbox-exec\) is missing.*takes no ordinary ticket/);
  });

  test("sous Windows, rien ne se règle : ni option ni limite, ni ligne qui l'explique", async () => {
    const vue = await play(PARADE, blockOfOrdinary({ ...PARADE, ordinaires: true }, "win32", undefined, true), undefined, { nom: "this computer", mac: false });
    await open(vue);
    const block = vue.element("ordinaires");
    assert.equal(block.hidden, true);
    assert.equal(fields(block).length, 0);
    assert.ok(!vue.element("reglages-machine").dessous("div").some(({ dataset }) => dataset.cle === "ordinaires"));
  });

  test("projet que la station de ce poste ne cuit pas, rien n'est posé : pas d'option", async () => {
    const vue = await play(PARADE, blockOfOrdinary(PARADE, "win32", undefined, false));
    await open(vue);
    assert.equal(vue.element("ordinaires").hidden, true);
    assert.equal(fields(vue.element("ordinaires")).length, 0);
  });
});
