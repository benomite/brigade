// Les préférences du chef branchées sur l'app : chaque appareil a son fichier de l'app, suivi comme dans
// l'app (suivi.ts), et l'accord avec le gist (synchro.ts) — contre la doublure de `gh` qui tient les
// gists d'un compte dans un répertoire (../stations/faux-gh-gists.ts). Deux appareils du même compte
// partagent ce répertoire ; un autre compte a le sien. Ni réseau, ni GitHub, ni Electron.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FICHIER_PREFERENCES, gistDesPreferences } from "../../src/reglages-perso/gist.ts";
import { reglagesPerso } from "../../src/reglages-perso/reglages-perso.ts";
import { tenirPreferences } from "../../src/reglages-perso/synchro.ts";
import { suivreConfiguration } from "../../src/suivi.ts";
import { ghDuRepertoire } from "../aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { repondre } from "../stations/faux-gh-gists.ts";

type Gist = { id: string; public: boolean; files: Record<string, { content: string }> };
type Declare = { nom: string; dossier?: string; couleurs?: { onglet?: string; accent?: string }; [cle: string]: unknown };

const PROJET_JSON = `${JSON.stringify({ version: 1, integrationBranch: "v2" }, null, 2)}\n`;

// Un compte GitHub : ses gists dans un répertoire, chaque entrée envoyée à `gh`, et ce qu'un test veut
// faire pendant qu'une réécriture du gist est en route.
function unCompte(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-compte-"));
  writeFileSync(join(repertoire, "appels"), "");
  const envoyes: string[] = [];
  let pendantLEcriture: (() => void) | undefined;
  const gh = ghDuRepertoire(repertoire, (dossier, args, entree) => {
    const lue = entree();
    if (lue !== "") envoyes.push(lue);
    if (args.includes("PATCH") && pendantLEcriture !== undefined) {
      const geste = pendantLEcriture;
      pendantLEcriture = undefined;
      geste();
    }
    return repondre(dossier, args, () => lue);
  });
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const gists = (): Gist[] => readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json")).map((nom) => JSON.parse(readFileSync(join(repertoire, nom), "utf8")) as Gist);
  const contenu = (): string => gists()[0]?.files[FICHIER_PREFERENCES]?.content ?? "";
  const preferences = () => (JSON.parse(contenu()) as { preferences: Record<string, unknown> }).preferences;
  // Ce qu'une autre version de l'app, ou une main, écrit dans le gist.
  const ecrireLeGist = (preferences: unknown) => {
    const gist = gists()[0]!;
    writeFileSync(join(repertoire, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { [FICHIER_PREFERENCES]: { filename: FICHIER_PREFERENCES, content: JSON.stringify({ version: 1, preferences }) } } }));
  };
  return {
    gh,
    envoyes,
    gists,
    contenu,
    preferences,
    ecrireLeGist,
    pendant: (geste: () => void) => void (pendantLEcriture = geste),
    panne: (oui: boolean) => (oui ? writeFileSync(join(repertoire, "panne"), "") : rmSync(join(repertoire, "panne"), { force: true })),
  };
}

// Un appareil du chef : ses dossiers de projets — chacun avec le `projet.json` de son dépôt —, son
// fichier de l'app, suivi comme l'app le suit, et l'accord de ses préférences avec le gist du compte.
function unAppareil(t: TestContext, compte: { gh: string }, declares: Declare[], autres: Record<string, unknown> = {}) {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-appareil-")));
  const dossierDe = (nom: string) => join(racine, "code", nom);
  for (const { nom } of declares) {
    mkdirSync(join(dossierDe(nom), ".claude", "brigade"), { recursive: true });
    writeFileSync(join(dossierDe(nom), ".claude", "brigade", "projet.json"), PROJET_JSON);
  }
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, `${JSON.stringify({ ...autres, projets: declares.map((declare) => ({ ...declare, dossier: dossierDe(declare.nom) })) }, null, 2)}\n`);
  const pannes: string[] = [];
  // Le même ordre que dans l'app : `preferences` est lu par le suivi, qui le lui signale.
  const preferences = tenirPreferences({
    perso: reglagesPerso({ gist: gistDesPreferences({ gh: compte.gh, delaiMs: 30_000 }), appJson: chemin }),
    fichier: { preferences: () => suivi.preferences(), poserPreferences: (voulues) => suivi.poserPreferences(voulues) },
    surPanne: (raison) => void pannes.push(raison),
  });
  const suivi = suivreConfiguration({ chemin, surChangement: () => preferences.signaler() });
  t.after(() => {
    preferences.fermer();
    suivi.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const projets = () => suivi.configuration().projets;
  const couleursDe = (nom: string) => projets().find((projet) => projet.nom === nom)?.couleurs;
  const fichier = () => JSON.parse(readFileSync(chemin, "utf8")) as { projets: Declare[]; [cle: string]: unknown };
  // Le chef écrit le fichier à la main, puis revient à l'app : elle relit le fichier, et accorde ses
  // préférences (main.ts, `browser-window-focus`) — une clé que les écrans ne lisent pas ne change pas
  // les projets, et le suivi ne la signale pas.
  const aLaMain = async (change: (contenu: ReturnType<typeof fichier>) => void) => {
    const contenu = fichier();
    change(contenu);
    writeFileSync(chemin, `${JSON.stringify(contenu, null, 2)}\n`);
    suivi.relire();
    await preferences.tirer();
  };
  const projetsJson = () => declares.map(({ nom }) => readFileSync(join(dossierDe(nom), ".claude", "brigade", "projet.json"), "utf8"));
  return { racine, chemin, suivi, preferences, pannes, projets, couleursDe, fichier, aLaMain, dossierDe, projetsJson, noms: () => projets().map(({ nom }) => nom) };
}

const CUISINE = { nom: "cuisine", depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" } };
const SALLE = { nom: "salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } };

describe("les préférences du chef le suivent d'un appareil à l'autre", { skip: SANS_POSIX }, () => {
  test("une couleur changée sur un appareil se lit sur l'autre à sa lecture suivante, sans rien recopier", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    const portable = unAppareil(t, compte, [{ nom: "cuisine", couleurs: { onglet: "#4caf50", accent: "#4caf50" } }, { nom: "salle" }]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();
    // Le portable a pris les couleurs que le gist tenait du Mac.
    assert.deepEqual(portable.couleursDe("cuisine"), CUISINE.couleurs);

    assert.equal(mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75"), undefined);
    await mac.preferences.calme();
    assert.deepEqual(portable.couleursDe("cuisine"), CUISINE.couleurs, "nothing reaches the other device before it reads");

    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
    assert.deepEqual(portable.fichier().projets[0]!.couleurs, { onglet: "#e85d75", accent: "#ad7142" });
  });

  test("l'ordre des projets rangé sur un appareil se lit sur l'autre ; un projet que lui seul a garde sa place", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    const portable = unAppareil(t, compte, [CUISINE, SALLE, { nom: "cave" }]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();

    assert.equal(mac.suivi.ranger("salle", 0), undefined);
    assert.deepEqual(mac.noms(), ["salle", "cuisine"]);
    await mac.preferences.calme();
    // Le gist garde « cave », que le Mac n'a pas : derrière « salle », qu'elle suivait.
    assert.deepEqual((compte.preferences().projets as Declare[]).map(({ nom }) => nom), ["salle", "cave", "cuisine"]);

    await portable.preferences.tirer();
    assert.deepEqual(portable.noms(), ["salle", "cave", "cuisine"]);
    // Chaque projet garde son dossier sur cet appareil, quelle que soit sa place.
    for (const projet of portable.projets()) assert.equal(projet.dossier, portable.dossierDe(projet.nom));
  });

  test("une préférence d'affichage changée sur un appareil se lit sur les autres à leur lecture suivante", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE]);
    const portable = unAppareil(t, compte, [CUISINE]);
    const bureau = unAppareil(t, compte, [CUISINE]);
    for (const appareil of [mac, portable, bureau]) await appareil.preferences.tirer();

    await mac.aLaMain((contenu) => void (contenu.affichage = { densite: "serree" }));
    await mac.preferences.calme();
    assert.deepEqual(compte.preferences().affichage, { densite: "serree" });

    for (const appareil of [portable, bureau]) {
      await appareil.preferences.tirer();
      assert.deepEqual(appareil.fichier().affichage, { densite: "serree" });
    }
    // Changée de nouveau, ailleurs, et retirée : la lecture suivante le dit aussi.
    await portable.aLaMain((contenu) => void (contenu.affichage = { densite: "aeree" }));
    await portable.preferences.calme();
    await mac.preferences.tirer();
    assert.deepEqual(mac.fichier().affichage, { densite: "aeree" });
    await bureau.aLaMain((contenu) => void delete contenu.affichage);
    await bureau.preferences.calme();
    await mac.preferences.tirer();
    assert.equal("affichage" in mac.fichier(), false);
  });

  test("deux appareils qui changent chacun un projet sans s'être relus : aucun changement n'est perdu", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    const portable = unAppareil(t, compte, [CUISINE, SALLE]);
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
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    await mac.preferences.tirer();

    compte.pendant(() => assert.equal(mac.suivi.ranger("salle", 0), undefined));
    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    await mac.preferences.calme();

    assert.deepEqual(mac.noms(), ["salle", "cuisine"]);
    assert.deepEqual(mac.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
    assert.deepEqual((compte.preferences().projets as Declare[]).map(({ nom, couleurs }) => ({ nom, onglet: couleurs?.onglet })), [
      { nom: "salle", onglet: "#7f9cf5" },
      { nom: "cuisine", onglet: "#e85d75" },
    ]);
  });

  test("au premier accord, les couleurs du gist l'emportent sur celles que l'app vient de tirer", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE]);
    await mac.preferences.tirer();
    const portable = unAppareil(t, compte, [{ nom: "cuisine" }]);
    assert.equal(portable.suivi.colorer(() => 0.5), undefined);
    assert.notDeepEqual(portable.couleursDe("cuisine"), CUISINE.couleurs);

    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), CUISINE.couleurs);
    assert.deepEqual((compte.preferences().projets as Declare[])[0]!.couleurs, CUISINE.couleurs);
  });
});

describe("ce qui reste sur l'appareil", { skip: SANS_POSIX }, () => {
  test("le dossier d'un projet n'est pas dans le gist, et se lit toujours dans le fichier de l'app", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    const portable = unAppareil(t, compte, [{ nom: "cuisine" }, { nom: "salle" }]);
    await mac.preferences.tirer();
    mac.suivi.changerCouleur("cuisine", "accent", "#e85d75");
    mac.suivi.ranger("salle", 0);
    await mac.preferences.calme();
    await portable.preferences.tirer();

    // Le gist, après les écritures : aucun dossier, ni sa clé ni sa valeur.
    for (const envoye of [compte.contenu(), ...compte.envoyes]) {
      for (const interdit of [mac.racine, portable.racine]) assert.ok(!envoye.includes(interdit), `${interdit} left the device: ${envoye}`);
      assert.doesNotMatch(envoye, /"dossier"/);
    }
    assert.ok(compte.envoyes.length >= 2, "the gist was written");
    // Chacun lit son dossier dans son propre fichier.
    for (const appareil of [mac, portable]) {
      const cuisine = appareil.projets().find(({ nom }) => nom === "cuisine")!;
      assert.equal(cuisine.dossier, appareil.dossierDe("cuisine"));
    }
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#f2994a", accent: "#e85d75" });
  });

  test("avec un autre compte GitHub, l'app montre les valeurs du fichier et aucune préférence du chef", async (t) => {
    const duChef = unCompte(t);
    const mac = unAppareil(t, duChef, [CUISINE, SALLE], { affichage: { densite: "serree" } });
    await mac.preferences.tirer();
    mac.suivi.ranger("salle", 0);
    await mac.preferences.calme();

    const dUnAutre = unCompte(t);
    const LOCALES = { onglet: "#4caf50", accent: "#4caf50" };
    const ailleurs = unAppareil(t, dUnAutre, [{ nom: "cuisine", couleurs: LOCALES }, { nom: "salle" }]);
    await ailleurs.preferences.tirer();
    assert.deepEqual(ailleurs.noms(), ["cuisine", "salle"]);
    assert.deepEqual(ailleurs.couleursDe("cuisine"), LOCALES);
    assert.equal("affichage" in ailleurs.fichier(), false);
    // Son gist est le sien : rien du chef n'y est.
    assert.doesNotMatch(dUnAutre.contenu(), /#f2994a|serree/);
  });

  test("sans accès au gist du chef, l'app montre les valeurs du fichier, ne le réécrit pas, et le dit une fois", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    await mac.preferences.tirer();
    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    await mac.preferences.calme();

    const LOCALES = { onglet: "#4caf50", accent: "#4caf50" };
    const portable = unAppareil(t, compte, [{ nom: "cuisine", couleurs: LOCALES }, { nom: "salle" }]);
    const avant = readFileSync(portable.chemin, "utf8");
    compte.panne(true);
    await portable.preferences.tirer();
    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), LOCALES);
    assert.equal(readFileSync(portable.chemin, "utf8"), avant);
    assert.equal(portable.pannes.length, 1);
    assert.match(portable.pannes[0]!, /error connecting to api\.github\.com/);

    // L'accès revenu, la lecture suivante rattrape.
    compte.panne(false);
    await portable.preferences.tirer();
    assert.deepEqual(portable.couleursDe("cuisine"), { onglet: "#e85d75", accent: "#ad7142" });
  });

  test("un gist dont les couleurs ne se liraient pas ne touche pas au fichier", async (t) => {
    const compte = unCompte(t);
    const portable = unAppareil(t, compte, [CUISINE]);
    await portable.preferences.tirer();
    compte.ecrireLeGist({ projets: [{ ...CUISINE, couleurs: { onglet: "rouge" } }] });

    const avant = readFileSync(portable.chemin, "utf8");
    await portable.preferences.tirer();
    assert.equal(readFileSync(portable.chemin, "utf8"), avant);
    assert.match(portable.pannes.at(-1) ?? "", /would no longer be understood/);
  });

  test("aucun enregistrement de préférences ne change un projet.json", async (t) => {
    const compte = unCompte(t);
    const mac = unAppareil(t, compte, [CUISINE, SALLE]);
    const portable = unAppareil(t, compte, [CUISINE, SALLE]);
    await mac.preferences.tirer();
    await portable.preferences.tirer();

    mac.suivi.changerCouleur("cuisine", "onglet", "#e85d75");
    mac.suivi.ranger("salle", 0);
    await mac.aLaMain((contenu) => void (contenu.affichage = { densite: "serree" }));
    await mac.preferences.calme();
    await portable.preferences.tirer();
    assert.deepEqual(portable.noms(), ["salle", "cuisine"]);

    for (const appareil of [mac, portable]) assert.deepEqual(appareil.projetsJson(), [PROJET_JSON, PROJET_JSON]);
    assert.ok(compte.envoyes.every((envoye) => !envoye.includes("integrationBranch")));
  });
});
