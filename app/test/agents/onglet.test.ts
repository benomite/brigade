// L'onglet Agents de la page d'un projet (#4224, épique #4117). La vue est jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts) ; l'API des agents est un faux de son contrat (faux-api.ts), posé sur `source.demander`
// (app/src/vue/agents/source.js), par où la vue la lit et l'écrit.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { source } from "../../src/vue/agents/source.js";
import { type Faux, FauxStockage, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";
import { AGENTS, champ, fausseApi, GESTES, QUI } from "./faux-api.ts";

const A = "2026-11-25T12:04:12.000Z";
const VRAIE = source.demander;
afterEach(() => {
  source.demander = VRAIE;
});

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'espace de parade, ses faits lus : il s'ouvre sur Rail.
async function ouvrir(plus: Partial<Reponses> = {}, stockage?: FauxStockage): Promise<Jouee> {
  const faits = { etat: "ouverte", lu: "2026-11-25T12:04:11.000Z", dernierTick: "2026-11-25T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...plus } as never, { stockage });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
const menu = (vue: Jouee) => vue.element("onglets-du-projet").children;
const ongletNomme = (vue: Jouee, titre: string) => menu(vue).find((onglet) => onglet.textContent === titre) ?? assert.fail(`pas d'onglet « ${titre} »`);
async function surAgents(vue: Jouee): Promise<void> {
  ongletNomme(vue, "Agents").click();
  await repos();
  await repos();
}
const rail = (vue: Jouee) => vue.element("rail");
const cartes = (vue: Jouee) => rail(vue).dessous("article").filter(({ className }) => className === "carte-d-agent");
const carte = (vue: Jouee, id: string) => cartes(vue).find(({ dataset }) => dataset.agent === id) ?? assert.fail(`pas de carte ${id}`);
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter(({ className }) => className.split(" ").includes(classe));
const rangee = (racine: Faux, cle: string) => [...racine.descendants()].find(({ dataset, className }) => dataset.cle === cle && className.split(" ").includes("reglage")) ?? assert.fail(`pas de réglage ${cle}`);
const nomDe = (vue: Jouee, id: string) => carte(vue, id).dessous("button").find(({ className }) => className === "nom-de-l-agent") ?? assert.fail(`pas de nom pour ${id}`);
async function changer(controle: Faux, valeur: string): Promise<void> {
  controle.value = valeur;
  controle.declencher("input");
  controle.declencher("change");
  await repos();
  await repos();
}

describe("l'onglet Agents, à côté de Rail, Stations et Settings", () => {
  test("le menu a Agents après Stations ; un clic le montre, une carte par agent que GET /api/agents rend", async () => {
    const { demandes } = fausseApi();
    const vue = await ouvrir();
    assert.deepEqual(
      menu(vue).map(({ textContent }) => textContent),
      ["Rail", "Stations", "Agents", "Settings"],
    );
    await surAgents(vue);
    assert.equal(ongletNomme(vue, "Agents").ariaSelected, "true");
    assert.equal(ongletNomme(vue, "Rail").ariaSelected, "false");
    assert.equal(rail(vue).dataset.onglet, "agents");
    assert.deepEqual(
      cartes(vue).map(({ dataset }) => dataset.agent),
      AGENTS.map(({ id }) => id),
    );
    assert.deepEqual(demandes[0], ["GET /api/agents", "parade", undefined]);
    assert.equal(rail(vue).ariaLabel, "The agents");
    ongletNomme(vue, "Stations").click();
    await repos();
    assert.equal(rail(vue).dataset.onglet, "stations");
    assert.equal(rail(vue).ariaLabel, "The stations");
    assert.equal(cartes(vue).length, 0, "Stations ne montre pas les agents");
    ongletNomme(vue, "Rail").click();
    await repos();
    assert.equal(rail(vue).dataset.onglet, "rail");
    assert.equal(rail(vue).ariaLabel, "The rail");
    await surAgents(vue);
    assert.equal(cartes(vue).length, AGENTS.length, "rouvert, l'onglet repose ses cartes");
  });

  test("l'app rouvre le projet sur Agents quand le chef l'y a laissé", async () => {
    fausseApi();
    const stockage = new FauxStockage();
    const vue = await ouvrir({}, stockage);
    await surAgents(vue);
    const rouverte = await ouvrir({}, stockage);
    await repos();
    assert.deepEqual(
      menu(rouverte)
        .filter(({ ariaSelected }) => ariaSelected === "true")
        .map(({ textContent }) => textContent),
      ["Agents"],
    );
    assert.equal(rail(rouverte).dataset.onglet, "agents");
  });

  test("chaque carte dit le nom, le rôle en une phrase, l'état, la prochaine passe et chaque chiffre — son libellé, sa valeur et son sens", async () => {
    fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    for (const agent of AGENTS) {
      const une = carte(vue, agent.id);
      assert.equal(nomDe(vue, agent.id).textContent, agent.name);
      assert.equal(parClasse(une, "role")[0]?.textContent, agent.role);
      const chiffres = parClasse(une, "chiffre");
      assert.equal(chiffres.length, agent.figures.length, agent.id);
      for (const [i, chiffre] of agent.figures.entries()) {
        const pose = chiffres[i] ?? assert.fail("pas de chiffre");
        assert.equal(parClasse(pose, "libelle")[0]?.textContent, chiffre.label);
        assert.equal(parClasse(pose, "valeur")[0]?.textContent, String(chiffre.value));
        assert.equal(parClasse(pose, "sens")[0]?.textContent, chiffre.meaning);
      }
    }
    assert.equal(parClasse(carte(vue, "manager"), "prochaine")[0]?.textContent, "next run: Nov 25, 16:30 UTC");
    assert.equal(parClasse(carte(vue, "cook"), "prochaine")[0]?.textContent, "next run: not known");
  });

  test("un agent au travail dit « working on #N » ; un agent cassé est marqué autrement qu'un agent au repos", async () => {
    fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    const etat = (id: string) => parClasse(carte(vue, id), "etat-de-l-agent")[0] ?? assert.fail(`pas d'état pour ${id}`);
    assert.equal(etat("manager").textContent, "idle");
    assert.equal(etat("cook").textContent, "working on #4224");
    assert.equal(etat("closer").textContent, "broken");
    const ton = (id: string) => etat(id).dessous("span").find(({ className }) => className === "pastille")?.dataset.ton;
    assert.equal(ton("manager"), "gris");
    assert.equal(ton("closer"), "rouge");
    assert.equal(ton("cook"), "vert");
    assert.equal(carte(vue, "closer").dataset.etat, "broken");
    assert.equal(carte(vue, "manager").dataset.etat, "idle");
  });

  test("un agent au travail sur aucun ticket dit « working », sans numéro", async () => {
    fausseApi({ agents: [{ ...(AGENTS[1] as (typeof AGENTS)[number]), workingOn: null }] });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.equal(parClasse(carte(vue, "cook"), "etat-de-l-agent")[0]?.textContent, "working");
  });
});

describe("les réglages de chaque agent, sur sa carte", () => {
  test("un réglage qui se change : un changement valide part en PUT, et la rangée montre la nouvelle valeur, quand et par qui", async () => {
    const { demandes } = fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    const autonomie = () => rangee(carte(vue, "manager"), "autonomy");
    assert.match(autonomie().textContent, /propose/);
    assert.match(autonomie().textContent, /from its default/);
    const liste = autonomie().dessous("select")[0] ?? assert.fail("pas de liste");
    assert.deepEqual(
      liste.dessous("option").map(({ value }) => value),
      ["observe", "propose", "act"],
    );
    await changer(liste, "act");
    assert.deepEqual(demandes.at(-1), ["PUT /api/agents/manager/settings", "parade", { key: "autonomy", value: "act" }]);
    assert.match(autonomie().textContent, /act/);
    assert.match(autonomie().textContent, new RegExp(`changed Nov 25, 14:00 UTC by ${QUI}`));
    assert.equal(parClasse(autonomie(), "refus").length, 0);
  });

  test("le modèle se choisit parmi ceux de l'app ; un champ chiffré envoie un nombre ; un interrupteur, son état", async () => {
    const { demandes } = fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    const modele = rangee(carte(vue, "manager"), "model");
    assert.match(modele.textContent, /from the box's variable/);
    const liste = modele.dessous("select")[0] ?? assert.fail("pas de liste");
    assert.deepEqual(
      liste.dessous("option").map(({ value }) => value),
      [...MODELES],
    );
    await changer(liste, "sonnet");
    assert.deepEqual(demandes.at(-1)?.[2], { key: "model", value: "sonnet" });

    const champTape = rangee(carte(vue, "closer"), "driftLostTokens").dessous("input")[0] ?? assert.fail("pas de champ");
    assert.equal(champTape.type, "number");
    assert.equal(champTape.value, "50000");
    await changer(champTape, "80000");
    assert.deepEqual(demandes.at(-1), ["PUT /api/agents/closer/settings", "parade", { key: "driftLostTokens", value: 80000 }]);
    assert.match(rangee(carte(vue, "closer"), "driftLostTokens").textContent, /80000/);

    const bascule = rangee(carte(vue, "closer"), "pause").dessous("button").find(({ role }) => role === "switch") ?? assert.fail("pas d'interrupteur");
    assert.equal(bascule.ariaChecked, "false");
    bascule.click();
    await repos();
    await repos();
    assert.deepEqual(demandes.at(-1)?.[2], { key: "pause", value: true });
    assert.match(rangee(carte(vue, "closer"), "pause").textContent, /on/);
  });

  test("un champ chiffré tapé en lettres part tel quel : le runtime le refuse en disant pourquoi", async () => {
    const { demandes } = fausseApi({ refuser: (_id, key, value) => (typeof value === "number" ? null : `${key} must be a whole number of 1 or more, not ${JSON.stringify(value)}`) });
    const vue = await ouvrir();
    await surAgents(vue);
    await changer(rangee(carte(vue, "closer"), "driftLostTokens").dessous("input")[0] ?? assert.fail("pas de champ"), "beaucoup");
    assert.deepEqual(demandes.at(-1)?.[2], { key: "driftLostTokens", value: "beaucoup" });
    assert.match(rangee(carte(vue, "closer"), "driftLostTokens").textContent, /must be a whole number/);
  });

  test("un changement refusé (400) dit sa raison et garde l'ancienne valeur", async () => {
    fausseApi({ refuser: (id, key) => (id === "manager" && key === "autonomy" ? "manager's autonomy is held by the chef this week" : null) });
    const vue = await ouvrir();
    await surAgents(vue);
    await changer(rangee(carte(vue, "manager"), "autonomy").dessous("select")[0] ?? assert.fail("pas de liste"), "act");
    const apres = rangee(carte(vue, "manager"), "autonomy");
    const refus = parClasse(apres, "refus")[0] ?? assert.fail("pas de refus");
    assert.match(refus.textContent, /manager's autonomy is held by the chef this week/);
    assert.equal(refus.role, "alert");
    assert.equal((apres.dessous("select")[0] ?? assert.fail("pas de liste")).value, "propose", "l'ancienne valeur reste choisie");
    assert.match(apres.textContent, /propose/);
    assert.doesNotMatch(apres.textContent, /changed .* by /);
  });

  test("un réglage qui ne se change pas de l'app dit où il vit, sans champ", async () => {
    fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    for (const [id, cle, vit] of [
      ["manager", "pause", "the project switch, one for the whole project"],
      ["cook", "places", "each station's configuration, on its own machine"],
    ] as const) {
      const fixe = rangee(carte(vue, id), cle);
      assert.match(fixe.textContent, new RegExp(`lives in ${vit}`));
      assert.deepEqual([...fixe.dessous("input"), ...fixe.dessous("select"), ...fixe.dessous("button")], [], `${id}/${cle} : aucun champ`);
    }
    assert.ok(rangee(carte(vue, "manager"), "autonomy").dessous("select").length === 1, "l'éditable a son champ");
  });

  test("les réglages que la liste porte se montrent sans autre lecture ; les autres se lisent par leur route", async () => {
    const { demandes } = fausseApi({ avecReglages: ["manager"] });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.ok(rangee(carte(vue, "manager"), "autonomy"));
    assert.ok(rangee(carte(vue, "closer"), "pause"));
    const lues = demandes.map(([demande]) => demande).filter((demande) => demande.endsWith("/settings"));
    assert.deepEqual(lues.toSorted(), ["GET /api/agents/closer/settings", "GET /api/agents/cook/settings"]);
  });
});

describe("les gestes d'un agent, d'un clic sur lui", () => {
  test("un clic sur l'agent ouvre ses derniers gestes, chacun avec sa raison ; un autre clic les referme", async () => {
    const { demandes } = fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    assert.equal(parClasse(carte(vue, "manager"), "gestes-de-l-agent").length, 0, "fermés d'abord");
    nomDe(vue, "manager").click();
    await repos();
    await repos();
    assert.equal(nomDe(vue, "manager").ariaExpanded, "true");
    assert.deepEqual(demandes.at(-1), ["GET /api/agents/manager/gestures", "parade", undefined]);
    const lignes = (parClasse(carte(vue, "manager"), "gestes-de-l-agent")[0] ?? assert.fail("pas de gestes")).dessous("li");
    assert.equal(lignes.length, 2);
    for (const [i, geste] of (GESTES.manager ?? []).entries()) {
      const ligne = lignes[i] ?? assert.fail("pas de ligne");
      assert.match(ligne.textContent, new RegExp(geste.summary));
      assert.equal(parClasse(ligne, "raison")[0]?.textContent, geste.reason);
    }
    assert.match(lignes[0]?.textContent ?? "", /^Nov 25, 12:10 UTC · split epic #4117 · #4117/);
    nomDe(vue, "manager").click();
    await repos();
    assert.equal(parClasse(carte(vue, "manager"), "gestes-de-l-agent").length, 0, "refermés");
  });

  test("un agent sans geste le dit", async () => {
    fausseApi();
    const vue = await ouvrir();
    await surAgents(vue);
    nomDe(vue, "cook").click();
    await repos();
    await repos();
    const gestes = parClasse(carte(vue, "cook"), "gestes-de-l-agent")[0] ?? assert.fail("pas de gestes");
    assert.match(gestes.textContent, /No gesture yet\./);
    assert.equal(gestes.dessous("li").length, 0);
  });
});

describe("ce qui ne se lit pas se dit, sans rien inventer", () => {
  test("sans l'API au pont, l'onglet dit que les agents ne sont pas atteints", async () => {
    const vue = await ouvrir();
    await surAgents(vue);
    assert.match(rail(vue).textContent, /The agents not reached\./);
    assert.equal(cartes(vue).length, 0);
  });

  test("la vraie source passe la demande au pont, et rend sa réponse", async () => {
    const recues: unknown[][] = [];
    const vue = await ouvrir({
      apiDesAgents: async (demande: string, projet: string) => {
        recues.push([demande, projet]);
        return { statut: 200, corps: AGENTS.slice(0, 1) };
      },
    } as Partial<Reponses>);
    await surAgents(vue);
    assert.deepEqual(recues[0], ["GET /api/agents", "parade"]);
    assert.equal(cartes(vue).length, 1);
  });

  test("une lecture qui échoue ou qui n'a pas la forme du contrat le dit en une ligne ; une réponse vide dit qu'il n'y a aucun agent", async () => {
    for (const [reponse, attendu] of [
      [{ statut: 500, corps: { reason: "the registry is gone" } }, /The agents not reached\./],
      [{ statut: 200, corps: [{ id: "manager" }] }, /the agents' reading is not readable/],
      [{ statut: 200, corps: [{ ...AGENTS[0], state: "asleep" }] }, /the agents' reading is not readable/],
      [{ statut: 200, corps: [{ ...AGENTS[0], figures: [{ label: "x", value: 1 }] }] }, /the agents' reading is not readable/],
      [{ statut: 200, corps: [] }, /No agent yet\./],
    ] as const) {
      Object.assign(source, { demander: async () => reponse });
      const vue = await ouvrir();
      await surAgents(vue);
      assert.match(rail(vue).textContent, attendu, JSON.stringify(reponse));
      assert.equal(cartes(vue).length, 0);
    }
    Object.assign(source, {
      demander: async () => {
        throw new Error("the box did not answer");
      },
    });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.match(rail(vue).textContent, /The agents not reached\./);
  });

  test("des réglages ou des gestes qui ne se lisent pas le disent sur leur carte ; un PUT qui échoue ne change rien", async () => {
    fausseApi();
    const faux = source.demander;
    Object.assign(source, {
      demander: async (demande: string, projet: string, corps?: { key: string; value: unknown }) => {
        if (demande === "GET /api/agents/cook/settings") return { statut: 500, corps: { reason: "the settings file cannot be read" } };
        if (demande === "GET /api/agents/closer/gestures") return { statut: 500, corps: { reason: "the gesture log cannot be read" } };
        if (demande.startsWith("PUT")) throw new Error("the box did not answer");
        return faux(demande, projet, corps);
      },
    });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.match(parClasse(carte(vue, "cook"), "reglages-de-l-agent")[0]?.textContent ?? "", /its settings not read/);
    nomDe(vue, "closer").click();
    await repos();
    await repos();
    assert.match(parClasse(carte(vue, "closer"), "gestes-de-l-agent")[0]?.textContent ?? "", /its gestures not read/);
    await changer(rangee(carte(vue, "manager"), "autonomy").dessous("select")[0] ?? assert.fail("pas de liste"), "act");
    const apres = rangee(carte(vue, "manager"), "autonomy");
    assert.match(apres.textContent, /not changed/);
    assert.equal((apres.dessous("select")[0] ?? assert.fail("pas de liste")).value, "propose");
  });

  test("« changed … by … » ne se dit que quand le runtime donne et le moment et l'auteur ; sinon, d'où vient la valeur", async () => {
    fausseApi({
      reglages: {
        manager: [champ("model", { label: "Model", kind: "model", value: "opus", source: "app", changedAt: "2026-11-20T09:00:00.000Z", changedBy: null }), champ("effort", { label: "Effort", kind: "effort", value: "high", source: "app", changedAt: "2026-11-20T09:00:00.000Z", changedBy: "chef" })],
        cook: [],
        closer: [],
      },
    });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.match(rangee(carte(vue, "manager"), "model").textContent, /from the app/);
    assert.doesNotMatch(rangee(carte(vue, "manager"), "model").textContent, /changed/);
    assert.match(rangee(carte(vue, "manager"), "effort").textContent, /changed Nov 20, 09:00 UTC by chef/);
  });

  test("un réglage rendu sans sa forme ne se montre pas comme une valeur", async () => {
    fausseApi({ reglages: { manager: [champ("model", { label: "Model", kind: "model", value: "opus" }), { key: "effort" } as never], cook: [], closer: [] } });
    const vue = await ouvrir();
    await surAgents(vue);
    assert.match(parClasse(carte(vue, "manager"), "reglages-de-l-agent")[0]?.textContent ?? "", /this setting is not readable/);
    assert.ok(rangee(carte(vue, "manager"), "model"));
  });
});
