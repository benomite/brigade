// L'interrupteur du projet (#1406) : un seul ON/OFF à la place de l'interrupteur
// du manager et du grant `merge`. Les premiers tests lisent un journal que le
// test écrit — ce que le runtime pose à son démarrage, ce que les commandes du
// chef écrivent, ce que `status` et `switch` en disent ; les derniers font
// tourner une cuisine, avec sa pass, sa station et son manager.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { commanderInterrupteur, etablirLInterrupteur, InterrupteurRefuse } from "../src/interrupteur.ts";
import { principal as interrupteurCli } from "../src/interrupteur-cli.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { managerAllume } from "../src/projections/manager.ts";
import { etatDuGrant } from "../src/projections/pass.ts";
import { etatDeLInterrupteur, projetEteint } from "../src/projections/switch.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { aArreter, appeler, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";

const A = new Date(`${JOUR_HORLOGE}T10:00:00.000Z`);

// Un journal que le test écrit, comme un runtime qui a déjà démarré une fois.
function journalEcrit(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: () => A });
  // Fermé avant que son répertoire soit supprimé : sous Windows, un journal
  // encore ouvert ne se supprime pas.
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, author = "chef") => journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }, "runtime");
  const types = () => journal.tout().map((e) => e.type);
  return { repertoire, journal, noter, types };
}

const suite = (journal: Journal, depuis: number) => journal.tout().slice(depuis).map((e) => [e.type, e.author, e.payload]);

describe("l'interrupteur posé au démarrage du runtime", () => {
  test("un projet qui n'a jamais touché aux anciens interrupteurs — tout projet ajouté depuis l'app — part allumé, et le grant `merge` est activé", (t) => {
    const { journal } = journalEcrit(t);
    const avant = journal.tout().length;

    const dit = etablirLInterrupteur(journal, "brigade", A);

    assert.match(dit ?? "", /allumé par défaut/);
    assert.deepEqual(suite(journal, avant), [
      ["project.switched-on", "runtime", { cause: "default" }],
      ["grant.activated", "runtime", { action: "merge" }],
    ]);
    assert.equal(managerAllume(journal.base), true);
    assert.equal(etatDuGrant(journal.base, "merge", A)?.active, true);
    assert.equal(projetEteint(journal.base), false);
  });

  test("posé une fois, il ne se repose plus : un second démarrage n'écrit rien, même si le chef l'a éteint entre-temps", (t) => {
    const { journal } = journalEcrit(t);
    etablirLInterrupteur(journal, "brigade", A);
    commanderInterrupteur(journal, "off", A);
    const avant = journal.tout().length;

    assert.equal(etablirLInterrupteur(journal, "brigade", A), null);
    assert.equal(journal.tout().length, avant);
    assert.equal(etatDeLInterrupteur(journal.base)?.on, false);
  });

  // Un projet d'avant cuisinait quels qu'aient été ses anciens interrupteurs — ses stations prenaient
  // les tickets lancés sans les lire — : il part allumé, même quand les deux étaient éteints.
  const AVANT: Array<[string, Fait[], boolean]> = [
    ["le manager seul allumé", [{ type: "manager.enabled", payload: {} }], true],
    ["le grant `merge` seul actif", [{ type: "grant.activated", payload: { action: "merge" } }], false],
    ["les deux", [{ type: "manager.enabled", payload: {} }, { type: "grant.activated", payload: { action: "merge" } }], false],
    ["le manager éteint, le grant révoqué", [{ type: "manager.enabled", payload: {} }, { type: "manager.disabled", payload: {} }, { type: "grant.activated", payload: { action: "merge" } }, { type: "grant.revoked", payload: { action: "merge" } }], true],
    ["le manager éteint, jamais de grant", [{ type: "manager.enabled", payload: {} }, { type: "manager.disabled", payload: {} }], true],
  ];
  for (const [cas, faitsDAvant, grantEcrit] of AVANT) {
    test(`un projet d'avant — ${cas} — continue de cuisiner : allumé`, (t) => {
      const { journal, noter } = journalEcrit(t);
      for (const fait of faitsDAvant) noter(fait);
      const avant = journal.tout().length;

      const dit = etablirLInterrupteur(journal, "brigade", A);

      assert.match(dit ?? "", /allumé — il remplace l'ancien réglage .* un projet d'avant continue de cuisiner/);
      assert.deepEqual(suite(journal, avant), [
        ["project.switched-on", "runtime", { cause: "carried-over" }],
        ...(grantEcrit ? [["grant.activated", "runtime", { action: "merge" }]] : []),
      ]);
      assert.equal(managerAllume(journal.base), true);
      assert.equal(etatDuGrant(journal.base, "merge", A)?.active, true);
      assert.equal(projetEteint(journal.base), false);
    });
  }

  test("un grant `merge` échu pendant que le runtime dormait est d'abord écrit éteint, puis rétabli par l'interrupteur allumé", (t) => {
    const { journal, noter } = journalEcrit(t);
    noter({ type: "manager.disabled", payload: {} });
    noter({ type: "grant.activated", payload: { action: "merge", until: `${JOUR_HORLOGE}T09:00:00.000Z` } });

    etablirLInterrupteur(journal, "brigade", A);

    assert.deepEqual(journal.tout().slice(-3).map((e) => e.type), ["grant.expired", "project.switched-on", "grant.activated"]);
    assert.equal(etatDuGrant(journal.base, "merge", A)?.active, true);
  });
});

describe("les commandes du chef", () => {
  test("éteindre écrit l'interrupteur et révoque le grant `merge`, ensemble ; rallumer les rétablit — chacune une seule fois", (t) => {
    const { journal } = journalEcrit(t);
    etablirLInterrupteur(journal, "brigade", A);
    const avant = journal.tout().length;

    assert.match(commanderInterrupteur(journal, "off", A), /^project off: nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait\. /);
    assert.match(commanderInterrupteur(journal, "off", A), /^nothing to switch off: the project is off since /);
    assert.equal(managerAllume(journal.base), false);
    assert.equal(etatDuGrant(journal.base, "merge", A)?.active, false);
    assert.match(commanderInterrupteur(journal, "on", A), /^project on: fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged\. The deliveries that were waiting are merged/);
    assert.match(commanderInterrupteur(journal, "on", A), /^project already on since /);

    assert.deepEqual(suite(journal, avant), [
      ["project.switched-off", "chef", {}],
      ["grant.revoked", "chef", { action: "merge" }],
      ["project.switched-on", "chef", {}],
      ["grant.activated", "chef", { action: "merge" }],
    ]);
    assert.equal(managerAllume(journal.base), true);
    assert.equal(etatDuGrant(journal.base, "merge", A)?.active, true);
  });

  test("le manager suit l'interrupteur, quel que soit l'ancien : allumé à la main, il s'éteint avec le projet", (t) => {
    const { journal, noter } = journalEcrit(t);
    noter({ type: "manager.enabled", payload: {} });
    commanderInterrupteur(journal, "off", A);
    assert.equal(managerAllume(journal.base), false);
  });

  test("sur un journal vide, la commande est refusée et n'écrit rien", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    aArreter(t, () => journal.fermer());
    assert.throws(() => commanderInterrupteur(journal, "on", A), InterrupteurRefuse);
    assert.equal(journal.tout().length, 0);
  });
});

describe("ce que `status`, les faits et `switch` en disent", () => {
  test("allumé, `status` porte sa ligne `switch` ; éteint, la ligne le dit, la cuisine se dit SWITCHED OFF et les faits la disent retenue", (t) => {
    const { journal } = journalEcrit(t);
    const lire = () => {
      const etat = lireEtat(journal, A);
      return { texte: decrireEtat(etat, A).join("\n"), etat: faits(etat, A).etat };
    };
    assert.doesNotMatch(lire().texte, /^switch/m, "pas encore posé : pas de ligne");

    etablirLInterrupteur(journal, "brigade", A);
    assert.match(lire().texte, /^switch {5}ON since \S+ \(by runtime, on by default\) — fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged$/m);

    commanderInterrupteur(journal, "off", A);
    const eteint = lire();
    assert.match(eteint.texte, /^switch {5}OFF since \S+ \(by chef\) — nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait$/m);
    assert.match(eteint.texte, /^kitchen {4}SWITCHED OFF 0 s ago · /m);
    assert.equal(eteint.etat, "retenue");
    sansMotFrancais(eteint.texte.split("\n").filter((ligne) => /^(switch|kitchen) /.test(ligne)));
  });

  test("`switch` montre l'interrupteur et le grant qu'il tient, le bascule, et refuse le reste — en anglais", async (t) => {
    const { repertoire, journal } = journalEcrit(t);
    const jouer = async (...args: string[]) => {
      const appel = appeler(interrupteurCli, args, { BRIGADE_STATE_DIR: repertoire });
      const code = await appel.fin;
      const sortie = appel.sortie();
      sansMotFrancais(sortie.trimEnd().split("\n"));
      return { code, sortie };
    };

    const pasPose = await jouer();
    assert.equal(pasPose.code, 0);
    assert.match(pasPose.sortie, /^switch {5}NOT SET — the runtime sets it at its next start/m);

    const eteindre = await jouer("off");
    assert.equal(eteindre.code, 0);
    assert.match(eteindre.sortie, /^brigade : project off: /);
    const vu = await jouer();
    assert.match(vu.sortie, /^switch {5}OFF since /m);
    assert.match(vu.sortie, /^merge {6}grant ABSENT — never given/m);
    assert.equal((await jouer("on")).code, 0);
    assert.match((await jouer()).sortie, /^merge {6}grant ACTIVE since \S+ \(by chef\)/m);
    assert.equal(etatDeLInterrupteur(journal.base)?.on, true);

    for (const args of [["start"], ["on", "now"]]) {
      const refus = await jouer(...args);
      assert.equal(refus.code, 2, args.join(" "));
      assert.match(refus.sortie, /usage: .*switch -- \[on \| off\]/);
    }
    const sansJournal = appeler(interrupteurCli, ["on"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
    assert.equal(await sansJournal.fin, 1);
    assert.match(sansJournal.sortie(), /no log in/);
  });
});

// Une cuisine sous l'interrupteur : `basculer` joue la commande du chef depuis une autre connexion.
function enCuisine(t: TestContext, options: Parameters<typeof cuisine>[1] = {}) {
  const lieu = cuisine(t, options);
  const basculer = (commande: "on" | "off") => {
    const journal = ouvrirJournal(lieu.repertoire);
    try {
      return commanderInterrupteur(journal, commande, new Date());
    } finally {
      journal.fermer();
    }
  };
  const compter = (type: string, ticket: number) => lieu.journal.duTicket(ticket).filter((e) => e.type === type).length;
  const commentaires = (ticket: number) => lieu.gh.commentaires.filter(([numero]) => numero === ticket).map(([, corps]) => corps).join("\n---\n");
  return { ...lieu, basculer, compter, commentaires };
}

describe("la cuisine sous l'interrupteur", { concurrency: 4 }, () => {
  test("éteint : le cook en vol finit, sa livraison verte attend sans merge, aucun ticket neuf n'est pris ; rallumé, elle est mergée et la prise reprend", async (t) => {
    const { etat, basculer, conclure, compter, gh, journal, commentaires } = enCuisine(t, { pass: true, scenario: "commite-puis-attend", cooks: 2, issues: [issue(17)] });
    await jusqua(() => etat(17) === "taken" && compter("cook.launched", 17) === 1);

    basculer("off");
    gh.poser(issue(18));
    await jusqua(() => journal.tout().some((e) => e.type === "station.held" && e.payload.reason === "off"));
    conclure();
    await jusqua(() => compter("pass.waiting", 17) === 1);

    assert.equal(journal.duTicket(17).findLast((e) => e.type === "pass.waiting")?.payload.reason, "project-off");
    assert.deepEqual(gh.merges, []);
    assert.equal(compter("grant.used", 17), 0);
    assert.match(commentaires(17), /\*\*Pass — en attente \(`project-off`\)\.\*\*[\s\S]*L'interrupteur du projet est éteint/);
    assert.equal(etat(18), "waiting");
    assert.equal(compter("cook.launched", 18), 0);

    basculer("on");
    await jusqua(() => compter("merge.done", 17) === 1);
    await jusqua(() => compter("cook.launched", 18) === 1);
    assert.equal(gh.merges.length, 1);
  });

  test("le manager suit l'interrupteur : éteint, allumé à l'ancienne, il ne juge rien ; le projet rallumé, il juge", async (t) => {
    const { basculer, gh, lancements, etat, repertoire, heure } = enCuisine(t, { manager: {}, issues: [issue(30, [])] });
    basculer("off");
    chef(repertoire, "manager.enabled");
    heure.avancer(1);
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(gh.sondages.ouvertes, 0);
    assert.equal(lancements().filter((lancement) => lancement.args.includes("--tools")).length, 0);

    basculer("on");
    await jusqua(() => lancements().some((lancement) => lancement.args.includes("--tools")));
    await jusqua(() => etat(30) === "pass");
  });
});
