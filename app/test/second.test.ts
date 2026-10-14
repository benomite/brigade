// Le second est à droite, en permanence : ce n'est plus un onglet. Il est visible en même temps
// que le rail ; changer de vue au centre — un onglet de contenu, un shell, aucun — ne le ferme ni
// ne le vide ; et un clic à gauche (une carte, un bouton, un geste) écrit dans lui sans que le
// centre change.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const FANFARE: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const AUTRE: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

async function ouvrir(reponses: Reponses = {}, projets: Projet[] = [PARADE, FANFARE]): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets, hotes: ["box"] }),
      exemple: EXEMPLE,
      onglets: ONGLETS,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: (projet) => (projet === "fanfare" ? [AUTRE] : [SECOND]),
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
const titres = (vue: Jouee) => vue.element("onglets").children.map((pose) => pose.textContent);
const selectionne = (vue: Jouee) => vue.element("onglets").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
// Le cadre du terminal du second, là où la vue l'a posé : dans sa colonne, et nulle part ailleurs.
const cadres = (vue: Jouee) => vue.element("fil").children;
// Ce qui se voit du second du projet affiché : sa colonne, son cadre, son titre, sa note.
function vuDuSecond(vue: Jouee) {
  const montres = cadres(vue).filter((cadre) => !cadre.hidden);
  return { colonne: !vue.element("second").hidden, cadres: montres.length, titre: vue.element("titre-second").textContent, note: vue.element("note-second").textContent };
}

describe("le second est une colonne à droite, pas un onglet", () => {
  test("dans la page, il a sa colonne à lui : hors de la zone centrale, après le panneau, au bord droit du cadre", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const cadre = html.slice(html.indexOf('<div id="cadre">'), html.indexOf('<p id="relecture"'));
    const rangs = ["<main>", "</main>", '<aside id="etat"', '<aside id="second"', 'id="fil"'].map((repere) => cadre.indexOf(repere));

    assert.ok(rangs.every((rang) => rang !== -1), "le cadre ne porte pas la colonne du second");
    assert.deepEqual(rangs, rangs.toSorted((a, b) => a - b));
    // Rien n'est posé après elle dans le cadre : c'est la dernière colonne.
    assert.match(cadre.slice(cadre.indexOf('<aside id="second"')), /^<aside id="second"[^]*?<\/aside>\s*<\/div>\s*$/);
  });

  test("il est visible dès que l'espace s'ouvre, en même temps que le rail : aucun onglet ne le nomme", async () => {
    const vue = await ouvrir();

    assert.deepEqual(vuDuSecond(vue), { colonne: true, cadres: 1, titre: "second · claude", note: "fil repris" });
    assert.equal(vue.element("rail").hidden, false);
    // Les cinq onglets de contenu, puis de quoi ouvrir un shell : ni « Second », ni le titre du second.
    assert.deepEqual(titres(vue), [...ONGLETS.map(({ titre }) => titre), "+ shell"]);
    // Aucun n'est ouvert : le rail a le centre pour lui.
    assert.deepEqual(selectionne(vue), []);
    assert.equal(vue.element("terminaux").hidden, true);
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

    for (const { titre } of ONGLETS) {
      await cliquer(vue, vue.element("onglets"), titre);
      assert.deepEqual(selectionne(vue), [titre]);
      assert.equal(vue.element("contenu").hidden, false, titre);
      tenu();
    }
    // Un shell au centre : il a son cadre à lui, sous le rail — pas dans la colonne du second.
    await cliquer(vue, vue.element("onglets"), "+ shell");
    assert.deepEqual(selectionne(vue), ["shell 1"]);
    assert.equal(vue.element("terminaux").hidden, false);
    assert.equal(vue.element("terminaux").children.filter((pose) => !pose.hidden).length, 1);
    tenu();
    // Recliqué, l'onglet se referme : le rail reprend le centre, le second n'a pas bougé.
    await cliquer(vue, vue.element("onglets"), "shell 1");
    assert.deepEqual(selectionne(vue), []);
    assert.equal(vue.element("terminaux").hidden, true);
    tenu();
    // Ce qui lui arrive pendant ce temps s'y écrit à la suite.
    vue.dire("surSortie", SECOND.id, "suite\r\n");
    assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n", "suite\r\n"]);
    // L'espace n'a été ouvert qu'une fois : changer de vue ne relance rien.
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, 1);
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
    assert.equal(vue.element("note-second").textContent, "« parade » ne s'ouvre pas : son dossier est déjà celui d'un autre projet — il n'a pas de second");
    assert.equal(vue.element("rail").hidden, false);
    assert.ok(!titres(vue).includes("+ shell"));
  });
});

describe("un clic à gauche écrit dans le second sans que le centre change", () => {
  test("un bouton d'onglet écrit sa commande dans le second : l'onglet ouvert reste ouvert, et la note se lit sous le titre du second", async () => {
    const ecrit = { ...SECOND, note: "écrit dans le second, sans Entrée : `!ssh box brigade parade station cooks `" };
    const vue = await ouvrir({ inscrire: () => ecrit });
    await cliquer(vue, vue.element("onglets"), "Cooks");

    await cliquer(vue, vue.element("gestes-onglet"), "station cooks …");

    assert.deepEqual(vue.dernier("inscrire"), ["parade", "cooks"]);
    assert.deepEqual(selectionne(vue), ["Cooks"]);
    assert.equal(vue.element("contenu").hidden, false);
    assert.equal(vue.element("rail").hidden, false);
    assert.equal(vue.element("note-second").textContent, ecrit.note);
    // La note du centre reste celle de l'onglet ouvert.
    assert.match(vue.element("note").textContent, /^la sortie de `ssh box brigade parade station`/);
  });

  test("un geste direct part dans le second, ou dit sous son titre pourquoi il n'est pas parti — le centre, lui, ne bouge pas", async () => {
    const OCCUPE = "le second est occupé : il est en plein tour — la commande n'est pas partie, et rien n'est écrit";
    let rendu: Terminal | { refus: string } = { refus: OCCUPE };
    const vue = await ouvrir({ geste: () => rendu });
    await cliquer(vue, vue.element("onglets"), "Log");

    // Vérifier l'installation est le geste du projet lui-même : en tête de son espace.
    await cliquer(vue, vue.element("gestes-projet"), "vérifier l'installation");

    assert.deepEqual(vue.dernier("geste"), ["parade", "installation", undefined, undefined]);
    assert.equal(vue.element("note-second").textContent, OCCUPE);
    assert.deepEqual(selectionne(vue), ["Log"]);
    assert.doesNotMatch(vue.element("note").textContent, /occupé/);
    // Le second libre, le même geste part : la raison d'avant fait place à ce qui est parti.
    rendu = { ...SECOND, note: "parti dans le second : `!ssh box brigade parade installation`" };
    await cliquer(vue, vue.element("gestes-projet"), "vérifier l'installation");
    assert.equal(vue.element("note-second").textContent, rendu.note);
    assert.deepEqual(selectionne(vue), ["Log"]);
  });

  test("un geste confirmé ouvre sa confirmation sur place, et ne part qu'à son « oui » — dans le second, sans que le centre change", async () => {
    const parti = { ...SECOND, note: "parti dans le second : `!ssh box brigade parade manager allumer`" };
    const vue = await ouvrir({ confirmer: (_, id, grant) => confirmationDe(id, PARADE, { sans: "pas lus" }, grant), geste: () => parti });
    await cliquer(vue, vue.element("onglets"), "Manager");

    await cliquer(vue, vue.element("manager"), "allumer…");

    assert.deepEqual(vue.dernier("confirmer"), ["parade", "manager-allumer", undefined]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste"), []);
    const ouverte = vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(ouverte.textContent, /il juge tout le backlog ouvert/);
    assert.equal(vue.element("note-second").textContent, "fil repris");

    // « non » la referme : rien ne part.
    await cliquer(vue, ouverte, "non, le laisser éteint");
    assert.equal(vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation"), undefined);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste"), []);

    // Rouverte, son « oui » le fait partir dans le second ; l'onglet ouvert reste ouvert.
    await cliquer(vue, vue.element("manager"), "allumer…");
    await cliquer(vue, vue.element("manager"), "oui, allumer le manager");
    assert.deepEqual(
      vue.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args),
      [["parade", "manager-allumer", undefined, true]],
    );
    assert.equal(vue.element("note-second").textContent, parti.note);
    assert.deepEqual(selectionne(vue), ["Manager"]);
    assert.equal(vue.element("manager").dessous("div").find((pose) => pose.className === "confirmation"), undefined);
  });
});
