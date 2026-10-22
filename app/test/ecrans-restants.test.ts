// Cooks, Verify (la vérification d'un projet) et Settings suivent les mêmes règles que le reste de l'app :
// aucun mode d'emploi à plat, chaque geste un bouton, aucune commande écrite, une lecture qui manque en
// une ligne — l'explication, la commande et le détail au survol. La vue est jouée telle qu'elle est.
import assert from "node:assert/strict";
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
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const A = "2026-10-16T10:00:00.000Z";
// Ce qui ne s'écrit jamais à plat sur ces écrans.
const TECHNIQUE = /\bssh\b|usage|exit code|code de sortie|`/;

async function ouvrir(reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this Mac" }],
    ...reponses,
  });
  (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
  await repos();
  return vue;
}
const survols = (ou: Faux) => ou.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
// Le texte posé à plat : celui des éléments, sans le contenu d'un `pre` ni le nom accessible d'une aide.
const aPlat = (ou: Faux) => ou.textContent;

describe("l'onglet Cooks (#1184) : la lecture de `station`, des gestes en boutons, rien d'expliqué à plat", () => {
  test("la note de l'onglet n'est qu'une aide, et les gestes disent leur mot — pas leur commande", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Cooks");
    const numero = (vue.dernier("onglet") as [string, string, number])[2];
    vue.dire("surContenu", { projet: "parade", demande: numero, a: A, sorties: [{ commande: "station", texte: "cooks 2" }] }, undefined, undefined);
    await repos();

    // L'explication n'est pas dans la ligne du haut : elle est au survol de la tête de la lecture, sous les colonnes.
    assert.equal(vue.element("note").textContent, "");
    const tete = vue.element("rail").dessous("h3").find(({ textContent }) => textContent.startsWith("the station:")) ?? assert.fail("pas de tête de la lecture");
    assert.equal(tete.textContent, "the station: its cap of cooks, its machine, its quota?");
    assert.match(survols(tete)[0] ?? "", /^the output of `ssh box brigade parade station`/);
    const gestes = vue.element("gestes-cuisine");
    assert.equal(gestes.hidden, false);
    assert.deepEqual(gestes.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), ["Set the cooks of a station…"]);
    assert.doesNotMatch(aPlat(gestes), TECHNIQUE);
    assert.doesNotMatch(aPlat(vue.element("lu-cuisine")), /ssh|usage|exit/);
  });

  test("une lecture en échec tient en une ligne : ni `ssh`, ni `usage`, ni code de sortie à plat — le détail est au survol", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Cooks");
    const numero = (vue.dernier("onglet") as [string, string, number])[2];
    const erreur = "usage: brigade <projet> station\nssh: connect to host box port 22: refused\n→ code de sortie 255";
    vue.dire("surContenu", { projet: "parade", demande: numero, a: A, erreur, atteinte: false, cas: "ssh-en-echec" }, undefined, undefined);
    await repos();

    const corps = vue.element("lecture-cuisine");
    assert.equal(corps.dessous("pre").length, 0);
    assert.doesNotMatch(aPlat(corps), TECHNIQUE);
    assert.equal(corps.dessous("p").find(({ className }) => className === "indisponible")?.textContent, "the station could not be reached?");
    assert.ok(survols(corps).some((dit) => dit.startsWith(erreur)));
  });
});

describe("Settings : l'onglet Manager n'a plus d'interrupteur à lui", () => {
  // Un seul interrupteur pour tout le projet (#1406), en tête de l'espace : sa confirmation, qui dit son
  // prix en une ligne, est éprouvée là (interrupteur-projet.test.ts).
  test("ni « on… » ni « off » : le manager suit l'interrupteur du projet", async () => {
    const vue = await ouvrir({ confirmer: (_: string, id: string, grant: unknown) => confirmationDe(id, PARADE, { sans: "pas lus" }, grant) });
    await ouvrirLecture(vue, "Manager");
    assert.deepEqual(
      vue.element("manager").dessous("button").filter(({ textContent }) => /^(?:on|off)(?:…)?$/.test(textContent)),
      [],
    );
    assert.deepEqual(vue.element("interrupteur-projet").dessous("button").filter(({ className }) => className === "bascule").length, 1);
  });

  test("le titre du manager ne porte pas sa commande, et un état illisible tient en une ligne", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Manager");
    const numero = (vue.dernier("onglet") as [string, string, number])[2];
    vue.dire("surContenu", { projet: "parade", demande: numero, a: A, sorties: [{ commande: "manager", texte: "?" }] }, { projet: "parade", demande: numero, a: A, sans: "usage: brigade manager — ssh: refused" }, undefined);
    await repos();

    const manager = vue.element("manager");
    assert.doesNotMatch(aPlat(manager), TECHNIQUE);
    assert.equal(manager.dessous("h3")[0]?.textContent, "the manager?");
    assert.ok(survols(manager).includes("from `ssh box brigade parade manager`"));
    assert.ok(survols(manager).some((dit) => dit.includes("usage: brigade manager")));
  });
});
