// Les réglages du projet sur sa page (#1309, épique 1301) : sa branche d'intégration, ses calibrages par défaut, son
// plafond de calibrage et ceux de son closer (#1685), lus par `setting` là où sa cuisine tourne, chacun avec de quoi le
// changer. Chacun est la rangée de réglage (#2920) : sans bouton, le `change` de son champ ouvre une PR sur le dépôt du
// projet — rien ne se pose sur la box —, la rangée le dit d'avance, puis la PR sous elle, avec de quoi l'ouvrir ; la
// valeur en vigueur ne change pas tant qu'elle n'est pas mergée. Un refus du runtime se dit sous la rangée, et le champ
// revient à la valeur en vigueur. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Read, Rendered } from "../src/box.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { commandOfSetting, readTheSettings, PROPOSES, proposeTheSetting, settingsSeen, type ReadOfSettings, type RenderedOfSetting } from "../src/settings-of-project.ts";
import type { Terminal } from "../src/terminals.ts";
import { BY_PR, PROPOSES as PROPOSES_IN } from "../src/vue/components/setting/setting.js";
import { IN_PROGRESS, TITLE } from "../src/vue/project/settings.js";
import { type Fake, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const PARADE = "parade";
const BOX: Read = { nom: PARADE, cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
// Ce que `setting` rend, mot pour mot (runtime/src/reglage-cli.ts).
const OUTPUT = JSON.stringify({
  file: ".claude/brigade/projet.json",
  inRepository: true,
  integrationBranch: { value: "main", from: "repository" },
  defaultCalibrations: { manager: { model: "opus", effort: "high", from: "repository" }, reviewer: null },
  calibrationCeiling: { model: "opus", effort: "high", from: "default" },
  closer: {
    calibration: { model: "sonnet", effort: "medium", from: "repository" },
    cooksBelow: { value: 1, from: "default" },
    maxTokens: { value: 200000, from: "repository" },
    maxRemovedLines: { value: 800, from: "station" },
  },
});
const PR = "https://github.com/benomite/parade/pull/51";
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade setting",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});

describe("ce que `setting` rend, et ce que la proposition envoie", () => {
  test("la lecture : chaque réglage, sa valeur et d'où elle vient — ce qui ne se dit pas est « not set »", () => {
    const seenOnes = settingsSeen(`${OUTPUT}\n`) ?? assert.fail("illisible");
    assert.deepEqual(
      seenOnes.reglages.map(({ cle: key, nom: name, dit: said, source }) => [key, name, said, source]),
      [
        ["branche", "Integration branch", "main", "from the repository"],
        ["manager", "Manager’s calibration", "opus / high", "from the repository"],
        ["reviewer", "Reviewer’s calibration", null, "not set"],
        ["plafond", "Calibration ceiling", "opus / high", "default"],
        ["closer", "Closer’s calibration", "sonnet / medium", "from the repository"],
        ["closer-cooks", "Closer’s start threshold (cooks in flight)", "1", "default"],
        ["closer-tokens", "Closer’s tokens cap", "200000", "from the repository"],
        ["closer-lines", "Closer’s removed-lines cap", "800", "set on the station"],
      ],
    );
    assert.equal(settingsSeen("not json"), null);
    // Un runtime d'avant #1685 ne dit pas le closer : ses rangées ne se posent pas.
    const { closer: _, ...withoutCloser } = JSON.parse(OUTPUT) as Record<string, unknown>;
    assert.deepEqual(settingsSeen(JSON.stringify(withoutCloser))?.reglages.map(({ cle: key }) => key), ["branche", "manager", "reviewer", "plafond"]);
  });

  test("lue là où la cuisine tourne ; un runtime d'avant la commande se dit en une ligne, son détail au survol", async () => {
    const launched: string[] = [];
    const readOne = await readTheSettings(PARADE, BOX, async (_, command) => (launched.push(command), rendered(OUTPUT)));
    assert.deepEqual(launched, ["setting"]);
    assert.ok("vus" in readOne);
    const old = await readTheSettings(PARADE, BOX, async () => rendered("", 66, "brigade : « setting » n'est pas une commande du runtime — celles de cette station : status, facts\n"));
    assert.deepEqual("sans" in old && old.sans, "settings unavailable: this station's runtime does not give them yet — update it");
    assert.ok("sans" in (await readTheSettings(PARADE, undefined, async () => rendered(OUTPUT))));
  });

  test("les mots de la commande : un nom de branche, ou un modèle et un effort que le runtime connaît", () => {
    assert.deepEqual(commandOfSetting({ cle: "plafond", modele: "sonnet", effort: "high" }), { commande: "setting ceiling sonnet high" });
    assert.deepEqual(commandOfSetting({ cle: "manager", modele: "opus", effort: "max" }), { commande: "setting manager opus max" });
    assert.deepEqual(commandOfSetting({ cle: "branche", valeur: " v3 " }), { commande: "setting branch v3" });
    assert.ok("refus" in commandOfSetting({ cle: "branche", valeur: "v3; rm -rf ~" }));
    assert.ok("refus" in commandOfSetting({ cle: "plafond", modele: "gpt", effort: "high" }));
    assert.ok("refus" in commandOfSetting({ cle: "cooks", valeur: "4" }));
    // Le closer : son calibrage, et ses nombres en chiffres — le runtime juge s'ils sont admis.
    assert.deepEqual(commandOfSetting({ cle: "closer", modele: "sonnet", effort: "low" }), { commande: "setting closer sonnet low" });
    assert.deepEqual(commandOfSetting({ cle: "closer-cooks", valeur: " 2 " }), { commande: "setting closer-cooks 2" });
    assert.deepEqual(commandOfSetting({ cle: "closer-tokens", valeur: "300000" }), { commande: "setting closer-tokens 300000" });
    assert.deepEqual(commandOfSetting({ cle: "closer-lines", valeur: "0" }), { commande: "setting closer-lines 0" });
    for (const value of ["", "-1", "1.5", "1e3", "200k", "2; rm -rf ~"]) {
      assert.deepEqual(commandOfSetting({ cle: "closer-tokens", valeur: value }), { refus: "nothing was sent: this value is a whole number, written in digits" }, value);
    }
  });

  test("la PR ouverte rend son adresse ; un refus, la phrase du runtime, sans clé du fichier ni accent grave", async () => {
    const launched: string[] = [];
    const openOne = await proposeTheSetting(PARADE, BOX, { cle: "plafond", modele: "sonnet", effort: "high" }, async (_, command) => {
      launched.push(command);
      return rendered(JSON.stringify({ ok: true, pr: PR, number: 51, branch: "brigade/reglage-1a2b3c4d", settings: {} }));
    });
    assert.deepEqual(launched, ["setting ceiling sonnet high"]);
    assert.deepEqual(openOne, { propose: PROPOSES, pr: PR, numero: 51 });

    const refused = await proposeTheSetting(PARADE, BOX, { cle: "branche", valeur: "/home/chef/parade" }, async () =>
      rendered(JSON.stringify({ ok: false, reason: "chemin", key: "integrationBranch", message: "`integrationBranch` does not belong in the project's repository: its value is a path on a machine. A machine's paths stay in that station's settings, never in git." }), 1),
    );
    assert.ok("refus" in refused);
    assert.equal(refused.refus, "This value does not belong in the project's repository: its value is a path on a machine. A machine's paths stay in that station's settings, never in git.");

    const old = await proposeTheSetting(PARADE, BOX, { cle: "plafond", modele: "sonnet", effort: "high" }, async () => rendered("", 66, "brigade : « setting » n'est pas une commande du runtime\n"));
    assert.match("refus" in old ? old.refus : "", /cannot propose a setting yet — update it/);
    // Rien ne part d'une valeur qui ne s'écrit pas en mots, ni d'un projet sans station.
    let gone = false;
    const launch = async () => ((gone = true), rendered(""));
    assert.ok("refus" in (await proposeTheSetting(PARADE, BOX, { cle: "plafond", modele: "gpt", effort: "high" }, launch)));
    assert.ok("refus" in (await proposeTheSetting(PARADE, undefined, { cle: "plafond", modele: "sonnet", effort: "high" }, launch)));
    assert.equal(gone, false);
  });
});

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Ce que le pont répond à une proposition : rien tant que le test ne le lâche pas.
type Proposal = { projet: string; choix: unknown; rendre(rendered: RenderedOfSetting): void };

async function open(reading: ReadOfSettings = { vus: settingsSeen(OUTPUT) ?? assert.fail() }) {
  const proposals: Proposal[] = [];
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
    reglagesDuProjet: () => reading,
    proposerUnReglage: (project, choice) => new Promise<RenderedOfSetting>((render) => proposals.push({ projet: project, choix: choice, rendre: render })) as unknown as RenderedOfSetting,
    ouvrirLaProposition: () => true,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, propositions: proposals };
}

const section = (vue: Played) => vue.element("reglages-du-projet").children[0] ?? assert.fail("pas de réglages du projet");
const extra = (vue: Played) => vue.element("reglages-du-projet-en-plus").children[0] ?? assert.fail("pas de réglages en plus");
const row = (vue: Played, key: string) => [...section(vue).children, ...extra(vue).children].find((pose) => pose.dataset.cle === key) ?? assert.fail(`pas de rangée ${key}`);
const value = (pose: Fake) => pose.dessous("p").find((p) => p.className === "valeur")?.textContent;
const said = (pose: Fake) => pose.dessous("p").find((p) => p.className.startsWith("dit"));
const byPr = (pose: Fake) => pose.dessous("p").find((p) => p.className === "par-pr")?.textContent;
const list = (pose: Fake, name: "model" | "effort") => pose.dessous("select").find((select) => select.ariaLabel.endsWith(name)) ?? assert.fail(`pas de liste ${name}`);
// Écrire dans un champ, ou choisir dans une liste, sans le valider : seul `input` part.
function write(field: Fake, valueChosen: string) {
  field.value = valueChosen;
  field.declencher("input");
}
// Puis le valider — Entrée, le focus qui s'en va, un choix fait : son `change`.
function choose(field: Fake, valueChosen: string) {
  write(field, valueChosen);
  field.declencher("change");
}

describe("Settings : les réglages du projet, chacun changé par une PR", () => {
  test("chaque réglage a sa valeur, d'où elle vient, et de quoi la changer", async () => {
    const { vue } = await open();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "reglagesDuProjet").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("reglages-du-projet").hidden, false);
    assert.match(section(vue).children[0]?.textContent ?? "", new RegExp(`^${TITLE}`));
    assert.deepEqual(
      section(vue).children.slice(1).map((pose) => pose.dataset.cle),
      ["branche", "manager", "reviewer", "plafond", "closer-tokens"],
    );
    // Les réglages que l'artboard ne dessine pas suivent, dans leur propre bloc, sous le sigle et la couleur.
    assert.deepEqual(
      extra(vue).children.map((pose) => pose.dataset.cle),
      ["closer", "closer-cooks", "closer-lines"],
    );
    assert.equal(value(row(vue, "branche")), "mainfrom the repository");
    assert.equal(row(vue, "branche").dessous("input")[0]?.value, "main");
    assert.equal(value(row(vue, "plafond")), "opus / highdefault");
    assert.equal(list(row(vue, "plafond"), "model").value, "opus");
    assert.equal(value(row(vue, "closer")), "sonnet / mediumfrom the repository");
    assert.equal(value(row(vue, "closer-lines")), "800set on the station");
    assert.equal(row(vue, "closer-tokens").dessous("input")[0]?.value, "200000");
    for (const key of ["branche", "manager", "reviewer", "plafond", "closer", "closer-cooks", "closer-tokens", "closer-lines"]) {
      // Gardé dans le dépôt : la rangée dit qu'un changement ouvre une PR, et n'a ni « propose » ni « save ».
      assert.equal(row(vue, key).dataset.depot, "", key);
      assert.equal(byPr(row(vue, key)), BY_PR, key);
      assert.equal(row(vue, key).dessous("button").length, 0, key);
    }
    assert.equal(section(vue).dessous("button").some((button) => /propose|save/i.test(button.textContent)), false);
  });

  test("écrire sans valider ne propose rien ; valider la valeur en vigueur, ou un champ vide, non plus", async () => {
    const { vue, propositions: proposals } = await open();
    const branch = () => row(vue, "branche").dessous("input")[0] ?? assert.fail();
    write(branch(), "develop");
    await repos();
    assert.equal(proposals.length, 0);
    choose(branch(), " main ");
    choose(branch(), "   ");
    await repos();
    assert.equal(proposals.length, 0);
    // Le modèle et l'effort de nouveau ceux en vigueur : rien ne change, rien ne part.
    choose(list(row(vue, "plafond"), "model"), "opus");
    await repos();
    assert.equal(proposals.length, 0);
  });

  test("changer le modèle du plafond le propose aussitôt : la PR est dite sous la rangée, avec de quoi l'ouvrir ; la valeur en vigueur ne change pas", async () => {
    const { vue, propositions: proposals } = await open();
    const cap = row(vue, "plafond");
    choose(list(cap, "model"), "sonnet");
    await repos();
    assert.deepEqual(proposals.map(({ projet: project, choix: choice }) => [project, choice]), [[PARADE, { cle: "plafond", modele: "sonnet", effort: "high" }]]);
    // Tant que le runtime n'a pas répondu, la rangée dit qu'elle s'y met, et ses listes attendent.
    const inProgress = row(vue, "plafond");
    assert.equal(said(inProgress)?.className, "dit en-cours");
    assert.equal(said(inProgress)?.textContent, IN_PROGRESS);
    assert.ok(inProgress.dessous("select").every((select) => select.disabled));

    proposals[0]?.rendre({ propose: PROPOSES, pr: PR, numero: 51 });
    await repos();
    const after = row(vue, "plafond");
    assert.equal(said(after)?.className, "dit propose");
    assert.match(said(after)?.textContent ?? "", new RegExp(`^sonnet / high ${PROPOSES_IN}pull request #51$`));
    assert.equal(value(after), "opus / highdefault");
    const link = after.dessous("button").find((button) => button.textContent === "pull request #51") ?? assert.fail("pas de bouton vers la PR");
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
    // Rien n'est posé sur la box : aucune commande ni geste du plafond d'avant.
    assert.equal(vue.appels.some(({ geste: action }) => action === "reglerLePlafondDeCalibrage" || action === "lancer"), false);
  });

  test("changer l'effort d'un calibrage le propose aussi, avec le modèle en vigueur", async () => {
    const { vue, propositions: proposals } = await open();
    choose(list(row(vue, "manager"), "effort"), "medium");
    await repos();
    assert.deepEqual(proposals.map(({ choix: choice }) => choice), [{ cle: "manager", modele: "opus", effort: "medium" }]);
  });

  test("un refus du runtime se dit sous la rangée ; la valeur en vigueur ne change pas, et le champ y revient", async () => {
    const { vue, propositions: proposals } = await open();
    const branch = row(vue, "branche");
    choose(branch.dessous("input")[0] ?? assert.fail(), "/home/chef/parade");
    await repos();
    assert.deepEqual(proposals[0]?.choix, { cle: "branche", valeur: "/home/chef/parade" });
    proposals[0]?.rendre({ refus: "This value does not belong in the project's repository: its value is a path on a machine.", detail: "$ node geste.ts parade setting branch /home/chef/parade" });
    await repos();
    const after = row(vue, "branche");
    assert.equal(said(after)?.className, "dit refus");
    assert.match(said(after)?.textContent ?? "", /^This value does not belong in the project's repository/);
    assert.equal(value(after), "mainfrom the repository");
    assert.equal(after.dessous("input")[0]?.value, "main");
    // Les autres réglages n'en disent rien.
    assert.equal(said(row(vue, "plafond")), undefined);
  });

  test("une lecture ratée tient en une ligne, son détail au survol ; un projet que rien ne lit n'a pas la section", async () => {
    const { vue } = await open({ sans: "settings unavailable", detail: "$ node geste.ts parade setting\nexit 255" });
    const pose = section(vue);
    assert.equal(pose.dessous("p").find((p) => p.className === "indisponible")?.children[0]?.textContent, "settings unavailable");
    assert.equal(pose.dessous("select").length, 0);
  });
});

describe("Settings : les réglages du closer, changés par la même PR (#1685)", () => {
  test("changer le plafond de tokens du closer le propose : la PR est dite, avec de quoi l'ouvrir ; rien ne part vers la box", async () => {
    const { vue, propositions: proposals } = await open();
    const tokens = row(vue, "closer-tokens");
    choose(tokens.dessous("input")[0] ?? assert.fail(), "300000");
    await repos();
    assert.deepEqual(proposals.map(({ projet: project, choix: choice }) => [project, choice]), [[PARADE, { cle: "closer-tokens", valeur: "300000" }]]);
    proposals[0]?.rendre({ propose: PROPOSES, pr: PR, numero: 52 });
    await repos();
    const after = row(vue, "closer-tokens");
    assert.equal(said(after)?.textContent, `300000 ${PROPOSES_IN}pull request #52`);
    assert.equal(value(after), "200000from the repository");
    (after.dessous("button").find((button) => button.textContent === "pull request #52") ?? assert.fail("pas de bouton vers la PR")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
    assert.equal(vue.appels.some(({ geste: action }) => action === "lancer" || action === "ecrire"), false);
  });

  test("un nombre que le fichier refuse se dit en une phrase à côté du champ, et aucune PR ne s'ouvre", async () => {
    // Le runtime refuse « 0 » au crible du fichier, avant toute demande : sa phrase, lue telle quelle.
    const refused = await proposeTheSetting(PARADE, BOX, { cle: "closer-cooks", valeur: "0" }, async () =>
      rendered(JSON.stringify({ ok: false, reason: "invalide", key: "closer.cooksBelow", message: "`closer.cooksBelow` must be an integer greater than zero" }), 1),
    );
    assert.deepEqual("refus" in refused && refused.refus, "This value must be an integer greater than zero");

    const { vue, propositions: proposals } = await open();
    const cooks = row(vue, "closer-cooks");
    choose(cooks.dessous("input")[0] ?? assert.fail(), "0");
    await repos();
    proposals[0]?.rendre(refused);
    await repos();
    const after = row(vue, "closer-cooks");
    assert.equal(said(after)?.className, "dit refus");
    assert.equal(said(after)?.children[0]?.textContent, "This value must be an integer greater than zero");
    assert.equal(after.dessous("button").some((button) => button.textContent.startsWith("pull request")), false);
    assert.equal(after.dessous("input")[0]?.value, "1");
  });
});
