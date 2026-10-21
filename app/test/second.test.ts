// Le second est à droite, en permanence : ce n'est pas une page. Il est visible en même temps
// que le rail ; à côté de lui, au même niveau, les shells — un shell montré ne le remplace
// jamais, son onglet le rend en un clic. Changer de page au centre ne le ferme ni ne le vide ; et
// un clic à gauche (une carte, un bouton, un geste) écrit dans lui sans que le centre change.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const FANFARE: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const AUTRE: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

async function ouvrir(reponses: Reponses = {}, projets: Projet[] = [PARADE, FANFARE], poste?: { nom: string; mac: boolean }): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      ...(poste === undefined ? {} : { poste }),
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets, hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: (projet) => (projet === "fanfare" ? [AUTRE] : [SECOND]),
    machines: () => [{ id: "poste", titre: "this Mac" }],
    shell: () => SHELL,
    ...reponses,
  });
  await entrer(vue, 1);
  return vue;
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier, puis « + ».
const entrer = async (vue: Jouee, rang: number) => {
  (vue.element("projets").children.at(rang) ?? assert.fail(`pas d'entrée ${rang}`)).click();
  await repos();
};
const cliquer = async (vue: Jouee, ou: Faux, texte: string) => {
  (ou.dessous("button").find((pose) => pose.textContent === texte) ?? ou.children.find((pose) => pose.textContent === texte) ?? assert.fail(`pas de « ${texte} »`)).click();
  await repos();
};
// En haut, les onglets de pages ; à droite, ceux des terminaux.
const titres = (vue: Jouee) => vue.element("onglets").children.map((pose) => pose.textContent);
const selectionne = (vue: Jouee) => vue.element("onglets").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
const terminaux = (vue: Jouee) => vue.element("terminaux").children.map((pose) => pose.textContent);
const montre = (vue: Jouee) => vue.element("terminaux").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
// Les cadres des terminaux, là où la vue les a posés : dans la colonne de droite, et nulle part ailleurs.
const cadres = (vue: Jouee) => vue.element("fil").children;
// Ce qui se voit à droite pour le projet affiché : la colonne, ses cadres montrés, le titre de l'onglet du second, la note.
function vuDuSecond(vue: Jouee) {
  const montres = cadres(vue).filter((cadre) => !cadre.hidden);
  return { colonne: !vue.element("second").hidden, cadres: montres.length, titre: terminaux(vue)[0], note: vue.element("note-second").textContent };
}

describe("le second est une colonne à droite, pas une page", () => {
  test("dans la page, il a sa colonne à lui : hors de la zone centrale, au bord droit du cadre — les onglets des terminaux en tête", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const cadre = html.slice(html.indexOf('<div id="cadre">'), html.indexOf('<p id="relecture"'));
    const rangs = ["<main>", "</main>", '<aside id="second"', 'id="terminaux"', 'id="fil"'].map((repere) => cadre.indexOf(repere));

    assert.ok(rangs.every((rang) => rang !== -1), "le cadre ne porte pas la colonne du second");
    assert.deepEqual(rangs, rangs.toSorted((a, b) => a - b));
    // Rien n'est posé après elle dans le cadre : c'est la dernière colonne.
    assert.match(cadre.slice(cadre.indexOf('<aside id="second"')), /^<aside id="second"[^]*?<\/aside>\s*<\/div>\s*$/);
  });

  test("il est visible dès que l'espace s'ouvre, en même temps que le rail : aucun onglet de page ne le nomme", async () => {
    const vue = await ouvrir();

    assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
    assert.equal(vue.element("rail").hidden, false);
    // En haut, un onglet de pages, Paramètres : ni « Second », ni shell — ni Cost, qui vit au niveau de l'app (#1022).
    assert.deepEqual(titres(vue), ["Settings"]);
    // À droite, le second, montré, et au même niveau, de quoi ouvrir un shell.
    assert.deepEqual(terminaux(vue), ["second · claude", "+ shell"]);
    assert.deepEqual(montre(vue), ["second · claude"]);
    // Aucune page n'est ouverte : le rail a le centre pour lui.
    assert.deepEqual(selectionne(vue), []);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("il reste monté quand la vue change : le même terminal, dans sa colonne, avec ce qu'il avait reçu — rien n'est rouvert ni vidé", async () => {
    const vue = await ouvrir();
    vue.dire("surSortie", SECOND.id, "> une conversation en cours\r\n");
    const [terminal] = vue.xterms;
    const [cadre] = cadres(vue);
    const tenu = () => {
      assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
      // Le même cadre et le même terminal, à leur place : rien n'a été recréé, ni déplacé, ni effacé.
      assert.equal(cadres(vue)[0], cadre);
      assert.equal(cadre?.parentElement, vue.element("fil"));
      assert.equal(vue.xterms[0], terminal);
      assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n"]);
    };

    // Cooks est un onglet du projet (#1184), pas une page : rien ne se pose par-dessus le centre.
    for (const { titre } of ONGLETS) {
      await ouvrirLecture(vue, titre);
      assert.equal(vue.element("contenu").hidden, titre === "Cooks", titre);
      tenu();
    }
    // Un shell s'ouvre à droite, à côté du second : il a son cadre à lui, montré à la place de
    // celui du second, qui reste posé, caché, avec ce qu'il avait reçu. La page ouverte ne bouge pas.
    const page = selectionne(vue);
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    assert.deepEqual(terminaux(vue), ["second · claude", "shell 1", "+ shell"]);
    assert.deepEqual(montre(vue), ["shell 1"]);
    assert.deepEqual(selectionne(vue), page);
    assert.equal(cadres(vue).length, 2);
    assert.equal(cadre?.hidden, true);
    assert.equal(cadres(vue).filter((pose) => !pose.hidden).length, 1);
    assert.equal(vue.xterms[0], terminal);
    // Un clic sur son onglet rend le second, et sa conversation ; le shell reste, caché.
    await cliquer(vue, vue.element("terminaux"), "second · claude");
    assert.deepEqual(montre(vue), ["second · claude"]);
    assert.deepEqual(terminaux(vue), ["second · claude", "shell 1", "+ shell"]);
    tenu();
    // Et l'inverse : le shell revient tel quel, sans en ouvrir un autre.
    await cliquer(vue, vue.element("terminaux"), "shell 1");
    assert.deepEqual(montre(vue), ["shell 1"]);
    assert.equal(vue.appels.filter(({ geste }) => geste === "shell").length, 1);
    await cliquer(vue, vue.element("terminaux"), "second · claude");
    tenu();
    // Ce qui lui arrive pendant ce temps s'y écrit à la suite.
    vue.dire("surSortie", SECOND.id, "suite\r\n");
    assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n", "suite\r\n"]);
    // L'espace n'a été ouvert qu'une fois : changer de vue ne relance rien.
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, 1);
  });

  test("Shift+Entrée revient à la ligne, dans le second comme dans un shell : Entrée, elle, reste envoyée", async () => {
    const vue = await ouvrir();
    vue.dire("surSortie", SECOND.id, "> ");
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    vue.dire("surSortie", SHELL.id, "$ ");
    const [second, shell] = vue.xterms;
    const ecrits = () => vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args);
    const touche = (key: string, shiftKey: boolean, type = "keydown") => ({ key, shiftKey, type });
    assert.equal(second?.filtre?.(touche("Enter", true)), false);
    assert.equal(shell?.filtre?.(touche("Enter", true)), false);
    // Au relâchement, rien de plus n'est écrit ; Entrée seule et les autres touches restent à xterm.
    assert.equal(second?.filtre?.(touche("Enter", true, "keyup")), false);
    assert.equal(second?.filtre?.(touche("Enter", false)), true);
    assert.equal(second?.filtre?.(touche("a", true)), true);
    assert.deepEqual(ecrits(), [[SECOND.id, "\x1b\r"], [SHELL.id, "\x16\n"]]);
  });

  test("Option/Cmd/Ctrl/Shift + flèche et + ⌫ déplacent ou effacent, dans le second comme dans un shell", async () => {
    const vue = await ouvrir();
    vue.dire("surSortie", SECOND.id, "> ");
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    vue.dire("surSortie", SHELL.id, "$ ");
    const [second, shell] = vue.xterms;
    const ecrits = () => vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args);
    const t = (key: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, type = "keydown") => ({ key, shiftKey: false, type, ...mods });
    const cas: [string, object, string][] = [
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
    for (const [key, mods, attendu] of cas) {
      const avant = ecrits().length;
      assert.equal(shell?.filtre?.(t(key, mods)), false);
      assert.equal(shell?.filtre?.(t(key, mods, "keyup")), false);
      assert.deepEqual(ecrits().slice(avant), [[SHELL.id, attendu]]);
    }
    assert.equal(second?.filtre?.(t("ArrowLeft", { altKey: true })), false);
    assert.deepEqual(ecrits().at(-1), [SECOND.id, "\x1bb"]);
    // Sans modificateur, les flèches et ⌫ restent à xterm.
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace"]) assert.equal(second?.filtre?.(t(key, {})), true);
  });

  test("hors d'un Mac, Ctrl copie et colle comme dans le Terminal de Windows ; sur un Mac, Ctrl reste au shell", async (t) => {
    const copies: string[] = [];
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (texte: string) => void copies.push(texte) }, configurable: true });
    t.after(() => Reflect.deleteProperty(globalThis.navigator, "clipboard"));
    const ctrl = (key: string, shiftKey = false, type = "keydown") => ({ key, shiftKey, ctrlKey: true, type });
    const ecrits = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args);

    const pc = await ouvrir({}, [PARADE, FANFARE], { nom: "this PC", mac: false });
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
    assert.deepEqual(ecrits(pc), []);

    const mac = await ouvrir();
    const [sienne] = mac.xterms;
    if (sienne !== undefined) sienne.selection = "brigade parade status";
    assert.equal(sienne?.filtre?.(ctrl("c")), true);
    assert.equal(sienne?.filtre?.(ctrl("v")), true);
    assert.equal(copies.length, 2);
  });

  test("chaque projet montre son second ; revenir sur un projet rend le sien, tel qu'il était", async () => {
    const vue = await ouvrir();
    vue.dire("surSortie", SECOND.id, "le fil de parade\r\n");
    await entrer(vue, 2);

    assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "session neuve" });
    assert.equal(cadres(vue).length, 2);
    await entrer(vue, 1);

    assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
    assert.deepEqual(vue.xterms.find((xterm) => xterm.ecrits.length > 0)?.ecrits, ["le fil de parade\r\n"]);
    // « Tous les projets » n'a pas d'espace : la colonne s'efface avec lui, et revient avec le projet.
    await entrer(vue, 0);
    assert.equal(vue.element("second").hidden, true);
    await entrer(vue, 1);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(cadres(vue).length, 2);
  });

  test("un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi, à sa place", async () => {
    const vue = await ouvrir({}, [{ ...PARADE, refus: "son dossier est déjà celui d'un autre projet" }]);

    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("fil").hidden, true);
    assert.equal(vue.element("note-second").textContent, "“parade” does not open: son dossier est déjà celui d'un autre projet — it has no second");
    assert.equal(vue.element("rail").hidden, false);
    assert.ok(!terminaux(vue).includes("+ shell"));
  });
});

describe("à droite, les shells à côté du second : un shell ne remplace jamais le second", () => {
  test("chaque shell ouvert a son onglet, au même niveau que le second ; « + shell » reste en bout de rangée", async () => {
    let n = 0;
    const vue = await ouvrir({ shell: () => ({ ...SHELL, id: 10 + ++n, titre: `shell ${n}` }) });

    await cliquer(vue, vue.element("terminaux"), "+ shell");
    await cliquer(vue, vue.element("terminaux"), "+ shell");

    assert.deepEqual(terminaux(vue), ["second · claude", "shell 1", "shell 2", "+ shell"]);
    assert.deepEqual(montre(vue), ["shell 2"]);
    // Le shell montré prend le clavier ; le second, rendu d'un clic, le reprend.
    assert.equal(vue.xterms[2]?.focalise, 1);
    const avant = vue.xterms[0]?.focalise ?? 0;
    await cliquer(vue, vue.element("terminaux"), "second · claude");
    assert.equal(vue.xterms[0]?.focalise, avant + 1);
    // Rien ne s'ouvre au centre : ni page, ni zone sous le rail.
    assert.deepEqual(selectionne(vue), []);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("« + shell » demande sur quelle machine ouvrir : ce poste, la box et chaque station, sous leurs noms — le choix part au process principal, qui ouvre le shell", async () => {
    const MACHINES = [
      { id: "poste", titre: "this Mac" },
      { id: "box", titre: "box parade-box — station box/claude" },
      { id: "station:studio", titre: "station studio/claude" },
    ];
    const vue = await ouvrir({ machines: () => MACHINES, shell: () => ({ ...SHELL, titre: "shell 1 · parade-box" }) });
    const machines = vue.element("machines");
    assert.equal(machines.hidden, true);

    await cliquer(vue, vue.element("terminaux"), "+ shell");

    assert.equal(machines.hidden, false);
    assert.deepEqual(machines.children.map((pose) => pose.textContent), ["open a shell on", ...MACHINES.map(({ titre }) => titre), "cancel"]);
    assert.deepEqual(vue.dernier("machines"), ["parade"]);
    // Rien ne s'ouvre avant le choix.
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "shell"), []);
    await cliquer(vue, machines, "box parade-box — station box/claude");

    assert.deepEqual(vue.dernier("shell"), ["parade", "box"]);
    assert.equal(machines.hidden, true);
    assert.deepEqual(terminaux(vue), ["second · claude", "shell 1 · parade-box", "+ shell"]);
    assert.deepEqual(montre(vue), ["shell 1 · parade-box"]);

    // « cancel » referme le choix sans rien ouvrir ; recliquer « + shell » aussi.
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    await cliquer(vue, machines, "cancel");
    assert.equal(machines.hidden, true);
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    assert.equal(machines.hidden, true);
    assert.equal(vue.appels.filter(({ geste }) => geste === "shell").length, 1);
  });

  test("là où il n'y a que ce poste, rien n'est à choisir : le shell s'y ouvre", async () => {
    const vue = await ouvrir();
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    assert.equal(vue.element("machines").hidden, true);
    assert.deepEqual(vue.dernier("shell"), ["parade", "poste"]);
  });

  test("le shell montré se ferme pour de bon par son bouton ; le second n'en a pas", async () => {
    const vue = await ouvrir({ fermerShell: () => ({ ferme: true }) });
    const fermer = vue.element("fermer-shell");
    assert.equal(fermer.hidden, true);

    await cliquer(vue, vue.element("terminaux"), "+ shell");
    assert.equal(fermer.hidden, false);
    assert.equal(fermer.textContent, "close shell 1");
    fermer.click();
    await repos();
    assert.deepEqual(vue.dernier("fermerShell"), [SHELL.id]);
    // Le process principal dit le shell arrêté : son onglet s'en va, le second revient.
    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();
    assert.deepEqual(terminaux(vue), ["second · claude", "+ shell"]);
    assert.equal(fermer.hidden, true);
  });

  test("une session qui n'a pas pu être détruite : la note du terminal dit où elle reste", async () => {
    const refus = "shell 1 · parade-box is closed, but its session `brigade-parade-1` could not be destroyed on box parade-box: it is no longer listed, and stays there until it is destroyed — ssh: connect to host parade-box port 22: Connection refused";
    const vue = await ouvrir({ fermerShell: () => ({ refus }) });
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    vue.element("fermer-shell").click();
    await repos();
    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();
    assert.equal(vue.element("note-second").textContent, refus);
  });

  test("un shell dont on sort ferme son onglet, et le second reprend sa place à droite", async () => {
    const vue = await ouvrir();
    await cliquer(vue, vue.element("terminaux"), "+ shell");

    vue.dire("surEtat", { ...SHELL, arrete: true });
    await repos();

    assert.deepEqual(terminaux(vue), ["second · claude", "+ shell"]);
    assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
  });

  test("un geste qui écrit dans le second le montre, si un shell le cachait — la note est la sienne", async () => {
    const ecrit = { ...SECOND, note: "écrit dans le second, sans Entrée : `!ssh box brigade parade station cooks `" };
    const vue = await ouvrir({ inscrire: () => ecrit });
    await ouvrirLecture(vue, "Cooks");
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    assert.deepEqual(montre(vue), ["shell 1"]);

    await cliquer(vue, vue.element("gestes-cuisine"), "Set the cooks of a station…");

    assert.deepEqual(montre(vue), ["second · claude"]);
    assert.equal(vue.element("note-second").textContent, ecrit.note);
  });

  test("chaque projet garde le terminal où il a été laissé : revenir dessus rend le shell montré", async () => {
    const vue = await ouvrir();
    await cliquer(vue, vue.element("terminaux"), "+ shell");
    await entrer(vue, 2);
    assert.deepEqual(montre(vue), ["second · claude"]);
    await entrer(vue, 1);
    assert.deepEqual(montre(vue), ["shell 1"]);
  });
});

describe("un clic à gauche écrit dans le second sans que le centre change", () => {
  test("un bouton d'onglet écrit sa commande dans le second : l'onglet ouvert reste ouvert, et la note se lit sous le titre du second", async () => {
    const ecrit = { ...SECOND, note: "écrit dans le second, sans Entrée : `!ssh box brigade parade station cooks `" };
    const vue = await ouvrir({ inscrire: () => ecrit });
    await ouvrirLecture(vue, "Cooks");

    await cliquer(vue, vue.element("gestes-cuisine"), "Set the cooks of a station…");

    assert.deepEqual(vue.dernier("inscrire"), ["parade", "cooks"]);
    // L'onglet Cooks (#1184) reste montré : aucune page ne s'est ouverte par-dessus.
    assert.deepEqual(vue.element("onglets-du-projet").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent), ["Cooks"]);
    assert.deepEqual(selectionne(vue), []);
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("note-second").textContent, ecrit.note);
    // L'explication de la lecture n'est pas écrite à plat : elle est au survol de sa tête, sur l'onglet.
    assert.equal(vue.element("note").textContent, "");
    const tete = vue.element("rail").dessous("h3").find(({ textContent }) => textContent.startsWith("the station:")) ?? assert.fail("pas de tête de la lecture");
    assert.match(tete.dessous("button")[0]?.ariaLabel ?? "", /^the output of `ssh box brigade parade station`/);
  });

  test("un geste confirmé ouvre sa confirmation sur place, et ne part qu'à son « oui » — dans le second, sans que le centre change", async () => {
    const parti = { ...SECOND, note: "parti dans le second : `!ssh box brigade parade manager allumer`" };
    const vue = await ouvrir({ confirmer: (_, id, grant) => confirmationDe(id, PARADE, { sans: "pas lus" }, grant), geste: () => parti });
    await ouvrirLecture(vue, "Manager");

    await cliquer(vue, vue.element("manager"), "on…");

    assert.deepEqual(vue.dernier("confirmer"), ["parade", "manager-allumer", undefined]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste"), []);
    const ouverte = vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    // Ce qu'allumer engage est au survol de sa phrase : à plat, une seule phrase dit le prix.
    assert.ok(ouverte.dessous("button").some((pose) => /it judges the whole open backlog/.test(pose.ariaLabel)), "ce qu'allumer engage n'est pas au survol");
    assert.equal(vue.element("note-second").textContent, "fil repris");

    // « non » la referme : rien ne part.
    await cliquer(vue, ouverte, "no, leave it off");
    assert.equal(vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation"), undefined);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste"), []);

    // Rouverte, son « oui » le fait partir dans le second ; l'onglet ouvert reste ouvert.
    await cliquer(vue, vue.element("manager"), "on…");
    await cliquer(vue, vue.element("manager"), "yes, turn the manager on");
    assert.deepEqual(
      vue.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args),
      [["parade", "manager-allumer", undefined, true]],
    );
    assert.equal(vue.element("note-second").textContent, parti.note);
    assert.deepEqual(selectionne(vue), ["Settings"]);
    assert.equal(vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation"), undefined);
  });
});

describe("l'écran principal ne garde que la bande, le rail et les terminaux ; le reste est derrière un onglet, en haut", () => {
  const RELAYE = "sauvegarde       il y a 10 h\nrail             2 tickets";

  test("à l'ouverture : ni l'état du projet, ni le consommé, ni le journal ; un onglet, et le geste du journal", async () => {
    const vue = await ouvrir();

    assert.deepEqual(titres(vue), ["Settings"]);
    assert.equal(vue.element("etat").hidden, true);
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("second").hidden, false);
    assert.equal(vue.element("journal").hidden, false);
    assert.equal(vue.element("journal").ariaPressed, "false");
    // Rien du journal n'est lu tant que le geste n'est pas fait.
    assert.equal(vue.dernier("onglet")[1], undefined);
  });

  test("Paramètres ouvre l'état du projet, la sauvegarde comprise ; la lecture de `station` n'y est plus — elle est l'onglet Cooks (#1184)", async () => {
    const vue = await ouvrir();
    vue.dire("surLecture", { projet: "parade", demande: vue.dernier("regarder")[1] as number, a: "2026-10-13T09:00:00Z", sorties: [{ commande: "status", texte: RELAYE }] } as never, { projet: "parade", pages: [], aLancer: [], illisibles: [], empeche: [] });

    await cliquer(vue, vue.element("onglets"), "Settings");
    assert.equal(vue.element("etat").hidden, false);
    assert.equal(vue.element("contenu").hidden, false);
    assert.deepEqual(selectionne(vue), ["Settings"]);
    assert.match(vue.element("lecture").textContent, /sauvegarde {7}il y a 10 h/);
    assert.deepEqual(vue.element("parametres-onglets").children.map((pose) => pose.textContent), ["General", "Rail", "Manager", "Grants", "Reliability", "Closer"]);
    await cliquer(vue, vue.element("parametres-onglets"), "Manager");
    assert.equal(vue.element("etat").hidden, true);
    assert.deepEqual(selectionne(vue), ["Settings"]);
    await cliquer(vue, vue.element("parametres-onglets"), "General");
    // Recliqué, il se referme.
    await cliquer(vue, vue.element("onglets"), "Settings");
    assert.equal(vue.element("etat").hidden, true);
    assert.equal(vue.element("contenu").hidden, true);
  });

  test("une page s'ouvre par-dessus le rail, qui reste posé dessous ; fermée, elle le rend tel qu'il était — la bande d'alertes, elle, reste en tête", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", { projet: "parade", alertes: [{ sujet: "grant", verifie: false, ton: "orange", dit: "grant non vérifié", pourquoi: "…", geste: "le lire : Paramètres, Grants", appel: { onglet: "grants" }, prix: "une lecture" }] } as never);
    const rail = vue.element("rail");
    const avant = rail.textContent;
    assert.equal(rail.inert, false);

    for (const page of ["Settings"]) {
      await cliquer(vue, vue.element("onglets"), page);
      assert.equal(vue.element("contenu").hidden, false, page);
      // Couvert, pas défait : il est encore là, et rien de lui ne se clique au travers.
      assert.equal(rail.hidden, false, page);
      assert.equal(rail.inert, true, page);
      assert.equal(vue.element("alertes").hidden, false, page);
      await cliquer(vue, vue.element("onglets"), page);
      assert.equal(vue.element("contenu").hidden, true, page);
      assert.equal(rail.inert, false, page);
      assert.equal(rail.textContent, avant, page);
    }
    // La page et le rail sont dans le même centre, la page après lui : elle se pose sur lui. Rien dessous.
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const centre = html.slice(html.indexOf('<div id="centre">'));
    assert.ok(centre.indexOf('id="rail"') < centre.indexOf('id="contenu"'));
    assert.match(html.slice(html.indexOf('<section id="contenu"')), /^<section id="contenu"[^]*?<\/section>\s*<\/div>\s*<pre id="message" hidden><\/pre>\s*<\/main>/);
  });

  test("le journal s'ouvre par son geste, et le recliquer le referme ; aucun onglet ne le porte", async () => {
    const vue = await ouvrir();

    vue.element("journal").click();
    await repos();
    assert.equal(vue.dernier("onglet")[1], "log");
    assert.equal(vue.element("contenu").hidden, false);
    assert.equal(vue.element("journal").ariaPressed, "true");
    assert.deepEqual(selectionne(vue), []);

    vue.element("journal").click();
    await repos();
    assert.equal(vue.element("contenu").hidden, true);
    assert.equal(vue.element("journal").ariaPressed, "false");
  });

  test("une ligne d'alerte dont la cause se règle dans Paramètres y mène en un clic", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", { projet: "parade", alertes: [{ sujet: "grant", verifie: false, ton: "orange", dit: "grant non vérifié", pourquoi: "…", geste: "le lire : Paramètres, Grants", appel: { onglet: "grants" }, prix: "une lecture" }] } as never);

    await cliquer(vue, vue.element("alertes"), "le lire : Paramètres, Grants");

    assert.equal(vue.dernier("onglet")[1], "grants");
    assert.deepEqual(selectionne(vue), ["Settings"]);
    assert.equal(vue.element("contenu").hidden, false);
  });
});
