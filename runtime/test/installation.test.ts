// L'installation de brigade dans un projet : ce que le dépôt et la machine
// doivent porter pour qu'un cook puisse y être lancé, vérifié d'un coup et sans
// rien lancer ; les labels créés ; le coût du setup mesuré ; la désinstallation.
import assert from "node:assert/strict";
import { chmodSync, chownSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { empreinteDuCode, lireCodeEnService, noterCodeEnService } from "../src/code.ts";
import { desinstaller, etapesAReprendre, InstallationRefusee, jugerReseau, jugerTemporaire, jugerUnites, LABELS, mesurerSetup, poserLabels, tenir, VARIABLES, verifier, jugerRenouvellement, type Constat } from "../src/installation.ts";
import type { EtatDuRenouvellement } from "../src/sonde-renouvellement.ts";
import type { Verdict } from "../src/verdict.ts";
import { retirerDecision } from "../src/decisions.ts";
import { configRail } from "../src/alimenter.ts";
import { lireSeuils } from "../src/derive.ts";
import { lireReglages } from "../src/garde-fous.ts";
import { configManager } from "../src/manager.ts";
import { configPass } from "../src/pass.ts";
import { configReviewer } from "../src/reviewer.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { configStation } from "../src/station.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as declarerStations } from "../src/declarer-stations.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { principal as poserDecisions } from "../src/poser-decisions.ts";
import { principal as etapes } from "../src/etapes-cli.ts";
import { ETAPES, installationDe } from "../src/etapes.ts";
import { prendreVerrou } from "../src/verrou.ts";
import { decider } from "./aides/cuisine.ts";
import { appeler, BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, issueGitHub, jusqua, lancer, repertoireDuFichier, repertoireTemporaire, rienEcritParLeRuntime, type FauxGh } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/installation-cli.ts");
const MAIN = join(import.meta.dirname, "../src/main.ts");
const FAUX_SYSTEMCTL = join(import.meta.dirname, "aides/faux-systemctl.sh");
const FAUX_SETUP = join(import.meta.dirname, "aides/faux-setup.sh");
const DEPLOIEMENT = join(import.meta.dirname, "../deploy");
const PROJET = "calculus";
const GATES = ".claude/brigade/gates.sh";
const SETUP = ".claude/brigade/worktree-setup.sh";
// L'adresse de l'origine dans le gabarit : chaque copie y met la sienne.
const ORIGINE = "@ORIGINE@";
const LABELS_DU_DEPOT = `repos/${DEPOT}/labels?per_page=100`;

// Ce que GitHub dit du dépôt à un compte qui l'administre et y pousse.
const DEPOT_LU = { full_name: DEPOT, permissions: { admin: true, push: true, pull: true }, security_and_analysis: { secret_scanning_push_protection: { status: "enabled" } } };
// La protection de la branche d'intégration, telle que GitHub la rend à un administrateur.
const PROTECTION_DE_LA_BASE = `repos/${DEPOT}/branches/${BASE}/protection`;
const PROTECTION_LUE = { required_pull_request_reviews: { required_approving_review_count: 0 }, enforce_admins: { enabled: true }, required_status_checks: null };

const bindings = (lignes: string[]) => ["# Le projet", "", "## Équipe multi-agents (plugin brigade)", "", ...lignes, "", "## Autre chose", "", "- **Dev local** : ailleurs"].join("\n");
const BINDINGS = bindings([
  `- **Branche d'intégration** : \`${BASE}\``,
  "- **Gates** : `.claude/brigade/gates.sh <WT>`",
  "- **Plafond des gates** : `75 s` de processeur",
  "- **Zones de fichiers** : `src/`, `docs/`",
  // Un binding dont la valeur tient en sous-liste.
  "- **Dev local** :",
  "  - **Serveur** : `npm run dev`",
]);

type Fichier = { contenu: string; executable?: boolean } | { lien: string };

// Ce que le dépôt du projet porte sur sa branche d'intégration. `null` : le
// fichier n'y est pas.
// `secrets` : les noms de secrets qu'il déclare.
type Porte = { bindings?: string | null; gates?: Fichier | null; setup?: Fichier | null; secrets?: string };

// Le dépôt d'un projet tel qu'il est poussé sur son origine, fabriqué une fois
// par fichier pour chaque chose qu'un test lui fait porter : chaque test en
// reçoit une copie, et copier coûte bien moins que rejouer `git`.
const gabarits = new Map<string, string>();
function gabarit(porte: Porte): string {
  const cle = JSON.stringify(porte);
  const connu = gabarits.get(cle);
  if (connu !== undefined) return connu;
  const racine = repertoireDuFichier("brigade-test-installation-", () => gabarits.clear());
  mkdirSync(join(racine, "clone"));
  const [origine, travail] = [join(racine, "origine.git"), join(racine, "travail")];
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  const fichiers: Record<string, Fichier | null> = {
    "CLAUDE.md": porte.bindings === null ? null : { contenu: porte.bindings ?? BINDINGS },
    [GATES]: porte.gates === undefined ? { contenu: "#!/usr/bin/env bash\nexit 0\n", executable: true } : porte.gates,
    [SETUP]: porte.setup === undefined ? { lien: FAUX_SETUP } : porte.setup,
    ".claude/brigade/secrets": porte.secrets === undefined ? null : { contenu: porte.secrets },
  };
  writeFileSync(join(travail, "LISEZMOI"), "le projet\n");
  for (const [chemin, fichier] of Object.entries(fichiers)) {
    if (fichier === null) continue;
    const cible = join(travail, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    if ("lien" in fichier) symlinkSync(fichier.lien, cible);
    else {
      writeFileSync(cible, fichier.contenu);
      if (fichier.executable) chmodSync(cible, 0o755);
    }
  }
  git(travail, "add", ".");
  git(travail, "commit", "-q", "-m", "installe brigade");
  git(travail, "push", "-q", origine, BASE);
  // Le clone réservé : posé avant l'installation, il ne connaît pas encore ce
  // que l'origine porte.
  git(join(racine, "clone"), "init", "-q", `--initial-branch=${BASE}`);
  git(join(racine, "clone"), "remote", "add", "origin", ORIGINE);
  rmSync(travail, { recursive: true });
  gabarits.set(cle, racine);
  return racine;
}

// Un projet installé : son dépôt poussé sur l'origine, le clone réservé, le
// répertoire d'état, et l'environnement du service — celui que la commande lit.
function projet(t: TestContext, porte: Porte = {}) {
  const racine = repertoireTemporaire(t);
  cpSync(gabarit(porte), racine, { recursive: true });
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  const config = join(clone, ".git/config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(ORIGINE, origine));

  const etat = join(racine, "etat");
  mkdirSync(etat);
  // Le réglage du geste d'installation, et la racine qu'il déclare : ceux du
  // test, tenus par le compte qui joue — la box de test n'a pas de root.
  mkdirSync(join(racine, "sauvegardes"), { mode: 0o755 });
  chmodSync(join(racine, "sauvegardes"), 0o755);
  writeFileSync(join(racine, "installateur.conf"), `sauvegardes=${join(racine, "sauvegardes")}\n`);
  // Ce que la box a posé : les unités du dépôt, copiées telles quelles.
  const unites = join(racine, "unites");
  mkdirSync(unites);
  for (const nom of ["brigade@.service", "brigade-sauvegarde@.service", "brigade-sauvegarde@.timer"]) cpSync(join(DEPLOIEMENT, nom), join(unites, nom));
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}`, { corps: DEPOT_LU });
  gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.map(({ name }) => ({ name })) });
  gh.repondre(PROTECTION_DE_LA_BASE, { corps: PROTECTION_LUE });
  const env: Record<string, string> = {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: etat,
    BRIGADE_PROJECT: PROJET,
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_SYSTEMCTL_BIN: FAUX_SYSTEMCTL,
    BRIGADE_INSTALLER_CONFIG: join(racine, "installateur.conf"),
    FAUX_SYSTEMCTL_UNITES: `brigade@${PROJET}.service brigade-sauvegarde@${PROJET}.timer`,
    FAUX_SYSTEMCTL_FRAGMENT: join(unites, "brigade@.service"),
    FAUX_SETUP: join(racine, "setup"),
    // Le répertoire temporaire de `claude` : celui du test, pas celui de la machine.
    CLAUDE_CODE_TMPDIR: racine,
  };
  // Ce que le chef a décidé : au journal du projet, leur seul support.
  for (const [nom, valeur] of Object.entries(DECIDEES)) decider(etat, nom, valeur);
  return { origine, clone, etat, unites, racine, gh, env };
}

const DECIDEES = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

// Une décision qui n'est plus posée au journal.
function sansDecision(etat: string, ...noms: string[]): void {
  const journal = ouvrirJournal(etat);
  try {
    for (const nom of noms) retirerDecision(journal, { projet: PROJET, nom, auteur: "chef" });
  } finally {
    journal.fermer();
  }
}

// Une décision posée telle quelle, valeur illisible comprise : ce qu'un journal
// d'une autre version, ou écrit à la main, pourrait porter.
function decisionBrute(etat: string, nom: string, valeur: string): void {
  const journal = ouvrirJournal(etat);
  try {
    journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "decision.set", payload: { name: nom, value: valeur, previous: null } });
  } finally {
    journal.fermer();
  }
}

const manques = (constats: Constat[]) => constats.filter((constat) => constat.etat === "manque").map((constat) => constat.texte);
// La ligne du renouvellement n'est pas de celles que ces tests regardent : elle a ses propres tests.
const notes = (constats: Constat[]) => constats.filter((constat) => constat.etat === "note" && !constat.texte.startsWith("renouvellement")).map((constat) => constat.texte);
const constates = (constats: Constat[]) => constats.filter((constat) => constat.etat === "ok").map((constat) => constat.texte);
const sans = (env: Record<string, string>, ...variables: string[]) => Object.fromEntries(Object.entries(env).filter(([nom]) => !variables.includes(nom)));

describe("les variables obligatoires", () => {
  const lecteurs = [configRail, lireReglages, configStation, configPass, configReviewer, configManager, lireSeuils];
  const complet = Object.fromEntries(VARIABLES.map((variable) => [variable, { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_BASE_BRANCH: BASE }[variable as string] ?? "sonnet"]));
  // Ce que le runtime lit, une fois les décisions du journal versées à son
  // environnement : le calibrage n'est plus une variable obligatoire.
  const calibre = { ...complet, BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "low", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "low" };
  const lues = [...VARIABLES, "BRIGADE_MANAGER_MODEL", "BRIGADE_MANAGER_EFFORT", "BRIGADE_REVIEWER_MODEL", "BRIGADE_REVIEWER_EFFORT"];

  test("la liste suffit au runtime : avec elles seules, aucun lecteur de configuration ne refuse", () => {
    for (const lecteur of lecteurs) lecteur(calibre);
  });

  test("chacune est exigée : sans elle, le runtime refuse de démarrer en la nommant", () => {
    // Ces deux-là sont exigées par le point d'entrée, avant tout lecteur.
    const duPointDEntree = ["BRIGADE_STATE_DIR", "BRIGADE_PROJECT"];
    for (const variable of lues.filter((nom) => !duPointDEntree.includes(nom))) {
      const refus = lecteurs.flatMap((lecteur) => {
        try {
          lecteur(sans(calibre, variable));
          return [];
        } catch (erreur) {
          assert.ok(erreur instanceof ConfigInvalide);
          return [erreur.message];
        }
      });
      assert.equal(refus.length, 1, variable);
      assert.match(refus[0] ?? "", new RegExp(variable));
    }
  });
});

describe("le réglage du geste d'installation", () => {
  const sauvegardes = (racine: string) => join(racine, "sauvegardes");
  const du_geste = (constats: Constat[]) => constats.filter((constat) => /réglage du geste|racine des sauvegardes|`sauvegardes=` de/.test(constat.texte));

  test("une racine que root tient seul est constatée, avec ce qui a été lu", async (t) => {
    const { env, racine } = projet(t);

    const constats = await verifier(env);

    const [dit] = du_geste(constats);
    assert.equal(dit?.etat, "ok");
    assert.ok(dit?.texte.includes(sauvegardes(racine)));
    assert.ok(dit?.texte.includes(join(racine, "installateur.conf")));
  });

  test("absent, il est à savoir, pas un manque : une box qui ne sert pas d'app n'en a pas besoin", async (t) => {
    const { env, racine } = projet(t);
    rmSync(join(racine, "installateur.conf"));

    const constats = await verifier(env);

    const [dit] = du_geste(constats);
    assert.equal(dit?.etat, "note");
    assert.match(dit?.geste ?? "", /printf 'sauvegardes=<racine des sauvegardes>\\n' \| sudo tee/);
    assert.deepEqual(manques(constats), []);
  });

  test("une racine tenue par le compte de service manque : à qui elle appartient, et la commande qui la remet à root", { skip: process.getuid?.() !== 0 && "chown réclame root : la box de test n'a pas de root" }, async (t) => {
    const { env, racine } = projet(t);
    chownSync(sauvegardes(racine), 1001, 1001);

    const [dit] = du_geste(await verifier(env));

    assert.equal(dit?.etat, "manque");
    assert.match(dit?.texte ?? "", new RegExp(`${sauvegardes(racine)} appartient à l'uid 1001 \\(mode 755\\)`));
    assert.match(dit?.texte ?? "", /root n'y crée rien/);
    assert.equal(dit?.geste?.includes(`sudo chown root:root ${sauvegardes(racine)} && sudo chmod go-w ${sauvegardes(racine)}`), true);
  });

  test("une racine ouverte en écriture manque, avec le répertoire, son mode et la commande qui le ferme", async (t) => {
    const { env, racine } = projet(t);
    chmodSync(sauvegardes(racine), 0o775);

    const [dit] = du_geste(await verifier(env));

    assert.equal(dit?.etat, "manque");
    assert.match(dit?.texte ?? "", new RegExp(`${sauvegardes(racine)} appartient à l'uid ${process.getuid?.()} \\(mode 775\\)`));
    assert.match(dit?.texte ?? "", /root n'y crée rien/);
    assert.equal(dit?.geste?.includes(`sudo chown root:root ${sauvegardes(racine)} && sudo chmod go-w ${sauvegardes(racine)}`), true);
  });

  test("un parent de la racine que root ne tient pas manque, et c'est lui qui est nommé", async (t) => {
    const { env, racine } = projet(t);
    const profonde = join(sauvegardes(racine), "sous");
    mkdirSync(profonde);
    chmodSync(sauvegardes(racine), 0o775);
    writeFileSync(join(racine, "installateur.conf"), `sauvegardes=${profonde}\n`);

    const constats = await verifier(env);

    const [dit] = du_geste(constats);
    assert.equal(dit?.etat, "manque");
    assert.ok(dit?.texte.includes(`${sauvegardes(racine)} appartient à l'uid`), dit?.texte);
    assert.ok(dit?.texte.includes("mode 775"));
  });

  test("une racine absente manque, avec la commande qui la crée", async (t) => {
    const { env, racine } = projet(t);
    rmSync(sauvegardes(racine), { recursive: true });

    const [dit] = du_geste(await verifier(env));

    assert.equal(dit?.etat, "manque");
    assert.match(dit?.texte ?? "", /n'existe pas/);
    assert.equal(dit?.geste?.includes(`sudo install -d ${sauvegardes(racine)}`), true);
  });

  test("une racine qui est un lien manque", async (t) => {
    const { env, racine } = projet(t);
    rmSync(sauvegardes(racine), { recursive: true });
    mkdirSync(join(racine, "ailleurs"));
    symlinkSync(join(racine, "ailleurs"), sauvegardes(racine));

    const [dit] = du_geste(await verifier(env));

    assert.equal(dit?.etat, "manque");
    assert.match(dit?.texte ?? "", /est un lien/);
  });

  test("un réglage présent sans `sauvegardes=` ou qui ne se lit pas manque, avec les mots du geste", async (t) => {
    const { env, racine } = projet(t);
    writeFileSync(join(racine, "installateur.conf"), "ports=3128-3227\n");
    const [sans] = du_geste(await verifier(env));
    assert.equal(sans?.etat, "manque");
    assert.match(sans?.texte ?? "", /ne dit pas `sauvegardes=`/);

    writeFileSync(join(racine, "installateur.conf"), "sauvegardes=relatif\n");
    const [relatif] = du_geste(await verifier(env));
    assert.equal(relatif?.etat, "manque");
  });

  test("un réglage qu'un autre compte pourrait écrire manque", async (t) => {
    const { env, racine } = projet(t);
    chmodSync(join(racine, "installateur.conf"), 0o666);

    const [dit] = du_geste(await verifier(env));

    assert.equal(dit?.etat, "manque");
    assert.match(dit?.texte ?? "", /n'est pas à root seul/);
  });
});

describe("la vérification", () => {
  test("un projet installé est prêt : rien ne manque", async (t) => {
    const { env } = projet(t);

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    assert.deepEqual(notes(constats), []);
  });

  test("elle ne lance ni cook ni setup, n'écrit rien sur GitHub et ne déplace rien dans le clone", async (t) => {
    const { env, gh, etat, clone } = projet(t);
    const refs = git(clone, "for-each-ref");

    await verifier(env);

    // Pas même une référence du clone : la station peut rapatrier au même instant.
    assert.equal(git(clone, "for-each-ref"), refs);
    assert.equal(existsSync(`${env.FAUX_SETUP}.appels`), false);
    assert.deepEqual(gh.appels().filter((appel) => appel.includes("-X")), []);
    assert.equal(rienEcritParLeRuntime(etat), true);
  });

  test("une variable de décision laissée au drop-in est dite : ignorée, avec le geste qui la pose puis retire la variable", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_STATIONS: "box/claude:99:code", BRIGADE_DRIFT_TICKET_TOKENS: "1" });

    assert.deepEqual(manques(constats), []);
    const dites = constats.filter((constat) => constat.etat === "note" && /encore dans l'environnement/.test(constat.texte));
    assert.deepEqual(dites.map((constat) => constat.texte.split(" ")[0]), ["BRIGADE_STATIONS", "BRIGADE_DRIFT_TICKET_TOKENS"]);
    assert.match(dites[0]?.geste ?? "", /`brigade \S+ station stations <valeur>`.*retirer `Environment=BRIGADE_STATIONS` du drop-in/);
  });

  test("toutes les variables absentes sont nommées d'un coup, pas la première", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT");

    const constats = await verifier(sans(env, "BRIGADE_BASE_BRANCH"));

    const dits = manques(constats).join("\n");
    for (const variable of ["BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT", "BRIGADE_BASE_BRANCH"]) assert.match(dits, new RegExp(`${variable} n'est pas défini`));
  });

  test("un projet sans station déclarée n'est pas prêt : le runtime démarrerait, mais aucun cook ne partirait — et le geste est dit", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_STATIONS");

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), ["aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente"]);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", /^déclarer une station par `brigade <projet> station stations box\/claude:30:code\+raisonnement`/);
  });

  test("les stations déclarées par l'étape d'installation, la vérification ne dit plus « aucune station » : le projet est prêt", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_STATIONS");
    assert.equal(manques(await verifier(env)).length, 1);

    const declaration = appeler(declarerStations, ["box/claude:2:code+raisonnement"], env);
    assert.equal(await declaration.fin, 0, declaration.sortie());

    const constats = await verifier(env);
    assert.deepEqual(manques(constats), []);
    assert.equal(constats.some((constat) => /aucune station/.test(constat.texte)), false);
  });

  test("un calibrage absent manque avec l'action de l'étape qui le pose, son choix expliqué ; posé par elle, le projet est prêt", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT");

    const avant = (await verifier(env)).filter((constat) => constat.etat === "manque");
    assert.deepEqual(avant.map((constat) => constat.texte.split(" ")[0]).sort(), ["BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT"]);
    assert.match(avant.find((constat) => constat.texte.startsWith("BRIGADE_MANAGER_MODEL"))?.geste ?? "", /^la poser par `brigade calculus installation decisions manager-modele <valeur>` — `brigade calculus installation decisions` dit la question, ses options et leur effet/);

    const reponse = appeler(poserDecisions, ["manager-modele", "sonnet", "reviewer-effort", "medium"], env);
    assert.equal(await reponse.fin, 0, reponse.sortie());

    assert.deepEqual(manques(await verifier(env)), []);
  });

  test("une déclaration de stations mal écrite est dite avec le champ fautif, comme le runtime la refuserait", async (t) => {
    const { env, etat } = projet(t);
    decisionBrute(etat, "BRIGADE_STATIONS", "box/claude:beaucoup:code");

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), [
      "décision du chef illisible au journal — BRIGADE_STATIONS invalide : station n° 1 (« box/claude:beaucoup:code ») — plafond : « beaucoup » n'est pas un entier supérieur à zéro. Attendu `<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:distante[+ordinaires]]`, une station par entrée, séparées par des virgules (box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless)",
    ]);
  });

  test("une variable mal écrite est nommée avec ce que le runtime en dirait", async (t) => {
    const { env, etat } = projet(t);
    decisionBrute(etat, "BRIGADE_MANAGER_MODEL", "gpt");

    const constats = await verifier({ ...env, BRIGADE_MAX_TURNS: "beaucoup", ANTHROPIC_API_KEY: "sk-x" });

    const dits = manques(constats).join("\n");
    assert.match(dits, /BRIGADE_MANAGER_MODEL invalide/);
    assert.match(dits, /BRIGADE_MAX_TURNS invalide/);
    assert.match(dits, /ANTHROPIC_API_KEY est défini/);
  });

  test("un nom de projet que le runtime refuserait manque, avec ses mots", async (t) => {
    const { env } = projet(t);

    const dits = manques(await verifier({ ...env, BRIGADE_PROJECT: "Calculus", FAUX_SYSTEMCTL_UNITES: "brigade@Calculus.service brigade-sauvegarde@Calculus.timer" }));

    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /nom de projet invalide : « Calculus »/);
  });

  test("ce qui manque au dépôt, à GitHub et à la machine est dit dans le même passage", async (t) => {
    const { env, gh } = projet(t, { gates: null, bindings: null });
    gh.repondre(LABELS_DU_DEPOT, { corps: [{ name: "fire" }, { name: "bug" }] });

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_UNITES: "", FAUX_CLAUDE_SESSION: "absente" });

    const dits = manques(constats).join("\n");
    assert.match(dits, /\.claude\/brigade\/gates\.sh/);
    assert.match(dits, /bloc de bindings/);
    assert.match(dits, /labels absents.*prio:1.*model:opus.*effort:max/);
    assert.doesNotMatch(dits, /labels absents.*fire/);
    assert.match(dits, new RegExp(`brigade@${PROJET}\\.service`));
    assert.match(dits, /session Max/);
  });

  test("une connexion Max que le journal dit expirée manque, avec sa date, même si `claude auth status` répond connecté", async (t) => {
    const { env } = projet(t);
    const journal = ouvrirJournal(env.BRIGADE_STATE_DIR as string);
    journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "station.disconnected", payload: { station: "box/claude", reason: "authentication_failed", run: null } });
    journal.fermer();

    const constats = await verifier(env);

    const dits = manques(constats).filter((texte) => /session Max/.test(texte));
    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /EXPIRÉE depuis le \d{4}-\d{2}-\d{2}T.*\(authentication_failed\)/);
    assert.deepEqual(constates(constats).filter((texte) => /session Max/.test(texte)), []);
    // La même phrase que `run station`, lue du même fait.
    const station = appeler(montrerStation, [], env);
    await station.fin;
    const ligne = station.sortie().split("\n").find((dite) => dite.startsWith("connexion Max")) ?? "";
    const phrase = ligne.slice("connexion Max".length).trim();
    assert.ok(phrase.length > 0 && (dits[0] ?? "").includes(phrase));
  });

  test("une connexion reprise ou un journal qui n'en dit rien ne change pas le constat", async (t) => {
    const { env } = projet(t);
    const journal = ouvrirJournal(env.BRIGADE_STATE_DIR as string);
    journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "station.disconnected", payload: { station: "box/claude", reason: "authentication_failed", run: null } });
    journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "kitchen.resumed", payload: {} });
    journal.fermer();

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    assert.match(constates(constats).join("\n"), /session Max/);
  });

  test("des gates ou un setup non exécutables manquent : le runtime les exécute tels quels", async (t) => {
    const { env } = projet(t, { gates: { contenu: "exit 0\n" }, setup: { contenu: "exit 0\n" } });

    const dits = manques(await verifier(env)).join("\n");

    assert.match(dits, /gates\.sh.*pas exécutable/);
    assert.match(dits, /worktree-setup\.sh.*pas exécutable/);
  });

  test("un projet sans setup est prêt, et c'est dit : un worktree neuf y part tel quel", async (t) => {
    const { env } = projet(t, { setup: null });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), /worktree-setup\.sh/);
  });

  test("la branche d'intégration des bindings et celle de la machine doivent être la même", async (t) => {
    const { env } = projet(t, { bindings: bindings(["- **Branche d'intégration** : `develop`", "- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`"]) });

    assert.match(manques(await verifier(env)).join("\n"), new RegExp(`les bindings disent \`develop\`.*BRIGADE_BASE_BRANCH.*\`${BASE}\``));
  });

  test("des bindings sans branche d'intégration valent `main`", async (t) => {
    const { env } = projet(t, { bindings: bindings(["- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`"]) });

    assert.match(manques(await verifier(env)).join("\n"), /les bindings disent `main`/);
  });

  test("les bindings que le runtime ne lit pas sont signalés sans rien retenir", async (t) => {
    const { env } = projet(t, { bindings: bindings([`- **Branche d'intégration** : \`${BASE}\``]) });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    const dits = notes(constats).join("\n");
    for (const binding of ["Zones de fichiers", "Dev local", "Plafond des gates"]) assert.match(dits, new RegExp(binding));
  });

  test("une branche d'intégration que l'origine n'a pas manque, et le dépôt n'est pas jugé à l'aveugle", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_BASE_BRANCH: "main" });

    assert.match(manques(constats).join("\n"), /`main`.*origine/);
    assert.match(notes(constats).join("\n"), /non vérifié/);
  });

  test("une origine injoignable manque, et n'est pas prise pour une branche absente", async (t) => {
    const { env, clone, racine } = projet(t);
    git(clone, "remote", "set-url", "origin", join(racine, "disparue.git"));

    const dits = manques(await verifier(env)).join("\n");

    assert.match(dits, /origine du clone.*ne répond pas/);
    assert.doesNotMatch(dits, /n'existe pas sur l'origine/);
  });

  test("un clone réservé absent manque, avec le geste qui le pose", async (t) => {
    const { env, racine } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_REPO_DIR: join(racine, "nulle-part") });

    const manque = constats.find((constat) => constat.etat === "manque");
    assert.match(manque?.texte ?? "", /clone réservé/);
    assert.match(manque?.geste ?? "", /git clone/);
  });

  test("un dépôt GitHub que `gh` ne lit pas manque", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(`repos/${DEPOT}`, { statut: 404, corps: { message: "Not Found" } });

    assert.match(manques(await verifier(env)).join("\n"), new RegExp(`${DEPOT}.*HTTP 404`));
  });

  test("un label écrit avec une autre casse est le même label : GitHub ne la distingue pas", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.map(({ name }) => ({ name: name.toUpperCase() })) });

    assert.deepEqual(manques(await verifier(env)), []);
    assert.deepEqual(await poserLabels(env), { crees: [], presents: LABELS.map(({ name }) => name) });
    assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), []);
  });

  test("les labels sont lus au-delà de la première page", async (t) => {
    const { env, gh } = projet(t);
    const suite = `repos/${DEPOT}/labels?per_page=100&page=2`;
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(0, 3).map(({ name }) => ({ name })), suivant: suite });
    gh.repondre(suite, { corps: LABELS.slice(3).map(({ name }) => ({ name })) });

    assert.deepEqual(manques(await verifier(env)), []);
  });

  test("sans systemd sur la machine, l'unité n'est pas vérifiée et c'est dit", async (t) => {
    const { env, racine } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_SYSTEMCTL_BIN: join(racine, "pas-de-systemctl") });

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), /systemd/);
  });

  // Un `claude` que le shell trouve par son nom, comme l'installeur natif le
  // pose : dans un répertoire du compte, que systemd ne donne pas à l'unité.
  // Un autre nom que `claude` le cherche dans le vrai `PATH` de systemd sans
  // l'y trouver : la box qui joue la suite peut y avoir posé le sien.
  function claudeDuCompte(racine: string, env: Record<string, string>, nom = "claude") {
    const bin = join(racine, "local/bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync(FAUX_CLAUDE, join(bin, nom));
    const appel = nom === "claude" ? sans(env, "BRIGADE_CLAUDE_BIN") : { ...env, BRIGADE_CLAUDE_BIN: nom };
    return { bin, env: { ...appel, PATH: `${bin}:${process.env.PATH}` } };
  }

  test("un `claude` que le shell trouve mais pas l'unité manque : c'est le `PATH` de l'unité qui compte", async (t) => {
    const { env, racine } = projet(t);
    const compte = claudeDuCompte(racine, env);

    const constats = await verifier({ ...compte.env, FAUX_SYSTEMCTL_ENVIRONNEMENT: `BRIGADE_GITHUB_REPO=${DEPOT} PATH=${racine}/ailleurs:/nulle/part BRIGADE_BASE_BRANCH=${BASE}` });

    // Le shell le trouve : la session Max, elle, est lue.
    assert.deepEqual(manques(constats), [`\`claude\` est introuvable dans le \`PATH\` que l'unité brigade@${PROJET}.service donnera au runtime (${racine}/ailleurs:/nulle/part) : aucun cook ne partirait — le \`PATH\` du shell qui lance cette commande ne compte pas`]);
    const geste = constats.find((constat) => constat.etat === "manque")?.geste ?? "";
    assert.match(geste, new RegExp(`sudo systemctl edit brigade@${PROJET}\\.service`));
    assert.match(geste, new RegExp(`Environment=PATH=${compte.bin}:${racine}/ailleurs:/nulle/part`));
  });

  test("un `claude` que le `PATH` de l'unité donne ne manque pas", async (t) => {
    const { env, racine } = projet(t);
    const compte = claudeDuCompte(racine, env);

    const constats = await verifier({ ...compte.env, FAUX_SYSTEMCTL_ENVIRONNEMENT: `PATH=/nulle/part:${compte.bin}` });

    assert.deepEqual(manques(constats), []);
  });

  test("sans `PATH` dans ses drop-ins, l'unité reçoit celui de systemd, et c'est lui qui est fouillé", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_CLAUDE_BIN: "claude-que-personne-n-a-installe" });

    assert.match(manques(constats).join("\n"), /introuvable dans le `PATH` que l'unité .* donnera au runtime \(\/usr\/local\/sbin:\/usr\/local\/bin:\/usr\/sbin:\/usr\/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins\)/);
  });

  test("là où le shell trouve `claude` et pas le `PATH` de systemd, le geste est un lien, pas un drop-in de plus", async (t) => {
    const { env, racine } = projet(t);
    // Sans `Environment=PATH=`, c'est le vrai `PATH` de systemd qui est fouillé.
    const compte = claudeDuCompte(racine, env, "claude-du-compte-seulement");

    const constats = await verifier(compte.env);

    assert.equal(constats.find((constat) => constat.etat === "manque")?.geste, `\`sudo ln -sfn ${compte.bin}/claude-du-compte-seulement /usr/local/bin/claude-du-compte-seulement\` — l'installeur natif pose \`claude\` sous \`~/.local/bin\` du compte, que systemd ne donne pas à l'unité ; docs/installer.md, « Préparer la box »`);
  });

  test("un compte sans identité git manque : un cook n'y commiterait rien", async (t) => {
    const { env } = projet(t);
    // Aucune identité, et `git` empêché d'en deviner une d'après le nom de la machine.
    const anonyme = { ...sans(env, "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.useConfigOnly", GIT_CONFIG_VALUE_0: "true" };

    const constats = await verifier(anonyme);

    assert.equal(manques(constats).length, 1);
    assert.match(manques(constats)[0] ?? "", /^ce compte n'a pas d'identité git : un cook ne pourrait rien commiter/);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", /git config --global user\.name .*git config --global user\.email/);
  });

  test("un compte qui lit le dépôt sans pouvoir y pousser manque : aucune livraison ne partirait", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(`repos/${DEPOT}`, { corps: { ...DEPOT_LU, permissions: { admin: false, push: false, pull: true } } });
    // Sans le rôle d'administrateur, la protection se lit par la branche.
    gh.repondre(`repos/${DEPOT}/branches/${BASE}`, { corps: { name: BASE, protected: true } });

    assert.deepEqual(manques(await verifier(env)), [`\`gh\` lit ${DEPOT} sous ce compte, sans le droit d'y pousser : aucune livraison ne partirait, aucune PR ne serait mergée`]);
  });

  test("une push protection qui n'est pas active est dite sans rien retenir, avec ce que GitHub en rend", async (t) => {
    const { env, gh } = projet(t);
    for (const [corps, lu] of [
      [{ ...DEPOT_LU, security_and_analysis: { secret_scanning_push_protection: { status: "disabled" } } }, "`disabled`"],
      // Ce que GitHub rend à un compte qui n'administre pas le dépôt.
      [{ full_name: DEPOT, permissions: DEPOT_LU.permissions }, "rien, ce compte n'administre pas le dépôt"],
    ] as const) {
      gh.repondre(`repos/${DEPOT}`, { corps });

      const constats = await verifier(env);

      assert.deepEqual(manques(constats), []);
      assert.deepEqual(notes(constats), [`la push protection de GitHub n'est pas constatée sur ${DEPOT} (GitHub en dit : ${lu}) : la station reste la seule barrière contre une livraison qui porterait des identifiants`]);
    }
  });

  test("une branche d'intégration que rien ne protège manque, avec l'action qui la protège", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(PROTECTION_DE_LA_BASE, { statut: 404, corps: { message: "Branch not protected" } });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), [`la branche d'intégration \`${BASE}\` n'est pas protégée sur GitHub : un push direct y entre sans passer par la pass`]);
    assert.equal(constats.find((constat) => constat.etat === "manque")?.geste, `\`brigade ${PROJET} installation protection poser\``);
  });

  test("une branche protégée sans PR obligatoire manque, et l'action ne l'écrasera pas : le geste dit où la régler", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(PROTECTION_DE_LA_BASE, { corps: { required_pull_request_reviews: null, enforce_admins: { enabled: true } } });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), [`la branche d'intégration \`${BASE}\` est protégée sans PR obligatoire : la pass ne tient pas la branche`]);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", /Settings → Branches/);
  });

  test("un compte qui n'administre pas le dépôt : la protection se lit par la branche, et le geste dit le droit à donner d'abord", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(`repos/${DEPOT}`, { corps: { ...DEPOT_LU, permissions: { admin: false, push: true, pull: true } } });
    gh.repondre(`repos/${DEPOT}/branches/${BASE}`, { corps: { name: BASE, protected: true } });

    assert.deepEqual(manques(await verifier(env)), []);

    gh.repondre(`repos/${DEPOT}/branches/${BASE}`, { corps: { name: BASE, protected: false } });
    const constats = await verifier(env);
    assert.deepEqual(manques(constats), [`la branche d'intégration \`${BASE}\` n'est pas protégée sur GitHub : un push direct y entre sans passer par la pass`]);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", new RegExp(`le rôle Admin sur ${DEPOT} .*, puis \`brigade ${PROJET} installation protection poser\`$`));
  });

  test("un `claude` désigné par son chemin ne doit rien au `PATH` de l'unité", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_ENVIRONNEMENT: "PATH=/nulle/part" });

    assert.deepEqual(manques(constats), []);
  });

  test("un répertoire temporaire de `claude` qui n'est pas au compte manque : chaque cook s'y refuserait", async (t) => {
    const { env, racine } = projet(t);
    const uid = process.getuid?.();
    // Celui d'un autre : la racine du système, sous le nom que `claude` attend.
    const temporaire = join(racine, `claude-${uid}`);
    symlinkSync("/", temporaire);
    // L'uid sous lequel cet autre se lit n'est pas le même partout : 0 d'ordinaire,
    // 65534 dans l'espace d'utilisateurs d'un `bwrap` sans privilège, où seul le
    // compte est connu. Ce qui compte est qu'il ne soit pas le compte.
    const etranger = statSync("/").uid;
    assert.notEqual(etranger, uid, "la racine du système est au compte qui joue la suite (root ?) : ce test n'a plus de répertoire étranger sous la main");

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), [`le répertoire temporaire de \`claude\` (${temporaire}) n'est pas au compte (uid ${etranger}, attendu ${uid}) : \`claude\` refuse de s'y lancer, chaque cook échouerait`]);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", /chown .*CLAUDE_CODE_TMPDIR.*docs\/installer\.md, « Préparer la box »$/);
  });

  test("ce répertoire, sous une unité qui a son propre /tmp, ne retient que la connexion faite à la main", () => {
    const lu = { repertoire: "/tmp/claude-1001", proprietaire: 0, uid: 1001 };

    assert.equal(jugerTemporaire({ ...lu, prive: false }).etat, "manque");
    const sousCloison = jugerTemporaire({ ...lu, prive: true });
    assert.equal(sousCloison.etat, "note");
    assert.match(sousCloison.texte, /\/tmp\/claude-1001.*uid 0, attendu 1001.*`PrivateTmp`.*connexion Max/);
  });

  test("une sauvegarde qui n'est pas programmée est signalée sans rien retenir", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_UNITES: `brigade@${PROJET}.service` });

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), new RegExp(`brigade-sauvegarde@${PROJET}\\.timer`));
    assert.equal(constats.find((constat) => constat.etat === "note" && !constat.texte.startsWith("renouvellement"))?.geste, "docs/installer.md, « Déclarer le projet »");
  });
});

// « Vérifier » vert veut dire prêt à servir, et « installation terminée » ne
// s'atteint que par lui : aucun geste ne se découvre après.
describe("« Vérifier » vert, « installation terminée »", () => {
  // Chaque chose qui retient la cuisine, cassée seule sur un projet prêt, et
  // l'étape de l'installation qui la règle.
  const BLOCAGES: Array<{ quoi: string; etape: string; casser: (lu: ReturnType<typeof projet>) => void }> = [
    { quoi: "aucune station déclarée", etape: "stations", casser: ({ etat }) => sansDecision(etat, "BRIGADE_STATIONS") },
    { quoi: "la branche d'intégration sans protection", etape: "protection", casser: ({ gh }) => gh.repondre(PROTECTION_DE_LA_BASE, { statut: 404, corps: { message: "Branch not protected" } }) },
    { quoi: "la protection de la branche illisible", etape: "protection", casser: ({ gh }) => gh.repondre(PROTECTION_DE_LA_BASE, { statut: 502, corps: { message: "Bad Gateway" } }) },
    { quoi: "le calibrage du reviewer absent", etape: "decisions", casser: ({ etat }) => sansDecision(etat, "BRIGADE_REVIEWER_MODEL") },
  ];

  for (const { quoi, etape, casser } of BLOCAGES) {
    test(`${quoi} : la vérification est rouge, d'un seul manque, qui nomme l'étape « ${etape} »`, async (t) => {
      const lu = projet(t);
      assert.deepEqual(manques(await verifier(lu.env)), []);
      casser(lu);

      const constats = await verifier(lu.env);

      assert.equal(manques(constats).length, 1, manques(constats).join("\n"));
      const manque = constats.find((constat) => constat.etat === "manque");
      assert.equal(manque?.etape, etape);
      assert.deepEqual(etapesAReprendre(constats), [etape]);
      // Ce qu'il dit au chef, en mots simples, et ce qui le lève.
      assert.ok(manque?.simple, manque?.texte);
      assert.ok(manque?.remede, manque?.texte);
    });
  }

  test("chaque manque nomme une étape de l'installation, et seuls les manques en nomment une", async (t) => {
    const { env, gh } = projet(t, { bindings: null, gates: null });
    gh.repondre(PROTECTION_DE_LA_BASE, { statut: 404, corps: { message: "Branch not protected" } });

    const constats = await verifier(sans(env, "BRIGADE_PROJECT"));

    const ids = ETAPES.map((connue) => connue.id);
    assert.ok(manques(constats).length >= 4);
    for (const constat of constats) {
      if (constat.etat === "manque") assert.ok(ids.includes(constat.etape ?? ""), `${constat.texte} → ${constat.etape}`);
      else assert.equal(constat.etape, undefined, constat.texte);
      // Les mots simples et le remède ne sont dits que d'un manque, et de chacun.
      assert.equal(constat.simple !== undefined && constat.remede !== undefined, constat.etat === "manque", constat.texte);
    }
    // Rendues dans l'ordre de l'installation, chacune une fois.
    assert.deepEqual(etapesAReprendre(constats), ["ajout", "init", "protection"]);
  });

  test("la commande la dit rouge, et nomme pour chaque manque l'étape à reprendre", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_STATIONS");

    const commande = lancer(t, CLI, [], env);

    assert.equal(await commande.fin, 1, commande.sortie());
    assert.match(commande.sortie(), /→ étape à reprendre : 4\. Déclarer les stations \(stations\)/);
    assert.match(commande.sortie(), /: 1 manque : aucun cook ne doit être lancé tant qu'il en reste — à reprendre : 4\. Déclarer les stations$/m);
  });

  test("« installation terminée » n'est atteinte qu'avec une vérification verte : un manque la refuse, nomme son étape et la remet à faire", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_STATIONS");
    // Le chef a tout noté fait, à la main, sauf la fin.
    for (const { id } of ETAPES.slice(0, -1)) assert.equal(await appeler(etapes, [id, "faite"], env).fin, 0);

    const refus = appeler(etapes, ["demarrage", "faite"], env);

    assert.equal(await refus.fin, 1, refus.sortie());
    assert.match(refus.sortie(), /l'installation n'est pas terminée : « Vérifier » n'est pas vert — 1 manque/);
    assert.match(refus.sortie(), /à reprendre : 4\. Déclarer les stations \(stations\), remise à faire/);
    assert.match(refus.sortie(), /aucune station déclarée/);
    const apres = installationDe(etat);
    assert.equal(apres.courante, "stations");
    assert.equal(apres.etapes.find((lue) => lue.id === "demarrage")?.etat, "todo");

    // L'étape reprise, la fin s'atteint.
    assert.equal(await appeler(declarerStations, ["box/claude:2:code"], env).fin, 0);
    const fin = appeler(etapes, ["demarrage", "faite"], env);
    assert.equal(await fin.fin, 0, fin.sortie());
    assert.match(fin.sortie(), /installation terminée : « Vérifier » est vert/);
    assert.equal(installationDe(etat).courante, null);
  });

  test("un refus ne touche ni ce qui n'est pas noté, ni l'étape d'un manque déjà à faire : rien n'est écrit pour rien", async (t) => {
    const { env, etat } = projet(t);
    sansDecision(etat, "BRIGADE_REVIEWER_MODEL");
    const journal = ouvrirJournal(etat, { lectureSeule: true });
    const compter = () => journal.tout().filter((e) => e.type === "installation.step").length;
    try {
      const refus = appeler(etapes, ["demarrage", "faite"], env);
      assert.equal(await refus.fin, 1, refus.sortie());
      assert.equal(compter(), 0);
    } finally {
      journal.fermer();
    }
  });

  test("après « terminée », la liste des étapes n'en porte aucune à faire, et un cook part sur le premier ticket sans autre geste", async (t) => {
    const { env, etat, gh } = projet(t);
    gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
    // La machine du poste ne décide d'aucun test : une suite qui tourne à côté
    // charge le processeur bien au-delà du seuil par défaut.
    const service = { ...env, BRIGADE_MAX_LOAD_PER_CORE: "1000000", BRIGADE_MIN_FREE_MEMORY_MB: "0", BRIGADE_MIN_FREE_DISK_MB: "0" };

    // Rien n'a été noté : la vérification verte atteste chaque étape.
    const fin = appeler(etapes, ["demarrage", "faite"], service);
    assert.equal(await fin.fin, 0, fin.sortie());

    const lue = appeler(etapes, ["--json"], service);
    assert.equal(await lue.fin, 0);
    const installation = JSON.parse(lue.sortie()) as { courante: string | null; etapes: Array<{ id: string; etat: string }> };
    assert.equal(installation.courante, null);
    assert.deepEqual(installation.etapes.filter((etape) => etape.etat !== "faite"), []);
    assert.deepEqual(manques(await verifier(service)), []);

    // Le runtime démarré dans l'environnement vérifié, et rien d'autre.
    const runtime = lancer(t, MAIN, [], service);
    const lancements = () => {
      const journal = ouvrirJournal(etat, { lectureSeule: true });
      try {
        return journal.tout().filter((e) => e.type === "cook.launched").map((e) => e.ticket);
      } finally {
        journal.fermer();
      }
    };
    await jusqua(() => lancements().length > 0);
    assert.deepEqual(lancements(), [15]);
    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0, runtime.sortie());
  });
});

describe("la mise à jour de la box", () => {
  const MISE_A_JOUR = /docs\/installer\.md, « Mettre brigade à jour »/;
  const cloisonPosee = (unites: string) => join(unites, `brigade@${PROJET}.service.d`, "cloison.conf");
  const poserCloison = (unites: string, regler: (contenu: string) => string = (contenu) => contenu) => {
    mkdirSync(dirname(cloisonPosee(unites)), { recursive: true });
    writeFileSync(cloisonPosee(unites), regler(readFileSync(join(DEPLOIEMENT, "cloison.conf"), "utf8")));
  };

  test("des unités posées qui sont celles du dépôt : « à jour » est dit, et ce qui a été comparé est nommé", async (t) => {
    const { env, unites } = projet(t);

    const constats = await verifier(env);

    const dit = constates(constats).find((texte) => texte.startsWith("unités à jour")) ?? "";
    assert.match(dit, /brigade-sauvegarde@\.service, brigade-sauvegarde@\.timer, brigade@\.service/);
    assert.ok(dit.includes(unites) && dit.includes(DEPLOIEMENT));
    // Ni l'arbitre ni la porte ne sont posés sur cette box : ce n'est pas une dérive.
    // Les unités comparées, pas la ligne entière : elle nomme aussi le chemin du dépôt.
    assert.doesNotMatch(dit.slice(dit.lastIndexOf(" — ")), /arbitre|porte/);
    assert.deepEqual(notes(constats), []);
  });

  test("une unité posée qui diffère de celle du dépôt est nommée, avec le geste qui la règle, sans rien retenir", async (t) => {
    const { env, unites } = projet(t);
    writeFileSync(join(unites, "brigade@.service"), "[Service]\nExecStart=/usr/bin/env node src/main.ts\n");

    const constats = await verifier(env);

    const perimee = constats.find((constat) => constat.texte.startsWith("unités périmées"));
    assert.equal(perimee?.etat, "note");
    assert.match(perimee?.texte ?? "", /unités périmées : brigade@\.service — /);
    assert.ok(perimee?.texte.includes(unites) && perimee.texte.includes(DEPLOIEMENT));
    assert.ok(perimee?.geste?.includes(`sudo cp ${DEPLOIEMENT}/*.service ${DEPLOIEMENT}/*.timer ${unites}/`));
    assert.match(perimee?.geste ?? "", /daemon-reload/);
    assert.match(perimee?.geste ?? "", MISE_A_JOUR);
    assert.deepEqual(manques(constats), []);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("la cloison posée se compare aussi, réglages du chef mis à part", async (t) => {
    const { env, unites } = projet(t);
    poserCloison(unites, (contenu) =>
      contenu
        .replace("BRIGADE_SANDBOX_HIDDEN=/var/lib/brigade:/etc/brigade", "BRIGADE_SANDBOX_HIDDEN=/var/lib/brigade:/etc/brigade:/home/brigade/.ssh")
        .replace("#Environment=BRIGADE_SANDBOX_PRIVATE=<nom>:<nom>", "Environment=BRIGADE_SANDBOX_PRIVATE=.cargo"),
    );

    const regles = await verifier(env);

    assert.match(constates(regles).join("\n"), /unités à jour.*cloison\.conf/);
    assert.deepEqual(notes(regles), []);

    poserCloison(unites, (contenu) => contenu.replace("PrivateTmp=yes", "PrivateTmp=no"));

    const perimee = (await verifier(env)).find((constat) => constat.texte.startsWith("unités périmées"));
    assert.match(perimee?.texte ?? "", /unités périmées : cloison\.conf — /);
    // Sa copie porte les réglages du chef : elle ne se recopie pas à l'aveugle.
    assert.ok(perimee?.geste?.includes(cloisonPosee(unites)));
    assert.match(perimee?.geste ?? "", /BRIGADE_SANDBOX_HIDDEN.*BRIGADE_SANDBOX_PRIVATE/);
    assert.doesNotMatch(perimee?.geste ?? "", /\*\.service/);
  });

  test("quand systemd ne dit pas d'où l'unité est chargée, rien n'est comparé et c'est dit", async (t) => {
    const { env } = projet(t);

    const constats = await verifier(sans(env, "FAUX_SYSTEMCTL_FRAGMENT"));

    assert.match(notes(constats).join("\n"), /unités non comparées/);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("une unité masquée n'a aucune copie à lire : « non comparées » est dit, pas « à jour »", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_FRAGMENT: "/dev/null" });

    assert.match(notes(constats).join("\n"), /unités non comparées .*masquée/);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("une unité que systemd dit masquée n'est pas comparée, quel que soit son fichier", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_CHARGE: "masked" });

    assert.match(notes(constats).join("\n"), /unités non comparées .*masquée/);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("des unités posées par lien vers les fichiers du dépôt ne sont pas comparées à elles-mêmes", async (t) => {
    const { env, unites } = projet(t);
    for (const nom of readdirSync(unites)) rmSync(join(unites, nom), { recursive: true, force: true });
    for (const nom of readdirSync(DEPLOIEMENT)) if (/\.(?:service|timer)$/.test(nom)) symlinkSync(join(DEPLOIEMENT, nom), join(unites, nom));

    const constats = await verifier(env);

    assert.match(notes(constats).join("\n"), /unités non comparées .*aucune copie/);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("une unité chargée depuis le dépôt même ne le compare pas à lui-même", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_FRAGMENT: join(DEPLOIEMENT, "brigade@.service") });

    assert.match(notes(constats).join("\n"), /unités non comparées .*depuis le dépôt lui-même/);
    assert.doesNotMatch(constates(constats).join("\n"), /unités à jour/);
  });

  test("l'empreinte du code change avec un fichier de ses sources, contenu ou nom, et avec rien d'autre", (t) => {
    const sources = join(repertoireTemporaire(t), "src");
    mkdirSync(join(sources, "projections"), { recursive: true });
    writeFileSync(join(sources, "main.ts"), "un\n");
    writeFileSync(join(sources, "projections/rail.ts"), "deux\n");
    const depart = empreinteDuCode(sources);

    assert.equal(empreinteDuCode(sources), depart);
    writeFileSync(join(sources, "projections/rail.ts"), "trois\n");
    const modifie = empreinteDuCode(sources);
    assert.notEqual(modifie, depart);
    writeFileSync(join(sources, "projections/rail.ts"), "deux\n");
    assert.equal(empreinteDuCode(sources), depart);
    writeFileSync(join(sources, "projections/pass.ts"), "");
    assert.notEqual(empreinteDuCode(sources), depart);
  });

  test("ce que le runtime laisse à son démarrage se relit ; rien de laissé se lit comme tel", (t) => {
    const etat = repertoireTemporaire(t);

    assert.equal(lireCodeEnService(etat), null);
    noterCodeEnService(etat);
    assert.equal(lireCodeEnService(etat), empreinteDuCode());
  });

  test("le jugement des unités : une copie identique n'est pas périmée", () => {
    const lu = { posees: "/etc/systemd/system", depot: "/opt/brigade/runtime/deploy", unite: "brigade@boutique.service" };
    assert.equal(jugerUnites({ ...lu, copies: [{ nom: "brigade@.service", identique: true }] }).etat, "ok");
    const perimees = jugerUnites({ ...lu, copies: [{ nom: "brigade@.service", identique: true }, { nom: "brigade-arbitre.service", identique: false }, { nom: "cloison.conf", identique: false }] });
    assert.match(perimees.texte, /^unités périmées : brigade-arbitre\.service, cloison\.conf — /);
    assert.match(perimees.geste ?? "", /\/etc\/systemd\/system\/brigade@boutique\.service\.d\/cloison\.conf/);

  });
});

describe("les labels", () => {
  const CREATION = `repos/${DEPOT}/labels`;
  const crees = (gh: FauxGh) =>
    gh
      .appels()
      .filter((appel) => appel.includes("POST"))
      .map((appel) => appel.find((argument) => argument.startsWith("name="))?.slice("name=".length));

  test("ceux qui manquent sont créés, ceux qui existent ne sont pas touchés", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: [{ name: "fire" }, { name: "prio:1" }, { name: "bug" }] });
    gh.repondre(CREATION, { statut: 201, corps: {} });

    const bilan = await poserLabels(env);

    const attendus = LABELS.map(({ name }) => name).filter((nom) => nom !== "fire" && nom !== "prio:1");
    assert.deepEqual(bilan, { crees: attendus, presents: ["fire", "prio:1"] });
    assert.deepEqual(crees(gh), attendus);
    const appel = gh.appels().find((arguments_) => arguments_.includes("name=model:opus"));
    assert.ok(appel?.some((argument) => /^color=[0-9A-F]{6}$/.test(argument)));
    assert.ok(appel?.some((argument) => argument.startsWith("description=")));
  });

  test("rejouée sur un dépôt qui les a tous, l'installation ne crée rien", async (t) => {
    const { env, gh } = projet(t);

    const bilan = await poserLabels(env);

    assert.deepEqual(bilan.crees, []);
    assert.deepEqual(crees(gh), []);
  });

  test("un label créé entre-temps par quelqu'un d'autre n'est pas une erreur", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(1).map(({ name }) => ({ name })) });
    gh.repondre(CREATION, { statut: 422, corps: { message: "Validation Failed" } });

    assert.deepEqual((await poserLabels(env)).crees, []);
  });

  test("un refus de GitHub est dit, avec le label en cause", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: [] });
    gh.repondre(CREATION, { statut: 403, corps: { message: "Forbidden" } });

    await assert.rejects(poserLabels(env), /fire.*HTTP 403/);
  });
});

test("un fichier de secrets que le runtime refuserait est un manque de la machine", async (t) => {
  const { env, racine } = projet(t);
  writeFileSync(join(racine, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o644 });

  assert.match(manques(await verifier({ ...env, BRIGADE_SECRETS_FILE: join(racine, "secrets.env") })).join("\n"), /BRIGADE_SECRETS_FILE invalide.*chmod 600/);
});

describe("le coût du setup", () => {
  const essais = (etat: string) => join(etat, "worktrees/.essais/installation");

  test("le setup est joué une fois, à blanc, dans un worktree neuf de la base — retiré ensuite", async (t) => {
    const { env, clone, etat, origine } = projet(t);

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, true);
    assert.equal(mesure.joue, true);
    assert.equal(mesure.sha, git(origine, "rev-parse", BASE));
    // Le numéro d'aucun ticket : rien de ce que le setup réserve par numéro ne croise un cook.
    assert.equal(readFileSync(`${env.FAUX_SETUP}.appels`, "utf8"), `0 ${essais(etat)}\n`);
    assert.equal(existsSync(essais(etat)), false);
    assert.equal(git(clone, "worktree", "list").split("\n").length, 1);
  });

  test("ce que le setup pose dans le worktree est pesé", async (t) => {
    const pose = '#!/usr/bin/env bash\nhead -c 400000 /dev/urandom > "$2/dependances.bin"\necho "export PRET=1"\n';
    const { env } = projet(t, { setup: { contenu: pose, executable: true } });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, true);
    assert.ok(mesure.apresOctets - mesure.avantOctets >= 300_000, `${mesure.avantOctets} → ${mesure.apresOctets}`);
  });

  test("un setup en échec est rendu avec ce qu'il a dit, et son worktree est retiré", async (t) => {
    const { env, etat } = projet(t);
    writeFileSync(env.FAUX_SETUP ?? "", "echec");

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, false);
    assert.match(mesure.sortie, /npm ci a échoué/);
    assert.equal(existsSync(essais(etat)), false);
  });

  test("le setup à blanc reçoit les secrets que le dépôt déclare, et ce qu'il en dit est masqué", async (t) => {
    const dit = '#!/usr/bin/env bash\necho "base créée sur $DATABASE_URL" >&2\n';
    const { env, racine } = projet(t, { setup: { contenu: dit, executable: true }, secrets: "DATABASE_URL\n" });
    writeFileSync(join(racine, "secrets.env"), "DATABASE_URL=postgres://dev:mot-de-passe@localhost\n", { mode: 0o600 });

    const mesure = await mesurerSetup({ ...env, BRIGADE_SECRETS_FILE: join(racine, "secrets.env") });

    assert.equal(mesure.pret, true);
    assert.equal(mesure.sortie, "base créée sur [secret:DATABASE_URL]\n");
  });

  test("un secret déclaré que la machine ne détient pas : le setup n'est pas joué, comme la station ne lancerait aucun cook", async (t) => {
    const { env, etat } = projet(t, { secrets: "DATABASE_URL\n" });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, false);
    assert.match(mesure.sortie, /secrets du projet indisponibles[\s\S]*BRIGADE_SECRETS_FILE n'est pas défini.*`DATABASE_URL`/);
    assert.equal(existsSync(`${env.FAUX_SETUP}.appels`), false);
    assert.equal(existsSync(essais(etat)), false);
  });

  test("le setup ne reçoit rien de l'état du runtime", async (t) => {
    const temoin = '#!/usr/bin/env bash\nenv | grep -c "^BRIGADE_" > "$2/../../../brigade-vues"\n';
    const { env, etat } = projet(t, { setup: { contenu: temoin, executable: true } });

    await mesurerSetup(env);

    assert.equal(readFileSync(join(etat, "brigade-vues"), "utf8").trim(), "0");
  });

  test("un projet sans setup n'a rien à mesurer que son worktree", async (t) => {
    const { env } = projet(t, { setup: null });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.joue, false);
    assert.equal(mesure.avantOctets, mesure.apresOctets);
  });

  const MO = 1024 ** 2;
  const mesure = { pret: true as const, joue: true, sha: "abc", dureeMs: 60_000, avantOctets: 11 * MO, apresOctets: 400 * MO, sortie: "" };
  const machine = { cooks: 30, entrees: 4, bailMs: 1_800_000, disqueLibre: 100 * 1024 * MO, disqueMinOctets: 5 * 1024 * MO };

  test("à 30 cooks : le disque que trente worktrees prennent, et le temps que le dernier attend son entrée", () => {
    const tenue = tenir(mesure, machine);

    assert.deepEqual(tenue.disque, { besoin: 30 * 400 * MO, disponible: 95 * 1024 * MO, tient: true });
    // Huit vagues de quatre setups, une minute chacune : la dernière part sept minutes après la première.
    assert.deepEqual(tenue.entree, { vagues: 8, dernierMs: 420_000 });
    assert.deepEqual(tenue.setup, { plafondMs: 900_000, tient: true });
    assert.equal(tenue.tient, true);
  });

  test("à une seule vague, le dernier cook part avec le premier", () => {
    assert.deepEqual(tenir(mesure, { ...machine, cooks: 4 }).entree, { vagues: 1, dernierMs: 0 });
  });

  test("trente worktrees qui ne tiennent pas sur le disque : ça ne tient pas", () => {
    const tenue = tenir(mesure, { ...machine, disqueLibre: 16 * 1024 * MO });

    assert.equal(tenue.disque.tient, false);
    assert.equal(tenue.tient, false);
  });

  test("un setup plus long que la moitié du bail ne tient pas : la station l'arrêterait à chaque ticket", () => {
    const tenue = tenir({ ...mesure, dureeMs: 901_000 }, machine);

    assert.equal(tenue.setup.tient, false);
    assert.equal(tenue.tient, false);
  });
});

describe("la désinstallation", () => {
  const refs = (depot: string) => git(depot, "for-each-ref");

  test("sans confirmation, elle dit ce qu'elle retirerait et ne retire rien", (t) => {
    const { env, clone } = projet(t);

    const bilan = desinstaller(env, { confirme: false });

    assert.equal(bilan.retire, false);
    assert.equal(bilan.clone, clone);
    assert.equal(existsSync(clone), true);
  });

  test("confirmée, elle retire le clone réservé et les worktrees — et rien de l'origine ni du journal", (t) => {
    const { env, clone, etat, origine } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "worktree", "add", "-q", "-b", "cook/a", join(etat, "worktrees/a"), `origin/${BASE}`);
    writeFileSync(join(etat, "log.db"), "le journal");
    const avant = refs(origine);

    const bilan = desinstaller(env, { confirme: true });

    assert.equal(bilan.retire, true);
    assert.equal(bilan.worktrees, 1);
    assert.equal(existsSync(clone), false);
    assert.equal(existsSync(join(etat, "worktrees")), false);
    assert.equal(readFileSync(join(etat, "log.db"), "utf8"), "le journal");
    assert.equal(refs(origine), avant);
  });

  // Un seul clone pour tout ce qu'il peut porter et que l'origine n'a pas :
  // chaque perte a sa ligne, et une seule suffit à retenir.
  test("tout ce que l'origine n'a pas est nommé à blanc, et retient la désinstallation confirmée", (t) => {
    const { env, clone, etat } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "checkout", "-q", "-B", BASE, `origin/${BASE}`);
    git(clone, "commit", "-q", "--allow-empty", "-m", "travail jamais poussé");
    // Une tête détachée, dans un autre worktree que celui d'où la commande regarde.
    git(clone, "worktree", "add", "-q", "--detach", join(etat, "worktrees/b"), `origin/${BASE}`);
    git(join(etat, "worktrees/b"), "commit", "-q", "--allow-empty", "-m", "essai hors branche");
    writeFileSync(join(clone, "LISEZMOI"), "à reprendre\n");
    git(clone, "stash", "push", "-q", "-m", "mis de côté");
    writeFileSync(join(clone, "LISEZMOI"), "en cours\n");
    writeFileSync(join(clone, "brouillon.txt"), "en cours\n");
    git(clone, "worktree", "add", "-q", "-b", "cook/a", join(etat, "worktrees/a"), `origin/${BASE}`);
    writeFileSync(join(etat, "worktrees/a/travail.txt"), "en cours\n");

    const { perdus } = desinstaller(env, { confirme: false });

    const attendus = [/^commit.*travail jamais poussé/, /^commit.*essai hors branche/, /^remise.*mis de côté/, /^non commité.*clone : LISEZMOI/, /^non commité.*brouillon\.txt/, /^non commité.*worktrees\/a : travail\.txt/];
    for (const attendu of attendus) assert.equal(perdus.filter((perdu) => attendu.test(perdu)).length, 1, `${attendu}\n${perdus.join("\n")}`);
    assert.equal(perdus.length, attendus.length, perdus.join("\n"));
    assert.throws(() => desinstaller(env, { confirme: true }), /travail jamais poussé[^]*brouillon\.txt/);
    assert.equal(existsSync(join(clone, "brouillon.txt")), true);
  });

  test("une seule perte suffit à la retenir", (t) => {
    const { env, clone } = projet(t);
    writeFileSync(join(clone, "brouillon.txt"), "en cours\n");

    assert.throws(() => desinstaller(env, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(clone), true);
  });

  test("un clone à jour de son origine n'a rien à perdre", (t) => {
    const { env, clone } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "checkout", "-q", "-B", BASE, `origin/${BASE}`);

    assert.deepEqual(desinstaller(env, { confirme: false }).perdus, []);
  });

  test("le clone déjà parti, les worktrees qui restent sont annoncés à blanc, puis retirés — et c'est dit", (t) => {
    const { env, clone, etat } = projet(t);
    rmSync(clone, { recursive: true });
    mkdirSync(join(etat, "worktrees/a"), { recursive: true });

    const blanc = desinstaller(env, { confirme: false });
    assert.deepEqual({ retire: blanc.retire, clone: blanc.clone, worktrees: blanc.worktrees }, { retire: false, clone: null, worktrees: 1 });
    assert.equal(existsSync(join(etat, "worktrees/a")), true);

    const bilan = desinstaller(env, { confirme: true });
    assert.deepEqual({ retire: bilan.retire, clone: bilan.clone, worktrees: bilan.worktrees }, { retire: true, clone: null, worktrees: 1 });
    assert.equal(existsSync(join(etat, "worktrees")), false);
  });

  test("rejouée, elle ne trouve plus rien à retirer et ne se plaint pas", (t) => {
    const { env } = projet(t);
    desinstaller(env, { confirme: true });

    const bilan = desinstaller(env, { confirme: true });

    assert.equal(bilan.clone, null);
    assert.equal(bilan.retire, false);
  });

  test("tant que le runtime du projet tourne, elle refuse", (t) => {
    const { env, clone, etat } = projet(t);
    const verrou = prendreVerrou(etat);
    t.after(() => verrou.relacher());

    assert.throws(() => desinstaller(env, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(clone), true);
  });

  test("un répertoire qui n'est pas un clone n'est jamais supprimé", (t) => {
    const { env, racine } = projet(t);
    const ailleurs = join(racine, "documents");
    mkdirSync(ailleurs);
    writeFileSync(join(ailleurs, "important.txt"), "à garder");

    assert.throws(() => desinstaller({ ...env, BRIGADE_REPO_DIR: ailleurs }, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(join(ailleurs, "important.txt")), true);
  });

  for (const nom of [".brigade-state", "..etat"]) {
    test(`un clone qui contient le répertoire d'état (${nom}) n'est jamais supprimé`, (t) => {
      const { env, clone } = projet(t);
      const etat = join(clone, nom);
      mkdirSync(etat);

      assert.throws(() => desinstaller({ ...env, BRIGADE_STATE_DIR: etat }, { confirme: true }), /dans le clone/);
      assert.equal(existsSync(clone), true);
    });
  }

  test("un clone désigné par un lien n'est pas supprimé s'il contient le répertoire d'état", (t) => {
    const { env, clone, racine } = projet(t);
    const etat = join(clone, ".brigade-state");
    mkdirSync(etat);
    const lien = join(racine, "lien-vers-le-clone");
    symlinkSync(clone, lien);

    assert.throws(() => desinstaller({ ...env, BRIGADE_REPO_DIR: lien, BRIGADE_STATE_DIR: etat }, { confirme: true }), /dans le clone/);
    assert.equal(existsSync(join(clone, ".git")), true);
  });
});

describe("la commande du chef", () => {
  const commande = async (t: TestContext, env: Record<string, string>, ...args: string[]) => {
    const enfant = lancer(t, CLI, args, env);
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };

  test("un projet prêt : elle le dit et sort en 0", async (t) => {
    const { env } = projet(t);

    const { code, sortie } = await commande(t, env);

    assert.match(sortie, new RegExp(`projet « ${PROJET} » : prêt`));
    assert.doesNotMatch(sortie, /MANQUE/);
    assert.equal(code, 0);
  });

  test("une box à mettre à jour : la dérive se lit avec son geste, et le projet reste prêt", async (t) => {
    const { env, unites } = projet(t);
    writeFileSync(join(unites, "brigade@.service"), "[Service]\n");

    const { code, sortie } = await commande(t, env);

    assert.match(sortie, /à savoir +unités périmées : brigade@\.service — .*\n +→ `sudo cp /);
    assert.match(sortie, new RegExp(`projet « ${PROJET} » : prêt`));
    assert.equal(code, 0);
  });

  test("un projet mal installé : chaque manque est nommé avec son geste, et elle sort en 1", async (t) => {
    const { env, gh, etat } = projet(t, { gates: null });
    gh.repondre(LABELS_DU_DEPOT, { corps: [] });
    sansDecision(etat, "BRIGADE_REVIEWER_MODEL");

    const { code, sortie } = await commande(t, env);

    assert.match(sortie, /MANQUE +BRIGADE_REVIEWER_MODEL n'est pas défini/);
    assert.match(sortie, /MANQUE +`\.claude\/brigade\/gates\.sh`/);
    assert.match(sortie, /MANQUE +labels absents/);
    assert.match(sortie, /→ la même commande, suivie de `labels`/);
    assert.match(sortie, /3 manques : aucun cook ne doit être lancé/);
    assert.equal(code, 1);
  });

  test("`labels` crée ce qui manque et le dit", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(2).map(({ name }) => ({ name })) });
    gh.repondre(`repos/${DEPOT}/labels`, { statut: 201, corps: {} });

    const { code, sortie } = await commande(t, env, "labels");

    assert.match(sortie, /2 labels créés sur benomite\/brigade : fire, prio:1/);
    assert.equal(code, 0);
  });

  test("`setup` mesure le setup et dit si un worktree neuf par cook tient", async (t) => {
    const { env } = projet(t);

    const { code, sortie } = await commande(t, env, "setup", "12");

    assert.match(sortie, /setup joué en .* s/);
    assert.match(sortie, /À 12 cooks/);
    assert.match(sortie, /un worktree neuf par cook tient à 12 cooks/);
    assert.equal(code, 0);
  });

  test("`setup` sur un setup en échec sort en 1 avec ce qu'il a dit", async (t) => {
    const { env } = projet(t);
    writeFileSync(env.FAUX_SETUP ?? "", "echec");

    const { code, sortie } = await commande(t, env, "setup");

    assert.match(sortie, /setup en échec/);
    assert.match(sortie, /npm ci a échoué/);
    assert.equal(code, 1);
  });

  test("`desinstaller` ne retire rien sans `--confirmer`, puis dit ce qui reste à la main", async (t) => {
    const { env, clone } = projet(t);

    const blanc = await commande(t, env, "uninstall");
    assert.match(blanc.sortie, /rien n'est retiré/);
    assert.equal(existsSync(clone), true);
    assert.equal(blanc.code, 0);

    const { code, sortie } = await commande(t, env, "uninstall", "--confirm");
    assert.equal(existsSync(clone), false);
    assert.match(sortie, new RegExp(`sudo systemctl disable --now brigade@${PROJET}\\.service`));
    assert.match(sortie, /Le dépôt reste un dépôt ordinaire/);
    assert.equal(code, 0);
  });

  // Le verdict pour l'app : le même, en JSON, sur une ligne — et la sortie
  // brute est celle que la commande écrit en texte, au caractère près.
  const juger = async (t: TestContext, env: Record<string, string>) => {
    const { code, sortie } = await commande(t, env, "--json");
    return { code, verdict: JSON.parse(sortie) as Verdict };
  };

  test("`--json` d'un projet prêt : le verdict « prêt », sans manque, la sortie brute du texte jointe", async (t) => {
    const { env } = projet(t);

    const texte = await commande(t, env);
    const { code, verdict } = await juger(t, env);

    assert.equal(verdict.verdict, "pret");
    assert.deepEqual(verdict.manques, []);
    assert.equal(verdict.brut, texte.sortie);
    assert.equal(code, 0);
  });

  test("`--json` d'un projet mal installé : « pas prêt », ses trois manques en mots simples, chacun avec qui le lève et comment", async (t) => {
    const { env, gh, etat } = projet(t, { gates: null });
    gh.repondre(LABELS_DU_DEPOT, { corps: [] });
    sansDecision(etat, "BRIGADE_REVIEWER_MODEL");

    const texte = await commande(t, env);
    const { code, verdict } = await juger(t, env);

    assert.equal(verdict.verdict, "pas-pret");
    assert.equal(verdict.manques.length, 3);
    assert.equal(verdict.phrase, "pas prêt : 3 choses à faire");
    const dit = verdict.manques.map((manque) => [manque.texte, manque.acteur, manque.acteur === "chef" ? (manque.action ?? manque.commande) : null]);
    assert.deepEqual(dit, [
      ["la décision « reviewer-modele » n'est pas prise", "chef", "decisions"],
      ["le dépôt n'a pas ses gates : rien ne jugerait une livraison", "chef", "init"],
      [`il manque au dépôt ${LABELS.length} des étiquettes par lesquelles tu parles à brigade`, "chef", `brigade ${PROJET} installation labels`],
    ]);
    assert.equal(verdict.brut, texte.sortie);
    assert.equal(code, 1);
  });

  test("une vérification qui plante sur /etc/sudoers.d (#654) : en texte, la ligne d'erreur ; en JSON, « pas allée au bout », la panne connue, rien à faire — pas « pas prêt »", async (t) => {
    if (process.getuid?.() === 0) return t.skip("root lit un répertoire en 000 : rien ne plante");
    const { env, racine } = projet(t);
    // Le réglage du geste d'installation, sous un répertoire que ce compte ne lit pas — comme /etc/sudoers.d sur la box du chef.
    // Sa lecture n'est pas gardée contre EACCES : c'est par elle que la vérification plante ici. Le jour où elle l'est,
    // ce test cherche une autre lecture qui plante — le verdict, lui, ne dépend pas de laquelle.
    const sudoers = join(racine, "etc/sudoers.d");
    mkdirSync(sudoers, { recursive: true });
    const plante = { ...env, BRIGADE_INSTALLER_CONFIG: join(sudoers, "regle") };
    chmodSync(sudoers, 0o000);
    try {
      const texte = await commande(t, plante);
      const { code, verdict } = await juger(t, plante);

      assert.match(texte.sortie, /^brigade : EACCES: permission denied, lstat '.*\/etc\/sudoers\.d\/regle'\n$/);
      assert.equal(texte.code, 1);
      assert.equal(verdict.verdict, "plantee");
      assert.ok(verdict.verdict === "plantee");
      assert.equal(verdict.panne.connue?.issue, 654);
      assert.equal(verdict.panne.rienAFaire, true);
      assert.deepEqual(verdict.manques, []);
      assert.equal(verdict.brut, texte.sortie);
      assert.equal(code, 1);
    } finally {
      chmodSync(sudoers, 0o755);
    }
  });

  test("une commande inconnue rappelle l'usage et sort en 2", async (t) => {
    const { code, sortie } = await commande(t, {}, "installer");

    assert.match(sortie, /usage :/);
    assert.equal(code, 2);
  });
});

describe("la ligne du renouvellement", () => {
  const ligne = (etat: EtatDuRenouvellement) => jugerRenouvellement(etat);
  test("ok : l'heure du dernier passage réussi", () => {
    assert.deepEqual(ligne({ etat: "ok", dernierReussi: "14:07", echecsConsecutifs: 0 }), { etat: "ok", texte: "renouvellement : dernier passage réussi à 14:07" });
  });
  test("minuteur inactif", () => {
    const dit = ligne({ etat: "minuteur-inactif", dernierReussi: null, echecsConsecutifs: 0 });
    assert.equal(dit.etat, "note");
    assert.match(dit.texte, /renouvellement : minuteur inactif$/);
  });
  test("minuteur inactif, un ancien passage gardé", () => {
    assert.match(ligne({ etat: "minuteur-inactif", dernierReussi: "09:30", echecsConsecutifs: 0 }).texte, /minuteur inactif \(dernier passage réussi à 09:30\)/);
  });
  test("claude introuvable", () => {
    const dit = ligne({ etat: "claude-introuvable", raison: "échec (claude-introuvable) : pas dans le PATH", dernierReussi: null, echecsConsecutifs: 1 });
    assert.match(dit.texte, /renouvellement : `claude` introuvable — échec \(claude-introuvable\)/);
  });
  test("échec : sa raison et le compte", () => {
    const dit = ligne({ etat: "echec", raison: "échec (réseau) : timeout", dernierReussi: "08:00", echecsConsecutifs: 3 });
    assert.equal(dit.texte, "renouvellement : échec, 3 échecs de suite (dernier passage réussi à 08:00) — échec (réseau) : timeout");
  });
  test("verifier porte une seule ligne de renouvellement, jouée par le systemd injecté", async (t) => {
    const { env } = projet(t);
    const systemd = { minuteurActif: async () => true, passages: async () => [{ at: new Date(2026, 9, 15, 14, 7), reussi: true, lignes: [] }] };
    const lignes = (await verifier(env, systemd)).filter((constat) => constat.texte.startsWith("renouvellement"));
    assert.deepEqual(lignes.map((constat) => constat.texte), ["renouvellement : dernier passage réussi à 14:07"]);
  });
});

test("réseau : un hôte du setup absent de la déclaration rend la vérification rouge et le nomme", () => {
  const setup = '#!/usr/bin/env bash\nnpm ci\nnpm add "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"\n';
  const ecart = jugerReseau({ setup, declaration: "registry.npmjs.org\n" });
  assert.equal(ecart.etat, "manque");
  assert.match(ecart.texte, /cdn\.sheetjs\.com/);
  assert.doesNotMatch(ecart.texte, /registry\.npmjs\.org/);

  const absent = jugerReseau({ setup, declaration: null });
  assert.equal(absent.etat, "manque");
  assert.match(absent.texte, /cdn\.sheetjs\.com/);
  assert.match(absent.texte, /absent/);

  assert.equal(jugerReseau({ setup, declaration: "registry.npmjs.org\ncdn.sheetjs.com\n" }).etat, "ok");
  assert.equal(jugerReseau({ setup: "#!/usr/bin/env bash\necho ok\n", declaration: null }).etat, "ok");
});
