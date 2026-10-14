// Le setup du projet bloqué (#644) : le runtime l'écrit en tête de `status` (`setup  BLOQUÉ…`),
// et sa cause et son geste dans l'entrée `setup` du bloc `attend`. L'app le dit dans la bande
// d'alertes du projet — ce texte-là, mot pour mot — et sur la pastille de sa case ; quand le
// runtime ne le dit plus, bande et pastille reviennent d'elles-mêmes. Ce que la box rend est écrit
// ici par le runtime lui-même, sur un vrai journal, comme alertes.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { alertes, entreeDeSetup, tenirBandes, type Alerte, type Bande } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const JOUR = "2026-10-14";
const STATION = "box/claude";
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: `${JOUR}T10:00:01.000Z`, sorties: [{ commande, texte }] });

// Ce que le runtime écrit de l'entrée, après sa tête et son « depuis » (runtime/test/attend.test.ts).
const HOTE_REFUSE =
  "setup impossible : la porte refuse `cdn.sheetjs.com` (`.claude/brigade/worktree-setup.sh`, code de sortie 1, deux fois à l'identique) — à déclarer dans `.claude/brigade/reseau` du projet, une ligne par hôte, puis merger sur la branche d'intégration ; les setups reprennent seuls dès que la branche d'intégration bouge ; d'ici là, aucun n'est lancé, pour aucun ticket";
const SETUP_A_CORRIGER =
  "setup impossible : `.claude/brigade/worktree-setup.sh` échoue deux fois à l'identique (code de sortie 1) — ce qu'il a dit est sur #15 — à corriger : le setup du projet, puis merger sur la branche d'intégration ; les setups reprennent seuls dès que la branche d'intégration bouge ; d'ici là, aucun n'est lancé, pour aucun ticket";

// Une cuisine saine — runtime en marche, une station, version à jour, manager allumé — dont le
// test tient l'horloge. `bande` : ce que l'app en dessine, lu comme le process principal le lit.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-setup-"));
  let instant = `${JOUR}T09:00:00.000Z`;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => void journal.ajouter({ project: "parade", ticket, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter({ type: "version.compared", payload: { outcome: "current", served: "a".repeat(40), branch: "origin/v2" } });
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  const rendre = () => {
    const maintenant = new Date(`${JOUR}T10:00:00.000Z`);
    const etat = lireEtat(journal, maintenant);
    const lignes: string[] = [];
    void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    return { faits: `${JSON.stringify(faitsDuRuntime(etat, maintenant))}\n`, status: `${decrireEtat(etat, maintenant).join("\n")}\n`, manager: `${lignes.join("\n")}\n` };
  };
  const bandes = tenirBandes();
  bandes.ouvrir(["parade"]);
  bandes.veiller(["parade"]);
  const bande = (): Bande => {
    const rendu = rendre();
    bandes.faits(lecture("faits", rendu.faits));
    bandes.status(mettreAPart(lecture("status", rendu.status)));
    return bandes.manager(lecture("manager", rendu.manager));
  };
  // Deux échecs à l'identique, le second bloque (#643) — à 9 h 30, sur la base `ba5e0001`.
  const bloquer = (hosts: string[]) => {
    instant = `${JOUR}T09:30:00.000Z`;
    for (const ticket of [14, 15]) {
      noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` } }, ticket, "github");
      noter({ type: "setup.failed", payload: { station: STATION, why: "code de sortie 1", hosts } }, ticket, `station:${STATION}`);
    }
    noter({ type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts, base: "ba5e0001ffff" } }, 15, `station:${STATION}`);
  };
  // La branche d'intégration a bougé : les setups reprennent.
  const debloquer = () => {
    instant = `${JOUR}T09:45:00.000Z`;
    noter({ type: "setup.unblocked", payload: { station: STATION, base: "ba5e0002ffff" } }, null, `station:${STATION}`);
  };
  return { noter, rendre, bande, bloquer, debloquer };
}

const duSetup = (bande: Alerte[]) => bande.filter(({ dit }) => dit.startsWith("project setup impossible"));
function laLigne(bande: Alerte[]): Alerte {
  const lignes = duSetup(bande);
  assert.equal(lignes.length, 1, JSON.stringify(bande, null, 2));
  return lignes[0] as Alerte;
}

describe("le setup du projet bloqué, dans la bande d'alertes", () => {
  test("un hôte refusé : la ligne reprend la cause et le geste du runtime, mot pour mot — et c'est la seule cause de la cuisine retenue", (t) => {
    const { bande, bloquer } = cuisine(t);
    bloquer(["cdn.sheetjs.com:443"]);
    const { alertes: lues, signal } = bande();

    const ligne = laLigne(lues);
    assert.equal(ligne.sujet, "cuisine");
    assert.equal(ligne.verifie, true);
    assert.equal(ligne.ton, "rouge");
    assert.equal(ligne.dit, "project setup impossible: no worktree is set up, no cook goes, for any ticket");
    assert.equal(ligne.releve, HOTE_REFUSE);
    assert.equal(ligne.pourquoi, undefined);
    assert.match(ligne.geste, /`\.claude\/brigade\/reseau`.*merge on the integration branch/);
    // Le geste se joue dans le dépôt du projet, hors de l'app : une demande au second.
    assert.deepEqual(ligne.appel, { demande: true });
    assert.match(ligne.prix, /^no cook is interrupted/);
    // La cuisine est retenue, et sa cause est lue : pas de « kitchen held » sans cause.
    assert.deepEqual(lues.map(({ dit }) => dit), [ligne.dit]);
    // La pastille de la case le reflète.
    assert.deepEqual(signal, { etat: "alerte", dit: ligne.dit });
  });

  test("sans hôte refusé : la ligne dit que le setup est à corriger, et l'issue où lire ce qu'il a dit", (t) => {
    const { bande, bloquer } = cuisine(t);
    bloquer([]);
    assert.equal(laLigne(bande().alertes).releve, SETUP_A_CORRIGER);
  });

  test("débloqué, le runtime ne le dit plus : la ligne sort de la bande et la pastille s'éteint, sans geste ; rebloqué, elles reviennent", (t) => {
    const { bande, bloquer, debloquer } = cuisine(t);
    bloquer(["cdn.sheetjs.com:443"]);
    assert.equal(bande().signal?.etat, "alerte");

    debloquer();
    const revenue = bande();
    assert.deepEqual(revenue.alertes, []);
    assert.equal(revenue.signal, undefined);

    bloquer(["cdn.sheetjs.com:443"]);
    assert.equal(laLigne(bande().alertes).releve, HOTE_REFUSE);
  });

  test("une station distante cuisine encore : la cuisine est ouverte, la ligne le dit, moins grave — et la pastille est en alerte", (t) => {
    const { noter, bande, bloquer } = cuisine(t);
    bloquer([]);
    noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["opus"], maxCooks: 1, remote: true } });
    const { alertes: lues, signal } = bande();
    const ligne = laLigne(lues);
    assert.equal(ligne.ton, "jaune");
    assert.equal(ligne.dit, "project setup impossible: no worktree is set up on the box, for any ticket — only a remote station still cooks");
    assert.equal(ligne.releve, SETUP_A_CORRIGER);
    assert.deepEqual(lues.map(({ dit }) => dit), [ligne.dit]);
    assert.equal(signal?.etat, "alerte");
  });

  test("le bloc `attend` laissé dans `status` se lit aussi ; absent, la ligne reprend la tête et dit que la cause n'est pas dans la lecture", (t) => {
    const { rendre, bloquer } = cuisine(t);
    bloquer(["cdn.sheetjs.com:443"]);
    const rendu = rendre();
    const faits = comprendre(rendu.faits);
    assert.ok(!("informe" in faits));
    const manager = { allume: true, mot: "ALLUMÉ", dit: "" };

    // `status` entier, son bloc à sa place.
    assert.equal(laLigne(alertes({ projet: "parade", faits, status: rendu.status, manager })).releve, HOTE_REFUSE);

    // `status` sans son bloc, et rien à côté : la tête, et ce qui manque.
    const montree = mettreAPart(lecture("status", rendu.status));
    assert.ok("attend" in montree);
    const sansBloc = montree.sorties[0]?.texte ?? assert.fail();
    const ligne = laLigne(alertes({ projet: "parade", faits, status: sansBloc, manager }));
    assert.match(ligne.releve ?? "", /^BLOQUÉ depuis 30 min sur ba5e000 — /);
    assert.match(ligne.pourquoi ?? "", /`attend` block/);
  });

  test("l'entrée `setup` se lit à sa tête seule : ni un ticket, ni une autre entrée", () => {
    const bloc = [
      "attend     2 décisions attendent le chef — la plus ancienne depuis 1 h 00",
      "  #12  depuis 1 h 00  setup impossible : ce n'est pas l'entrée du projet",
      "  setup  depuis 20 min  setup impossible : la vraie",
      "      ce qui la précise",
      "  base  depuis 10 min  BASE ROUGE",
      "fin attend",
    ].join("\n");
    assert.equal(entreeDeSetup(bloc), "setup impossible : la vraie\nce qui la précise");
    assert.equal(entreeDeSetup("attend     rien n'attend le chef\nfin attend\n"), undefined);
  });
});

describe("le setup du projet bloqué, à l'écran", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
  const AUTRE: Projet = { nom: "baloo", dossier: "/tmp/baloo", box: { hote: "box" } };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, AUTRE], hotes: ["box"] }),
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

  test("la pastille de la case est en alerte, la bande porte le texte du runtime ; débloqué, l'une s'éteint et l'autre se cache", async (t) => {
    const { bande, bloquer, debloquer } = cuisine(t);
    bloquer(["cdn.sheetjs.com:443"]);
    const vue = await ouvrir();
    const pastille = () => vue.element("projets").children[1]?.children.find((pose) => pose.className === "signal");

    // L'app s'ouvre sur « Tous les projets » : la case de parade porte le signal.
    vue.dire("surAlertes", bande());
    const pose = pastille() ?? assert.fail("pas de pastille sur parade");
    assert.equal(pose.dataset.etat, "alerte");
    assert.match(pose.title, /^parade: project setup impossible: no worktree is set up, no cook goes, for any ticket — alert: something needs doing/);

    // L'espace de parade : la bande en tête, la ligne et le texte du runtime, mot pour mot.
    pose.click();
    await repos();
    const alertesDeLaVue = vue.element("alertes");
    assert.equal(alertesDeLaVue.hidden, false);
    const [ligne] = alertesDeLaVue.children;
    assert.equal(ligne?.dataset.sujet, "cuisine");
    assert.deepEqual(ligne?.dessous("pre").map((pre) => pre.textContent), [HOTE_REFUSE]);

    // Débloqué : la bande se vide et se cache ; revenu sur « Tous les projets », la case n'a pas de pastille.
    debloquer();
    vue.dire("surAlertes", bande());
    assert.equal(alertesDeLaVue.hidden, true);
    assert.equal(alertesDeLaVue.children.length, 0);
    vue.element("projets").children[0]?.click();
    await repos();
    assert.equal(pastille(), undefined);
  });
});
