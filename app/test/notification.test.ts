// La notification de l'urgence : chaque annonce du runtime — la première, puis chaque rappel — se
// dit au système une fois ; relire `faits` sans nouvelle annonce ne redit rien ; le clic ouvre le
// projet sur sa ligne d'urgence et son geste ; l'app rouverte redit l'annonce en cours, sauf si le
// chef l'a déjà cliquée (notification.ts). Ce que la box rend est écrit ici par le runtime lui-même —
// son annonce (runtime/src/alerte-urgence.ts) et `faits`, joués sur un vrai journal : la forme que
// l'app lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { annoncerUrgence } from "../../runtime/src/alerte-urgence.ts";
import { decrireEtat, faits as faitsDuRuntime, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { signalDe, tenirBandes, type Alerte } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { memoireDansFichier, tenirNotifications, type AMontrer, type Memoire } from "../src/notification.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const JOUR = "2026-10-15";
const STATION = "box/claude";
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const heure = (h: string) => `${JOUR}T${h}.000Z`;
const LIBELLE = "brigade : toute la cuisine attend ton merge de #535";

// Un répertoire à soi, retiré en fin de test.
function repertoire(t: TestContext, nom: string): string {
  const cree = mkdtempSync(join(tmpdir(), `brigade-app-${nom}-`));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

// Une cuisine dont le test tient l'horloge, où une livraison à merger à la main tient toutes les
// zones du rail — l'exemple de l'épique. `annoncer` joue une passe de l'alerte du runtime à l'heure
// dite ; `lire`, `faits` tel que l'app le lit ; `debloquer`, le merge du chef.
function toutRetenu(t: TestContext) {
  let instant = heure("08:00:00");
  // Le journal se ferme avant que son dossier soit retiré : Windows ne retire pas un fichier ouvert.
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-notification-"));
  const journal = ouvrirJournal(dossier, { maintenant: () => new Date(instant) });
  t.after(() => {
    journal.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => void journal.ajouter({ project: "parade", ticket, author, ...fait });
  const a = (h: string) => void (instant = heure(h));
  const arriver = (ticket: number, zone: string[]) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket % 60}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } } },
      ticket,
      "github",
    );
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as Fait);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  arriver(535, ["runtime", "app"]);
  arriver(536, ["runtime/src"]);
  arriver(537, ["app/src"]);
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-11-30T00:00:00.000Z" } }, 535, `station:${STATION}`);
  noter({ type: "cook.launched", payload: { run: "535-aa", limits: LIMITES, stream: "runs/535-aa.jsonl", branch: "cook/535-aa", worktree: "worktrees/535-aa" } }, 535);
  noter({ type: "cook.exited", payload: { run: "535-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 535);
  noter({ type: "ticket.passing", payload: { station: STATION } }, 535, `station:${STATION}`);
  noter({ type: "pass.started", payload: { run: "535-aa", pr: "https://exemple.test/pull/535", number: 535, sha: "sha-535" } }, 535, "pass");
  a("08:30:00");
  noter({ type: "pass.held", payload: { reason: "review-required" } } as never, 535, "pass");
  const sortie = (h: string) => {
    const maintenant = new Date(heure(h));
    const etat = lireEtat(journal, maintenant);
    return { faits: `${JSON.stringify(faitsDuRuntime(etat, maintenant))}\n`, status: `${decrireEtat(etat, maintenant).join("\n")}\n` };
  };
  return {
    annoncer: (h: string) => {
      a(h);
      return annoncerUrgence(journal, new Date(heure(h)));
    },
    sortie,
    lire: (h: string): Faits => {
      const lu = comprendre(sortie(h).faits);
      return "informe" in lu ? assert.fail(lu.informe) : lu;
    },
    debloquer: (h: string) => {
      a(h);
      noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/535", sha: "sha-535", by: "outside", reconciled: false } }, 535, "pass");
      noter({ type: "ticket.served", payload: {} }, 535);
    },
  };
}

// Une mémoire tenue en mémoire : ce que l'app retient d'une ouverture à l'autre.
function memoireTenue(): Memoire & { ecrites: number } {
  let tenue = {};
  return {
    ecrites: 0,
    lire: () => ({ ...tenue }),
    ecrire(acquittees) {
      this.ecrites++;
      tenue = { ...acquittees };
    },
  };
}

// L'app, telle que le process principal tient ses notifications : ce qui a été montré, avec son
// clic, et ce que le clic a ouvert.
function app(memoire: Memoire) {
  const montrees: { notification: AMontrer; cliquer: () => void }[] = [];
  const ouverts: string[] = [];
  const notifications = tenirNotifications({ memoire, montrer: (notification, cliquer) => void montrees.push({ notification, cliquer }), ouvrir: (projet) => void ouverts.push(projet) });
  return { notifications, montrees, ouverts };
}

describe("la notification de l'urgence", () => {
  test("une annonce du runtime : une notification, qui dit en une ligne ce qui bloque et que tout est à l'arrêt", (t) => {
    const cuisine = toutRetenu(t);
    assert.equal(cuisine.annoncer("08:35:00"), "alerte");
    const { notifications, montrees } = app(memoireTenue());

    const montree = notifications.recevoir("parade", cuisine.lire("08:35:30"));
    assert.deepEqual(montree, { projet: "parade", titre: "parade — urgent", corps: LIBELLE, emission: heure("08:35:00") });
    assert.equal(montrees.length, 1);
    assert.doesNotMatch(montrees[0]?.notification.corps ?? "", /\n/);
  });

  test("tant que le runtime n'a rien annoncé, rien n'est notifié — la bande dit l'urgence quand même", (t) => {
    const cuisine = toutRetenu(t);
    const { notifications, montrees } = app(memoireTenue());
    const lus = cuisine.lire("08:35:00");
    assert.notEqual(lus.urgence, null);
    assert.equal(lus.urgence?.alerte, null);
    assert.equal(notifications.recevoir("parade", lus), undefined);
    assert.equal(montrees.length, 0);
  });

  test("un runtime d'avant l'alerte — `urgence` sans `alerte`, ou sans `urgence` du tout — ne fait rien notifier", (t) => {
    const cuisine = toutRetenu(t);
    cuisine.annoncer("08:35:00");
    const brut = JSON.parse(cuisine.sortie("08:40:00").faits) as Record<string, unknown> & { urgence: Record<string, unknown> };
    const { alerte: _, ...sansAlerte } = brut.urgence;
    const { urgence: __, ...sansUrgence } = brut;
    const { notifications, montrees } = app(memoireTenue());
    for (const forme of [{ ...brut, urgence: sansAlerte }, sansUrgence]) {
      const lu = comprendre(JSON.stringify(forme));
      if ("informe" in lu) assert.fail(lu.informe);
      assert.equal(notifications.recevoir("parade", lu), undefined);
    }
    assert.equal(montrees.length, 0);
  });

  test("deux lectures de la même annonce n'en font qu'une ; un recalcul sans nouvelle annonce non plus ; le rappel des 2 h en fait une nouvelle", (t) => {
    const cuisine = toutRetenu(t);
    const { notifications, montrees } = app(memoireTenue());
    cuisine.annoncer("08:35:00");
    notifications.recevoir("parade", cuisine.lire("08:35:30"));
    assert.equal(notifications.recevoir("parade", cuisine.lire("08:36:00")), undefined);
    // Cinq minutes plus tard, le runtime refait sa passe : rien à redire, rien n'est redit.
    assert.equal(cuisine.annoncer("08:40:00"), null);
    assert.equal(notifications.recevoir("parade", cuisine.lire("08:40:30")), undefined);
    assert.equal(montrees.length, 1);

    assert.equal(cuisine.annoncer("10:35:00"), "rappel");
    const rappel = notifications.recevoir("parade", cuisine.lire("10:35:30"));
    assert.deepEqual(rappel, { projet: "parade", titre: "parade — urgent, reminder", corps: LIBELLE, emission: heure("10:35:00") });
    assert.equal(notifications.recevoir("parade", cuisine.lire("10:36:00")), undefined);
    assert.equal(montrees.length, 2);
  });

  test("le clic ouvre le projet de l'urgence, et retient que le chef l'a vue", (t) => {
    const cuisine = toutRetenu(t);
    const memoire = memoireTenue();
    const { notifications, montrees, ouverts } = app(memoire);
    cuisine.annoncer("08:35:00");
    notifications.recevoir("parade", cuisine.lire("08:35:30"));

    montrees[0]?.cliquer();
    assert.deepEqual(ouverts, ["parade"]);
    assert.deepEqual(memoire.lire(), { parade: heure("08:35:00") });
  });

  test("une urgence levée ne notifie plus rien, et ce qui en était retenu s'efface", (t) => {
    const cuisine = toutRetenu(t);
    const memoire = memoireTenue();
    const { notifications, montrees } = app(memoire);
    cuisine.annoncer("08:35:00");
    notifications.recevoir("parade", cuisine.lire("08:35:30"));
    montrees[0]?.cliquer();

    cuisine.debloquer("09:00:00");
    assert.equal(cuisine.annoncer("09:00:10"), "levee");
    const lus = cuisine.lire("09:00:30");
    assert.equal(lus.urgence, null);
    assert.equal(notifications.recevoir("parade", lus), undefined);
    assert.deepEqual(memoire.lire(), {});
    assert.equal(montrees.length, 1);
  });

  test("la même annonce lue pour un autre projet est la sienne : notifiée à part, sans rien changer à la première", (t) => {
    const cuisine = toutRetenu(t);
    const { notifications, montrees } = app(memoireTenue());
    cuisine.annoncer("08:35:00");
    const lus = cuisine.lire("08:35:30");
    notifications.recevoir("parade", lus);
    // Le même `faits` lu pour un autre projet est une autre urgence : la sienne.
    assert.equal(notifications.recevoir("baloo", lus)?.projet, "baloo");
    assert.equal(notifications.recevoir("parade", lus), undefined);
    assert.equal(montrees.length, 2);
  });
});

describe("l'app fermée, puis rouverte", () => {
  test("l'urgence en cours, jamais cliquée : rouverte, l'app la notifie une fois, et sa bande la pose en tête avec la durée d'arrêt", (t) => {
    const cuisine = toutRetenu(t);
    const memoire = memoireDansFichier(join(repertoire(t, "urgences"), "urgences.json"));
    // Notifiée, pas cliquée, puis l'app est fermée.
    const avant = app(memoire);
    cuisine.annoncer("08:35:00");
    avant.notifications.recevoir("parade", cuisine.lire("08:35:30"));
    assert.equal(avant.montrees.length, 1);

    // Le lendemain matin.
    const apres = app(memoire);
    const lus = cuisine.lire("13:58:00");
    assert.equal(apres.notifications.recevoir("parade", lus)?.corps, LIBELLE);
    assert.equal(apres.notifications.recevoir("parade", cuisine.lire("13:58:30")), undefined);
    assert.equal(apres.montrees.length, 1);

    const { faits, status } = cuisine.sortie("13:58:00");
    const bandes = tenirBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: heure("13:58:00"), sorties: [{ commande, texte }] });
    bandes.faits(lecture("facts", faits));
    const [premiere] = bandes.status(mettreAPart(lecture("status", status))).alertes;
    assert.equal(premiere?.sujet, "urgence");
    assert.match(premiere.dit, /^the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28$/);
  });

  test("l'urgence en cours, déjà cliquée : rouverte, l'app ne la redit pas — son rappel suivant, si", (t) => {
    const cuisine = toutRetenu(t);
    const memoire = memoireDansFichier(join(repertoire(t, "urgences"), "urgences.json"));
    const avant = app(memoire);
    cuisine.annoncer("08:35:00");
    avant.notifications.recevoir("parade", cuisine.lire("08:35:30"));
    avant.montrees[0]?.cliquer();

    const apres = app(memoire);
    assert.equal(apres.notifications.recevoir("parade", cuisine.lire("09:30:00")), undefined);
    assert.equal(apres.montrees.length, 0);
    cuisine.annoncer("10:35:00");
    assert.equal(apres.notifications.recevoir("parade", cuisine.lire("10:35:30"))?.titre, "parade — urgent, reminder");
  });

  test("fermée pendant l'annonce et son rappel : rouverte, l'app ne dit que la dernière, une fois", (t) => {
    const cuisine = toutRetenu(t);
    cuisine.annoncer("08:35:00");
    cuisine.annoncer("10:35:00");
    const { notifications, montrees } = app(memoireDansFichier(join(repertoire(t, "urgences"), "urgences.json")));
    notifications.recevoir("parade", cuisine.lire("11:00:00"));
    notifications.recevoir("parade", cuisine.lire("11:00:30"));
    assert.deepEqual(
      montrees.map(({ notification }) => notification.emission),
      [heure("10:35:00")],
    );
  });

  test("le fichier des clics : absent ou illisible, il ne retient rien ; écrit, il se relit ; une écriture ratée se dit", (t) => {
    const dossier = repertoire(t, "urgences");
    const chemin = join(dossier, "urgences.json");
    assert.deepEqual(memoireDansFichier(chemin).lire(), {});
    writeFileSync(chemin, "pas du json");
    assert.deepEqual(memoireDansFichier(chemin).lire(), {});
    writeFileSync(chemin, JSON.stringify({ acquittees: { parade: heure("08:35:00"), baloo: 3 } }));
    assert.deepEqual(memoireDansFichier(chemin).lire(), { parade: heure("08:35:00") });

    memoireDansFichier(chemin).ecrire({ parade: heure("10:35:00") });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { acquittees: { parade: heure("10:35:00") } });
    assert.deepEqual(memoireDansFichier(chemin).lire(), { parade: heure("10:35:00") });

    // Un dossier là où le fichier devrait être : rien n'est écrit, et c'est dit.
    const dits: string[] = [];
    memoireDansFichier(dossier, (ligne) => void dits.push(ligne)).ecrire({ parade: heure("10:35:00") });
    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /^brigade: the clicked urgent notifications could not be remembered — /);
  });
});

describe("le clic, dans la vue", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade" };
  const BALOO: Projet = { nom: "baloo", dossier: "/tmp/baloo" };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, BALOO] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENTE: Alerte = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the box writes it", bouton: "ask the second", appel: { demande: true }, prix: "none" };
  const ORDINAIRE: Alerte = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: "—" };

  test("depuis un autre projet : celui de l'urgence s'ouvre, sa ligne d'urgence en tête, choisie, et son geste prend le clavier et se lance", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[2]?.click();
    await repos();
    assert.equal(vue.dernier("espace")[0], "baloo");
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([URGENTE, ORDINAIRE]) });

    vue.dire("surUrgence", "parade");
    await repos();
    assert.equal(vue.dernier("espace")[0], "parade");
    assert.equal(vue.element("espace").textContent, "parade");
    const [premiere, seconde] = vue.element("alertes").children;
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(premiere?.dataset.sujet, "urgence");
    assert.equal(premiere.dataset.choisie, "oui");
    assert.equal(seconde?.dataset.choisie, undefined);
    const geste = premiere.dessous("button").find((pose) => pose.dataset.geste !== undefined) ?? assert.fail("pas de geste sur la ligne d'urgence");
    assert.equal(geste.textContent, "ask the second");
    assert.equal(geste.disabled, false);
    assert.ok(geste.focalise > 0, "le geste de l'urgence n'a pas pris le clavier");

    geste.click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAlerte"), ["parade", "urgence", URGENTE.dit]);
  });

  test("la bande relue garde la ligne choisie ; un autre projet ouvert, elle ne l'est plus", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE], signal: signalDe([URGENTE]) });
    vue.dire("surUrgence", "parade");
    await repos();
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([URGENTE, ORDINAIRE]) });
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, "oui");

    vue.element("projets").children[2]?.click();
    await repos();
    vue.element("projets").children[1]?.click();
    await repos();
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, undefined);
  });

  test("le projet déjà ouvert : il ne se rouvre pas, sa ligne d'urgence est choisie", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[1]?.click();
    await repos();
    const ouvertures = vue.appels.filter(({ geste }) => geste === "espace").length;
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE], signal: signalDe([URGENTE]) });

    vue.dire("surUrgence", "parade");
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, ouvertures);
    assert.equal(vue.element("alertes").children[0]?.dataset.choisie, "oui");
  });

  test("un projet qui n'est plus dans le fichier : rien ne s'ouvre", async () => {
    const vue = await ouvrir();
    const avant = vue.appels.length;
    vue.dire("surUrgence", "parti");
    await repos();
    assert.equal(vue.appels.length, avant);
  });
});
