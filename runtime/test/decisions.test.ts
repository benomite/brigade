// Les décisions du chef — stations, seuils de coût, calibrage du manager et du
// reviewer — posées au journal du projet, hors du dépôt et hors du drop-in :
// relues à chaque lecture, sans redémarrage, elles ne se lisent plus de
// la variable d'environnement de même nom, qui n'est plus lue, et n'arrêtent
// rien de ce qui tourne.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DECISIONS, decisionsDansLEnvironnement, decisionsPosees, direDecisionIgnoree, environnementDecide, poserDecision, retirerDecision, suivreDecisions, supportDesDecisions } from "../src/decisions.ts";
import { brancherDerive, lireSeuils } from "../src/derive.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { configManager } from "../src/manager.ts";
import { stationsAnnoncees } from "../src/projections/stations.ts";
import { configReviewer } from "../src/reviewer.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { demander } from "../src/tirer.ts";
import { chef, cuisine, decider, issue, pousserSurLOrigine } from "./aides/cuisine.ts";
import { BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, git, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");
const REFUS = 2;

// Ce que le chef a décidé d'abord : posé au journal avant chaque test.
const ENV = {
  BRIGADE_STATIONS: "box/claude:1:code",
  BRIGADE_DRIFT_TICKET_TOKENS: "500000",
  BRIGADE_DRIFT_LOST_TOKENS: "200000",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "haiku",
  BRIGADE_REVIEWER_EFFORT: "medium",
};
// Ce que le chef décide ensuite, une valeur par décision.
const DECIDEES = {
  BRIGADE_STATIONS: "box/claude:3:code,box/playwright:1:navigateur-headless",
  BRIGADE_DRIFT_TICKET_TOKENS: "300000",
  BRIGADE_DRIFT_LOST_TOKENS: "100000",
  BRIGADE_MANAGER_MODEL: "opus",
  BRIGADE_MANAGER_EFFORT: "high",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "low",
  BRIGADE_CLOSING_MODEL: "sonnet",
  BRIGADE_CLOSING_EFFORT: "high",
  BRIGADE_CLOSING_COOKS: "2",
  BRIGADE_CLOSING_MAX_TOKENS: "300000",
  BRIGADE_CLOSING_MAX_REMOVED_LINES: "200",
};

// Un journal neuf, dans un répertoire d'état à lui.
function support(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  return { repertoire, journal };
}

function poserLesPremieres(repertoire: string): void {
  for (const [nom, valeur] of Object.entries(ENV)) decider(repertoire, nom, valeur);
}

const lu = (decisions: ReturnType<typeof suivreDecisions>) => {
  const seuils = decisions.seuils();
  return { stations: decisions.stations(), ticketTokens: seuils.ticketTokens, lostTokens: seuils.lostTokens, manager: decisions.manager(), reviewer: decisions.reviewer(), fermeture: decisions.fermeture() };
};

describe("les décisions du chef", { concurrency: 8 }, () => {
  test("chacune, posée au support, est lue à la lecture suivante — sans redémarrage ni rechargement du process", (t) => {
    const { repertoire, journal } = support(t);
    poserLesPremieres(repertoire);
    const decisions = suivreDecisions(journal.base, {});
    assert.deepEqual(lu(decisions), {
      stations: lireStations({ BRIGADE_STATIONS: ENV.BRIGADE_STATIONS }),
      ticketTokens: 500_000,
      lostTokens: 200_000,
      manager: { model: "sonnet", effort: "medium" },
      reviewer: { model: "haiku", effort: "medium" },
      fermeture: { calibration: null, cooksBelow: 1, tokens: 500_000, removedLines: 500 },
    });

    // Le chef les pose depuis son propre process : une autre connexion au journal.
    for (const [nom, valeur] of Object.entries(DECIDEES)) assert.notEqual(decider(repertoire, nom, valeur), null, nom);

    // Le même suivi, dans le même process : rien n'a été rechargé.
    assert.deepEqual(lu(decisions), {
      stations: lireStations({ BRIGADE_STATIONS: DECIDEES.BRIGADE_STATIONS }),
      ticketTokens: 300_000,
      lostTokens: 100_000,
      manager: { model: "opus", effort: "high" },
      reviewer: { model: "sonnet", effort: "low" },
      fermeture: { calibration: { model: "sonnet", effort: "high" }, cooksBelow: 2, tokens: 300_000, removedLines: 200 },
    });
    // Toutes les décisions de la famille sont couvertes, et chacune est au
    // journal au nom du chef, avec ce qu'elle remplace.
    assert.deepEqual(Object.keys(DECIDEES).sort(), [...DECISIONS].sort());
    assert.deepEqual(
      journal.tout().filter((e) => e.type === "decision.set").slice(Object.keys(ENV).length).map((e) => [e.author, e.payload]),
      Object.entries(DECIDEES).map(([name, value]) => ["chef", { name, value, previous: ENV[name as keyof typeof ENV] ?? null }]),
    );
  });

  test("une variable de décision laissée dans l'environnement est ignorée au profit du support ; retirée du support, la décision ne retombe pas sur elle", (t) => {
    const { repertoire, journal } = support(t);
    poserLesPremieres(repertoire);
    decider(repertoire, "BRIGADE_REVIEWER_MODEL", "opus");
    const dansLEnvironnement = { ...ENV, BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_STATIONS: "box/claude:9:code", BRIGADE_DRIFT_TICKET_TOKENS: "1" };
    const decide = environnementDecide(dansLEnvironnement, decisionsPosees(journal.base));

    // Le support l'emporte, et là où il se tait, la variable n'est pas lue.
    assert.equal(configReviewer(decide).calibrage.model, "opus");
    assert.deepEqual(lireStations(decide).map((station) => station.cooks), [1]);
    assert.equal(lireSeuils(decide).ticketTokens, 500_000);
    assert.equal(environnementDecide(dansLEnvironnement, {}).BRIGADE_STATIONS, undefined);
    assert.equal(configReviewer(decide).calibrage.effort, "medium");

    // Le runtime en dit chacune, avec le geste qui la remplace.
    assert.deepEqual(decisionsDansLEnvironnement(dansLEnvironnement), DECISIONS.filter((nom) => nom in ENV));
    assert.deepEqual(decisionsDansLEnvironnement({ BRIGADE_STATIONS: "", BRIGADE_PROJECT: "x" }), []);
    assert.match(direDecisionIgnoree("BRIGADE_REVIEWER_MODEL", "brigade"), /BRIGADE_REVIEWER_MODEL est ignorée.*`brigade brigade station reviewer-modele <valeur>`.*retirer `Environment=BRIGADE_REVIEWER_MODEL`/);

    // Retirée du support, la décision ne retombe pas sur la variable.
    const decisions = suivreDecisions(journal.base, dansLEnvironnement, () => {});
    assert.equal(decisions.reviewer().model, "opus");
    assert.notEqual(retirerDecision(journal, { projet: "brigade", nom: "BRIGADE_REVIEWER_MODEL", auteur: "chef" }), null);
    assert.equal(decisions.reviewer().model, "opus");
    // Rien à retirer : rien n'est écrit.
    assert.equal(retirerDecision(journal, { projet: "brigade", nom: "BRIGADE_REVIEWER_MODEL", auteur: "chef" }), null);
  });

  test("le support n'est pas sous le clone du dépôt, et aucune pose de décision ne crée ni ne modifie un fichier du dépôt", (t) => {
    const { clone } = depotGit(t);
    const repertoire = repertoireTemporaire(t);
    const chemin = supportDesDecisions({ repertoireEtat: repertoire, clone });
    const depuisLeClone = relative(clone, chemin);
    assert.ok(depuisLeClone.startsWith("..") || isAbsolute(depuisLeClone), `${chemin} est sous ${clone}`);
    // Un répertoire d'état posé dans le clone est refusé : un cook l'atteindrait.
    assert.throws(() => supportDesDecisions({ repertoireEtat: join(clone, ".brigade-state"), clone }), (erreur: Error) => erreur instanceof ConfigInvalide && /sous BRIGADE_REPO_DIR/.test(erreur.message));

    // Tout le dépôt, `.git` compris : chaque fichier, son contenu et sa date.
    const releve = (racine: string, ici = racine): string[] =>
      readdirSync(ici, { withFileTypes: true }).flatMap((entree) => {
        const chemin = join(ici, entree.name);
        if (entree.isDirectory()) return releve(racine, chemin);
        return [`${relative(racine, chemin)} ${statSync(chemin).mtimeMs} ${createHash("sha256").update(readFileSync(chemin)).digest("hex")}`];
      });
    // `git status` rafraîchit l'index : il passe avant le relevé, pas entre.
    const statut = git(clone, "status", "--porcelain", "--ignored");
    const avant = releve(clone);

    for (const [nom, valeur] of Object.entries(DECIDEES)) decider(repertoire, nom, valeur);
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => journal.fermer());
    assert.equal(Object.keys(decisionsPosees(journal.base)).length, DECISIONS.length);

    assert.deepEqual(releve(clone), avant);
    assert.equal(git(clone, "status", "--porcelain", "--ignored"), statut);
  });

  test("une décision absente reste absente : ni station, ni seuil, ni calibrage par défaut", (t) => {
    const { journal } = support(t);
    const decide = environnementDecide({}, decisionsPosees(journal.base));

    assert.deepEqual(decisionsPosees(journal.base), {});
    for (const nom of DECISIONS) assert.equal(decide[nom], undefined, nom);
    assert.deepEqual(lireStations(decide), []);
    assert.deepEqual([lireSeuils(decide).ticketTokens, lireSeuils(decide).lostTokens], [null, null]);
    assert.throws(() => configManager(decide), /BRIGADE_MANAGER_MODEL n'est pas défini — le calibrage des jugements du manager n'a pas de défaut/);
    assert.throws(() => configReviewer(decide), /BRIGADE_REVIEWER_MODEL n'est pas défini — le calibrage des relectures du reviewer n'a pas de défaut/);
    // Le suivi n'en invente pas non plus : sans rien à lire, il refuse.
    assert.throws(() => suivreDecisions(journal.base, {}), ConfigInvalide);

    // Une valeur vide n'est pas une décision, ni une valeur que le runtime ne
    // lirait pas : refusées, rien n'est écrit.
    for (const [nom, valeur, motif] of [
      ["BRIGADE_STATIONS", " ", /une valeur vide n'est pas une décision/],
      ["BRIGADE_STATIONS", "box:2:code", /BRIGADE_STATIONS invalide/],
      ["BRIGADE_DRIFT_TICKET_TOKENS", "-1", /BRIGADE_DRIFT_TICKET_TOKENS invalide/],
      ["BRIGADE_DRIFT_LOST_TOKENS", "beaucoup", /BRIGADE_DRIFT_LOST_TOKENS invalide/],
      ["BRIGADE_MANAGER_MODEL", "gpt", /BRIGADE_MANAGER_MODEL invalide : « gpt » — attendu opus, sonnet ou haiku/],
      ["BRIGADE_REVIEWER_EFFORT", "fort", /BRIGADE_REVIEWER_EFFORT invalide/],
      ["BRIGADE_PROXY_PORT", "8080", /n'est pas une décision du chef/],
    ] as const) {
      assert.throws(() => poserDecision(journal, { projet: "brigade", nom, valeur, auteur: "chef" }), motif, `${nom}=${valeur}`);
    }
    assert.deepEqual(journal.tout(), []);
  });

  test("retirée sans variable derrière, une décision ne tombe pas sur un défaut : le runtime s'en tient à ce qu'il lisait, et le dit une fois", (t) => {
    const { repertoire, journal } = support(t);
    poserLesPremieres(repertoire);
    decider(repertoire, "BRIGADE_MANAGER_MODEL", "opus");
    const avertissements: string[] = [];
    const decisions = suivreDecisions(journal.base, ENV, (message) => void avertissements.push(message));
    retirerDecision(journal, { projet: "brigade", nom: "BRIGADE_MANAGER_MODEL", auteur: "chef" });

    assert.deepEqual([decisions.manager(), decisions.manager()], [{ model: "opus", effort: "medium" }, { model: "opus", effort: "medium" }]);
    assert.equal(avertissements.length, 1);
    assert.match(avertissements[0] ?? "", /le calibrage du manager non relu — BRIGADE_MANAGER_MODEL n'est pas défini.*s'en tient à ce qu'il lisait/);
  });

  test("les seuils de coût posés pendant que la dérive tourne sont écrits au journal au réveil suivant, et regardés à leur aune", (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 3_600_000, intervalleTickMs: 3_600_000 });
    t.after(() => runtime.arreter("test"));
    const reveils: Array<() => void> = [];
    poserLesPremieres(repertoire);
    const decisions = suivreDecisions(runtime.journal.base, {});
    brancherDerive({ ...runtime, surReveil: (ecouter) => (reveils.push(() => ecouter("log")), () => {}) }, decisions.seuils, () => {});
    const limites = () => runtime.journal.tout().filter((e) => e.type === "drift.configured").map((e) => [e.payload.limits.ticketTokens, e.payload.limits.lostTokens]);
    assert.deepEqual(limites(), [[500_000, 200_000]]);

    decider(repertoire, "BRIGADE_DRIFT_TICKET_TOKENS", "300000");
    decider(repertoire, "BRIGADE_DRIFT_LOST_TOKENS", "100000");
    for (const reveiller of reveils) reveiller();

    assert.deepEqual(limites(), [
      [500_000, 200_000],
      [300_000, 100_000],
    ]);
  });

  test("en cuisine : des stations posées par le chef sont annoncées et servies au réveil suivant — un ticket qu'aucune ne pouvait cuisiner part", async (t) => {
    const { repertoire, journal, gh, types, etat } = cuisine(t, { decisions: true, scenario: "muet" });
    gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : navigateur-headless"].join("\n"));
    gh.poser(issue(16));
    await jusqua(() => types(16).includes("ticket.86"));
    assert.deepEqual(stationsAnnoncees(journal.base), ["box/claude"]);

    decider(repertoire, "BRIGADE_STATIONS", "box/claude:1:code,box/playwright:1:navigateur-headless");

    await jusqua(() => etat(16) === "taken" && types(16).includes("cook.launched"));
    assert.deepEqual(stationsAnnoncees(journal.base), ["box/claude", "box/playwright"]);
    assert.equal(journal.duTicket(16).find((e) => e.type === "ticket.taken")?.author, "station:box/playwright");
  });

  test("en cuisine : le calibrage du reviewer posé par le chef vaut dès la relecture suivante", async (t) => {
    const { repertoire, gh, relectures } = cuisine(t, { decisions: true, pass: true, issues: [issue(16)] });
    await jusqua(() => relectures().length === 1);

    decider(repertoire, "BRIGADE_REVIEWER_MODEL", "opus");
    decider(repertoire, "BRIGADE_REVIEWER_EFFORT", "high");
    gh.poser(issue(17));

    await jusqua(() => relectures().length === 2);
    const calibrage = (args: string[]) => [args[args.indexOf("--model") + 1], args[args.indexOf("--effort") + 1]];
    assert.deepEqual(relectures().map((lancement) => calibrage(lancement.args)), [
      ["haiku", "medium"],
      ["opus", "high"],
    ]);
  });

  test("en cuisine : le calibrage du manager posé par le chef vaut dès le jugement suivant", async (t) => {
    const { repertoire, gh, lancements } = cuisine(t, { decisions: true, manager: {}, issues: [issue(30, [])] });
    chef(repertoire, "manager.enabled");
    const jugements = () => lancements().filter((lancement) => lancement.args.includes("--tools"));
    await jusqua(() => jugements().length === 1);

    decider(repertoire, "BRIGADE_MANAGER_MODEL", "opus");
    decider(repertoire, "BRIGADE_MANAGER_EFFORT", "high");
    gh.poser(issue(31, []));

    await jusqua(() => jugements().length === 2);
    const calibrage = (args: string[]) => [args[args.indexOf("--model") + 1], args[args.indexOf("--effort") + 1]];
    assert.deepEqual(jugements().map((lancement) => calibrage(lancement.args)), [
      ["sonnet", "medium"],
      ["opus", "high"],
    ]);
  });

  test("en cuisine : changer les décisions ne touche à aucun cook en vol — ni arrêt, ni relance, même quand sa station est retirée", async (t) => {
    const { repertoire, journal, types, etat, cooks, conclure } = cuisine(t, { decisions: true, scenario: "commite-puis-attend", issues: [issue(16)] });
    await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

    // Toutes les décisions changent, et la station du cook en vol disparaît.
    for (const [nom, valeur] of Object.entries({ ...DECIDEES, BRIGADE_STATIONS: "box/autre:1:code" })) decider(repertoire, nom, valeur);
    await jusqua(() => stationsAnnoncees(journal.base).join() === "box/autre");

    const ARRETS = ["cook.exited", "cook.interrupted", "guard.tripped", "ticket.released"];
    assert.deepEqual(types(16).filter((type) => ARRETS.includes(type)), []);
    assert.equal(cooks().length, 1);
    assert.equal(etat(16), "taken");
    assert.deepEqual(journal.tout().filter((e) => e.type.startsWith("runtime.") && e.type !== "runtime.ticked").map((e) => e.type), ["runtime.started"]);

    // Il finit de lui-même, comme il aurait fini : sa livraison est reçue.
    conclure();
    await jusqua(() => etat(16) === "pass");
    assert.equal((journal.duTicket(16).find((e) => e.type === "cook.exited")?.payload as { outcome?: string } | undefined)?.outcome, "ok");
    assert.equal(cooks().length, 1);
    // Sa station retirée ne revient pas pour autant.
    assert.deepEqual(stationsAnnoncees(journal.base), ["box/autre"]);
  });

  test("en cuisine : une station distante retirée par le chef laisse son cook en vol renouveler et livrer — elle ne prend plus rien", async (t) => {
    const MAC = "mac/claude";
    const { repertoire, journal, gh, heure, types, etat } = cuisine(t, { decisions: true, stations: lireStations({ BRIGADE_STATIONS: `${MAC}:1:chrome-connecté:distante` }) });
    gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
    gh.poser(issue(16));
    const tirer = (demande: Parameters<typeof demander>[2]) => demander(repertoire, MAC, demande, { maintenant: heure.maintenant, pasMs: 2 });
    await jusqua(() => types(16).includes("ticket.86"));
    await tirer({ verb: "announce" });
    await jusqua(() => types(16).includes("ticket.released"));
    const prise = await tirer({ verb: "claim" });
    assert.ok(prise.ok && prise.verb === "claim" && prise.mission !== null);
    const { run, branch } = prise.mission;

    decider(repertoire, "BRIGADE_STATIONS", "box/claude:1:code");
    await jusqua(() => stationsAnnoncees(journal.base).join() === "box/claude");

    assert.equal((await tirer({ verb: "renew", run, proof: "e1", turns: 1, tokens: 10 })).ok, true);
    pousserSurLOrigine(repertoire, branch);
    assert.equal((await tirer({ verb: "deliver", run, ending: "delivered", reason: null, message: null, turns: 2, tokens: 20 })).ok, true);
    await jusqua(() => etat(16) === "pass");
    // Retirée, elle ne s'annonce plus et ne réclame plus rien.
    const refus = await tirer({ verb: "claim" });
    assert.equal(refus.ok ? null : refus.refusal, "unknown-station");
    assert.deepEqual(stationsAnnoncees(journal.base), ["box/claude"]);
  });
});

// Un runtime complet, dans son propre process : ce que le chef pose pendant
// qu'il tourne, il le lit sans redémarrer.
describe("le runtime et les décisions du chef", { concurrency: 4 }, () => {
  const environnement = (t: TestContext, repertoire: string) => {
    const gh = fauxGh(t);
    gh.issues([]);
    const clone = repertoireTemporaire(t);
    git(clone, "init", "-q");
    if (repertoire !== "") poserLesPremieres(repertoire);
    return {
      ...ENV_GIT,
      BRIGADE_STATE_DIR: repertoire,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: DEPOT,
      BRIGADE_GH_BIN: gh.bin,
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: BASE,
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_MAX_LOAD_PER_CORE: "1000000",
      BRIGADE_MIN_FREE_MEMORY_MB: "0",
      BRIGADE_MIN_FREE_DISK_MB: "0",
    };
  };
  const relire = (repertoire: string) => {
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return journal.tout();
    } finally {
      journal.fermer();
    }
  };

  test("posées pendant qu'il tourne, ses stations et ses seuils sont lus au réveil suivant : même process, aucun redémarrage", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const runtime = lancer(t, MAIN, [], environnement(t, repertoire));
    await runtime.attendre("démarré");

    decider(repertoire, "BRIGADE_STATIONS", DECIDEES.BRIGADE_STATIONS);
    decider(repertoire, "BRIGADE_DRIFT_TICKET_TOKENS", DECIDEES.BRIGADE_DRIFT_TICKET_TOKENS);

    const annoncees = () => relire(repertoire).flatMap((e) => (e.type === "station.announced" ? [`${e.payload.station}:${e.payload.maxCooks}`] : []));
    const seuils = () => relire(repertoire).flatMap((e) => (e.type === "drift.configured" ? [e.payload.limits.ticketTokens] : []));
    await jusqua(() => annoncees().includes("box/playwright:1") && seuils().includes(300_000));
    assert.deepEqual(annoncees(), ["box/claude:1", "box/claude:3", "box/playwright:1"]);
    assert.deepEqual(seuils(), [500_000, 300_000]);
    const vie = relire(repertoire).filter((e) => e.type.startsWith("runtime.") && e.type !== "runtime.ticked");
    assert.deepEqual(vie.map((e) => e.type), ["runtime.started"]);
    assert.equal((vie[0]?.payload as { pid?: number }).pid, runtime.process.pid);
    assert.match(runtime.sortie(), /stations relues — box\/claude \(3 cooks au plus.*box\/playwright/);
  });

  test("une variable de décision laissée au drop-in est ignorée dès le démarrage, et dite avec le geste qui la remplace", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const env = { ...environnement(t, repertoire), BRIGADE_STATIONS: "box/claude:7:code", BRIGADE_MANAGER_MODEL: "haiku" };

    const runtime = lancer(t, MAIN, [], env);
    await runtime.attendre("démarré");

    // Le journal l'emporte : la station est celle du chef, pas celle du drop-in.
    assert.match(runtime.sortie(), /stations — box\/claude \(1 cooks? au plus/);
    assert.match(runtime.sortie(), /BRIGADE_STATIONS est ignorée dans l'environnement de l'unité.*`brigade brigade station stations <valeur>`.*retirer `Environment=BRIGADE_STATIONS` du drop-in/);
    assert.match(runtime.sortie(), /BRIGADE_MANAGER_MODEL est ignorée.*station manager-modele <valeur>/);
  });

  test("sans décision au journal, une variable de décision du drop-in ne suffit pas : le runtime refuse de démarrer, et nomme le geste", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const { BRIGADE_MANAGER_MODEL, ...autres } = ENV;
    for (const [nom, valeur] of Object.entries(autres)) decider(repertoire, nom, valeur);
    const env = { ...environnement(t, ""), BRIGADE_STATE_DIR: repertoire, BRIGADE_MANAGER_MODEL, BRIGADE_TEST_SANS_DECISIONS: "1" };

    const runtime = lancer(t, MAIN, [], env);

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /BRIGADE_MANAGER_MODEL n'est pas défini.*`brigade <projet> station manager-modele <valeur>`/);
  });

  test("un répertoire d'état sous le clone est un refus de démarrer : les décisions y seraient à portée d'un cook", async (t) => {
    const env = environnement(t, "");
    const repertoire = join(env.BRIGADE_REPO_DIR, ".brigade-state");
    const runtime = lancer(t, MAIN, [], { ...env, BRIGADE_STATE_DIR: repertoire });

    assert.equal(await runtime.fin, REFUS);
    assert.match(runtime.sortie(), /refus de démarrer — BRIGADE_STATE_DIR .* est sous BRIGADE_REPO_DIR/);
  });
});
