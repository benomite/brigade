// Une base rouge dont la réparation a échoué attend le chef : sa ligne est dans le bloc
// `attend` que `status` écrit, et elle se lit telle quelle là où ce bloc est lu — dans le
// panneau de l'app, mis à part du reste de `status`, et dans le second, qui relaie la sortie
// entière de `status` mot pour mot (commands/po.md, « À l'ouverture »). Au retour au vert,
// elle en est sortie, chez les deux. Ce que la box rend est écrit ici par le runtime lui-même.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as status } from "../../runtime/src/status.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart, ticketsDe } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const HEURE_MS = 3_600_000;

// Une cuisine dont la base est rouge depuis trois heures : rejouée, elle l'est restée, et son
// ticket de réparation a quitté le rail sans être servi. `status` : ce que la box en rend.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-base-rouge-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(Date.now() - 3 * HEURE_MS) });
  const noter = (fait: Fait, ticket: number | null = null, author = "pass") => journal.ajouter({ project: PARADE, ticket, author, ...fait });
  const gates = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime en échec"], tail: "" };
  noter({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  noter({ type: "base.recheck-requested", payload: {} });
  noter({ type: "base.checked", payload: { sha: "ba5e0001ffff", outcome: "red", gates, tickets: [] } });
  noter({ type: "base.repair-opening", payload: { sha: "ba5e0001ffff" } });
  noter({ type: "base.repair-opened", payload: { sha: "ba5e0001ffff", failures: ["tests du runtime en échec"], reconciled: false } }, 501);
  noter({ type: "ticket.arrived", payload: { title: "Réparer la base `v2`", priority: 0, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/501" } }, 501, "github");
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 501, "github");
  journal.fermer();
  return {
    status: () => {
      let texte = "";
      const ecrire = (ligne: string) => void (texte += `${ligne}\n`);
      status({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: ecrire, redire: ecrire });
      return texte;
    },
    // La base est revenue au vert : la pass l'a contrôlée.
    verdir: () => {
      const rouvert = ouvrirJournal(repertoire);
      rouvert.ajouter({ project: PARADE, ticket: null, author: "pass", type: "base.checked", payload: { sha: "ba5e0002ffff", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [] } });
      rouvert.fermer();
    },
  };
}

const lue = (texte: string): Lecture => ({ projet: PARADE, demande: 1, a: "2026-10-14T10:00:00.000Z", sorties: [{ commande: "status", texte }] });
// La ligne de la base dans un texte : à deux espaces, nommée `base`, puis ce qu'elle dit.
const LIGNE = /^ {2}base {2}for 3 h 00 {2}BASE RED on ba5e000, failing: tests du runtime en échec — its repair #501 left the rail without being served — to repair: .*`brigade \S+ base replay`$/m;
const lignesDeBase = (texte: string) => texte.split("\n").filter((ligne) => ligne.startsWith("  base  "));

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const REPONSES = {
  demarrage: () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS, rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  }),
  espace: () => [SECOND],
};
// Le panneau de l'espace : le bloc `attend` posé à part, puis le reste de `status`.
const relayes = (ou: Faux) => ou.dessous("pre").filter((pre) => pre.className === "").map((pre) => pre.textContent);

describe("une base rouge dont la réparation a échoué : la même ligne dans le panneau de l'app et dans le second", () => {
  test("le second reçoit la sortie de `status`, qui porte la ligne dans le bloc `attend` ; l'app la pose à part, mot pour mot, sans en faire un ticket", async (t) => {
    const { status } = cuisine(t);
    const texte = status();

    // Ce que le second relaie : la sortie entière, la ligne entre les bords du bloc.
    const debut = texte.indexOf("\nawaiting ");
    const fin = texte.indexOf("\nend awaiting\n");
    assert.match(texte.slice(debut, fin), LIGNE);
    assert.match(texte.slice(debut, fin), /^awaiting {3}1 decision awaits the chef — for 3 h 00$/m);
    const [ligne] = lignesDeBase(texte);

    // Ce que l'app en met à part : le même bloc, la même ligne — et rien d'elle dans le reste.
    const montree = mettreAPart(lue(texte));
    assert.ok("attend" in montree && montree.attend !== undefined);
    assert.deepEqual(lignesDeBase(montree.attend), [ligne]);
    assert.deepEqual(montree.sorties.flatMap(({ texte }) => lignesDeBase(texte)), []);
    assert.deepEqual(ticketsDe(montree.attend), []);

    // Posée dans le panneau de l'espace, telle quelle.
    const vue = await jouerLaVue(REPONSES);
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    const demande = vue.dernier("regarder")[1] as number;
    vue.dire("surLecture", { ...montree, demande }, { projet: PARADE, pages: [], aLancer: [], illisibles: [], empeche: [] });
    const [bloc] = relayes(vue.element("lecture"));
    assert.equal(bloc, montree.attend);
    assert.deepEqual(lignesDeBase(bloc ?? ""), [ligne]);
  });

  test("la base revenue au vert, la ligne a quitté le bloc : ni le second ni l'app ne la lisent plus", (t) => {
    const { status, verdir } = cuisine(t);
    assert.equal(lignesDeBase(status()).length, 1);

    verdir();
    const texte = status();
    assert.deepEqual(lignesDeBase(texte), []);
    const montree = mettreAPart(lue(texte));
    assert.ok("attend" in montree);
    assert.equal(montree.attend, "awaiting   nothing awaits the chef\nend awaiting\n");
  });
});
