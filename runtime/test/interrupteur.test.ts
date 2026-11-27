// L'interrupteur du projet (#1406) : un seul ON/OFF à la place de l'interrupteur
// du manager. Les premiers tests lisent un journal que le
// test écrit — ce que le runtime pose à son démarrage, ce que les commandes du
// chef écrivent, ce que `status` et `switch` en disent ; le dernier fait
// tourner une cuisine et son manager.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { aArreter, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";

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

describe("ce que `status`, les faits et `switch` en disent", () => {
  test("allumé, `status` porte sa ligne `switch` ; éteint, la ligne le dit, la cuisine se dit SWITCHED OFF et les faits la disent retenue", (t) => {
    const { journal, noter } = journalEcrit(t);
    const lire = () => {
      const etat = lireEtat(journal, A);
      return { texte: decrireEtat(etat, A).join("\n"), etat: faits(etat, A).etat };
    };
    assert.doesNotMatch(lire().texte, /^switch/m, "pas encore posé : pas de ligne");

    noter({ type: "project.switched-on", payload: { cause: "default" } }, "runtime");
    assert.match(lire().texte, /^switch {5}ON since \S+ \(by runtime, on by default\) — fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged$/m);

    noter({ type: "project.switched-off", payload: {} });
    const eteint = lire();
    assert.match(eteint.texte, /^switch {5}OFF since \S+ \(by chef\) — nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait$/m);
    assert.match(eteint.texte, /^kitchen {4}SWITCHED OFF 0 s ago · /m);
    assert.equal(eteint.etat, "retenue");
    sansMotFrancais(eteint.texte.split("\n").filter((ligne) => /^(switch|kitchen) /.test(ligne)));
  });
});

// Une cuisine sous l'interrupteur : `basculer` joue la commande du chef depuis une autre connexion.
function enCuisine(t: TestContext, options: Parameters<typeof cuisine>[1] = {}) {
  const lieu = cuisine(t, options);
  const basculer = (commande: "on" | "off"): void => {
    const journal = ouvrirJournal(lieu.repertoire);
    try {
      journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: commande === "on" ? "project.switched-on" : "project.switched-off", payload: {} });
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
