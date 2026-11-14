// La déclaration du bac à sable d'un projet (`.claude/brigade/bac-a-sable.json`) :
// ses `ports` et ses dossiers d'`ecriture`, dans des limites fixes ; hors
// d'elles, refusée en entier, le refus nommant l'entrée et la limite. Relue à
// chaque lancement, sur la branche d'intégration ; absente, rien ne change.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { configurer, type Cook, type Reglages } from "../../src/bac-a-sable/configuration.ts";
import { DECLARATION_BAC_A_SABLE, DeclarationRefusee, lireDeclarationBacASable } from "../../src/bac-a-sable/declaration.ts";
import { SEATBELT, type Sondes } from "../../src/bac-a-sable/detection.ts";
import { configBacASableLocal, dansLeBacASableLocal, type BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { lireALaBase } from "../../src/depot.ts";
import { reglesDuProjet } from "../../src/reseau.ts";
import { ENV_GIT, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const HOME = "/Users/chef";
const ETAT = "/Users/chef/Library/Application Support/brigade";
const WORKTREE = "/Users/chef/brigade-wt/850-bac-a-sable";
const HOTES = reglesDuProjet(["registry.npmjs.org"]);
const cook = (): Cook => ({ worktree: WORKTREE, caches: [], hotes: HOTES, home: HOME, etat: ETAT });
const avec = (texte: string) => configurer({ ...cook(), declaration: lireDeclarationBacASable(texte) ?? undefined }).reglages;
const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n", temporaire: () => "/private/var/folders/xy/T" };
const ARGS = argumentsClaude("consigne", { model: "sonnet", effort: "low" });
const reglagesDe = (args: string[]) => JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as Reglages;

// Le bac à sable de Claude Code n'a pas de champ par port : `allowLocalBinding`
// ouvre toute la boucle locale, et #3541 l'ouvre déjà pour chaque cook. Un port
// déclaré se juge aux limites et ne change pas la configuration : décision du
// manager sur #3549, option (a), dans sa réponse au blocage du 2026-11-14, qui
// réécrit le critère 1 ainsi.
test("`ports` : avec {\"ports\":[5037]}, la liaison reste sur la boucle locale seule, sans hôte ajouté ni exposition au réseau", () => {
  assert.deepEqual(lireDeclarationBacASable('{"ports":[5037]}'), { ports: [5037], ecriture: [] });
  assert.deepEqual(lireDeclarationBacASable('{"ports":["127.0.0.1:8080","[::1]:9000","localhost:5037",5037]}'), { ports: [8080, 9000, 5037], ecriture: [] });
  const reglages = avec('{"ports":[5037]}');
  const sans = configurer(cook()).reglages;
  assert.deepEqual(reglages.sandbox.network.allowedDomains, sans.sandbox.network.allowedDomains);
  assert.equal(reglages.sandbox.network.allowLocalBinding, true);
  assert.equal(reglages.sandbox.network.allowAllUnixSockets, false);
  assert.equal(reglages.sandbox.network.strictAllowlist, true);
  assert.deepEqual(reglages.sandbox.network, sans.sandbox.network);
  assert.deepEqual(configurer({ ...cook(), declaration: lireDeclarationBacASable('{"ports":[5037]}') ?? undefined }), configurer(cook()));
});

test("`ecriture` : `~/.gradle` est ouvert à l'écriture en plus du worktree, au bac à sable comme aux outils de `claude`", () => {
  const reglages = avec('{"ecriture":["~/.gradle"]}');
  const sans = configurer(cook()).reglages;
  assert.deepEqual(reglages.sandbox.filesystem.allowWrite, [...sans.sandbox.filesystem.allowWrite, "/Users/chef/.gradle"]);
  assert.equal(reglages.sandbox.filesystem.allowWrite[0], WORKTREE);
  assert.ok(reglages.permissions.allow.includes("Edit(//Users/chef/.gradle/**)"));
  // Relatif : sous le worktree ; absolu hors du compte : tel quel.
  assert.ok(avec('{"ecriture":["build-cache"]}').sandbox.filesystem.allowWrite.includes(`${WORKTREE}/build-cache`));
  assert.ok(avec('{"ecriture":["/opt/gradle-cache"]}').sandbox.filesystem.allowWrite.includes("/opt/gradle-cache"));
  // Rien d'autre ne bouge.
  assert.deepEqual(reglages.sandbox.filesystem.denyRead, sans.sandbox.filesystem.denyRead);
  assert.deepEqual(reglages.sandbox.network, sans.sandbox.network);
});

test("une déclaration hors des limites est refusée en entier, et le refus nomme l'entrée et la limite", () => {
  const refus: [string, RegExp][] = [
    ['{"ports":["0.0.0.0:5037"]}', /ports "0\.0\.0\.0:5037" : un port ne s'ouvre que sur la boucle locale/],
    ['{"ports":["192.168.1.2:80"]}', /ports "192\.168\.1\.2:80" : un port ne s'ouvre que sur la boucle locale/],
    ['{"ports":[70000]}', /ports 70000 : un port est un entier de 1 à 65535/],
    ['{"ports":[0]}', /ports 0 : un port est un entier de 1 à 65535/],
    ['{"ports":["127.0.0.1:99999"]}', /ports "127\.0\.0\.1:99999" : un port est un entier de 1 à 65535/],
    ['{"ports":[5037.5]}', /ports 5037\.5 : un port est un entier/],
    ['{"ecriture":["~/.ssh"]}', /ecriture « ~\/\.ssh » : un dossier déclaré n'est ni ne contient les secrets du chef ou l'état de Brigade \(\/Users\/chef\/\.ssh\)/],
    ['{"ecriture":["~/.config/gh"]}', /ecriture « ~\/\.config\/gh » : .*secrets du chef/],
    ['{"ecriture":["~/.claude"]}', /ecriture « ~\/\.claude » : .*l'état de Brigade \(\/Users\/chef\/\.claude/],
    ['{"ecriture":["~/.claude/projects"]}', /ecriture « ~\/\.claude\/projects » : .*l'état de Brigade \(\/Users\/chef\/\.claude\)/],
    ['{"ecriture":["~/.config"]}', /ecriture « ~\/\.config » : .*secrets du chef/],
    [`{"ecriture":["${ETAT}/station"]}`, /ecriture « \/Users\/chef\/Library\/Application Support\/brigade\/station » : .*état de Brigade/],
    ['{"ecriture":["~/Library"]}', /ecriture « ~\/Library » : .*secrets du chef/],
    ['{"ecriture":["~/.aws-credentials"]}', /ecriture « ~\/\.aws-credentials » : un dossier déclaré ne porte pas d'identifiants ni de jetons/],
    ['{"ecriture":["~/tokens"]}', /ecriture « ~\/tokens » : .*jetons/],
    ['{"ecriture":["/"]}', /ecriture « \/ » : un cook n'écrit jamais à la racine du système de fichiers/],
    ['{"ecriture":["~"]}', /ecriture « ~ » : un cook n'écrit ni dans le compte entier \(\/Users\/chef\), ni au-dessus/],
    ['{"ecriture":["/Users/chef"]}', /ecriture « \/Users\/chef » : un cook n'écrit ni dans le compte entier/],
    ['{"ecriture":["/Users"]}', /ecriture « \/Users » : un cook n'écrit ni dans le compte entier/],
    ['{"ecriture":["../autre-worktree"]}', /ecriture « \.\.\/autre-worktree » : un chemin relatif reste sous le worktree/],
    ['{"ecriture":["build/../../.."]}', /ecriture « build\/\.\.\/\.\.\/\.\. » : un chemin relatif reste sous le worktree/],
    ['{"ecriture":["cache/*"]}', /ecriture « cache\/\* » : .*ni motif/],
    ['{"ecriture":[""]}', /ecriture "" : un dossier se donne en chemin non vide/],
    ['{"ports":[5037],"hosts":["example.com"]}', /la clé « hosts » : clé inconnue/],
    ['{"ports":5037}', /la clé « ports » : une liste est attendue/],
    ["[5037]", /le fichier : un objet est attendu/],
    ["{ports: [5037]", /le fichier : du JSON est attendu/],
  ];
  for (const [texte, motif] of refus) {
    assert.throws(
      () => avec(texte),
      (erreur: unknown) => {
        assert.ok(erreur instanceof DeclarationRefusee, `${texte} : ${String(erreur)}`);
        assert.match(erreur.message, motif, texte);
        assert.match(erreur.message, /^`\.claude\/brigade\/bac-a-sable\.json`, .* — la déclaration est refusée en entier$/);
        return true;
      },
    );
  }
  // Une seule entrée hors des limites refuse toute la déclaration.
  assert.throws(() => avec('{"ports":[5037],"ecriture":["~/.gradle","~/.ssh"]}'), DeclarationRefusee);
});

test("sans déclaration, la configuration est celle d'avant, à l'identique", () => {
  assert.equal(lireDeclarationBacASable(null), null);
  assert.equal(lireDeclarationBacASable(undefined), null);
  const { etat: _etat, ...avant } = cook();
  assert.deepEqual(configurer(cook()), configurer(avant));
  const bac: BacASableLocal = { version: "2.1.300", home: HOME, caches: [], hotes: () => HOTES };
  const avertis: string[] = [];
  const declare: BacASableLocal = { ...bac, declaration: () => null, etat: ETAT, avertir: (m) => void avertis.push(m) };
  assert.deepEqual(dansLeBacASableLocal(declare, ARGS, WORKTREE), dansLeBacASableLocal(bac, ARGS, WORKTREE));
  assert.deepEqual(avertis, []);
});

test("refusée ou illisible, la déclaration ne s'applique pas du tout : le lancement part comme avant, et le refus se dit", () => {
  const avertis: string[] = [];
  let texte: () => string | null = () => '{"ports":[5037],"ecriture":["~/.gradle","~/.ssh"]}';
  const bac: BacASableLocal = { version: "2.1.300", home: HOME, caches: [], hotes: () => HOTES, declaration: () => texte(), etat: ETAT, avertir: (m) => void avertis.push(m) };
  const avant = dansLeBacASableLocal({ version: "2.1.300", home: HOME, caches: [], hotes: () => HOTES, etat: ETAT }, ARGS, WORKTREE);
  assert.deepEqual(dansLeBacASableLocal(bac, ARGS, WORKTREE), avant);
  assert.equal(reglagesDe(dansLeBacASableLocal(bac, ARGS, WORKTREE)).sandbox.filesystem.allowWrite.includes("/Users/chef/.gradle"), false);
  assert.match(avertis[0] ?? "", /^brigade : la déclaration de bac à sable du projet ne s'applique pas, ce lancement part sans elle — `\.claude\/brigade\/bac-a-sable\.json`, ecriture « ~\/\.ssh » : /);
  texte = () => {
    throw new Error("git ls-tree : délai dépassé");
  };
  avertis.length = 0;
  assert.deepEqual(dansLeBacASableLocal(bac, ARGS, WORKTREE), avant);
  assert.match(avertis[0] ?? "", /ne s'applique pas.*git ls-tree : délai dépassé/);
});

test("la déclaration est relue sur la branche d'intégration à chaque lancement : changée entre deux, le second voit le changement", (t) => {
  const racine = repertoireTemporaire(t);
  const amont = join(racine, "amont");
  const clone = join(racine, "clone");
  mkdirSync(amont);
  git(amont, "init", "-q", "-b", "main");
  const declarer = (texte: string) => {
    mkdirSync(join(amont, ".claude/brigade"), { recursive: true });
    writeFileSync(join(amont, DECLARATION_BAC_A_SABLE), texte);
    git(amont, "add", "-A");
    git(amont, "commit", "-q", "-m", "déclaration");
  };
  declarer('{"ecriture":["~/.gradle"]}');
  git(racine, "clone", "-q", amont, clone);
  const avertis: string[] = [];
  const bac = configBacASableLocal(MAC, { home: HOME, worktrees: "/Users/chef/brigade-wt", caches: [] }, () => HOTES, undefined, {
    declaration: () => lireALaBase({ clone, base: "main" }, DECLARATION_BAC_A_SABLE, ENV_GIT),
    etat: ETAT,
    avertir: (m) => void avertis.push(m),
  });
  const ecrits = () => reglagesDe(dansLeBacASableLocal(bac, ARGS, WORKTREE)).sandbox.filesystem.allowWrite;
  assert.ok(ecrits().includes("/Users/chef/.gradle"));
  declarer('{"ecriture":["~/.m2"]}');
  git(clone, "fetch", "-q", "origin");
  assert.ok(ecrits().includes("/Users/chef/.m2"));
  assert.equal(ecrits().includes("/Users/chef/.gradle"), false);
  assert.deepEqual(avertis, []);
});

test("declaration.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
