// La bande d'alertes : vide quand tout va bien, chaque ligne avec son geste et son prix, et
// l'inconnu est dit. Quatre états y entrent — le manager, la version en service, la cuisine,
// le grant — et chacun s'y éprouve sain (rien n'est posé), en panne (une ligne, sa cause, son
// geste, son prix) et non dit (une ligne « non vérifié » qui le nomme).
// Ce que la box rend est écrit ici par le runtime lui-même — `faits`, `status` et `manager`,
// joués dans ce process sur un vrai journal (runtime/src/etat.ts, runtime/src/manager-cli.ts) :
// la forme que la bande lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { GESTE_DE_STATION_A_CHAUD } from "../../runtime/src/stations-declarees.ts";
import { AFFICHAGE_MINIMUM, alertes, MANAGER_PAS_DIT, signalDe, tenirBandes, type Alerte, type Sujet } from "../src/alertes.ts";
import { mettreAPart } from "../src/attend.ts";
import type { Lecture } from "../src/box.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { confirmationDe, type Lus } from "../src/confirmation.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GESTES, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { ANNULER, COUPER, DEMANDER } from "../src/version.ts";
import { jouerLaVue, repos, type Reponses } from "./aides/fausse-vue.ts";

const JOUR = "2026-10-13";
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: `${JOUR}T10:00:01.000Z`, sorties: [{ commande, texte }] });
// La box a répondu, la commande a échoué : une lecture ratée, pas une box muette (#728).
const RATEE: Lecture = { projet: "parade", demande: 1, a: `${JOUR}T10:00:01.000Z`, erreur: "$ ssh box brigade parade facts\nnpm error Missing script: facts\n\n→ code de sortie 1", atteinte: true, cas: null };
const PAS_JOINT: Lecture = { projet: "parade", demande: 1, a: `${JOUR}T10:00:01.000Z`, erreur: "$ ssh box brigade parade facts\nssh: connect to host box port 22: Connection refused\n\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" };

// Une cuisine dont le test tient l'horloge, et ce que la box en rend : `faits`, `status` et
// `manager`, écrits par le runtime. `bande` : ce que l'app en dessine, lu comme le process
// principal le lit — `faits`, puis `status` son bloc `attend` mis à part, puis l'onglet Manager.
function cuisine(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-alertes-"));
  let instant = `${JOUR}T09:00:00.000Z`;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, author = "runtime") => void journal.ajouter({ project: "parade", ticket: null, author, ...fait });
  // Une heure du jour du test, ou un instant entier.
  const quand = (heure: string) => (heure.includes("T") ? heure : `${JOUR}T${heure}.000Z`);
  const a = (heure: string) => void (instant = quand(heure));
  const rendre = (heure: string) => {
    const maintenant = new Date(quand(heure));
    const etat = lireEtat(journal, maintenant);
    const lignes: string[] = [];
    void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
    return { faits: `${JSON.stringify(faitsDuRuntime(etat, maintenant))}\n`, status: `${decrireEtat(etat, maintenant).join("\n")}\n`, manager: `${lignes.join("\n")}\n` };
  };
  const bande = (heure = "10:00:00", { avecManager = true } = {}): Alerte[] => {
    const rendu = rendre(heure);
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(lecture("facts", rendu.faits));
    const lue = bandes.status(mettreAPart(lecture("status", rendu.status)));
    return avecManager ? bandes.manager(lecture("manager", rendu.manager)).alertes : lue.alertes;
  };
  return { noter, a, rendre, bande };
}

// Une cuisine qui tourne, et où tout va bien : runtime en marche, version à jour, manager allumé.
function saine(t: TestContext) {
  const servie = cuisine(t);
  servie.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  servie.noter({ type: "version.compared", payload: { outcome: "current", served: "a".repeat(40), branch: "origin/v2" } });
  servie.noter({ type: "manager.enabled", payload: {} }, "chef");
  return servie;
}

const du = (bande: Alerte[], sujet: Sujet) => bande.filter((alerte) => alerte.sujet === sujet);
// Une ligne en panne : vérifiée, et qui dit sa cause, son geste et son prix.
function enPanne(bande: Alerte[], sujet: Sujet): Alerte {
  const lignes = du(bande, sujet);
  assert.equal(lignes.length, 1, JSON.stringify(bande, null, 2));
  const [ligne] = lignes as [Alerte];
  assert.equal(ligne.verifie, true);
  for (const dit of [ligne.dit, ligne.geste, ligne.prix]) assert.notEqual(dit.trim(), "");
  return ligne;
}
// Une ligne « non vérifié » : elle nomme l'état, dit pourquoi, et n'est pas « sain ».
function nonVerifie(bande: Alerte[], sujet: Sujet, nomme: string): Alerte {
  const lignes = du(bande, sujet);
  assert.equal(lignes.length, 1, JSON.stringify(bande, null, 2));
  const [ligne] = lignes as [Alerte];
  assert.equal(ligne.verifie, false);
  assert.match(ligne.dit, new RegExp(`${nomme}.* not verified$`));
  assert.notEqual(ligne.pourquoi?.trim() ?? "", "");
  for (const dit of [ligne.geste, ligne.prix]) assert.notEqual(dit.trim(), "");
  return ligne;
}

describe("la bande d'alertes : vide quand tout va bien", () => {
  test("manager allumé, version à jour, cuisine ouverte, aucun grant : la bande est vide", (t) => {
    assert.deepEqual(saine(t).bande(), []);
  });

  test("un grant actif, accordé par le chef, ne s'y dit pas : c'est son choix, pas une chose à faire", (t) => {
    const { noter, rendre, bande } = saine(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: `${JOUR}T18:00:00.000Z` } }, "chef");

    assert.match(rendre("10:00:00").status, /^grant {6}merge ACTIF encore 8 h 00/m);
    assert.deepEqual(bande(), []);
  });

  test("ce qui ne change rien aux cinq minutes à venir n'y entre jamais : la sauvegarde trop vieille, ou jamais faite", (t) => {
    const { noter, a, rendre, bande } = saine(t);
    assert.match(rendre("10:00:00").status, /^sauvegarde JAMAIS FAITE/m);
    assert.deepEqual(bande(), []);

    a("2026-10-10T09:30:00.000Z");
    noter({ type: "backup.completed", payload: { name: "parade-1", lastSeq: 3, events: 3, streams: 0 } }, "sauvegarde");
    assert.match(rendre("10:00:00").status, /^sauvegarde TROP VIEILLE/m);
    // Ni l'âge de la sauvegarde, ni rien de ce qui se dit d'elle.
    assert.deepEqual(bande("10:00:00"), []);
  });
});

describe("le manager : sain, éteint, non dit", () => {
  test("allumé : rien", (t) => {
    assert.deepEqual(du(saine(t).bande(), "manager"), []);
  });

  test("éteint : la ligne dit ce que le runtime en écrit, mot pour mot, et propose de l'allumer — en disant ce que ça engage", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "manager.disabled", payload: {} }, "chef");

    const ligne = enPanne(bande(), "manager");
    assert.equal(ligne.ton, "rouge");
    assert.equal(ligne.releve, `ÉTEINT since ${JOUR}T09:00:00.000Z (by chef) — aucune issue n'est jugée, ce qu'il a posé reste posé`);
    assert.equal(ligne.geste, "turn the manager on");
    assert.deepEqual(ligne.appel, { geste: "manager-allumer" });
    assert.match(ligne.prix, /it judges the whole open backlog/);
  });

  test("jamais allumé : éteint aussi", (t) => {
    const { noter, bande } = cuisine(t);
    noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    assert.match(enPanne(bande(), "manager").releve ?? "", /^ÉTEINT — jamais allumé/);
  });

  test("pas encore lu par l'app : la première lecture en cours n'affiche rien — ni « allumé », ni « non vérifié » (#721)", (t) => {
    assert.deepEqual(du(saine(t).bande("10:00:00", { avecManager: false }), "manager"), []);
  });

  test("non dit — la lecture de `manager` a échoué, ou n'a pas la forme : non vérifié, avec ce qui en a été obtenu", () => {
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    assert.match(nonVerifie(bandes.manager({ ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("faits", "manager") }).alertes, "manager", "manager state").pourquoi ?? "", /^`manager` was not read: not reached/);
    assert.match(nonVerifie(bandes.manager(lecture("manager", "erreur\n")).alertes, "manager", "manager state").pourquoi ?? "", /does not have the expected shape/);
  });

  test("lu par la veille de l'app, sans onglet : un manager allumé ne dit rien, éteint se dit, et un onglet quitté n'y change rien", (t) => {
    const { noter, rendre } = saine(t);
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    assert.deepEqual(du(bandes.manager(lecture("manager", rendre("10:00:00").manager)).alertes, "manager"), []);
    // Rien ne lâche l'état lu : la veille le rafraîchit, quel que soit l'onglet affiché.
    assert.deepEqual(du(bandes.faits(lecture("facts", rendre("10:00:30").faits)).alertes, "manager"), []);
    noter({ type: "manager.disabled", payload: {} }, "chef");
    enPanne(bandes.manager(lecture("manager", rendre("10:01:00").manager)).alertes, "manager");
  });
});

describe("la version en service : à jour, en attente, non dite", () => {
  test("à jour : rien", (t) => {
    assert.deepEqual(du(saine(t).bande(), "version"), []);
  });

  test("en attente : depuis quand, combien de livraisons, et le geste « mettre en service » avec ce qu'il interromprait", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "version.compared", payload: { outcome: "waiting", served: "a".repeat(40), branch: "origin/v2", head: "b".repeat(40), since: `${JOUR}T05:00:00.000Z`, deliveries: 26 } });

    const ligne = enPanne(bande(), "version");
    assert.equal(ligne.dit, "a version has been waiting for 5 h 00 — 26 deliveries not in service");
    assert.equal(ligne.pourquoi, `origin/v2 (${"b".repeat(12)}) is waiting, ${"a".repeat(12)} is in service`);
    assert.equal(ligne.geste, "deploy");
    // Le geste est sur la ligne, confirmé : sa confirmation montre d'abord ce qu'il interromprait.
    assert.deepEqual(ligne.appel, { geste: DEMANDER });
    assert.ok(CONFIRMES.includes(DEMANDER));
    assert.equal(ligne.prix, "no cook in flight at this reading, nothing is interrupted");
  });

  // Le prix d'après les cooks en vol — l'exemple de la spec : « 1 cook en vol sera interrompu, son ticket repart de zéro ».
  const FAITS: Faits = {
    etat: "ouverte",
    lu: `${JOUR}T10:00:00.000Z`,
    dernierTick: `${JOUR}T09:59:30.000Z`,
    compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    version: { etat: "en attente", depuis: `${JOUR}T05:00:00.000Z`, branche: "origin/v2", enService: "a".repeat(40), enAttente: "b".repeat(40), livraisons: 1, raison: null },
    miseEnService: { etat: "aucune", depuis: null, coupe: false, enVol: [{ ticket: 14, run: "14-aa", station: "box/claude", tokens: 230000 }], tokens: 230000 },
  };
  const lu = { projet: "parade", status: "cuisine    ouverte\n", manager: { allume: true, mot: "ALLUMÉ", dit: "" } };

  test("en attente, un cook en vol : le prix le dit — attendre ne l'interrompt pas, couper l'interrompt et son ticket repart de zéro", () => {
    const [ligne] = du(alertes({ ...lu, faits: FAITS }), "version");
    assert.equal(ligne?.prix, `wait for a quiet rail: no cook interrupted, but none goes until then — or cut: 1 cook in flight interrupted, its ticket starts over from zero (${(230000).toLocaleString("en-US")} tokens already spent)`);
  });

  test("la mise en service demandée attend le rail calme : le geste est de couper, et son prix est dit — la cuisine qu'elle retient ne le redit pas", () => {
    const bande = alertes({ ...lu, faits: { ...FAITS, etat: "retenue", miseEnService: { ...FAITS.miseEnService!, etat: "demandée", depuis: `${JOUR}T09:40:00.000Z` } } });
    const [ligne] = du(bande, "version");
    assert.equal(ligne?.dit, "deploy requested for 20 min: it is waiting for a quiet rail — no cook goes any more, 1 in flight finishes first");
    assert.equal(ligne?.geste, "cut without waiting");
    assert.deepEqual(ligne?.appel, { geste: COUPER });
    assert.match(ligne?.prix ?? "", /^1 cook in flight interrupted, its ticket starts over from zero/);
    // Y renoncer est sur la même ligne : direct, il n'interrompt rien.
    assert.deepEqual(ligne?.aussi?.appel, { geste: ANNULER });
    assert.ok(DIRECTS.includes(ANNULER));
    assert.deepEqual(du(bande, "cuisine"), []);
  });

  test("non dite — le runtime vient de démarrer et n'a rien comparé : « version en service non vérifiée », pas « à jour »", (t) => {
    const { noter, bande } = cuisine(t);
    noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    noter({ type: "manager.enabled", payload: {} }, "chef");
    assert.match(nonVerifie(bande(), "version", "version in service").pourquoi ?? "", /has compared nothing/);
  });

  test("non dite — la comparaison n'a pas pu se faire : non vérifiée, avec le motif du runtime mot pour mot", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "version.compared", payload: { outcome: "unreadable", served: "a".repeat(40), branch: "origin/v2", reason: "l'origine ne répond pas" } });
    assert.equal(nonVerifie(bande(), "version", "version in service").releve, "l'origine ne répond pas");
  });

  test("non dite — un runtime d'avant le champ `version` : non vérifiée", (t) => {
    const { version: _version, miseEnService: _miseEnService, ...ancien } = JSON.parse(saine(t).rendre("10:00:00").faits);
    const faits = comprendre(JSON.stringify(ancien));
    assert.ok(!("informe" in faits));
    nonVerifie(alertes({ ...lu, faits }), "version", "version in service");
  });
});

describe("la cuisine : ouverte, gelée, non dite", () => {
  test("ouverte : rien", (t) => {
    assert.deepEqual(du(saine(t).bande(), "cuisine"), []);
  });

  test("aucune station déclarée : la cuisine est gelée — la ligne le dit, et le geste est celui du runtime, mot pour mot", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });

    const ligne = enPanne(bande(), "cuisine");
    assert.equal(ligne.dit, "no station declared: no cook goes, the kitchen is frozen");
    assert.equal(ligne.releve, "AUCUNE DÉCLARÉE depuis 1 h 00 — aucun cook ne part, les tickets restent en attente");
    assert.equal(ligne.geste, GESTE_DE_STATION_A_CHAUD);
    // Déclarer une station se joue sur la box, hors de l'app : le geste est une demande au second.
    assert.deepEqual(ligne.appel, { demande: true });
    assert.equal(ligne.prix, "a runtime restart: no cook in flight at this reading, nothing is interrupted");
  });

  test("arrêtée par le « stop » du chef : reprendre, et ce que ça relance", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "kitchen.stopped", payload: {} }, "chef");

    const ligne = enPanne(bande(), "cuisine");
    assert.deepEqual(ligne.appel, { geste: "reprendre" });
    assert.match(ligne.prix, /start again at once/);
  });

  test("le disjoncteur ouvert : la ligne de `status` mot pour mot, et reprendre", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } });

    const ligne = enPanne(bande(), "cuisine");
    assert.equal(ligne.releve, "disjoncteur OUVERT depuis 1 h 00 (0 échec d'affilée)");
    assert.deepEqual(ligne.appel, { geste: "reprendre" });
  });

  test("runtime arrêté : rien ne tourne — le geste se joue sur la box, il est une demande au second", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });

    const ligne = enPanne(bande(), "cuisine");
    assert.equal(ligne.dit, "runtime stopped: nothing is running, no ticket is taken");
    assert.match(ligne.geste, /systemctl start brigade@parade/);
    assert.deepEqual(ligne.appel, { demande: true });
  });

  test("retenue, et `status` pas lu : la ligne dit qu'elle est retenue, et que sa cause n'est pas lue", (t) => {
    const { noter, rendre } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    const ligne = enPanne(bandes.faits(lecture("facts", rendre("10:00:00").faits)).alertes, "cuisine");
    assert.equal(ligne.dit, "kitchen held: it is running, but no cook goes any more");
    assert.match(ligne.pourquoi ?? "", /^its cause was not read: `status` is only read for the project shown/);
  });

  test("non dite — `faits` pas joint, pas encore lu, ou pas dans sa forme : « état de la cuisine non vérifié »", () => {
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    const [premiere] = bandes.ouvrir(["parade"]);
    // La première lecture est en cours : rien ne se dit avant son résultat.
    assert.deepEqual(premiere?.alertes, []);
    assert.equal(nonVerifie(bandes.faits(PAS_JOINT).alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: not reached");
    assert.equal(nonVerifie(bandes.faits(lecture("facts", "pas du json\n")).alertes, "cuisine", "kitchen state").pourquoi, "the box did not return the shape of `facts`: this is not JSON");
  });
});

describe("le grant : sans rien à dire, éteint seul, non dit", () => {
  test("aucun grant, ou révoqué par le chef : rien — `status` n'a pas de ligne `grant`", (t) => {
    const { noter, rendre, bande } = saine(t);
    noter({ type: "grant.activated", payload: { action: "merge" } }, "chef");
    noter({ type: "grant.revoked", payload: { action: "merge" } }, "chef");
    assert.doesNotMatch(rendre("10:00:00").status, /^grant/m);
    assert.deepEqual(du(bande(), "grant"), []);
  });

  test("éteint seul : la ligne de `status` mot pour mot, et le geste de le réaccorder — dont le prix est dit", (t) => {
    const { noter, a, bande } = saine(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: `${JOUR}T09:30:00.000Z` } }, "chef");
    a("09:30:00");
    noter({ type: "grant.expired", payload: { action: "merge", cause: "until", since: `${JOUR}T09:30:00.000Z` } }, "pass");

    const ligne = enPanne(bande(), "grant");
    assert.equal(ligne.releve, "merge ÉTEINT SEUL il y a 30 min — son échéance est passée : la pass s'arrête à la PR ouverte, plus rien n'est mergé sans toi");
    assert.deepEqual(ligne.appel, { geste: "grant-activer", grant: "merge" });
    assert.ok(GESTES.some(({ id }) => id === "grant-activer"));
    assert.equal(ligne.prix, "a green pass will be merged without you");
  });

  test("bientôt éteint : la ligne le dit, avec le geste de le prolonger", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: `${JOUR}T10:30:00.000Z` } }, "chef");

    const ligne = enPanne(bande(), "grant");
    assert.equal(ligne.ton, "jaune");
    assert.match(ligne.releve ?? "", /^merge ACTIF, BIENTÔT ÉTEINT : encore 30 min/);
    assert.match(ligne.geste, /grant extend merge/);
  });

  test("non dit — `status` pas lu pour ce projet, pas joint, ou pas dans sa forme : « état du grant non vérifié », jamais « aucun grant »", (t) => {
    const { rendre } = saine(t);
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    const [ouverte] = bandes.ouvrir(["parade"]);
    assert.deepEqual(ouverte?.alertes, []);
    assert.deepEqual(bandes.veiller(["parade"])[0]?.alertes, []);
    assert.equal(nonVerifie(bandes.status({ ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("faits", "status") }).alertes, "grant", "grant state").pourquoi, "`status` was not read: not reached");
    assert.match(nonVerifie(bandes.status(mettreAPart(lecture("status", "rien de connu\n"))).alertes, "grant", "grant state").pourquoi ?? "", /has no `cuisine` line/);

    // Lu, puis plus lu : ce qu'il disait est lâché.
    assert.deepEqual(du(bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status))).alertes, "grant"), []);
  });
});

describe("la bande, à l'écran", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
  const ouvrir = async (plus: Reponses = {}) => {
    const vue = await jouerLaVue({
      ...plus,
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    vue.element("projets").children[1]?.click();
    await repos();
    return vue;
  };

  test("vide, elle est cachée : elle ne prend aucune place ; une ligne la montre, et son geste, confirmé, ne part qu'à son « oui »", async (t) => {
    const { rendre, noter } = saine(t);
    const lus = (): Lus => {
      const faits = comprendre(rendre("10:00:00").faits);
      return "informe" in faits ? { sans: faits.informe } : { faits, a: `${JOUR}T10:00:01.000Z` };
    };
    const vue = await ouvrir({ confirmer: (_, id, grant) => confirmationDe(id, PARADE, lus(), grant) });
    const bande = vue.element("alertes");

    vue.dire("surAlertes", { projet: "parade", alertes: [] });
    assert.equal(bande.hidden, true);
    assert.equal(bande.children.length, 0);

    noter({ type: "kitchen.stopped", payload: {} }, "chef");
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.faits(lecture("facts", rendre("10:00:00").faits));
    bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status)));
    vue.dire("surAlertes", bandes.manager(lecture("manager", rendre("10:00:00").manager)));
    assert.equal(bande.hidden, false);
    const [ligne] = bande.children;
    assert.equal(ligne?.dataset.sujet, "cuisine");
    assert.match(ligne?.textContent ?? "", /kitchen stopped by your “stop”.*resume the kitchen…— cost: queued tickets start again at once/);

    // Le clic ouvre la confirmation, sous la ligne : elle dit ce qu'il relance, et rien ne part.
    (ligne?.dessous("button")[0] ?? assert.fail("pas de bouton")).click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "reprendre", undefined]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste"), []);
    const ouverte = bande.children[0]?.dessous("div").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(ouverte.textContent, /resume the kitchen/);
    assert.match(ouverte.textContent, /queued tickets start again, on your quota/);

    // Son « oui » le fait partir, une fois, et le dit au process principal.
    (ouverte.dessous("button").find((choix) => choix.dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(
      vue.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args),
      [["parade", "reprendre", undefined, true]],
    );
  });

  test("une ligne dont le geste demande du jugement écrit sa demande dans le second : aucun geste ne part, rien n'est confirmé, rien n'est envoyé", async (t) => {
    const { rendre, noter } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.faits(lecture("facts", rendre("10:00:00").faits));
    bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status)));
    const lue = bandes.manager(lecture("manager", rendre("10:00:00").manager));
    const ecrite = { id: 1, projet: "parade", genre: "second" as const, titre: "second · claude", note: "écrit dans le second, sans Entrée", arrete: false };
    const vue = await ouvrir({ demanderAlerte: () => ecrite });
    vue.dire("surAlertes", lue);

    const ligne = vue.element("alertes").children.find((pose) => pose.dataset.sujet === "cuisine") ?? assert.fail("pas de ligne");
    const demande = ligne.dessous("button").find((pose) => pose.dataset.geste === "demande") ?? assert.fail("pas de demande");
    assert.equal(demande.textContent, `${GESTE_DE_STATION_A_CHAUD} — ask the second`);
    demande.click();
    await repos();

    // La vue nomme la ligne ; la phrase se compose dans le process principal, d'après la bande.
    assert.deepEqual(vue.dernier("demanderAlerte"), ["parade", "cuisine", "no station declared: no cook goes, the kitchen is frozen"]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste" || geste === "confirmer" || geste === "inscrire"), []);
    assert.equal(vue.element("note-second").textContent, ecrite.note);
  });

  test("une ligne « non vérifié » se pose aussi, marquée comme telle", async () => {
    const vue = await ouvrir();
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    vue.dire("surAlertes", bandes.faits(PAS_JOINT));
    const lignes = vue.element("alertes").children;
    assert.deepEqual(
      lignes.map((ligne) => [ligne.dataset.sujet, ligne.dataset.verifie]),
      [
        ["version", "non"],
        ["cuisine", "non"],
      ],
    );
  });
});

describe("le signal d'un projet sur sa case de la barre", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
  const AUTRE: Projet = { nom: "baloo", dossier: "/tmp/baloo", box: { hote: "box" } };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, AUTRE], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const signalDeLaCase = (vue: Awaited<ReturnType<typeof ouvrir>>, rang: number) => vue.element("projets").children[rang]?.children.find((pose) => pose.className === "signal");
  const alerte = (verifie: boolean): Alerte => ({ sujet: "cuisine", verifie, ton: "rouge", dit: verifie ? "kitchen stopped by your “stop”" : "kitchen state not verified", geste: "resume the kitchen", prix: "—" });

  test("sans alerte : aucun signal ; avec alerte : un signal ; non vérifié : dit comme tel, jamais sain", () => {
    assert.equal(signalDe([]), undefined);
    assert.equal(signalDe([alerte(true)])?.etat, "alerte");
    assert.equal(signalDe([alerte(false)])?.etat, "non-verifie");
    assert.equal(signalDe([alerte(false), alerte(true)])?.etat, "alerte");
    // Une bande jamais lue ne dit rien le temps de sa première lecture ; sa lecture ratée, elle, est non vérifiée.
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    assert.equal(bandes.ouvrir(["baloo"])[0]?.signal, undefined);
    assert.equal(bandes.faits({ ...PAS_JOINT, projet: "baloo" }).signal?.etat, "non-verifie");
  });

  test("sur la barre : le signal n'est posé que sur un projet non affiché, et son clic ouvre l'espace du projet", async () => {
    const vue = await ouvrir();
    // La barre : « T », parade, baloo. L'app s'ouvre sur « Tous les projets ».
    vue.dire("surAlertes", { projet: "baloo", alertes: [alerte(true)], signal: signalDe([alerte(true)]) });
    vue.dire("surAlertes", { projet: "parade", alertes: [], signal: undefined });
    assert.equal(signalDeLaCase(vue, 1), undefined);
    const pose = signalDeLaCase(vue, 2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(pose.dataset.etat, "alerte");
    assert.match(pose.title, /baloo: kitchen stopped by your “stop” — alert: something needs doing/);

    vue.dire("surAlertes", { projet: "parade", alertes: [alerte(false)], signal: signalDe([alerte(false)]) });
    const verif = signalDeLaCase(vue, 1) ?? assert.fail("pas de signal sur parade");
    assert.equal(verif.dataset.etat, "non-verifie");
    assert.match(verif.title, /not verified: the app could not read this state/);

    // Le projet affiché ne porte pas de signal : sa bande est sous les yeux ; il le reprend en le quittant.
    vue.element("projets").children[1]?.click();
    await repos();
    assert.equal(signalDeLaCase(vue, 1), undefined);
    assert.notEqual(signalDeLaCase(vue, 2), undefined);

    // Le clic sur le signal ouvre l'espace de baloo : sa bande, avec le geste et le prix, est en tête.
    vue.dire("surAlertes", { projet: "baloo", alertes: [alerte(true)], signal: signalDe([alerte(true)]) });
    (signalDeLaCase(vue, 2) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("tous").hidden, true);
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(signalDeLaCase(vue, 2), undefined);
    assert.notEqual(signalDeLaCase(vue, 1), undefined);

    // La bande qui se vide retire le signal.
    vue.dire("surAlertes", { projet: "baloo", alertes: [], signal: undefined });
    assert.equal(signalDeLaCase(vue, 2), undefined);
  });

  test("la bande dit la plus grave d'abord : une alerte lue avant un état non vérifié, le rouge avant le jaune", () => {
    const lu = alertes({ projet: "baloo", faits: { sans: "pas lu" }, status: { sans: "pas lu" }, manager: { sans: MANAGER_PAS_DIT } });
    const rangs = lu.map(({ verifie }) => verifie);
    assert.deepEqual(rangs, [...rangs].sort((a, b) => Number(b) - Number(a)));
  });
});

describe("la bande ne clignote pas (#721)", () => {
  const horloge = () => {
    let t = 0;
    return { maintenant: () => t, avancer: (ms: number) => void (t += ms) };
  };
  const OK = (rendre: (h: string) => { faits: string }) => lecture("facts", rendre("10:00:00").faits);

  test("une lecture en cours n'affiche rien ; une lecture ratée une fois puis réussie au tour suivant non plus", (t) => {
    const { rendre } = saine(t);
    const bandes = tenirBandes();
    assert.deepEqual(bandes.ouvrir(["parade"])[0]?.alertes, []);
    assert.deepEqual(bandes.veiller(["parade"])[0]?.alertes, []);
    assert.deepEqual(bandes.faits(PAS_JOINT).alertes, []);
    assert.deepEqual(du(bandes.faits(OK(rendre)).alertes, "cuisine"), []);
    assert.deepEqual(bandes.faits(OK(rendre)).alertes.filter(({ verifie }) => !verifie).map(({ sujet }) => sujet), []);
  });

  test("une alerte qui tient sur deux lectures de suite s'affiche, une fois, et reste ; identique, la bande est la même", () => {
    const bandes = tenirBandes();
    bandes.ouvrir(["parade"]);
    assert.deepEqual(bandes.faits(RATEE).alertes, []);
    const deux = bandes.faits(RATEE);
    assert.equal(nonVerifie(deux.alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: reached, but `facts` did not answer");
    assert.equal(bandes.faits(RATEE), deux, "même contenu : aucun mouvement");
  });

  test("une alerte dite reste le temps d'être lue, puis part quand l'état est levé", (t) => {
    const { rendre } = saine(t);
    const h = horloge();
    const bandes = tenirBandes({ maintenant: h.maintenant });
    bandes.ouvrir(["parade"]);
    bandes.faits(RATEE);
    assert.equal(bandes.faits(RATEE).alertes.length > 0, true);
    h.avancer(1000);
    const levee = bandes.faits(OK(rendre));
    assert.equal(levee.alertes.some(({ verifie }) => !verifie), true, "tenue : lue trop peu de temps");
    h.avancer(AFFICHAGE_MINIMUM);
    assert.equal(bandes.faits(OK(rendre)).alertes.some(({ verifie }) => !verifie), false);
  });

  test("une réception de `status` entre deux lectures de `faits` n'établit pas ce que `faits` a raté une fois", (t) => {
    const { rendre } = saine(t);
    const bandes = tenirBandes();
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(PAS_JOINT);
    const statut = bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status)));
    assert.deepEqual(statut.alertes.filter(({ verifie }) => !verifie).map(({ sujet }) => sujet), []);
    assert.deepEqual(bandes.faits(OK(rendre)).alertes.filter(({ verifie }) => !verifie), []);
    // Deux lectures de `faits` de suite ratées, `status` entre elles : établie.
    bandes.faits(PAS_JOINT);
    bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status)));
    assert.equal(du(bandes.faits(PAS_JOINT).alertes, "cuisine").length, 1);
  });
  test("les échecs de `status` ne comptent pas pour une alerte dont vient `faits`, et inversement (#746)", (t) => {
    const { rendre } = saine(t);
    const bandes = tenirBandes();
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    const statusRate = { ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("facts", "status") };
    const cuisine = (b: { alertes: Alerte[] }) => du(b.alertes, "cuisine").filter(({ pourquoi }) => pourquoi?.includes("`facts`"));
    // `status` rate deux fois de suite : ce qu'il dit est établi, pas ce que `faits` n'a raté qu'une fois.
    bandes.status(mettreAPart({ ...statusRate, projet: "parade" }));
    bandes.faits(PAS_JOINT);
    const apres = bandes.status(mettreAPart({ ...statusRate, projet: "parade" }));
    assert.deepEqual(cuisine(apres), []);
    assert.deepEqual(cuisine(bandes.faits(OK(rendre))), []);
    // `faits` rate deux fois de suite, entrelacé de `status` réussi : établie.
    bandes.faits(PAS_JOINT);
    bandes.status(mettreAPart(lecture("status", rendre("10:00:00").status)));
    assert.equal(cuisine(bandes.faits(PAS_JOINT)).length, 1);
  });
});
