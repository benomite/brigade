// Les préférences du chef branchées sur l'app : chaque appareil a son fichier de l'app, suivi comme dans
// l'app (tracking.ts), et l'accord avec le gist (sync.ts) — contre la doublure de `gh` qui tient les
// gists d'un compte dans un répertoire (../stations/fake-gh-gists.ts). Deux appareils du même compte
// partagent ce répertoire ; un autre compte a le sien. Ni réseau, ni GitHub, ni Electron.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FILE_PREFERENCES, gistOfPreferences } from "../../src/settings-personal/gist.ts";
import { settingsPersonal } from "../../src/settings-personal/settings-personal.ts";
import { holdPreferences } from "../../src/settings-personal/sync.ts";
import { followConfiguration } from "../../src/tracking.ts";
import { ghOfDirectory } from "../helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { reply } from "../stations/fake-gh-gists.ts";

type Gist = { id: string; public: boolean; files: Record<string, { content: string }> };
type Declare = { nom: string; dossier?: string; couleurs?: { onglet?: string; accent?: string }; [key: string]: unknown };

const PROJECT_JSON = `${JSON.stringify({ version: 1, integrationBranch: "v2" }, null, 2)}\n`;

// Un compte GitHub : ses gists dans un répertoire, chaque entrée envoyée à `gh`, et ce qu'un test veut
// faire pendant qu'une réécriture du gist est en route.
function oneAccount(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-compte-"));
  writeFileSync(join(directory, "appels"), "");
  const sent: string[] = [];
  let duringTheWriting: (() => void) | undefined;
  const gh = ghOfDirectory(directory, (folder, args, entry) => {
    const readEntry = entry();
    if (readEntry !== "") sent.push(readEntry);
    if (args.includes("PATCH") && duringTheWriting !== undefined) {
      const action = duringTheWriting;
      duringTheWriting = undefined;
      action();
    }
    return reply(folder, args, () => readEntry);
  });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gists = (): Gist[] => readdirSync(directory).filter((name) => name.endsWith(".gist.json")).map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")) as Gist);
  const content = (): string => gists()[0]?.files[FILE_PREFERENCES]?.content ?? "";
  const preferences = () => (JSON.parse(content()) as { preferences: Record<string, unknown> }).preferences;
  // Ce qu'une autre version de l'app, ou une main, écrit dans le gist.
  const writeTheGist = (preferences: unknown) => {
    const gist = gists()[0]!;
    writeFileSync(join(directory, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { [FILE_PREFERENCES]: { filename: FILE_PREFERENCES, content: JSON.stringify({ version: 1, preferences }) } } }));
  };
  return {
    gh,
    envoyes: sent,
    gists,
    contenu: content,
    preferences,
    ecrireLeGist: writeTheGist,
    pendant: (action: () => void) => void (duringTheWriting = action),
    panne: (yes: boolean) => (yes ? writeFileSync(join(directory, "panne"), "") : rmSync(join(directory, "panne"), { force: true })),
  };
}

// Un appareil du chef : ses dossiers de projets — chacun avec le `projet.json` de son dépôt —, son
// fichier de l'app, suivi comme l'app le suit, et l'accord de ses préférences avec le gist du compte.
function oneDevice(t: TestContext, account: { gh: string }, declares: Declare[], others: Record<string, unknown> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-appareil-")));
  const folderOf = (name: string) => join(root, "code", name);
  for (const { nom: name } of declares) {
    mkdirSync(join(folderOf(name), ".claude", "brigade"), { recursive: true });
    writeFileSync(join(folderOf(name), ".claude", "brigade", "projet.json"), PROJECT_JSON);
  }
  const path = join(root, "app.json");
  writeFileSync(path, `${JSON.stringify({ ...others, projets: declares.map((declare) => ({ ...declare, dossier: folderOf(declare.nom) })) }, null, 2)}\n`);
  const outages: string[] = [];
  // Le même ordre que dans l'app : `preferences` est lu par le suivi, qui le lui signale.
  const preferences = holdPreferences({
    perso: settingsPersonal({ gist: gistOfPreferences({ gh: account.gh, delaiMs: 30_000 }), appJson: path }),
    fichier: { preferences: () => tracking.preferences(), poserPreferences: (wanted) => tracking.poserPreferences(wanted) },
    surPanne: (reason) => void outages.push(reason),
  });
  const tracking = followConfiguration({ chemin: path, surChangement: () => preferences.signaler() });
  t.after(() => {
    preferences.fermer();
    tracking.fermer();
    rmSync(root, { recursive: true, force: true });
  });
  const projects = () => tracking.configuration().projets;
  const colorsOf = (name: string) => projects().find((project) => project.nom === name)?.couleurs;
  const file = () => JSON.parse(readFileSync(path, "utf8")) as { projets: Declare[]; [key: string]: unknown };
  // Le chef écrit le fichier à la main, puis revient à l'app : elle relit le fichier, et accorde ses
  // préférences (main.ts, `browser-window-focus`) — une clé que les écrans ne lisent pas ne change pas
  // les projets, et le suivi ne la signale pas.
  const atTheMain = async (change: (content: ReturnType<typeof file>) => void) => {
    const content = file();
    change(content);
    writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
    tracking.relire();
    await preferences.tirer();
  };
  const projectsJson = () => declares.map(({ nom: name }) => readFileSync(join(folderOf(name), ".claude", "brigade", "projet.json"), "utf8"));
  return { racine: root, chemin: path, suivi: tracking, preferences, pannes: outages, projets: projects, couleursDe: colorsOf, fichier: file, aLaMain: atTheMain, dossierDe: folderOf, projetsJson: projectsJson, noms: () => projects().map(({ nom: name }) => name) };
}

const KITCHEN = { nom: "cuisine", depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" } };
const ROOM = { nom: "salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } };

describe("les préférences du chef le suivent d'un appareil à l'autre", { skip: WITHOUT_POSIX }, () => {
  test("une couleur changée sur un appareil se lit sur l'autre à sa lecture suivante, sans rien recopier", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    const portable = oneDevice(t, account, [{ nom: "cuisine", couleurs: { onglet: "#4caf50", accent: "#4caf50" } }, { nom: "salle" }]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();
    // Le portable a pris les couleurs que le gist tenait du Mac.
    assert.deepEqual(portable.couleursDe("cuisine"), KITCHEN.couleurs);

    assert.equal(mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75"), undefined);
    await mac.preferences.calme();
    assert.deepEqual(portable.couleursDe("cuisine"), KITCHEN.couleurs, "nothing reaches the other device before it reads");

    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
    assert.deepEqual(portable.fichier().projets[0]!.couleurs, { onglet: "#e85d75", accent: "#ad7142" });
  });

  test("l'ordre des projets rangé sur un appareil se lit sur l'autre ; un projet que lui seul a garde sa place", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    const portable = oneDevice(t, account, [KITCHEN, ROOM, { nom: "cave" }]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();

    assert.equal(mac.suivi.ranger("salle", 0), undefined);
    assert.deepEqual(mac.noms(), ["salle", "cuisine"]);
    await mac.preferences.calme();
    // Le gist garde « cave », que le Mac n'a pas : derrière « salle », qu'elle suivait.
    assert.deepEqual((account.preferences().projets as Declare[]).map(({ nom: name }) => name), ["salle", "cave", "cuisine"]);

    await portable.preferences.tirer();
    assert.deepEqual(portable.noms(), ["salle", "cave", "cuisine"]);
    // Chaque projet garde son dossier sur cet appareil, quelle que soit sa place.
    for (const project of portable.projets()) assert.equal(project.dossier, portable.dossierDe(project.nom));
  });

  test("une préférence d'affichage changée sur un appareil se lit sur les autres à leur lecture suivante", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN]);
    const portable = oneDevice(t, account, [KITCHEN]);
    const desktop = oneDevice(t, account, [KITCHEN]);
    for (const device of [mac, portable, desktop]) await device.preferences.tirer();

    await mac.aLaMain((content) => void (content.affichage = { densite: "serree" }));
    await mac.preferences.calme();
    assert.deepEqual(account.preferences().affichage, { densite: "serree" });

    for (const device of [portable, desktop]) {
      await device.preferences.tirer();
      assert.deepEqual(device.fichier().affichage, { densite: "serree" });
    }
    // Changée de nouveau, ailleurs, et retirée : la lecture suivante le dit aussi.
    await portable.aLaMain((content) => void (content.affichage = { densite: "aeree" }));
    await portable.preferences.calme();
    await mac.preferences.tirer();
    assert.deepEqual(mac.fichier().affichage, { densite: "aeree" });
    await desktop.aLaMain((content) => void delete content.affichage);
    await desktop.preferences.calme();
    await mac.preferences.tirer();
    assert.equal("affichage" in mac.fichier(), false);
  });

  test("deux appareils qui changent chacun un projet sans s'être relus : aucun changement n'est perdu", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    const portable = oneDevice(t, account, [KITCHEN, ROOM]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();

    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    await mac.preferences.calme();
    portable.suivi.changerCouleur("salle", "accent", "#4caf50");
    await portable.preferences.calme();

    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
    await mac.preferences.tirer();
    assert.deepEqual(mac.couleursDe("salle"), { onglet: "#7f9cf5", accent: "#4caf50" });
    assert.deepEqual(mac.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
  });

  test("un geste fait pendant que le gist s'écrit n'est pas effacé par ce que le gist porte", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    await mac.preferences.tirer();

    account.pendant(() => assert.equal(mac.suivi.ranger("salle", 0), undefined));
    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    await mac.preferences.calme();

    assert.deepEqual(mac.noms(), ["salle", "cuisine"]);
    assert.deepEqual(mac.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
    assert.deepEqual((account.preferences().projets as Declare[]).map(({ nom: name, couleurs: colors }) => ({ nom: name, onglet: colors?.onglet })), [
      { nom: "salle", onglet: "#7f9cf5" },
      { nom: "cuisine", onglet: "#e85d75" },
    ]);
  });

  test("au premier accord, les couleurs du gist l'emportent sur celles que l'app vient de tirer", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN]);
    await mac.preferences.tirer();
    const portable = oneDevice(t, account, [{ nom: "cuisine" }]);
    assert.equal(portable.suivi.colorer(() => 0.5), undefined);
    assert.notDeepEqual(portable.couleursDe("cuisine"), KITCHEN.couleurs);

    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), KITCHEN.couleurs);
    assert.deepEqual((account.preferences().projets as Declare[])[0]!.couleurs, KITCHEN.couleurs);
  });
});

describe("ce qui reste sur l'appareil", { skip: WITHOUT_POSIX }, () => {
  test("le dossier d'un projet n'est pas dans le gist, et se lit toujours dans le fichier de l'app", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    const portable = oneDevice(t, account, [{ nom: "cuisine" }, { nom: "salle" }]);
    await mac.preferences.tirer();
    mac.suivi.changerCouleur("cuisine", "accent", "#e85d75");
    mac.suivi.ranger("salle", 0);
    await mac.preferences.calme();
    await portable.preferences.tirer();

    // Le gist, après les écritures : aucun dossier, ni sa clé ni sa valeur.
    for (const sent of [account.contenu(), ...account.envoyes]) {
      for (const forbidden of [mac.racine, portable.racine]) assert.ok(!sent.includes(forbidden), `${forbidden} left the device: ${sent}`);
      assert.doesNotMatch(sent, /"dossier"/);
    }
    assert.ok(account.envoyes.length >= 2, "the gist was written");
    // Chacun lit son dossier dans son propre fichier.
    for (const device of [mac, portable]) {
      const kitchen = device.projets().find(({ nom: name }) => name === "cuisine")!;
      assert.equal(kitchen.dossier, device.dossierDe("cuisine"));
    }
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#f2994a", accent: "#e85d75" });
  });

  test("avec un autre compte GitHub, l'app montre les valeurs du fichier et aucune préférence du chef", async (t) => {
    const ofChef = oneAccount(t);
    const mac = oneDevice(t, ofChef, [KITCHEN, ROOM], { affichage: { densite: "serree" } });
    await mac.preferences.tirer();
    mac.suivi.ranger("salle", 0);
    await mac.preferences.calme();

    const ofAOther = oneAccount(t);
    const LOCALES = { onglet: "#4caf50", accent: "#4caf50" };
    const elsewhere = oneDevice(t, ofAOther, [{ nom: "cuisine", couleurs: LOCALES }, { nom: "salle" }]);
    await elsewhere.preferences.tirer();
    assert.deepEqual(elsewhere.noms(), ["cuisine", "salle"]);
    assert.deepEqual(elsewhere.couleursDe("cuisine"), LOCALES);
    assert.equal("affichage" in elsewhere.fichier(), false);
    // Son gist est le sien : rien du chef n'y est.
    assert.doesNotMatch(ofAOther.contenu(), /#f2994a|serree/);
  });

  test("sans accès au gist du chef, l'app montre les valeurs du fichier, ne le réécrit pas, et le dit une fois", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    await mac.preferences.tirer();
    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    await mac.preferences.calme();

    const LOCALES = { onglet: "#4caf50", accent: "#4caf50" };
    const portable = oneDevice(t, account, [{ nom: "cuisine", couleurs: LOCALES }, { nom: "salle" }]);
    const before = readFileSync(portable.chemin, "utf8");
    account.panne(true);
    await portable.preferences.tirer();
    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), LOCALES);
    assert.equal(readFileSync(portable.chemin, "utf8"), before);
    assert.equal(portable.pannes.length, 1);
    assert.match(portable.pannes[0]!, /error connecting to api\.github\.com/);

    // L'accès revenu, la lecture suivante rattrape.
    account.panne(false);
    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
  });

  test("un gist dont les couleurs ne se liraient pas ne touche pas au fichier", async (t) => {
    const account = oneAccount(t);
    const portable = oneDevice(t, account, [KITCHEN]);
    await portable.preferences.tirer();
    account.ecrireLeGist({ projets: [{ ...KITCHEN, couleurs: { onglet: "rouge" } }] });

    const before = readFileSync(portable.chemin, "utf8");
    await portable.preferences.tirer();
    assert.equal(readFileSync(portable.chemin, "utf8"), before);
    assert.match(portable.pannes.at(-1) ?? "", /would no longer be understood/);
  });

  test("aucun enregistrement de préférences ne change un projet.json", async (t) => {
    const account = oneAccount(t);
    const mac = oneDevice(t, account, [KITCHEN, ROOM]);
    const portable = oneDevice(t, account, [KITCHEN, ROOM]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();

    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    mac.suivi.ranger("salle", 0);
    await mac.aLaMain((content) => void (content.affichage = { densite: "serree" }));
    await mac.preferences.calme();
    await portable.preferences.tirer();
    assert.deepEqual(portable.noms(), ["salle", "cuisine"]);

    for (const device of [mac, portable]) assert.deepEqual(device.projetsJson(), [PROJECT_JSON, PROJECT_JSON]);
    assert.ok(account.envoyes.every((sent) => !sent.includes("integrationBranch")));
  });
});
