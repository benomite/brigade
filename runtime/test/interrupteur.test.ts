// L'interrupteur du projet (#1406) : un seul ON/OFF à la place de l'interrupteur
// du manager. Les premiers tests lisent un journal que le
// test écrit — ce que le runtime pose à son démarrage, ce que les commandes du
// chef écrivent, ce que `status` et `switch` en disent ; le dernier fait
// tourner une cuisine et son manager.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { commanderInterrupteur, etablirLInterrupteur, InterrupteurRefuse } from "../src/interrupteur.ts";
import { principal as interrupteurCli } from "../src/interrupteur-cli.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { managerAllume } from "../src/projections/manager.ts";
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
  test("un projet qui n'a jamais touché aux anciens interrupteurs — tout projet ajouté depuis l'app — part allumé", (t) => {
    const { journal } = journalEcrit(t);
    const avant = journal.tout().length;

    const dit = etablirLInterrupteur(journal, "brigade");

    assert.match(dit ?? "", /allumé par défaut/);
    assert.deepEqual(suite(journal, avant), [
      ["project.switched-on", "runtime", { cause: "default" }],
    ]);
    assert.equal(managerAllume(journal.base), true);
    assert.equal(projetEteint(journal.base), false);
  });

  test("posé une fois, il ne se repose plus : un second démarrage n'écrit rien, même si le chef l'a éteint entre-temps", (t) => {
    const { journal } = journalEcrit(t);
    etablirLInterrupteur(journal, "brigade");
    commanderInterrupteur(journal, "off");
    const avant = journal.tout().length;

    assert.equal(etablirLInterrupteur(journal, "brigade"), null);
    assert.equal(journal.tout().length, avant);
    assert.equal(etatDeLInterrupteur(journal.base)?.on, false);
  });

  // Un projet d'avant cuisinait quels qu'aient été ses anciens interrupteurs — ses stations prenaient
  // les tickets lancés sans les lire — : il part allumé, même quand les deux étaient éteints.
  // Les journaux d'avant portent encore les événements `grant.*` : ils sont ignorés.
  const AVANT: Array<[string, unknown[]]> = [
    ["le manager seul allumé", [{ type: "manager.enabled", payload: {} }]],
    ["les deux", [{ type: "manager.enabled", payload: {} }, { type: "grant.activated", payload: { action: "merge" } }]],
    ["le manager éteint, le grant révoqué", [{ type: "manager.enabled", payload: {} }, { type: "manager.disabled", payload: {} }, { type: "grant.activated", payload: { action: "merge" } }, { type: "grant.revoked", payload: { action: "merge" } }]],
    ["le manager éteint, jamais de grant", [{ type: "manager.enabled", payload: {} }, { type: "manager.disabled", payload: {} }]],
  ];
  for (const [cas, faitsDAvant] of AVANT) {
    test(`un projet d'avant — ${cas} — continue de cuisiner : allumé`, (t) => {
      const { journal, noter } = journalEcrit(t);
      for (const fait of faitsDAvant) noter(fait as Fait);
      const avant = journal.tout().length;

      const dit = etablirLInterrupteur(journal, "brigade");

      assert.match(dit ?? "", /allumé — il remplace l'ancien réglage .* un projet d'avant continue de cuisiner/);
      assert.deepEqual(suite(journal, avant), [
        ["project.switched-on", "runtime", { cause: "carried-over" }],
      ]);
      assert.equal(managerAllume(journal.base), true);
      assert.equal(projetEteint(journal.base), false);
    });
  }
});

describe("les commandes du chef", () => {
  test("éteindre écrit l'interrupteur ; rallumer le rétablit — chacun une seule fois", (t) => {
    const { journal } = journalEcrit(t);
    etablirLInterrupteur(journal, "brigade");
    const avant = journal.tout().length;

    assert.match(commanderInterrupteur(journal, "off"), /^project off: nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait\. /);
    assert.match(commanderInterrupteur(journal, "off"), /^nothing to switch off: the project is off since /);
    assert.equal(managerAllume(journal.base), false);
    assert.match(commanderInterrupteur(journal, "on"), /^project on: fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged\. The deliveries that were waiting are merged/);
    assert.match(commanderInterrupteur(journal, "on"), /^project already on since /);

    assert.deepEqual(suite(journal, avant), [
      ["project.switched-off", "chef", {}],
      ["project.switched-on", "chef", {}],
    ]);
    assert.equal(managerAllume(journal.base), true);
  });

  test("le manager suit l'interrupteur, quel que soit l'ancien : allumé à la main, il s'éteint avec le projet", (t) => {
    const { journal, noter } = journalEcrit(t);
    noter({ type: "manager.enabled", payload: {} });
    commanderInterrupteur(journal, "off");
    assert.equal(managerAllume(journal.base), false);
  });

  test("sur un journal vide, la commande est refusée et n'écrit rien", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    aArreter(t, () => journal.fermer());
    assert.throws(() => commanderInterrupteur(journal, "on"), InterrupteurRefuse);
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

    etablirLInterrupteur(journal, "brigade");
    assert.match(lire().texte, /^switch {5}ON since \S+ \(by runtime, on by default\) — fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged$/m);

    commanderInterrupteur(journal, "off");
    const eteint = lire();
    assert.match(eteint.texte, /^switch {5}OFF since \S+ \(by chef\) — nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait$/m);
    assert.match(eteint.texte, /^kitchen {4}SWITCHED OFF 0 s ago · /m);
    assert.equal(eteint.etat, "retenue");
    sansMotFrancais(eteint.texte.split("\n").filter((ligne) => /^(switch|kitchen) /.test(ligne)));
  });

  test("`switch` montre l'interrupteur, le bascule, et refuse le reste — en anglais", async (t) => {
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
    assert.equal((await jouer("on")).code, 0);
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
      return commanderInterrupteur(journal, commande);
    } finally {
      journal.fermer();
    }
  };
  return { ...lieu, basculer };
}

describe("la cuisine sous l'interrupteur", () => {
  test("le manager suit l'interrupteur : éteint, allumé à l'ancienne, il ne juge rien ; le projet rallumé, il juge", async (t) => {
    const { basculer, gh, lancements, repertoire, heure, laisserReveiller } = enCuisine(t, { manager: {}, issues: [issue(30, [])] });
    basculer("off");
    chef(repertoire, "manager.enabled");
    heure.avancer(1);
    await laisserReveiller();
    assert.equal(gh.sondages.ouvertes, 0);
    assert.equal(lancements().filter((lancement) => lancement.args.includes("--tools")).length, 0);

    basculer("on");
    await jusqua(() => lancements().some((lancement) => lancement.args.includes("--tools")));
    await jusqua(() => gh.lire(30)?.labels.includes("fire") === true);
  });
});
