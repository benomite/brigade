// La vérification du dépôt choisi dans le parcours d'ajout (ticket 2627) : ses quatre états — prêt, pas prêt, en cours,
// échoué —, chacun dit en une phrase, un seul bouton quand un geste est attendu, et jamais la commande d'init du plugin.
// Puis l'étape « projet », qui vérifie le dépôt choisi avant de l'ajouter.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  FAILURE,
  IN_PROGRESS,
  type StateOfRepository,
  UNREADABLE,
  missingSays,
  PREPARE,
  PREPARE_LABEL,
  READY,
  setInstallationOfRepository,
  RETRY,
  VERIFICATION,
} from "../../../src/vue/addition-project/installation-of-repository.js";
import { setStepProject } from "../../../src/vue/journey-project/step-project.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const repos = () => new Promise((resolve) => setImmediate(resolve));
const READY_STATE: StateOfRepository = { ready: true, missingBindings: [], missingLabels: [] };

// Une promesse que le test tient en main : il la résout ou la rejette quand il veut.
function queued<T>() {
  let hold!: (value: T) => void;
  let release!: (error: Error) => void;
  const promise = new Promise<T>((yes, not) => ((hold = yes), (release = not)));
  return { promesse: promise, tenir: hold, lacher: release };
}

function mount(check: (repository: string) => Promise<StateOfRepository>, installer: (repository: string) => Promise<StateOfRepository> = async () => READY_STATE) {
  let suites = 0;
  const installed: string[] = [];
  const root = setInstallationOfRepository(doc, {
    depot: "chef/site",
    verifier: check,
    installer: (repository) => (installed.push(repository), installer(repository)),
    continuer: () => void suites++,
  }) as Fake;
  const buttons = () => root.dessous("button").filter((button) => button.className !== "aide");
  const sentence = () => root.dessous("p")[0]?.dessous("span")[0]?.textContent ?? "";
  const click = async () => {
    await Promise.all(buttons()[0]!.declencher("click"));
    await repos();
  };
  return { racine: root, boutons: buttons, phrase: sentence, cliquer: click, installes: installed, suites: () => suites };
}

describe("la vérification du dépôt choisi", () => {
  test("pendant la vérification : une phrase, aucun bouton", () => {
    const block = mount(() => new Promise(() => {}));
    assert.equal(block.racine.dataset.etat, "verification");
    assert.equal(block.phrase(), VERIFICATION("chef/site"));
    assert.equal(block.boutons().length, 0);
  });

  test("prêt : une phrase le dit et le parcours continue, sans geste de plus", async () => {
    const block = mount(async () => READY_STATE);
    await repos();
    assert.equal(block.racine.dataset.etat, "pret");
    assert.equal(block.phrase(), READY("chef/site"));
    assert.equal(block.boutons().length, 0);
    assert.equal(block.suites(), 1);
  });

  test("pas prêt : la phrase nomme exactement ce qui manque, un seul bouton, et pas de suite", async () => {
    const theCase: Array<[StateOfRepository, string]> = [
      [{ ready: false, missingBindings: ["Branche d'intégration"], missingLabels: [] }, "its bindings are missing"],
      [{ ready: false, missingBindings: [], missingLabels: ["fire", "ready"] }, "its labels are missing"],
      [{ ready: false, missingBindings: true, missingLabels: true }, "its bindings and labels are missing"],
    ];
    for (const [state, lack] of theCase) {
      const block = mount(async () => state);
      await repos();
      assert.equal(block.racine.dataset.etat, "a-installer");
      assert.equal(block.phrase(), `chef/site is not set up for brigade: ${lack}.`);
      assert.deepEqual(block.boutons().map((button) => button.textContent), [PREPARE_LABEL]);
      assert.equal(block.suites(), 0);
      assert.equal(block.racine.textContent.includes("/brigade:"), false);
      assert.equal(block.racine.textContent.includes("init"), false);
    }
  });

  test("les noms qui manquent passent au survol, pas dans la phrase", async () => {
    const block = mount(async () => ({ ready: false, missingBindings: [], missingLabels: ["fire", "ready"] }));
    await repos();
    const help = block.racine.dessous("button").find((button) => button.className === "aide");
    assert.equal(help?.ariaLabel, "missing labels: fire, ready");
    assert.equal(block.phrase().includes("fire"), false);
  });

  test("le bouton : la préparation en cours, puis la phrase du succès, et le parcours continue", async () => {
    const preparation = queued<StateOfRepository>();
    const block = mount(async () => ({ ready: false, missingBindings: true, missingLabels: false }), () => preparation.promesse);
    await repos();
    const click = block.cliquer();
    assert.equal(block.racine.dataset.etat, "en-cours");
    assert.equal(block.phrase(), IN_PROGRESS("chef/site"));
    assert.equal(block.boutons().length, 0);
    assert.deepEqual(block.installes, ["chef/site"]);
    preparation.tenir(READY_STATE);
    await click;
    await repos();
    assert.equal(block.racine.dataset.etat, "pret");
    assert.equal(block.phrase(), PREPARE("chef/site"));
    assert.equal(block.suites(), 1);
  });

  test("la préparation échoue : une phrase, la raison au survol, et « try again » la relance", async () => {
    let trials = 0;
    const block = mount(
      async () => ({ ready: false, missingBindings: false, missingLabels: true }),
      async () => {
        trials++;
        if (trials === 1) throw new Error("GitHub refused to create the label fire.");
        return READY_STATE;
      },
    );
    await repos();
    await block.cliquer();
    assert.equal(block.racine.dataset.etat, "echec");
    assert.equal(block.phrase(), FAILURE("chef/site"));
    assert.deepEqual(block.boutons().map((button) => button.textContent), [RETRY]);
    assert.equal(block.racine.dessous("button").find((button) => button.className === "aide")?.ariaLabel, "GitHub refused to create the label fire.");
    assert.equal(block.suites(), 0);
    await block.cliquer();
    assert.equal(trials, 2);
    assert.equal(block.racine.dataset.etat, "pret");
    assert.equal(block.suites(), 1);
  });

  test("une préparation qui rend encore un manque le redit, avec son bouton", async () => {
    const block = mount(async () => ({ ready: false, missingBindings: true, missingLabels: true }), async () => ({ ready: false, missingBindings: false, missingLabels: ["fire"] }));
    await repos();
    await block.cliquer();
    assert.equal(block.racine.dataset.etat, "a-installer");
    assert.equal(block.phrase(), missingSays("chef/site", { ready: false, missingLabels: ["fire"] }));
    assert.equal(block.suites(), 0);
  });

  test("la vérification elle-même échoue : une phrase, et « try again » vérifie de nouveau", async () => {
    let readings = 0;
    const block = mount(async () => {
      readings++;
      if (readings === 1) throw new Error("gh: HTTP 502");
      return READY_STATE;
    });
    await repos();
    assert.equal(block.racine.dataset.etat, "echec");
    assert.equal(block.phrase(), UNREADABLE("chef/site"));
    assert.equal(block.phrase().includes("502"), false);
    await block.cliquer();
    assert.equal(readings, 2);
    assert.equal(block.suites(), 1);
  });
});

describe("l'étape « projet » vérifie le dépôt choisi avant de l'ajouter", () => {
  function step(check: (repository: string) => Promise<StateOfRepository>, installer: (repository: string) => Promise<StateOfRepository> = async () => READY_STATE) {
    const added: string[] = [];
    let suites = 0;
    const checked: string[] = [];
    const root = setStepProject(doc, {
      depots: [{ depot: "chef/site", base: "trunk" }, { depot: "chef/autre", base: "main" }],
      resoudre: async (repository) => ({ depot: repository, base: "main" }),
      ajouter: async ({ depot: repository }) => void added.push(repository),
      suivante: () => void suites++,
      verifier: (repository) => (checked.push(repository), check(repository)),
      installer,
    }) as Fake;
    const error = () => [...root.descendants()].find((element) => element.className === "erreur")?.textContent ?? "";
    const choose = async (name = "chef/site") => {
      const line = [...root.descendants()].find((element) => element.dataset.depot === name)!;
      await Promise.all(line.dessous("button")[0]!.declencher("click"));
      await repos();
    };
    const block = () => [...root.descendants()].find((element) => element.className === "installation-du-depot");
    return { racine: root, choisir: choose, bloc: block, erreur: error, ajoutes: added, verifies: checked, suites: () => suites };
  }

  test("un dépôt prêt : vérifié, dit prêt, ajouté et la suite, comme avant", async () => {
    const vue = step(async () => READY_STATE);
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
    assert.equal(vue.racine.textContent.includes("/brigade:"), false);
    const button = vue.bloc()!.dessous("button").find((oneOf) => oneOf.textContent === PREPARE_LABEL)!;
    await Promise.all(button.declencher("click"));
    await repos();
    await repos();
    assert.equal(vue.bloc()?.dataset.etat, "pret");
    assert.deepEqual(vue.ajoutes, ["chef/site"]);
    assert.equal(vue.suites(), 1);
  });

  test("un autre dépôt choisi pendant la vérification prend sa place", async () => {
    const reading = queued<StateOfRepository>();
    const vue = step((repository) => (repository === "chef/site" ? reading.promesse : Promise.resolve(READY_STATE)));
    await vue.choisir();
    await vue.choisir("chef/autre");
    await repos();
    reading.tenir(READY_STATE);
    await repos();
    assert.deepEqual(vue.verifies, ["chef/site", "chef/autre"]);
    assert.deepEqual(vue.ajoutes, ["chef/autre"]);
  });

  test("pendant une préparation, un autre dépôt choisi attend : une phrase le dit, rien n'est vérifié", async () => {
    const preparation = queued<StateOfRepository>();
    const vue = step(async () => ({ ready: false, missingBindings: true, missingLabels: false }), () => preparation.promesse);
    await vue.choisir();
    const button = vue.bloc()!.dessous("button").find((oneOf) => oneOf.textContent === PREPARE_LABEL)!;
    void Promise.all(button.declencher("click"));
    await repos();
    assert.equal(vue.bloc()?.dataset.etat, "en-cours");
    await vue.choisir("chef/autre");
    assert.equal(vue.erreur(), "chef/site is being set up.");
    assert.deepEqual(vue.verifies, ["chef/site"]);
    preparation.tenir(READY_STATE);
    await repos();
    await repos();
    assert.deepEqual(vue.ajoutes, ["chef/site"]);
  });
});
