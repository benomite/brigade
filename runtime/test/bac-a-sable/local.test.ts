// Le bac à sable d'une cuisine locale, sur le Mac du chef : chaque `claude`
// qu'elle lance — cook, reviewer de la pass, jugement du manager — part avec
// la configuration d'un cook prêté par la box ; la vérification dit `ok`, ou
// ce qui manque en une phrase. La machine est simulée : plateforme, fichiers,
// `claude`.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { argumentsDuBacASable, configurer, type Reglages } from "../../src/bac-a-sable/configuration.ts";
import { SEATBELT, VERSION_MINIMALE, type Sondes } from "../../src/bac-a-sable/detection.ts";
import { configBacASableLocal, dansLeBacASableLocal, poserLeBacASable, verifier, type BacASableLocal, type Lieux } from "../../src/bac-a-sable/local.ts";
import { principal as verifierEnCommande } from "../../src/bac-a-sable/verifier.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { argumentsJuge } from "../../src/juger.ts";
import { reglesDuProjet } from "../../src/reseau.ts";
import { argumentsReviewer } from "../../src/reviewer.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { appeler, jusqua } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

// Le Mac simulé a son propre répertoire temporaire : celui du process qui joue
// le test n'est pas un chemin de Mac sous Windows.
const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n", temporaire: () => "/private/var/folders/xy/T" };
const HOME = "/Users/chef";
const LIEUX: Lieux = { home: HOME, worktrees: "/Users/chef/Library/Application Support/brigade/station/etat", caches: ["/Users/chef/Library/Caches/brigade"] };
const HOTES = reglesDuProjet(["registry.npmjs.org"]);
const CALIBRAGE = { model: "sonnet", effort: "low" };

// Une raison se lit en une phrase : une ligne, sans point qui en ouvre une autre.
const unePhrase = (raison: string) => {
  assert.equal(raison.includes("\n"), false, raison);
  assert.equal(/\.\s+\p{Lu}/u.test(raison), false, raison);
  assert.ok(raison.length > 20 && raison.length <= 400, raison);
};

test("un Mac avec Seatbelt, un `claude` récent et des lieux où un cook peut écrire : la vérification dit ok, avec la version", () => {
  assert.deepEqual(verifier(MAC, LIEUX), { ok: true, version: "2.1.300" });
  assert.deepEqual(verifier(MAC, { ...LIEUX, caches: [] }, HOTES), { ok: true, version: "2.1.300" });
});

test("ce qui manque se dit en une phrase qui le nomme : la plateforme, Seatbelt, un `claude` trop ancien ou muet, des lieux qui ne tiennent pas", () => {
  const raisons: Array<[ReturnType<typeof verifier>, RegExp]> = [
    [verifier({ ...MAC, plateforme: "linux" }, LIEUX), /macOS.*linux/],
    [verifier({ ...MAC, existe: () => false }, LIEUX), /Seatbelt.*\/usr\/bin\/sandbox-exec/],
    [verifier({ ...MAC, versionDeClaude: () => "2.1.200 (Claude Code)" }, LIEUX), new RegExp(`2\\.1\\.200 est trop ancien.*${VERSION_MINIMALE.replaceAll(".", "\\.")}`)],
    [verifier({ ...MAC, versionDeClaude: () => null }, LIEUX), /`claude --version` n'a pas répondu/],
    // L'app pose sa station sous `~/.config/brigade` : ses cooks y
    // travailleraient là où aucun cook ne lit.
    [verifier(MAC, { ...LIEUX, worktrees: "/Users/chef/.config/brigade/station/etat" }), /^la configuration du bac à sable ne tient pas sur ce Mac — .*\/Users\/chef\/\.config\/brigade/],
    [verifier(MAC, { ...LIEUX, caches: [HOME] }), /^la configuration du bac à sable ne tient pas sur ce Mac — .*ni à la racine du compte/],
    [verifier(MAC, { ...LIEUX, caches: ["Library/Caches"] }), /BRIGADE_SANDBOX_CACHES nomme « Library\/Caches » : un cache du projet se donne en chemin absolu/],
    [verifier(MAC, { ...LIEUX, home: undefined }), /HOME n'est pas un chemin absolu/],
  ];
  for (const [verification, motif] of raisons) {
    assert.equal(verification.ok, false);
    const raison = verification.ok ? "" : verification.raison;
    assert.match(raison, motif);
    unePhrase(raison);
  }
});

test("hors de macOS, la cuisine n'est pas locale : pas de bac à sable, et rien n'est demandé à `claude`", () => {
  let demande = false;
  const linux: Sondes = { plateforme: "linux", existe: () => true, versionDeClaude: () => ((demande = true), "2.1.300") };
  assert.equal(configBacASableLocal(linux, LIEUX, () => HOTES), null);
  assert.equal(demande, false);
});

test("sur un Mac, la cuisine locale a son bac à sable ; s'il n'y est pas, elle refuse de s'ouvrir, et dit pourquoi", () => {
  const bac = configBacASableLocal(MAC, LIEUX, () => HOTES);
  assert.equal(bac?.version, "2.1.300");
  assert.equal(bac?.home, HOME);
  assert.deepEqual(bac?.caches, LIEUX.caches);
  assert.throws(
    () => configBacASableLocal({ ...MAC, existe: () => false }, LIEUX, () => HOTES),
    (erreur: unknown) => erreur instanceof ConfigInvalide && /^sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — Seatbelt est introuvable/.test(erreur.message),
  );
});

test("le profil se pose sur chaque `claude` : le cook perd `bypassPermissions`, le reviewer et le jugement le reçoivent devant `--setting-sources`", () => {
  const config = configurer({ worktree: "/Users/chef/wt/12", caches: [], hotes: HOTES, home: HOME });
  const profil = argumentsDuBacASable(config);
  const cook = argumentsClaude("consigne", CALIBRAGE);
  const place = cook.indexOf("--permission-mode");
  assert.deepEqual(poserLeBacASable(cook, config), [...cook.slice(0, place), ...profil, ...cook.slice(place + 2)]);
  assert.equal(poserLeBacASable(cook, config).includes("bypassPermissions"), false);
  for (const args of [argumentsReviewer("consigne", CALIBRAGE), argumentsJuge("consigne", CALIBRAGE)]) {
    const sources = args.indexOf("--setting-sources");
    assert.deepEqual(poserLeBacASable(args, config), [...args.slice(0, sources), ...profil, ...args.slice(sources)]);
  }
  assert.throws(() => poserLeBacASable(["-p", "x"], config), /ne s'y pose pas/);
});

test("sans bac à sable, les arguments partent tels quels ; avec, le répertoire du lancement est le seul ouvert à l'écriture, avec les caches", () => {
  const args = argumentsClaude("consigne", CALIBRAGE);
  assert.equal(dansLeBacASableLocal(null, args, "/Users/chef/wt/12"), args);
  let lues = 0;
  const bac: BacASableLocal = { version: "2.1.300", home: HOME, caches: ["/Users/chef/Library/Caches/brigade"], hotes: () => (lues++, HOTES) };
  const dedans = dansLeBacASableLocal(bac, args, "/Users/chef/wt/12");
  const reglages = JSON.parse(dedans[dedans.indexOf("--settings") + 1] ?? "") as Reglages;
  assert.deepEqual(reglages.sandbox.filesystem.allowWrite, ["/Users/chef/wt/12", "/Users/chef/Library/Caches/brigade"]);
  assert.ok(reglages.sandbox.network.allowedDomains.includes("registry.npmjs.org"));
  // La liste réseau est relue à chaque lancement.
  dansLeBacASableLocal(bac, args, "/Users/chef/wt/13");
  assert.equal(lues, 2);
});

// Les réglages qu'un lancement a reçus, et son mode de permission.
function profilDe(args: string[]): { mode: string | undefined; reglages: Reglages } {
  const settings = args.indexOf("--settings");
  assert.notEqual(settings, -1, `lancé hors du bac à sable : ${args.join(" ").slice(0, 200)}`);
  return { mode: args[args.indexOf("--permission-mode") + 1], reglages: JSON.parse(args[settings + 1] ?? "") as Reglages };
}

test("dans une cuisine locale, le cook, le reviewer de la pass et le jugement du manager partent chacun dans le bac à sable, avec le profil d'un cook prêté", { skip: posixOnly("runs a kitchen whose cook is the fake claude (a bash script) and compares the manager's profile with the real temporary directory: on the Windows job no judgement was ever launched (condition never met)") }, async (t) => {
  let lues = 0;
  const bacASable: BacASableLocal = { version: "2.1.300", home: HOME, caches: ["/Users/chef/Library/Caches/brigade"], hotes: () => (lues++, HOTES) };
  const c = cuisine(t, { bacASable, pass: true, manager: {}, issues: [issue(15), issue(30, [])] });
  chef(c.repertoire, "manager.enabled");
  // Le jugement n'a aucun outil ; le reviewer, ses trois outils de lecture.
  const outils = (args: string[]) => args[args.indexOf("--tools") + 1];
  const jugements = () => c.relectures().filter((lance) => outils(lance.args) === "");
  const relectures = () => c.relectures().filter((lance) => outils(lance.args) !== "");
  await jusqua(() => relectures().length >= 1 && jugements().length >= 1);

  const cook = c.cooks()[0];
  const relecture = relectures()[0];
  const jugement = jugements()[0];
  assert.ok(cook && relecture && jugement);
  for (const [lance, ou] of [
    [cook, cook.cwd],
    [relecture, relecture.cwd],
    [jugement, tmpdir()],
  ] as const) {
    const { mode, reglages } = profilDe(lance.args);
    assert.equal(mode, "dontAsk");
    assert.equal(lance.args.includes("bypassPermissions"), false);
    // Le profil d'un cook prêté par la box, pour le répertoire où il travaille.
    assert.deepEqual(reglages, configurer({ worktree: ou, caches: bacASable.caches, hotes: HOTES, home: HOME }).reglages);
    assert.ok(reglages.sandbox.filesystem.denyRead.includes(join(HOME, ".ssh")));
    assert.ok(reglages.sandbox.filesystem.denyRead.includes(join(HOME, ".claude/.credentials.json")));
    assert.equal(reglages.sandbox.network.strictAllowlist, true);
    assert.ok(reglages.sandbox.network.allowedDomains.includes("registry.npmjs.org"));
    assert.equal(reglages.sandbox.network.allowedDomains.includes("example.com"), false);
  }
  assert.match(cook.cwd, /\/worktrees\//);
  assert.ok(lues >= 3);
});

test("la commande de vérification dit `ok`, ou la raison en une phrase et le code 1 ; mal appelée, code 2", async () => {
  const env = { BRIGADE_STATION_DIR: "/Users/chef/Library/Application Support/brigade/station" };
  const ok = appeler((appel) => verifierEnCommande(appel, MAC, HOME), [], env);
  assert.equal(await ok.fin, 0);
  assert.equal(ok.sortie(), "ok\n");

  const sansSeatbelt = appeler((appel) => verifierEnCommande(appel, { ...MAC, existe: () => false }, HOME), [], env);
  assert.equal(await sansSeatbelt.fin, 1);
  assert.match(sansSeatbelt.sortie(), /^Seatbelt est introuvable : `\/usr\/bin\/sandbox-exec` n'existe pas sur ce Mac\n$/);

  // La station de l'app, sous `~/.config/brigade` : ses worktrees n'y sont
  // pas, ils vivent dans l'atelier, hors de ce qu'un cook ne lit pas.
  const sousLaConfig = appeler((appel) => verifierEnCommande(appel, MAC, HOME), [], { BRIGADE_STATION_DIR: "/Users/chef/.config/brigade/station" });
  assert.equal(await sousLaConfig.fin, 0);
  assert.equal(sousLaConfig.sortie(), "ok\n");

  for (const [args, avec] of [
    [[], {}],
    [["--autre"], env],
    [["--settings"], env],
    [["--settings", "wt"], env],
  ] as const) {
    const mal = appeler((appel) => verifierEnCommande(appel, MAC, HOME), [...args], avec);
    assert.equal(await mal.fin, 2, args.join(" "));
    assert.match(mal.sortie(), /^brigade : .*usage : node runtime\/src\/bac-a-sable\/verifier\.ts/);
  }
});

test("`--settings` rend les réglages d'un `claude` lancé dans ce répertoire, la liste réseau étant les hôtes donnés", async () => {
  const appel = appeler((a) => verifierEnCommande(a, MAC, HOME), ["--settings", "/Users/chef/wt/12", "registry.npmjs.org"], { BRIGADE_SANDBOX_CACHES: "/Users/chef/Library/Caches/brigade" });
  assert.equal(await appel.fin, 0);
  assert.deepEqual(JSON.parse(appel.sortie()), configurer({ worktree: "/Users/chef/wt/12", caches: ["/Users/chef/Library/Caches/brigade"], hotes: HOTES, home: HOME }).reglages);
});
