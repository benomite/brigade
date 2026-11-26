// #4237 : les gates d'un projet sont celles que sa fiche nomme — partout où la
// cuisine les cherche. La vérification de la box les cherche sur la base, avec
// la branche que la fiche sert ; et chaque refus de la station faute de gates
// nomme le script de la fiche qui manque : sur la tête de la PR d'un ticket,
// pour un « déjà servi », sur la tête d'une PR externe.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { CHEMIN_DE_LA_FICHE, ecrireFiche, ficheParDefaut, SCRIPT_GATES } from "../../src/fiche-projet/index.ts";
import type { GitHub } from "../../src/github.ts";
import { verifier, type Constat } from "../../src/installation.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, FAUX_CLAUDE, git, repertoireTemporaire } from "../outils.ts";

const fiche = (changer: (f: Record<string, unknown>) => void = () => {}) => {
  const f: Record<string, unknown> = ficheParDefaut(BASE);
  changer(f);
  return f;
};
const LINT = "checks/lint.sh";
const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

// --- La vérification de la box.

const bindings = (lignes: string[]) => ["# Le projet", "", "## Équipe multi-agents (plugin brigade)", "", ...lignes, "- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`", ""].join("\n");

// Pousse sur la base de l'origine un commit qui porte exactement `fichiers` :
// un chemin à `null` n'y est pas, un script `executable` en a le droit.
function pousser(clone: string, fichiers: Record<string, { contenu: string; executable?: boolean } | null>) {
  for (const [chemin, fichier] of Object.entries(fichiers)) {
    rmSync(join(clone, chemin), { force: true });
    if (fichier === null) continue;
    mkdirSync(join(clone, chemin, ".."), { recursive: true });
    writeFileSync(join(clone, chemin), fichier.contenu);
  }
  git(clone, "add", "-A");
  for (const [chemin, fichier] of Object.entries(fichiers)) if (fichier !== null) git(clone, "update-index", `--chmod=${fichier.executable ? "+x" : "-x"}`, chemin);
  git(clone, "commit", "-q", "--allow-empty", "-m", "base");
  git(clone, "push", "-q", "origin", `HEAD:${BASE}`);
}

const SANS_SYSTEMD = { minuteurActif: async () => false, passages: async () => [] };
const duDepot = async (clone: string) => {
  const constats = await verifier({ ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SYSTEMCTL_BIN: join(import.meta.dirname, "../aides/faux-systemctl.sh"), BRIGADE_GH_BIN: join(clone, "pas-de-gh") }, SANS_SYSTEMD);
  const depot = constats.filter((constat: Constat) => constat.ou === "depot");
  return { manques: depot.filter(({ etat }) => etat === "manque").map(({ texte }) => texte), oks: depot.filter(({ etat }) => etat === "ok").map(({ texte }) => texte) };
};

const SCRIPT = { contenu: "#!/usr/bin/env bash\nnpm test\n", executable: true };
const NOMME_LINT = { contenu: JSON.stringify(fiche((f) => (f.stages = [{ name: "code", gates: [LINT] }]))) };

test("the box check: the gates are the scripts the sheet on the base names, no `gates.sh` is asked of it", async (t: TestContext) => {
  const { clone } = depotGit(t);
  pousser(clone, { "CLAUDE.md": { contenu: bindings([`- **Branche d'intégration** : \`${BASE}\``]) }, [LINT]: SCRIPT, [CHEMIN_DE_LA_FICHE]: NOMME_LINT });
  const { manques, oks } = await duDepot(clone);
  assert.deepEqual(manques, []);
  assert.ok(oks.includes(`gates: \`${LINT}\``), oks.join("\n"));
  assert.ok(oks.includes(`bindings: block present, integration branch \`${BASE}\``), oks.join("\n"));
});

test("the box check: a gate the sheet names must be executable on the base; bindings with no integration branch still say the default one", async (t: TestContext) => {
  const { clone } = depotGit(t);
  pousser(clone, { "CLAUDE.md": { contenu: bindings([]) }, [LINT]: { ...SCRIPT, executable: false }, [CHEMIN_DE_LA_FICHE]: NOMME_LINT });
  const { manques } = await duDepot(clone);
  assert.ok(manques.includes(`\`${LINT}\` is not executable: the pass runs it as is`), manques.join("\n"));
  assert.ok(manques.some((texte) => texte.includes("the bindings say `main` (no “Branche d'intégration” line)")), manques.join("\n"));
});

test("the box check: a sheet the loader refuses on the base is said, naming the item, and no gate is judged on it", async (t: TestContext) => {
  const { clone } = depotGit(t);
  pousser(clone, { [CHEMIN_DE_LA_FICHE]: { contenu: JSON.stringify(fiche((f) => delete f.rules)) } });
  const { manques } = await duDepot(clone);
  assert.deepEqual(manques.filter((texte) => /sheet|gates/.test(texte)), [`the project sheet on \`${BASE}\` is refused — .brigade/fiche-projet.json: the item \`rules\` (House rules) is missing`]);
});

// --- Les refus de la station.

// Un worktree dont les gates sont vertes ; `sansLint` : sa fiche nomme aussi
// `checks/lint.sh`, qu'il n'a pas.
function worktreeDe(racine: string, run: string, sansLint: boolean) {
  const worktree = join(racine, run);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, SCRIPT_GATES), '#!/bin/sh\nnpm test\necho "PASS  all"\n');
  chmodSync(join(worktree, SCRIPT_GATES), 0o755);
  if (sansLint) ecrireFiche(worktree, fiche((f) => (f.stages = [{ name: "code", gates: [SCRIPT_GATES, LINT] }])));
  return worktree;
}

const OPTIONS = {
  nom: "box",
  places: 1,
  base: "main",
  prise: priseDeLaStation,
  claude: "claude",
  env: {},
  cloison: null,
  plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
  graceMs: 1,
  reviewer: { model: "sonnet" as const, effort: "medium" as const },
  gates: { delaiMs: 2_000 },
};

test("the station's refusals for missing gates name the script of the sheet: on the head of a ticket's PR, and on the head of an outside PR", async (t: TestContext) => {
  const racine = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(757, CALIBRE);
  faux.feu(77, [], "Fixes a typo in the README.");
  const SHA = "a".repeat(40);
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const bas = faux.pour("box");
  const github = {
    ...fauxClient(faux),
    ci: async (sha: string) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })),
    statuts: bas.statuts,
    poserStatut: bas.poserStatut,
    prsOuvertes: async () => [...faux.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, branche: p.branche, fichiers: p.fichiers, sha: p.sha, externe: false })), { number: 77, branche: "typo", fichiers: ["README.md"], sha: SHA, externe: true }],
    remplacerCommentaire: async () => false,
    assigner: async () => {},
  } as unknown as GitHub;
  const avertis: string[] = [];
  const station = stationDuDepot({
    ...OPTIONS,
    depotGitHub: "faux/depot",
    github,
    graphql: false,
    depot: {
      connait: () => false,
      // Le worktree du cook a ses gates ; la tête de sa PR et celle du fork, non.
      preparer: async (run) => ({ worktree: worktreeDe(racine, run, false), branche: `cook/${run}` }),
      reprendre: async (run) => worktreeDe(racine, run, run.startsWith("gates-")),
      recevoirPR: async (run, numero) => ({ worktree: worktreeDe(racine, run, true), reference: `refs/brigade/pr/${numero}` }),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (reference) => (reference === "refs/brigade/pr/77" ? SHA : (faux.prs.findLast((p) => p.branche === reference)?.sha ?? "")),
      vue: () => "e5ba5e",
      fichiers: () => ["src/app.ts"],
      lire: () => null,
    },
    flux: racine,
    lancer,
    projet: () => ({ humans: [{ login: "sam", roles: ["review"] }] }),
    maintenant: () => new Date(Date.UTC(2026, 10, 2, 0, 10)),
    avertir: (texte) => void avertis.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 757);
  assert.ok(pr, "the cook's delivery is in the pass");
  faux.sansCI.add(pr.number);
  for (let tour = 0; tour < 3; tour += 1) {
    await station.tour();
    await station.calme();
  }

  assert.equal(faux.mergee(757), undefined);
  assert.ok(
    avertis.some((texte) => texte.includes(`are not run on box — the project has no \`${LINT}\`, which its sheet names: with no CI either, nothing would judge this delivery`)),
    avertis.join("\n"),
  );
  const verdict = (faux.commentaires.get(77) ?? []).find((c) => c.body.startsWith("<!-- brigade:pr-externe "));
  assert.match(verdict?.body ?? "", /\*\*Gates:\*\* not run — the PR's tree has no `checks\/lint\.sh`, which its sheet names/);
});

test("the station's refusal of an 'already served' claim names the script of the sheet that is missing", async (t: TestContext) => {
  const repertoire = mkdtempSync(join(tmpdir(), "fiche-projet-deja-servi-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(757, CALIBRE);
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut(`<livrable>\n<deja-servi>Commit ${sha.slice(0, 9)} on main does it.</deja-servi>\n</livrable>`));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...OPTIONS,
    depotGitHub: "faux/depot",
    github: fauxClient(faux) as unknown as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(repertoire, run, true), branche: "cook/757-github" }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
      lancerGit: async (args) => ({ code: 0, stdout: args[0] === "rev-parse" ? `${sha}\n` : "", stderr: "" }),
    },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const corps = (faux.commentaires.get(757) ?? []).map((c) => c.body);
  assert.match(corps.find((c) => c.startsWith(MARQUE_D_ECHEC)) ?? "", /the project has no `checks\/lint\.sh`, which its sheet names: nothing would show the base is green/);
  assert.equal(faux.ticket(757).state, "open");
});
