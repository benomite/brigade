// Ce qu'un projet a coûté, sur sa page (#1022) : sous Settings → Reliability, à côté de la fiabilité de ses
// cooks, ses tokens perdus et ses tickets les plus chers — lus dans le `station` de sa propre box, que cette
// lecture lance déjà —, jugés face à ses propres seuils. Aucun chiffre d'un autre projet n'y entre, et le
// projet n'a plus d'onglet Cost. La vue est jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { LECTURE, NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirLecture, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-17T10:00:00.000Z";
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } };

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts).
const cook = (ticket: number, fin: string, tokens: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${fin}  31 tours · ${n(tokens)} tokens · 9,2 min`;
// Une `station` : ses derniers cooks, puis les décisions du chef — le seuil du ticket le plus cher, posé ou non.
const station = (seuilTicket: string | null, ...cooks: string[]) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "derniers cooks        ",
    ...cooks,
    "consommé              en cours : rien",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        ${seuilTicket ?? "non posée — BRIGADE_DRIFT_TICKET_TOKENS ne se lit que du journal"}`,
    "  seuil-perdus        non posée — BRIGADE_DRIFT_LOST_TOKENS ne se lit que du journal",
    "",
  ].join("\n");
// Ce que la lecture Reliability rend : `station`, puis `measures` sur sa fenêtre.
const lu = (projet: string, texte: string, demande: number) => ({ projet, demande, a: A, sorties: [{ commande: "station", texte }, { commande: "measures --last 10 --by 1", texte: "" }] });

async function ouvrirReliability(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
  await repos();
  await ouvrirLecture(vue, "Reliability");
  return vue;
}
const coutDuProjet = (vue: Jouee): Faux => vue.element("fiabilite").dessous("div").find(({ className }) => className === "cout-du-projet") ?? assert.fail("pas de coût du projet");

describe("le coût d'un projet, sur sa page, à côté de sa fiabilité (#1022)", () => {
  test("le projet n'a plus d'onglet Cost : son seul onglet est Settings", async () => {
    const vue = await ouvrirReliability();
    assert.deepEqual(vue.element("onglets").children.map(({ textContent }) => textContent), ["Settings"]);
  });

  test("sous Reliability, ses tokens perdus et ses tickets les plus chers — avant la lecture, en lecture", async () => {
    const vue = await ouvrirReliability();
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), ["parade", "fiabilite"]);
    const cout = coutDuProjet(vue);
    assert.deepEqual(cout.children.map(({ balise, className }) => className || balise), ["h2", "perdus-cout", "chers-cout"]);
    assert.equal(cout.children[0]?.textContent, "cost of this project");
    assert.deepEqual(cout.dessous("p").map(({ textContent }) => textContent), [LECTURE, LECTURE]);
  });

  test("il ne parle que de lui : la lecture d'un autre projet n'y entre pas, ni « all projects »", async () => {
    const vue = await ouvrirReliability();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", lu("cantine", station(null, cook(40, "fini", "9 000 000"), cook(41, "échoué", "5 000 000")), demande), undefined, undefined);
    vue.dire("surContenu", lu("parade", station(null, cook(7, "fini", "120 000"), cook(8, "échoué", "30 000"), cook(7, "fini", "10 000")), demande), undefined, undefined);
    await repos();
    const cout = coutDuProjet(vue);
    const perdus = cout.dessous("button").find(({ className }) => className.startsWith("perdus-total")) ?? assert.fail("pas de chiffre perdu");
    assert.equal(perdus.textContent, "30,000");
    const chers = cout.dessous("button").filter(({ className }) => className.startsWith("ticket-cher"));
    assert.deepEqual(
      chers.map((ligne) => ligne.dessous("span").map(({ textContent }) => textContent).slice(1, 4)),
      [["#7", NON_COMMUNIQUE, "130,000"], ["#8", NON_COMMUNIQUE, "30,000"]],
    );
    assert.doesNotMatch(vue.element("fiabilite").textContent, /cantine|#40|#41|all projects|9,000,000/);
    // Un seuil que le chef n'a pas posé n'est pas inventé.
    assert.ok(cout.dessous("p").some(({ textContent }) => textContent === `ceiling: ${NON_COMMUNIQUE}`));
  });

  test("au-delà de son seuil, son ticket le plus cher est mis en évidence, et la ligne d'alerte ouvre sa fiche", async () => {
    const vue = await ouvrirReliability();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", lu("parade", station("100000", cook(7, "fini", "120 000"), cook(8, "fini", "30 000")), demande), undefined, undefined);
    await repos();
    const cout = coutDuProjet(vue);
    assert.deepEqual(cout.dessous("button").filter(({ className }) => className.startsWith("ticket-cher")).map(({ className }) => className), ["ticket-cher depasse", "ticket-cher"]);
    const alerte = cout.dessous("p").find(({ className }) => className === "alerte-cout") ?? assert.fail("pas d'alerte");
    assert.match(alerte.textContent, /^parade · over its ceiling of 100,000/);
    assert.equal(vue.element("fiche").hidden, true);
    (alerte.dessous("button")[0] ?? assert.fail("pas de geste")).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#7"));
  });

  test("une lecture d'une demande passée n'y entre pas ; quitter Reliability l'efface", async () => {
    const vue = await ouvrirReliability();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", lu("parade", station(null, cook(7, "fini", "120 000")), demande - 1), undefined, undefined);
    await repos();
    assert.deepEqual(coutDuProjet(vue).dessous("p").map(({ textContent }) => textContent), [LECTURE, LECTURE]);
    await ouvrirLecture(vue, "Rail");
    assert.equal(vue.element("fiabilite").hidden, true);
    assert.equal(vue.element("fiabilite").children.length, 0);
  });
});
