// Les GitHub Apps de la station, dans Settings (#2317) : une ligne par rôle — cook, pass, manager —, chacune avec son
// état (`not configured`, `configured`), son App ID et sa clé, sans « save » : c'est la rangée de réglage (#2920), qui
// s'applique au `change` d'un des deux champs — un App ID changé sans sa clé dit qu'il l'attend ; la ligne d'en-tête dit que les clés restent sur
// la station. Rangée, une clé quitte l'écran : son champ se vide et rien ne la redit. Un App ID vide ou une clé qui
// n'est pas PEM se disent sous leur champ, et rien ne part. L'écran est joué devant un faux document ; derrière son
// pont, la station range pour de bon, par `rangerApp` du runtime, dans un répertoire du test.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { AppRefusee, appsRangees, rangerApp } from "../../../runtime/src/identites-stations.ts";
import {
  KEY_EXPECTED,
  CONFIGURE,
  GUARD,
  UNREADABLE,
  NOT_CONFIGURE,
  NOT_ONE_ID,
  NOT_ONE_KEY,
  setTheIdentities,
  ROW,
  ROLES,
  WITHOUT_ID,
  holdTheIdentities,
  type BridgeOfIdentities,
  type Role,
} from "../../src/vue/identities-github.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const OTHER_KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const stations: string[] = [];
after(() => {
  for (const station of stations) rmSync(station, { recursive: true, force: true });
});

// Une station dans un répertoire neuf, et le pont du process principal devant elle : ce qu'il lit et ce qu'il range,
// par le runtime — chaque appel retenu, pour voir ce qui est parti.
function plays(options: { pont?: BridgeOfIdentities } = {}) {
  const station = mkdtempSync(join(tmpdir(), "identites-github-"));
  stations.push(station);
  const calls: { role: string; id: string; cle: string }[] = [];
  const bridge: BridgeOfIdentities = options.pont ?? {
    appsDeLaStation: () => Promise.resolve({ apps: appsRangees(station) }),
    rangerUneApp: (role, id, key) => {
      calls.push({ role, id, cle: key });
      try {
        const row = rangerApp({ station, role, id, cle: key, env: {} });
        return Promise.resolve({ rangee: { role: row.role, id: row.id } });
      } catch (error) {
        if (error instanceof AppRefusee) return Promise.resolve({ refus: error.message });
        throw error;
      }
    },
  };
  let renderedOnes = 0;
  const heldOne = holdTheIdentities({ pont: bridge, rendre: () => renderedOnes++ });
  const screen = (): Fake => setTheIdentities(doc, heldOne.etat ?? assert.fail("l'écran n'est pas posé"), heldOne.gestes);
  return { station, appels: calls, tenue: heldOne, ecran: screen, rendus: () => renderedOnes };
}

const line = (screen: Fake, role: Role) => screen.children.find((child) => child.dataset.role === role) ?? assert.fail(`pas de ligne pour ${role}`);
const classe = (root: Fake, name: string) => [...root.descendants()].filter((element) => element.className.split(" ").includes(name));
const fieldId = (root: Fake) => classe(root, "app-id")[0] ?? assert.fail("pas de champ App ID");
const fieldKey = (root: Fake) => classe(root, "cle")[0] ?? assert.fail("pas de champ de clé");
const stateOf = (root: Fake) => [...root.descendants()].find((element) => element.dataset.etat !== undefined)?.textContent;
const button = (root: Fake, text: string) => root.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
const errors = (root: Fake) => [...root.descendants()].filter((element) => element.className === "dit refus").map((element) => element.textContent);
// Taper dans un champ, comme le chef : sa valeur change, puis son écoute l'apprend.
const type = (field: Fake, text: string) => {
  field.value = text;
  field.declencher("input");
};
// Puis le quitter, ou le valider : son `change` — le réglage s'applique là.
const validate = (field: Fake) => field.declencher("change");
const write = (field: Fake, text: string) => {
  type(field, text);
  validate(field);
};
// Tout ce que l'écran donne à lire : ses textes, ses survols, ses noms accessibles, la valeur de ses champs.
function allWhatItselfLit(root: Fake): string {
  const hovers = root.dessous("button").filter((element) => element.className === "aide");
  for (const declencheur of hovers) declencheur.declencher("mouseenter");
  const readOne = [root, ...root.descendants()].flatMap((element) => [element.textContent, element.title, element.ariaLabel, element.value, element.placeholder]).join("\n");
  for (const declencheur of hovers) declencheur.declencher("mouseleave");
  return readOne;
}

describe("l'écran des GitHub Apps", () => {
  test("une ligne par rôle, cook, pass et manager, chacune avec un App ID et une clé, sans « save » — et la ligne qui dit que les clés restent sur la station", async () => {
    const set = plays();
    await set.tenue.lire();
    const screen = set.ecran();
    assert.ok(screen.textContent.includes(GUARD));
    assert.match(GUARD, /stay on this station/);
    assert.match(GUARD, /never sent to the repository/);
    for (const role of ROLES) {
      const itsOwnOne = line(screen, role);
      assert.equal(fieldId(itsOwnOne).balise, "input");
      assert.equal(fieldKey(itsOwnOne).balise, "textarea");
      assert.equal(itsOwnOne.className, "reglage");
      assert.equal(itsOwnOne.dessous("button").some((candidate) => /save|propose/i.test(candidate.textContent)), false);
      assert.ok(button(itsOwnOne, "choose the .pem file"));
      // Gardée sur la station, la ligne ne dit pas de PR.
      assert.equal(itsOwnOne.dessous("p").some((p) => p.className === "par-pr"), false);
      const file = itsOwnOne.dessous("input").find((field) => field.type === "file") as unknown as { accept: string } | undefined;
      assert.equal(file?.accept, ".pem,application/x-pem-file");
    }
  });
});

describe("not configured", () => {
  test("une station qui n'a aucune App : chaque rôle dit `not configured`, sans App ID", async () => {
    const set = plays();
    await set.tenue.lire();
    const screen = set.ecran();
    for (const role of ROLES) {
      assert.equal(stateOf(line(screen, role)), NOT_CONFIGURE);
      assert.equal(fieldId(line(screen, role)).value, "");
    }
  });

  test("une App rangée sans sa clé n'est pas configurée : la ligne dit ce qui manque", async () => {
    const set = plays({ pont: { appsDeLaStation: () => Promise.resolve({ apps: [{ role: "cook", id: "1203456", cle: false }, { role: "pass", id: null, cle: false }, { role: "manager", id: null, cle: false }] }) } });
    await set.tenue.lire();
    const cook = line(set.ecran(), "cook");
    assert.equal(stateOf(cook), NOT_CONFIGURE);
    assert.ok(cook.textContent.includes("App 1203456 · no key stored"));
  });
});

describe("configured", () => {
  test("l'App ID puis la clé écrits, la clé validée range l'App du rôle sur la station : sa ligne dit `configured` et son ID, et le champ de la clé est vide", async () => {
    const set = plays();
    await set.tenue.lire();
    let pass = line(set.ecran(), "pass");
    // L'App ID validé sans clé n'envoie rien : il attend la clé.
    write(fieldId(pass), " 1203457 ");
    assert.deepEqual(set.appels, []);
    assert.deepEqual(errors(line(set.ecran(), "pass")), []);
    type(fieldKey(pass), KEY);
    assert.deepEqual(set.appels, [], "écrite sans être validée, la clé ne part pas");
    validate(fieldKey(pass));
    assert.ok(line(set.ecran(), "pass").textContent.includes("Saving…"), "le geste en route se dit");
    await repos();
    assert.deepEqual(set.appels, [{ role: "pass", id: "1203457", cle: KEY }]);
    // La station l'a pour de bon : son ID et sa clé, dans son répertoire des Apps.
    assert.equal(readFileSync(join(set.station, "apps-github", "pass.pem"), "utf8"), KEY);
    assert.equal(readFileSync(join(set.station, "apps-github", "pass.id"), "utf8"), "1203457\n");
    pass = line(set.ecran(), "pass");
    assert.equal(stateOf(pass), CONFIGURE);
    assert.ok(pass.textContent.includes("App 1203457"));
    assert.ok(pass.textContent.includes(ROW));
    assert.equal(fieldKey(pass).value, "", "la clé rangée ne se relit plus");
    assert.equal(fieldId(pass).value, "1203457");
    // Les autres rôles n'ont pas bougé.
    assert.equal(stateOf(line(set.ecran(), "cook")), NOT_CONFIGURE);
    assert.equal(stateOf(line(set.ecran(), "manager")), NOT_CONFIGURE);
  });

  test("la clé n'est jamais redite : ni rangée, ni relue, ni rouverte — l'écran n'en garde rien", async () => {
    const set = plays();
    await set.tenue.lire();
    const cook = line(set.ecran(), "cook");
    type(fieldId(cook), "1203456");
    write(fieldKey(cook), KEY);
    await repos();
    const body = KEY.split("\n")[1] ?? assert.fail("une clé sans corps");
    assert.ok(!allWhatItselfLit(set.ecran()).includes(body));
    assert.ok(!JSON.stringify(set.tenue.etat).includes(body), "l'état de l'écran ne la retient pas");
    // Relue de la station, elle ne revient pas : la station ne dit que si elle l'a.
    await set.tenue.lire();
    const reread = set.ecran();
    assert.equal(stateOf(line(reread, "cook")), CONFIGURE);
    assert.ok(!allWhatItselfLit(reread).includes(body));
    assert.equal(fieldKey(line(reread, "cook")).value, "");
  });

  test("une station qui a déjà ses Apps les dit configurées, leur ID dans son champ — et aucun « save » n'y attend", async () => {
    const set = plays();
    rangerApp({ station: set.station, role: "manager", id: "1203458", cle: KEY, env: {} });
    await set.tenue.lire();
    const screen = set.ecran();
    const manager = line(screen, "manager");
    assert.equal(stateOf(manager), CONFIGURE);
    assert.equal(fieldId(manager).value, "1203458");
    assert.equal(fieldKey(manager).value, "");
    assert.equal(screen.dessous("button").some((candidate) => /save/i.test(candidate.textContent)), false);
  });

  test("la clé choisie dans un fichier .pem : son nom se lit, pas son contenu ; sans App ID, la ligne le demande, et l'App ID validé la range", async () => {
    const set = plays();
    await set.tenue.lire();
    let cook = line(set.ecran(), "cook");
    const file = cook.dessous("input").find((field) => field.type === "file") ?? assert.fail("pas de choix de fichier");
    let opened = 0;
    file.addEventListener("click", () => void opened++);
    button(cook, "choose the .pem file").click();
    assert.equal(opened, 1, "le bouton ouvre le choix du fichier");
    Object.assign(file, { files: [{ name: "parade-cook.2026-11-04.private-key.pem", text: () => Promise.resolve(KEY) }] });
    file.declencher("change");
    await repos();
    cook = line(set.ecran(), "cook");
    assert.ok(cook.textContent.includes("parade-cook.2026-11-04.private-key.pem chosen"));
    assert.equal(fieldKey(cook).value, "", "la clé lue n'est pas écrite dans le champ");
    // Le fichier choisi est un changement : sans App ID, rien ne part, et la ligne le demande.
    assert.deepEqual(set.appels, []);
    assert.deepEqual(errors(classe(cook, "champ-id")[0] ?? assert.fail("pas de ligne de l'App ID")), [WITHOUT_ID]);
    write(fieldId(cook), "1203456");
    await repos();
    assert.deepEqual(set.appels, [{ role: "cook", id: "1203456", cle: KEY }]);
    cook = line(set.ecran(), "cook");
    assert.equal(stateOf(cook), CONFIGURE);
    assert.ok(!cook.textContent.includes("chosen"));
  });

  test("une clé écrite sur un rôle déjà configuré remplace son App", async () => {
    const set = plays();
    rangerApp({ station: set.station, role: "pass", id: "1203457", cle: KEY, env: {} });
    await set.tenue.lire();
    const pass = line(set.ecran(), "pass");
    type(fieldId(pass), "1203459");
    write(fieldKey(pass), OTHER_KEY);
    await repos();
    assert.equal(readFileSync(join(set.station, "apps-github", "pass.pem"), "utf8"), OTHER_KEY);
    assert.ok(line(set.ecran(), "pass").textContent.includes("App 1203459"));
  });

  test("seul l'App ID changé sur un rôle déjà configuré ne range rien sans sa clé, et la ligne le dit ; l'ID déjà rangé ne dit rien", async () => {
    const set = plays();
    rangerApp({ station: set.station, role: "pass", id: "1203457", cle: KEY, env: {} });
    await set.tenue.lire();
    write(fieldId(line(set.ecran(), "pass")), "1203459");
    await repos();
    assert.deepEqual(set.appels, [], "sans clé, rien ne part vers la station");
    assert.equal(readFileSync(join(set.station, "apps-github", "pass.id"), "utf8"), "1203457\n");
    let pass = line(set.ecran(), "pass");
    assert.ok(pass.textContent.includes(KEY_EXPECTED), "le changement sans effet se dit");
    assert.deepEqual(errors(pass), []);
    // Revenu à l'ID que la station a, il n'y a plus rien qui attend.
    write(fieldId(pass), "1203457");
    pass = line(set.ecran(), "pass");
    assert.equal(pass.textContent.includes(KEY_EXPECTED), false);
    // La clé donnée ensuite range l'App avec l'ID changé.
    type(fieldId(pass), "1203459");
    write(fieldKey(pass), OTHER_KEY);
    await repos();
    assert.equal(readFileSync(join(set.station, "apps-github", "pass.id"), "utf8"), "1203459\n");
    assert.equal(line(set.ecran(), "pass").textContent.includes(KEY_EXPECTED), false);
  });
});

describe("error", () => {
  test("une clé validée sans App ID : l'erreur se dit sous le champ, et rien n'est écrit", async () => {
    const set = plays();
    await set.tenue.lire();
    let pass = line(set.ecran(), "pass");
    type(fieldId(pass), "   ");
    write(fieldKey(pass), KEY);
    await repos();
    assert.deepEqual(set.appels, [], "rien n'est parti vers la station");
    assert.deepEqual(readdirSync(set.station), []);
    pass = line(set.ecran(), "pass");
    const under = classe(pass, "champ-id")[0] ?? assert.fail("pas de ligne de l'App ID");
    assert.deepEqual(errors(under), [WITHOUT_ID]);
    assert.equal(stateOf(pass), NOT_CONFIGURE);
  });

  test("un texte validé qui n'est pas une clé privée PEM : l'erreur se dit sous le champ de la clé, et rien n'est écrit ; un champ vidé n'est pas une erreur", async () => {
    const set = plays();
    await set.tenue.lire();
    for (const text of ["", "my key", "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----\n", KEY.replace("-----END PRIVATE KEY-----", "")]) {
      let cook = line(set.ecran(), "cook");
      type(fieldId(cook), "1203456");
      write(fieldKey(cook), text);
      await repos();
      cook = line(set.ecran(), "cook");
      // Vidé, le champ n'a rien à ranger : il ne dit rien.
      assert.deepEqual(errors(classe(cook, "champ-cle")[0] ?? assert.fail("pas de ligne de la clé")), text === "" ? [] : [NOT_ONE_KEY], JSON.stringify(text));
      assert.deepEqual(errors(classe(cook, "champ-id")[0] ?? assert.fail("pas de ligne de l'App ID")), []);
    }
    assert.deepEqual(set.appels, []);
    assert.deepEqual(readdirSync(set.station), []);
  });

  test("les deux à la fois : une erreur sous chaque champ ; corrigé, le champ perd la sienne", async () => {
    const set = plays();
    await set.tenue.lire();
    let manager = line(set.ecran(), "manager");
    write(fieldKey(manager), "my key");
    manager = line(set.ecran(), "manager");
    assert.deepEqual(errors(manager), [WITHOUT_ID, NOT_ONE_KEY]);
    write(fieldId(manager), "1203458");
    assert.deepEqual(errors(line(set.ecran(), "manager")), [NOT_ONE_KEY]);
    assert.deepEqual(set.appels, []);
  });

  test("un App ID qui n'en a pas la forme — une clé collée à sa place — ne part pas", async () => {
    const set = plays();
    await set.tenue.lire();
    const cook = line(set.ecran(), "cook");
    type(fieldId(cook), "-----BEGIN PRIVATE KEY-----");
    write(fieldKey(cook), KEY);
    assert.deepEqual(errors(line(set.ecran(), "cook")), [NOT_ONE_ID]);
    assert.deepEqual(set.appels, []);
  });

  test("ce que la station refuse se dit en une ligne sous le rôle, sa suite au survol, sans la clé ; rien n'est écrit, et le rôle reste ce qu'il était", async () => {
    const set = plays();
    rangerApp({ station: set.station, role: "cook", id: "1203456", cle: KEY, env: {} });
    await set.tenue.lire();
    const pass = line(set.ecran(), "pass");
    type(fieldId(pass), "1203456");
    write(fieldKey(pass), OTHER_KEY);
    await repos();
    assert.equal(set.appels.length, 1);
    assert.deepEqual(readdirSync(join(set.station, "apps-github")).sort(), ["cook.id", "cook.pem"]);
    const refused = line(set.ecran(), "pass");
    // La ligne, puis le « ? » de son survol.
    assert.deepEqual(errors(refused), ["nothing was written: the cook role already has the App 1203456?"]);
    assert.ok(allWhatItselfLit(refused).includes("one identity per role, so one App per role"));
    assert.equal(stateOf(refused), NOT_CONFIGURE);
    assert.ok(!refused.textContent.includes(ROW));
    // Le refus ne cite pas la clé ; elle reste dans son champ, que le chef corrige l'App ID sans la recoller.
    const refusal = [...refused.descendants()].find((element) => element.className === "dit refus") ?? assert.fail("pas de refus");
    assert.ok(!allWhatItselfLit(refusal).includes(OTHER_KEY.split("\n")[1] ?? assert.fail("une clé sans corps")));
    assert.equal(fieldKey(refused).value, OTHER_KEY);
  });

  test("une station qui ne se lit pas le dit en une ligne, son détail au survol — jamais `not configured`", async () => {
    const set = plays({ pont: { appsDeLaStation: () => Promise.resolve({ refus: "this station's Apps directory cannot be read (EACCES)" }) } });
    await set.tenue.lire();
    const screen = set.ecran();
    assert.ok(screen.textContent.includes(UNREADABLE));
    assert.ok(allWhatItselfLit(screen).includes("EACCES"));
    assert.ok(!screen.textContent.includes(NOT_CONFIGURE));
    assert.ok(!screen.textContent.includes(CONFIGURE));
  });
});

describe("un appareil sans station", () => {
  test("un pont qui n'a pas ces gestes, ou qui ne rend rien — le téléphone — : l'écran ne se pose pas", async () => {
    for (const bridge of [{}, { appsDeLaStation: () => Promise.resolve(undefined) }] satisfies BridgeOfIdentities[]) {
      const set = plays({ pont: bridge });
      await set.tenue.lire();
      assert.equal(set.tenue.etat, undefined);
      assert.ok(set.rendus() > 0);
    }
  });
});
