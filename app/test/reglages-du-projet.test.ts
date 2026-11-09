// Les réglages du projet sur sa page (#1309, épique 1301) : sa branche d'intégration, ses calibrages par défaut, son
// plafond de calibrage et ceux de son closer (#1685), lus par `setting` là où sa cuisine tourne, chacun avec de quoi le
// changer. Chacun est la rangée de réglage (#2920) : sans bouton, le `change` de son champ ouvre une PR sur le dépôt du
// projet — rien ne se pose sur la box —, la rangée le dit d'avance, puis la PR sous elle, avec de quoi l'ouvrir ; la
// valeur en vigueur ne change pas tant qu'elle n'est pas mergée. Un refus du runtime se dit sous la rangée, et le champ
// revient à la valeur en vigueur. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { commandeDuReglage, lireLesReglages, PROPOSE, proposerLeReglage, reglagesVus, type LectureDesReglages, type RenduDuReglage } from "../src/reglages-du-projet.ts";
import type { Terminal } from "../src/terminaux.ts";
import { PAR_PR, PROPOSE as PROPOSE_DANS } from "../src/vue/composants/reglage/reglage.js";
import { EN_COURS, TITRE } from "../src/vue/projet/reglages.js";
import { type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const BOX: Lu = { nom: PARADE, cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
// Ce que `setting` rend, mot pour mot (runtime/src/reglage-cli.ts).
const SORTIE = JSON.stringify({
  file: ".claude/brigade/projet.json",
  inRepository: true,
  integrationBranch: { value: "main", from: "repository" },
  defaultCalibrations: { manager: { model: "opus", effort: "high", from: "repository" }, reviewer: null },
  calibrationCeiling: { model: "opus", effort: "high", from: "default" },
  closer: {
    calibration: { model: "sonnet", effort: "medium", from: "repository" },
    cooksBelow: { value: 1, from: "default" },
    maxTokens: { value: 200000, from: "repository" },
    maxRemovedLines: { value: 800, from: "station" },
  },
});
const PR = "https://github.com/benomite/parade/pull/51";
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade setting",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});

describe("ce que `setting` rend, et ce que la proposition envoie", () => {
  test("la lecture : chaque réglage, sa valeur et d'où elle vient — ce qui ne se dit pas est « not set »", () => {
    const vus = reglagesVus(`${SORTIE}\n`) ?? assert.fail("illisible");
    assert.deepEqual(
      vus.reglages.map(({ cle, nom, dit, source }) => [cle, nom, dit, source]),
      [
        ["branche", "integration branch", "main", "from the repository"],
        ["manager", "manager's default calibration", "opus / high", "from the repository"],
        ["reviewer", "reviewer's default calibration", null, "not set"],
        ["plafond", "calibration ceiling", "opus / high", "default"],
        ["closer", "closer's calibration", "sonnet / medium", "from the repository"],
        ["closer-cooks", "closer's start threshold (cooks in flight)", "1", "default"],
        ["closer-tokens", "closer's tokens cap", "200000", "from the repository"],
        ["closer-lines", "closer's removed-lines cap", "800", "set on the station"],
      ],
    );
    assert.equal(reglagesVus("not json"), null);
    // Un runtime d'avant #1685 ne dit pas le closer : ses rangées ne se posent pas.
    const { closer: _, ...sansCloser } = JSON.parse(SORTIE) as Record<string, unknown>;
    assert.deepEqual(reglagesVus(JSON.stringify(sansCloser))?.reglages.map(({ cle }) => cle), ["branche", "manager", "reviewer", "plafond"]);
  });

  test("lue là où la cuisine tourne ; un runtime d'avant la commande se dit en une ligne, son détail au survol", async () => {
    const lances: string[] = [];
    const lu = await lireLesReglages(PARADE, BOX, async (_, commande) => (lances.push(commande), rendu(SORTIE)));
    assert.deepEqual(lances, ["setting"]);
    assert.ok("vus" in lu);
    const ancien = await lireLesReglages(PARADE, BOX, async () => rendu("", 66, "brigade : « setting » n'est pas une commande du runtime — celles de cette station : status, facts\n"));
    assert.deepEqual("sans" in ancien && ancien.sans, "settings unavailable: this station's runtime does not give them yet — update it");
    assert.ok("sans" in (await lireLesReglages(PARADE, undefined, async () => rendu(SORTIE))));
  });

  test("les mots de la commande : un nom de branche, ou un modèle et un effort que le runtime connaît", () => {
    assert.deepEqual(commandeDuReglage({ cle: "plafond", modele: "sonnet", effort: "high" }), { commande: "setting ceiling sonnet high" });
    assert.deepEqual(commandeDuReglage({ cle: "manager", modele: "opus", effort: "max" }), { commande: "setting manager opus max" });
    assert.deepEqual(commandeDuReglage({ cle: "branche", valeur: " v3 " }), { commande: "setting branch v3" });
    assert.ok("refus" in commandeDuReglage({ cle: "branche", valeur: "v3; rm -rf ~" }));
    assert.ok("refus" in commandeDuReglage({ cle: "plafond", modele: "gpt", effort: "high" }));
    assert.ok("refus" in commandeDuReglage({ cle: "cooks", valeur: "4" }));
    // Le closer : son calibrage, et ses nombres en chiffres — le runtime juge s'ils sont admis.
    assert.deepEqual(commandeDuReglage({ cle: "closer", modele: "sonnet", effort: "low" }), { commande: "setting closer sonnet low" });
    assert.deepEqual(commandeDuReglage({ cle: "closer-cooks", valeur: " 2 " }), { commande: "setting closer-cooks 2" });
    assert.deepEqual(commandeDuReglage({ cle: "closer-tokens", valeur: "300000" }), { commande: "setting closer-tokens 300000" });
    assert.deepEqual(commandeDuReglage({ cle: "closer-lines", valeur: "0" }), { commande: "setting closer-lines 0" });
    for (const valeur of ["", "-1", "1.5", "1e3", "200k", "2; rm -rf ~"]) {
      assert.deepEqual(commandeDuReglage({ cle: "closer-tokens", valeur }), { refus: "nothing was sent: this value is a whole number, written in digits" }, valeur);
    }
  });

  test("la PR ouverte rend son adresse ; un refus, la phrase du runtime, sans clé du fichier ni accent grave", async () => {
    const lances: string[] = [];
    const ouverte = await proposerLeReglage(PARADE, BOX, { cle: "plafond", modele: "sonnet", effort: "high" }, async (_, commande) => {
      lances.push(commande);
      return rendu(JSON.stringify({ ok: true, pr: PR, number: 51, branch: "brigade/reglage-1a2b3c4d", settings: {} }));
    });
    assert.deepEqual(lances, ["setting ceiling sonnet high"]);
    assert.deepEqual(ouverte, { propose: PROPOSE, pr: PR, numero: 51 });

    const refusee = await proposerLeReglage(PARADE, BOX, { cle: "branche", valeur: "/home/chef/parade" }, async () =>
      rendu(JSON.stringify({ ok: false, reason: "chemin", key: "integrationBranch", message: "`integrationBranch` does not belong in the project's repository: its value is a path on a machine. A machine's paths stay in that station's settings, never in git." }), 1),
    );
    assert.ok("refus" in refusee);
    assert.equal(refusee.refus, "This value does not belong in the project's repository: its value is a path on a machine. A machine's paths stay in that station's settings, never in git.");

    const ancien = await proposerLeReglage(PARADE, BOX, { cle: "plafond", modele: "sonnet", effort: "high" }, async () => rendu("", 66, "brigade : « setting » n'est pas une commande du runtime\n"));
    assert.match("refus" in ancien ? ancien.refus : "", /cannot propose a setting yet — update it/);
    // Rien ne part d'une valeur qui ne s'écrit pas en mots, ni d'un projet sans station.
    let parti = false;
    const lancer = async () => ((parti = true), rendu(""));
    assert.ok("refus" in (await proposerLeReglage(PARADE, BOX, { cle: "plafond", modele: "gpt", effort: "high" }, lancer)));
    assert.ok("refus" in (await proposerLeReglage(PARADE, undefined, { cle: "plafond", modele: "sonnet", effort: "high" }, lancer)));
    assert.equal(parti, false);
  });
});

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Ce que le pont répond à une proposition : rien tant que le test ne le lâche pas.
type Proposition = { projet: string; choix: unknown; rendre(rendu: RenduDuReglage): void };

async function ouvrir(lecture: LectureDesReglages = { vus: reglagesVus(SORTIE) ?? assert.fail() }) {
  const propositions: Proposition[] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
    reglagesDuProjet: () => lecture,
    proposerUnReglage: (projet, choix) => new Promise<RenduDuReglage>((rendre) => propositions.push({ projet, choix, rendre })) as unknown as RenduDuReglage,
    ouvrirLaProposition: () => true,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return { vue, propositions };
}

const section = (vue: Jouee) => vue.element("reglages-du-projet").children[0] ?? assert.fail("pas de réglages du projet");
const rangee = (vue: Jouee, cle: string) => section(vue).children.find((pose) => pose.dataset.cle === cle) ?? assert.fail(`pas de rangée ${cle}`);
const valeur = (pose: Faux) => pose.dessous("p").find((p) => p.className === "valeur")?.textContent;
const dit = (pose: Faux) => pose.dessous("p").find((p) => p.className.startsWith("dit"));
const parPr = (pose: Faux) => pose.dessous("p").find((p) => p.className === "par-pr")?.textContent;
const liste = (pose: Faux, nom: "model" | "effort") => pose.dessous("select").find((select) => select.ariaLabel.endsWith(nom)) ?? assert.fail(`pas de liste ${nom}`);
// Écrire dans un champ, ou choisir dans une liste, sans le valider : seul `input` part.
function ecrire(champ: Faux, valeurChoisie: string) {
  champ.value = valeurChoisie;
  champ.declencher("input");
}
// Puis le valider — Entrée, le focus qui s'en va, un choix fait : son `change`.
function choisir(champ: Faux, valeurChoisie: string) {
  ecrire(champ, valeurChoisie);
  champ.declencher("change");
}

describe("Settings : les réglages du projet, chacun changé par une PR", () => {
  test("chaque réglage a sa valeur, d'où elle vient, et de quoi la changer", async () => {
    const { vue } = await ouvrir();
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "reglagesDuProjet").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("reglages-du-projet").hidden, false);
    assert.match(section(vue).children[0]?.textContent ?? "", new RegExp(`^${TITRE}`));
    assert.deepEqual(
      section(vue).children.slice(1).map((pose) => pose.dataset.cle),
      ["branche", "manager", "reviewer", "plafond", "closer", "closer-cooks", "closer-tokens", "closer-lines"],
    );
    assert.equal(valeur(rangee(vue, "branche")), "mainfrom the repository");
    assert.equal(rangee(vue, "branche").dessous("input")[0]?.value, "main");
    assert.equal(valeur(rangee(vue, "plafond")), "opus / highdefault");
    assert.equal(liste(rangee(vue, "plafond"), "model").value, "opus");
    assert.equal(valeur(rangee(vue, "closer")), "sonnet / mediumfrom the repository");
    assert.equal(valeur(rangee(vue, "closer-lines")), "800set on the station");
    assert.equal(rangee(vue, "closer-tokens").dessous("input")[0]?.value, "200000");
    for (const cle of ["branche", "manager", "reviewer", "plafond", "closer", "closer-cooks", "closer-tokens", "closer-lines"]) {
      // Gardé dans le dépôt : la rangée dit qu'un changement ouvre une PR, et n'a ni « propose » ni « save ».
      assert.equal(rangee(vue, cle).dataset.depot, "", cle);
      assert.equal(parPr(rangee(vue, cle)), PAR_PR, cle);
      assert.equal(rangee(vue, cle).dessous("button").length, 0, cle);
    }
    assert.equal(section(vue).dessous("button").some((bouton) => /propose|save/i.test(bouton.textContent)), false);
  });

  test("écrire sans valider ne propose rien ; valider la valeur en vigueur, ou un champ vide, non plus", async () => {
    const { vue, propositions } = await ouvrir();
    const branche = () => rangee(vue, "branche").dessous("input")[0] ?? assert.fail();
    ecrire(branche(), "develop");
    await repos();
    assert.equal(propositions.length, 0);
    choisir(branche(), " main ");
    choisir(branche(), "   ");
    await repos();
    assert.equal(propositions.length, 0);
    // Le modèle et l'effort de nouveau ceux en vigueur : rien ne change, rien ne part.
    choisir(liste(rangee(vue, "plafond"), "model"), "opus");
    await repos();
    assert.equal(propositions.length, 0);
  });

  test("changer le modèle du plafond le propose aussitôt : la PR est dite sous la rangée, avec de quoi l'ouvrir ; la valeur en vigueur ne change pas", async () => {
    const { vue, propositions } = await ouvrir();
    const plafond = rangee(vue, "plafond");
    choisir(liste(plafond, "model"), "sonnet");
    await repos();
    assert.deepEqual(propositions.map(({ projet, choix }) => [projet, choix]), [[PARADE, { cle: "plafond", modele: "sonnet", effort: "high" }]]);
    // Tant que le runtime n'a pas répondu, la rangée dit qu'elle s'y met, et ses listes attendent.
    const enCours = rangee(vue, "plafond");
    assert.equal(dit(enCours)?.className, "dit en-cours");
    assert.equal(dit(enCours)?.textContent, EN_COURS);
    assert.ok(enCours.dessous("select").every((select) => select.disabled));

    propositions[0]?.rendre({ propose: PROPOSE, pr: PR, numero: 51 });
    await repos();
    const apres = rangee(vue, "plafond");
    assert.equal(dit(apres)?.className, "dit propose");
    assert.match(dit(apres)?.textContent ?? "", new RegExp(`^sonnet / high ${PROPOSE_DANS}pull request #51$`));
    assert.equal(valeur(apres), "opus / highdefault");
    const lien = apres.dessous("button").find((bouton) => bouton.textContent === "pull request #51") ?? assert.fail("pas de bouton vers la PR");
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
    // Rien n'est posé sur la box : aucune commande ni geste du plafond d'avant.
    assert.equal(vue.appels.some(({ geste }) => geste === "reglerLePlafondDeCalibrage" || geste === "lancer"), false);
  });

  test("changer l'effort d'un calibrage le propose aussi, avec le modèle en vigueur", async () => {
    const { vue, propositions } = await ouvrir();
    choisir(liste(rangee(vue, "manager"), "effort"), "medium");
    await repos();
    assert.deepEqual(propositions.map(({ choix }) => choix), [{ cle: "manager", modele: "opus", effort: "medium" }]);
  });

  test("un refus du runtime se dit sous la rangée ; la valeur en vigueur ne change pas, et le champ y revient", async () => {
    const { vue, propositions } = await ouvrir();
    const branche = rangee(vue, "branche");
    choisir(branche.dessous("input")[0] ?? assert.fail(), "/home/chef/parade");
    await repos();
    assert.deepEqual(propositions[0]?.choix, { cle: "branche", valeur: "/home/chef/parade" });
    propositions[0]?.rendre({ refus: "This value does not belong in the project's repository: its value is a path on a machine.", detail: "$ node geste.ts parade setting branch /home/chef/parade" });
    await repos();
    const apres = rangee(vue, "branche");
    assert.equal(dit(apres)?.className, "dit refus");
    assert.match(dit(apres)?.textContent ?? "", /^This value does not belong in the project's repository/);
    assert.equal(valeur(apres), "mainfrom the repository");
    assert.equal(apres.dessous("input")[0]?.value, "main");
    // Les autres réglages n'en disent rien.
    assert.equal(dit(rangee(vue, "plafond")), undefined);
  });

  test("une lecture ratée tient en une ligne, son détail au survol ; un projet que rien ne lit n'a pas la section", async () => {
    const { vue } = await ouvrir({ sans: "settings unavailable", detail: "$ node geste.ts parade setting\nexit 255" });
    const pose = section(vue);
    assert.equal(pose.dessous("p").find((p) => p.className === "indisponible")?.children[0]?.textContent, "settings unavailable");
    assert.equal(pose.dessous("select").length, 0);
  });
});

describe("Settings : les réglages du closer, changés par la même PR (#1685)", () => {
  test("changer le plafond de tokens du closer le propose : la PR est dite, avec de quoi l'ouvrir ; rien ne part vers la box", async () => {
    const { vue, propositions } = await ouvrir();
    const tokens = rangee(vue, "closer-tokens");
    choisir(tokens.dessous("input")[0] ?? assert.fail(), "300000");
    await repos();
    assert.deepEqual(propositions.map(({ projet, choix }) => [projet, choix]), [[PARADE, { cle: "closer-tokens", valeur: "300000" }]]);
    propositions[0]?.rendre({ propose: PROPOSE, pr: PR, numero: 52 });
    await repos();
    const apres = rangee(vue, "closer-tokens");
    assert.equal(dit(apres)?.textContent, `300000 ${PROPOSE_DANS}pull request #52`);
    assert.equal(valeur(apres), "200000from the repository");
    (apres.dessous("button").find((bouton) => bouton.textContent === "pull request #52") ?? assert.fail("pas de bouton vers la PR")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
    assert.equal(vue.appels.some(({ geste }) => geste === "lancer" || geste === "ecrire"), false);
  });

  test("un nombre que le fichier refuse se dit en une phrase à côté du champ, et aucune PR ne s'ouvre", async () => {
    // Le runtime refuse « 0 » au crible du fichier, avant toute demande : sa phrase, lue telle quelle.
    const refusee = await proposerLeReglage(PARADE, BOX, { cle: "closer-cooks", valeur: "0" }, async () =>
      rendu(JSON.stringify({ ok: false, reason: "invalide", key: "closer.cooksBelow", message: "`closer.cooksBelow` must be an integer greater than zero" }), 1),
    );
    assert.deepEqual("refus" in refusee && refusee.refus, "This value must be an integer greater than zero");

    const { vue, propositions } = await ouvrir();
    const cooks = rangee(vue, "closer-cooks");
    choisir(cooks.dessous("input")[0] ?? assert.fail(), "0");
    await repos();
    propositions[0]?.rendre(refusee);
    await repos();
    const apres = rangee(vue, "closer-cooks");
    assert.equal(dit(apres)?.className, "dit refus");
    assert.equal(dit(apres)?.children[0]?.textContent, "This value must be an integer greater than zero");
    assert.equal(apres.dessous("button").some((bouton) => bouton.textContent.startsWith("pull request")), false);
    assert.equal(apres.dessous("input")[0]?.value, "1");
  });
});
