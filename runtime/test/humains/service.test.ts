// Le service des humains du projet (#2929), joué par la commande `humans` qui
// l'ouvre pour l'app, contre un faux `gh` : lire les humains que
// `projet.json` déclare, en ajouter, en changer, en retirer — chaque écriture
// par une PR dont le diff ne change que l'entrée `humans`, après avoir vérifié
// que le compte existe sur GitHub et a accès au dépôt.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { principal } from "../../src/humains/commande.ts";
import { FICHIER } from "../../src/reglages-projet/reglages.ts";
import { DEPOT, fauxGh } from "../outils.ts";

const LU = `repos/${DEPOT}/contents/${FICHIER}?ref=main`;
const ECRIT = `repos/${DEPOT}/contents/${FICHIER}`;
const PR = `https://github.com/${DEPOT}/pull/77`;

const texte = (contenu: object) => `${JSON.stringify(contenu, null, 2)}\n`;
const AVANT = texte({
  version: 1,
  integrationBranch: "main",
  defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } },
  humans: [
    { login: "Alice", roles: ["product", "review"] },
    { login: "bob", roles: ["design"] },
  ],
  closer: { calibration: { model: "opus", effort: "high" } },
});

// Un faux GitHub qui porte ce fichier sur `main` (null : pas de fichier), et
// ces comptes : `acces` ceux qui ont accès au dépôt, `sansAcces` ceux qui
// existent sans y avoir accès. Tout autre compte n'existe pas.
function github(t: TestContext, fichier: string | null, comptes: { acces?: string[]; sansAcces?: string[] } = {}) {
  const gh = fauxGh(t);
  if (fichier === null) gh.repondre(LU, { statut: 404, corps: { message: "Not Found" } });
  else gh.repondre(LU, { corps: { content: Buffer.from(fichier).toString("base64"), encoding: "base64", sha: "blob1" } });
  gh.repondre("users/*", { statut: 404, corps: { message: "Not Found" } });
  gh.repondre(`repos/${DEPOT}/collaborators/*`, { statut: 404, corps: { message: "Not Found" } });
  for (const login of [...(comptes.acces ?? []), ...(comptes.sansAcces ?? [])]) gh.repondre(`users/${login}`, { corps: { login } });
  for (const login of comptes.acces ?? []) gh.repondre(`repos/${DEPOT}/collaborators/${login}/permission`, { corps: { permission: "read" } });
  for (const login of comptes.sansAcces ?? []) gh.repondre(`repos/${DEPOT}/collaborators/${login}/permission`, { corps: { permission: "none" } });
  gh.repondre(`repos/${DEPOT}/commits/main`, { corps: { sha: "tete1" } });
  gh.repondre(`repos/${DEPOT}/git/refs`, { statut: 201, corps: { ref: "refs/heads/x" } });
  gh.repondre(ECRIT, { statut: fichier === null ? 201 : 200, corps: {} });
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { number: 77, html_url: PR } });
  // Ce que GitHub a reçu : les appels qui écrivent, et le texte commité.
  const ecritures = () => gh.appels().filter((appel) => appel.includes("-X"));
  const commite = () => {
    const put = gh.appels().find((appel) => appel.includes("PUT"));
    const champ = put?.find((arg) => arg.startsWith("content="));
    return champ === undefined ? null : Buffer.from(champ.slice("content=".length), "base64").toString("utf8");
  };
  const champ = (appel: string[] | undefined, nom: string) => appel?.find((arg) => arg.startsWith(`${nom}=`))?.slice(nom.length + 1);
  return { gh, ecritures, commite, champ };
}

async function humans(gh: { bin: string }, args: string[]) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  let code = 0;
  try {
    await principal({ args, env: { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, BRIGADE_BASE_BRANCH: "main" }, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreurs.push(ligne) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { code, sortie, erreurs, json: sortie.length === 1 ? (JSON.parse(sortie[0] as string) as Record<string, unknown>) : undefined };
}

// Les lignes qui diffèrent entre deux textes de même longueur, ou les lignes en plus.
const lignesChangees = (avant: string, apres: string) => {
  const [a, b] = [avant.split("\n"), apres.split("\n")];
  let debut = 0;
  while (debut < a.length && a[debut] === b[debut]) debut++;
  let fin = 0;
  while (fin < a.length - debut && a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++;
  return { retirees: a.slice(debut, a.length - fin), ajoutees: b.slice(debut, b.length - fin) };
};

describe("le service des humains du projet", { concurrency: 4 }, () => {
  test("list rend chaque humain déclaré, son login et ses rôles", async (t) => {
    const { gh, ecritures } = github(t, AVANT);
    const fin = await humans(gh, []);
    assert.equal(fin.code, 0, fin.erreurs.join("\n"));
    assert.deepEqual(fin.json, { humans: [{ login: "Alice", roles: ["product", "review"] }, { login: "bob", roles: ["design"] }] });
    assert.deepEqual(ecritures(), []);
  });

  test("list rend une liste vide quand personne n'est déclaré, ou que le dépôt n'a pas le fichier", async (t) => {
    const sans = github(t, texte({ version: 1, integrationBranch: "main" }));
    assert.deepEqual((await humans(sans.gh, [])).json, { humans: [] });
    const absent = github(t, null);
    assert.deepEqual((await humans(absent.gh, [])).json, { humans: [] });
  });

  test("list d'un fichier illisible le dit en une ligne, sans liste devinée", async (t) => {
    const { gh } = github(t, "{ pas du json");
    const fin = await humans(gh, []);
    assert.equal(fin.code, 1);
    assert.deepEqual(fin.sortie, []);
    assert.equal(fin.erreurs.length, 1);
    assert.match(fin.erreurs[0] as string, /humans are not read — .*not valid JSON/);
  });

  test("save d'un login valide ouvre une PR dont le diff n'ajoute que lui à `humans`, et rend son adresse", async (t) => {
    const { gh, ecritures, commite, champ } = github(t, AVANT, { acces: ["carol"] });
    const fin = await humans(gh, ["save", "carol", "review"]);
    assert.equal(fin.code, 0, fin.sortie.join("\n"));
    assert.deepEqual(fin.json, { ok: true, pr: PR });
    const apres = commite() as string;
    assert.deepEqual(lignesChangees(AVANT, apres), {
      retirees: [],
      ajoutees: ["    },", "    {", '      "login": "carol",', '      "roles": [', '        "review"', "      ]"],
    });
    const [ref, put, pull] = ecritures();
    assert.equal(champ(ref, "sha"), "tete1");
    const branche = champ(ref, "ref")?.replace("refs/heads/", "");
    assert.equal(champ(put, "branch"), branche);
    assert.equal(champ(put, "sha"), "blob1");
    assert.equal(champ(pull, "head"), branche);
    assert.equal(champ(pull, "base"), "main");
    assert.equal(ecritures().length, 3);
  });

  test("save d'un login qui n'existe pas sur GitHub est refusé en une ligne, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT);
    const fin = await humans(gh, ["save", "personne", "review"]);
    assert.equal(fin.code, 1);
    assert.deepEqual(fin.json, { ok: false, message: "personne is not a GitHub account: check the login" });
    assert.deepEqual(ecritures(), []);
  });

  test("save d'un login qui existe sans accès au dépôt est refusé d'une autre ligne, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT, { sansAcces: ["dave"] });
    const fin = await humans(gh, ["save", "dave", "review"]);
    assert.equal(fin.code, 1);
    assert.deepEqual(fin.json, { ok: false, message: `dave exists on GitHub but has no access to ${DEPOT}: invite them to the repository first` });
    assert.deepEqual(ecritures(), []);
  });

  test("save qui ne peut pas vérifier le compte le dit, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT);
    gh.repondre("users/erin", { statut: 500, corps: { message: "boom" } });
    const fin = await humans(gh, ["save", "erin", "review"]);
    assert.equal(fin.code, 1);
    assert.match(String(fin.json?.message), /^the login erin could not be checked on GitHub: .*HTTP 500$/);
    assert.deepEqual(ecritures(), []);
  });

  test("save d'un rôle inconnu est refusé en une ligne, avant toute question à GitHub", async (t) => {
    const { gh } = github(t, AVANT, { acces: ["carol"] });
    const fin = await humans(gh, ["save", "carol", "boss"]);
    assert.equal(fin.code, 1);
    assert.match(String(fin.json?.message), /^"boss" is not a role: expected `product`/);
    assert.deepEqual(gh.appels(), []);
  });

  test("changer les rôles d'un humain garde son login et ne change que ses rôles dans le diff", async (t) => {
    const { gh, commite } = github(t, AVANT, { acces: ["alice"] });
    const fin = await humans(gh, ["save", "alice", "design"]);
    assert.deepEqual(fin.json, { ok: true, pr: PR });
    assert.deepEqual(lignesChangees(AVANT, commite() as string), {
      retirees: ['        "product",', '        "review"'],
      ajoutees: ['        "design"'],
    });
  });

  test("save sans rien qui change est refusé, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT, { acces: ["bob"] });
    const fin = await humans(gh, ["save", "bob", "design"]);
    assert.equal(fin.code, 1);
    assert.deepEqual(fin.json, { ok: false, message: "bob is already declared with these roles: there is nothing to change" });
    assert.deepEqual(ecritures(), []);
  });

  test("save sur un dépôt sans fichier le crée avec la branche d'intégration et l'humain", async (t) => {
    const { gh, commite, champ, ecritures } = github(t, null, { acces: ["carol"] });
    const fin = await humans(gh, ["save", "carol", "product"]);
    assert.deepEqual(fin.json, { ok: true, pr: PR });
    assert.equal(commite(), texte({ version: 1, integrationBranch: "main", humans: [{ login: "carol", roles: ["product"] }] }));
    assert.equal(champ(ecritures()[1], "sha"), undefined);
  });

  test("remove ouvre une PR dont le diff ne retire que cet humain", async (t) => {
    const { gh, commite, ecritures } = github(t, AVANT);
    const fin = await humans(gh, ["remove", "bob"]);
    assert.deepEqual(fin.json, { ok: true, pr: PR });
    assert.deepEqual(lignesChangees(AVANT, commite() as string), {
      retirees: ["    },", "    {", '      "login": "bob",', '      "roles": [', '        "design"'],
      ajoutees: [],
    });
    assert.equal(ecritures().length, 3);
  });

  test("remove du dernier humain retire l'entrée `humans`, et rien d'autre", async (t) => {
    const seul = texte({ version: 1, integrationBranch: "main", humans: [{ login: "bob", roles: ["design"] }], chef: "boss" });
    const { gh, commite } = github(t, seul);
    assert.deepEqual((await humans(gh, ["remove", "bob"])).json, { ok: true, pr: PR });
    assert.equal(commite(), texte({ version: 1, integrationBranch: "main", chef: "boss" }));
  });

  test("remove d'un login non déclaré est refusé en une ligne, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT);
    const fin = await humans(gh, ["remove", "zoe"]);
    assert.equal(fin.code, 1);
    assert.deepEqual(fin.json, { ok: false, message: `zoe is not declared in ${FICHIER} on \`main\`: there is nothing to remove` });
    assert.deepEqual(ecritures(), []);
  });

  test("une PR que GitHub refuse le dit en une ligne, et nomme la branche poussée", async (t) => {
    const { gh } = github(t, AVANT);
    gh.repondre(`repos/${DEPOT}/pulls`, { statut: 422, corps: { message: "Validation Failed" } });
    const fin = await humans(gh, ["remove", "bob"]);
    assert.equal(fin.code, 1);
    assert.match(String(fin.json?.message), /^the pull request could not be opened on acme\/brigade: .*HTTP 422; the branch `brigade\/humans-bob-[0-9a-f]{8}` is pushed, with the change$/);
  });

  test("une branche que GitHub refuse d'écrire le dit en une ligne, sans PR", async (t) => {
    const { gh, ecritures } = github(t, AVANT);
    gh.repondre(ECRIT, { statut: 409, corps: { message: "Conflict" } });
    const fin = await humans(gh, ["remove", "bob"]);
    assert.equal(fin.code, 1);
    assert.match(String(fin.json?.message), /could not be written on acme\/brigade: .*HTTP 409$/);
    assert.equal(ecritures().some((appel) => appel.at(-1) === `repos/${DEPOT}/pulls`), false);
  });

  test("un usage qui ne se lit pas sort avec le code 2", async (t) => {
    const { gh } = github(t, AVANT);
    for (const args of [["save"], ["remove"], ["remove", "bob", "de-trop"], ["add", "bob"]]) assert.equal((await humans(gh, args)).code, 2, args.join(" "));
  });
});
