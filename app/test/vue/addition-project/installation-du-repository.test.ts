// La vérification du dépôt choisi dans le parcours d'ajout (ticket 2627) : ses quatre états — prêt, pas prêt, en cours,
// échoué —, chacun dit en une phrase, un seul bouton quand un geste est attendu, et jamais la commande d'init du plugin.
// Puis l'étape « projet », qui vérifie le dépôt choisi avant de l'ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  FAILURE,
  EN_COURS,
  type StateDuRepository,
  ILLISIBLE,
  manqueDit,
  PREPARE,
  PREPARER,
  PRET,
  poserInstallationDuRepository,
  REESSAYER,
  VERIFICATION,
} from "../../../src/vue/addition-project/installation-du-repository.js";
import { poserStepProject } from "../../../src/vue/journey-project/step-project.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const repos = () => new Promise((resoudre) => setImmediate(resoudre));
const PRET_STATE: StateDuRepository = { ready: true, missingBindings: [], missingLabels: [] };

// Une promesse que le test tient en main : il la résout ou la rejette quand il veut.
function queued<T>() {
  let hold!: (valeur: T) => void;
  let lacher!: (error: Error) => void;
  const promesse = new Promise<T>((oui, non) => ((hold = oui), (lacher = non)));
  return { promesse, tenir: hold, lacher };
}

function monter(verifier: (repository: string) => Promise<StateDuRepository>, installer: (repository: string) => Promise<StateDuRepository> = async () => PRET_STATE) {
  let suites = 0;
  const installes: string[] = [];
  const racine = poserInstallationDuRepository(doc, {
    depot: "chef/site",
    verifier,
    installer: (repository) => (installes.push(repository), installer(repository)),
    continuer: () => void suites++,
  }) as Faux;
  const boutons = () => racine.dessous("button").filter((button) => button.className !== "aide");
  const phrase = () => racine.dessous("p")[0]?.dessous("span")[0]?.textContent ?? "";
  const cliquer = async () => {
    await Promise.all(boutons()[0]!.declencher("click"));
    await repos();
  };
  return { racine, boutons, phrase, cliquer, installes, suites: () => suites };
}

describe("la vérification du dépôt choisi", () => {
  test("pendant la vérification : une phrase, aucun bouton", () => {
    const bloc = monter(() => new Promise(() => {}));
    assert.equal(bloc.racine.dataset.etat, "verification");
    assert.equal(bloc.phrase(), VERIFICATION("chef/site"));
    assert.equal(bloc.boutons().length, 0);
  });

  test("prêt : une phrase le dit et le parcours continue, sans geste de plus", async () => {
    const bloc = monter(async () => PRET_STATE);
    await repos();
    assert.equal(bloc.racine.dataset.etat, "pret");
    assert.equal(bloc.phrase(), PRET("chef/site"));
    assert.equal(bloc.boutons().length, 0);
    assert.equal(bloc.suites(), 1);
  });

  test("pas prêt : la phrase nomme exactement ce qui manque, un seul bouton, et pas de suite", async () => {
    const cas: Array<[StateDuRepository, string]> = [
      [{ ready: false, missingBindings: ["Branche d'intégration"], missingLabels: [] }, "its bindings are missing"],
      [{ ready: false, missingBindings: [], missingLabels: ["fire", "ready"] }, "its labels are missing"],
      [{ ready: false, missingBindings: true, missingLabels: true }, "its bindings and labels are missing"],
    ];
    for (const [state, manque] of cas) {
      const bloc = monter(async () => state);
      await repos();
      assert.equal(bloc.racine.dataset.etat, "a-installer");
      assert.equal(bloc.phrase(), `chef/site is not set up for brigade: ${manque}.`);
      assert.deepEqual(bloc.boutons().map((button) => button.textContent), [PREPARER]);
      assert.equal(bloc.suites(), 0);
      assert.equal(bloc.racine.textContent.includes("/brigade:init"), false);
      assert.equal(bloc.racine.textContent.includes("init"), false);
    }
  });

  test("les noms qui manquent passent au survol, pas dans la phrase", async () => {
    const bloc = monter(async () => ({ ready: false, missingBindings: [], missingLabels: ["fire", "ready"] }));
    await repos();
    const aide = bloc.racine.dessous("button").find((button) => button.className === "aide");
    assert.equal(aide?.ariaLabel, "missing labels: fire, ready");
    assert.equal(bloc.phrase().includes("fire"), false);
  });

  test("le bouton : la préparation en cours, puis la phrase du succès, et le parcours continue", async () => {
    const preparation = queued<StateDuRepository>();
    const bloc = monter(async () => ({ ready: false, missingBindings: true, missingLabels: false }), () => preparation.promesse);
    await repos();
    const clic = bloc.cliquer();
    assert.equal(bloc.racine.dataset.etat, "en-cours");
    assert.equal(bloc.phrase(), EN_COURS("chef/site"));
    assert.equal(bloc.boutons().length, 0);
    assert.deepEqual(bloc.installes, ["chef/site"]);
    preparation.tenir(PRET_STATE);
    await clic;
    await repos();
    assert.equal(bloc.racine.dataset.etat, "pret");
    assert.equal(bloc.phrase(), PREPARE("chef/site"));
    assert.equal(bloc.suites(), 1);
  });

  test("la préparation échoue : une phrase, la raison au survol, et « try again » la relance", async () => {
    let essais = 0;
    const bloc = monter(
      async () => ({ ready: false, missingBindings: false, missingLabels: true }),
      async () => {
        essais++;
        if (essais === 1) throw new Error("GitHub refused to create the label fire.");
        return PRET_STATE;
      },
    );
    await repos();
    await bloc.cliquer();
    assert.equal(bloc.racine.dataset.etat, "echec");
    assert.equal(bloc.phrase(), FAILURE("chef/site"));
    assert.deepEqual(bloc.boutons().map((button) => button.textContent), [REESSAYER]);
    assert.equal(bloc.racine.dessous("button").find((button) => button.className === "aide")?.ariaLabel, "GitHub refused to create the label fire.");
    assert.equal(bloc.suites(), 0);
    await bloc.cliquer();
    assert.equal(essais, 2);
    assert.equal(bloc.racine.dataset.etat, "pret");
    assert.equal(bloc.suites(), 1);
  });

  test("une préparation qui rend encore un manque le redit, avec son bouton", async () => {
    const bloc = monter(async () => ({ ready: false, missingBindings: true, missingLabels: true }), async () => ({ ready: false, missingBindings: false, missingLabels: ["fire"] }));
    await repos();
    await bloc.cliquer();
    assert.equal(bloc.racine.dataset.etat, "a-installer");
    assert.equal(bloc.phrase(), manqueDit("chef/site", { ready: false, missingLabels: ["fire"] }));
    assert.equal(bloc.suites(), 0);
  });

  test("la vérification elle-même échoue : une phrase, et « try again » vérifie de nouveau", async () => {
    let lectures = 0;
    const bloc = monter(async () => {
      lectures++;
      if (lectures === 1) throw new Error("gh: HTTP 502");
      return PRET_STATE;
    });
    await repos();
    assert.equal(bloc.racine.dataset.etat, "echec");
    assert.equal(bloc.phrase(), ILLISIBLE("chef/site"));
    assert.equal(bloc.phrase().includes("502"), false);
    await bloc.cliquer();
    assert.equal(lectures, 2);
    assert.equal(bloc.suites(), 1);
  });
});

describe("l'étape « projet » vérifie le dépôt choisi avant de l'ajouter", () => {
  function step(verifier: (repository: string) => Promise<StateDuRepository>, installer: (repository: string) => Promise<StateDuRepository> = async () => PRET_STATE) {
    const ajoutes: string[] = [];
    let suites = 0;
    const verifies: string[] = [];
    const racine = poserStepProject(doc, {
      depots: [{ depot: "chef/site", base: "trunk" }, { depot: "chef/autre", base: "main" }],
      resoudre: async (repository) => ({ depot: repository, base: "main" }),
      ajouter: async ({ depot: repository }) => void ajoutes.push(repository),
      suivante: () => void suites++,
      verifier: (repository) => (verifies.push(repository), verifier(repository)),
      installer,
    }) as Faux;
    const error = () => [...racine.descendants()].find((element) => element.className === "erreur")?.textContent ?? "";
    const choisir = async (name = "chef/site") => {
      const line = [...racine.descendants()].find((element) => element.dataset.depot === name)!;
      await Promise.all(line.dessous("button")[0]!.declencher("click"));
      await repos();
    };
    const bloc = () => [...racine.descendants()].find((element) => element.className === "installation-du-depot");
    return { racine, choisir, bloc, erreur: error, ajoutes, verifies, suites: () => suites };
  }

  test("un dépôt prêt : vérifié, dit prêt, ajouté et la suite, comme avant", async () => {
    const vue = step(async () => PRET_STATE);
    await vue.choisir();
    await repos();
    assert.deepEqual(vue.verifies, ["chef/site"]);
    assert.equal(vue.bloc()?.dataset.etat, "pret");
    assert.deepEqual(vue.ajoutes, ["chef/site"]);
    assert.equal(vue.suites(), 1);
  });

  test("un dépôt pas prêt : rien n'est ajouté avant que le chef le prépare, puis l'ajout et la suite", async () => {
    const vue = step(async () => ({ ready: false, missingBindings: true, missingLabels: true }));
    await vue.choisir();
    assert.equal(vue.bloc()?.dataset.etat, "a-installer");
    assert.deepEqual(vue.ajoutes, []);
    assert.equal(vue.racine.textContent.includes("/brigade:init"), false);
    const button = vue.bloc()!.dessous("button").find((un) => un.textContent === PREPARER)!;
    await Promise.all(button.declencher("click"));
    await repos();
    await repos();
    assert.equal(vue.bloc()?.dataset.etat, "pret");
    assert.deepEqual(vue.ajoutes, ["chef/site"]);
    assert.equal(vue.suites(), 1);
  });

  test("un autre dépôt choisi pendant la vérification prend sa place", async () => {
    const read = queued<StateDuRepository>();
    const vue = step((repository) => (repository === "chef/site" ? read.promesse : Promise.resolve(PRET_STATE)));
    await vue.choisir();
    await vue.choisir("chef/autre");
    await repos();
    read.tenir(PRET_STATE);
    await repos();
    assert.deepEqual(vue.verifies, ["chef/site", "chef/autre"]);
    assert.deepEqual(vue.ajoutes, ["chef/autre"]);
  });

  test("pendant une préparation, un autre dépôt choisi attend : une phrase le dit, rien n'est vérifié", async () => {
    const preparation = queued<StateDuRepository>();
    const vue = step(async () => ({ ready: false, missingBindings: true, missingLabels: false }), () => preparation.promesse);
    await vue.choisir();
    const button = vue.bloc()!.dessous("button").find((un) => un.textContent === PREPARER)!;
    void Promise.all(button.declencher("click"));
    await repos();
    assert.equal(vue.bloc()?.dataset.etat, "en-cours");
    await vue.choisir("chef/autre");
    assert.equal(vue.erreur(), "chef/site is being set up.");
    assert.deepEqual(vue.verifies, ["chef/site"]);
    preparation.tenir(PRET_STATE);
    await repos();
    await repos();
    assert.deepEqual(vue.ajoutes, ["chef/site"]);
  });
});
