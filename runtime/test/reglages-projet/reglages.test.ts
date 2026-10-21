import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuClaudeMd, depotDeLOrigine, ecrireReglagesProjet, FICHIER, lireReglagesProjet, ReglageRefuse, type Motif, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { git, repertoireTemporaire } from "../outils.ts";

// Un clone du projet dont l'origine est sur github.com : lire son adresse ne
// joint pas le réseau.
function clone(t: TestContext, origine: string | null = "git@github.com:benomite/espace.git"): string {
  const repertoire = repertoireTemporaire(t);
  git(repertoire, "init", "-q");
  if (origine !== null) git(repertoire, "remote", "add", "origin", origine);
  return repertoire;
}

const poser = (repertoire: string, chemin: string, texte: string) => {
  mkdirSync(dirname(join(repertoire, chemin)), { recursive: true });
  writeFileSync(join(repertoire, chemin), texte);
};

const COMPLETS: ReglagesProjet = {
  integrationBranch: "v2",
  defaultCalibrations: { manager: { model: "opus", effort: "high" }, reviewer: { model: "sonnet", effort: "medium" } },
  calibrationCeiling: { model: "opus", effort: "xhigh" },
};

test("a clone carrying `.claude/brigade/projet.json`: branch, default calibrations and ceiling come from the file, the repository from `origin`", async (t) => {
  const repertoire = clone(t);
  poser(repertoire, "CLAUDE.md", "- **Branche d'intégration** : `main`\n");
  poser(
    repertoire,
    FICHIER,
    JSON.stringify({ version: 1, integrationBranch: "v2", defaultCalibrations: { reviewer: { model: "sonnet", effort: "medium" } }, calibrationCeiling: { model: "sonnet", effort: "high" } }),
  );
  assert.deepEqual(await lireReglagesProjet(repertoire), {
    depot: "benomite/espace",
    source: "projet.json",
    // Le fichier fait foi : la ligne du CLAUDE.md n'est lue que sans lui.
    integrationBranch: "v2",
    defaultCalibrations: { reviewer: { model: "sonnet", effort: "medium" } },
    calibrationCeiling: { model: "sonnet", effort: "high" },
  });
});

test("a clone without the file: the integration branch is the one the CLAUDE.md `Branche d'intégration` line declares", async (t) => {
  const repertoire = clone(t, "https://github.com/benomite/brigade.git");
  poser(repertoire, "CLAUDE.md", ["# brigade", "", "## Équipe multi-agents (plugin brigade)", "", "- **Acteurs** : the chef", "- **Branche d'intégration** : `v2`", "- **Worktrees** : `<parent>/brigade-wt`", ""].join("\n"));
  assert.deepEqual(await lireReglagesProjet(repertoire), { depot: "benomite/brigade", source: "CLAUDE.md", integrationBranch: "v2", defaultCalibrations: {}, calibrationCeiling: null });
});

test("a clone with neither the file nor the line, nor a github.com origin: nothing is guessed", async (t) => {
  const sans = clone(t, null);
  assert.deepEqual(await lireReglagesProjet(sans), { depot: null, source: "aucune", integrationBranch: null, defaultCalibrations: {}, calibrationCeiling: null });
  const ailleurs = clone(t, "https://gitlab.com/benomite/espace.git");
  poser(ailleurs, "CLAUDE.md", "# espace\n\nNo bindings here.\n");
  assert.deepEqual(await lireReglagesProjet(ailleurs), { depot: null, source: "aucune", integrationBranch: null, defaultCalibrations: {}, calibrationCeiling: null });
});

test("the repository is read from every form of a github.com origin, and from nothing else", () => {
  for (const url of [
    "https://github.com/benomite/espace.git",
    "https://github.com/benomite/espace",
    "https://x-access-token@github.com/benomite/espace.git",
    "git@github.com:benomite/espace.git",
    "ssh://git@github.com/benomite/espace.git",
    "https://github.com/benomite/espace/\n",
  ]) {
    assert.equal(depotDeLOrigine(url), "benomite/espace", url);
  }
  for (const url of ["https://gitlab.com/benomite/espace.git", "/srv/git/espace.git", "https://github.com/benomite", "https://github.com.evil.example/benomite/espace"]) {
    assert.equal(depotDeLOrigine(url), null, url);
  }
});

test("the CLAUDE.md line is read with or without its markup, and an unreadable branch is no branch", () => {
  assert.equal(brancheDuClaudeMd("- **Branche d'intégration** : `v2`"), "v2");
  assert.equal(brancheDuClaudeMd("Branche d'intégration : `release/2026`"), "release/2026");
  assert.equal(brancheDuClaudeMd("- **Branche d’intégration** : main"), "main");
  assert.equal(brancheDuClaudeMd("- **Worktrees** : `v2`"), null);
  assert.equal(brancheDuClaudeMd("- **Branche d'intégration** : `a..b`"), null);
});

test("writing then reading round-trips", async (t) => {
  const repertoire = clone(t);
  assert.deepEqual(ecrireReglagesProjet(repertoire, COMPLETS), COMPLETS);
  assert.deepEqual(await lireReglagesProjet(repertoire), { depot: "benomite/espace", source: "projet.json", integrationBranch: "v2", defaultCalibrations: COMPLETS.defaultCalibrations, calibrationCeiling: COMPLETS.calibrationCeiling });
  // Le seul réglage obligatoire est la branche.
  ecrireReglagesProjet(repertoire, { integrationBranch: "main" });
  assert.deepEqual(await lireReglagesProjet(repertoire), { depot: "benomite/espace", source: "projet.json", integrationBranch: "main", defaultCalibrations: {}, calibrationCeiling: null });
  // Rien d'autre n'est laissé à côté du fichier.
  assert.deepEqual(readdirSync(join(repertoire, ".claude/brigade")), ["projet.json"]);
});

test("the written file is stable JSON: the same settings give the same bytes, whatever their order", (t) => {
  const [a, b] = [clone(t), clone(t)];
  ecrireReglagesProjet(a, COMPLETS);
  ecrireReglagesProjet(b, {
    calibrationCeiling: { effort: "xhigh", model: "opus" },
    defaultCalibrations: { reviewer: { effort: "medium", model: "sonnet" }, manager: { effort: "high", model: "opus" } },
    integrationBranch: "v2",
  });
  const texte = readFileSync(join(a, FICHIER), "utf8");
  assert.equal(readFileSync(join(b, FICHIER), "utf8"), texte);
  assert.equal(
    texte,
    `{
  "version": 1,
  "integrationBranch": "v2",
  "defaultCalibrations": {
    "manager": {
      "model": "opus",
      "effort": "high"
    },
    "reviewer": {
      "model": "sonnet",
      "effort": "medium"
    }
  },
  "calibrationCeiling": {
    "model": "opus",
    "effort": "xhigh"
  }
}
`,
  );
  // Réécrire les mêmes réglages ne change pas un octet.
  ecrireReglagesProjet(a, COMPLETS);
  assert.equal(readFileSync(join(a, FICHIER), "utf8"), texte);
});

// Écrit ce qui doit être refusé dans un clone qui a déjà son fichier, puis dans
// un clone qui n'en a pas : le refus dit pourquoi, et rien n'a bougé.
function refuse(t: TestContext, reglages: unknown, motif: Motif, cle: string, dit: RegExp, secret?: string): void {
  const avec = clone(t);
  ecrireReglagesProjet(avec, COMPLETS);
  const avant = readFileSync(join(avec, FICHIER));
  const sans = clone(t);
  for (const repertoire of [avec, sans]) {
    assert.throws(
      () => ecrireReglagesProjet(repertoire, reglages),
      (erreur: unknown) => {
        assert.ok(erreur instanceof ReglageRefuse);
        assert.equal(erreur.motif, motif);
        assert.equal(erreur.cle, cle);
        assert.match(erreur.message, dit);
        // Un secret refusé n'est pas répété dans le message.
        if (secret !== undefined) assert.ok(!erreur.message.includes(secret), erreur.message);
        return true;
      },
    );
  }
  assert.deepEqual(readFileSync(join(avec, FICHIER)), avant);
  assert.deepEqual(readdirSync(join(avec, ".claude/brigade")), ["projet.json"]);
  assert.equal(existsSync(join(sans, ".claude")), false);
}

test("a value that looks like a secret is refused, without being repeated, and the file is left untouched", (t) => {
  const jeton = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
  refuse(t, { ...COMPLETS, integrationBranch: jeton }, "secret", "integrationBranch", /looks like a GitHub token/, jeton);
  const cle = "sk-ant-api03-" + "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe";
  refuse(t, { ...COMPLETS, notes: { anthropic: cle } }, "secret", "notes.anthropic", /looks like an Anthropic key/, cle);
  const brut = "Q7wE9rT2yU4iO6pA8sD0fG1hJ3kL5zX7cV9bN2mQ4";
  refuse(t, { ...COMPLETS, gates: brut }, "secret", "gates", /looks like a key or a token/, brut);
});

test("a credential is refused by its name, whatever its value, and the file is left untouched", (t) => {
  refuse(t, { ...COMPLETS, githubToken: "abc" }, "secret", "githubToken", /its name says a secret or a credential/, "abc");
  refuse(t, { ...COMPLETS, defaultCalibrations: { manager: { model: "opus", effort: "high", password: "hunter2" } } }, "secret", "defaultCalibrations.manager.password", /secret or a credential/, "hunter2");
  refuse(t, { ...COMPLETS, mirror: "https://chef:hunter2@example.com/espace.git" }, "secret", "mirror", /an address carrying a password/, "hunter2");
});

test("an absolute machine path is refused, and the file is left untouched", (t) => {
  for (const chemin of ["/home/chef/espace", "~/brigade-wt", "C:\\Users\\chef\\espace", "$HOME/espace", "bash /opt/brigade/gates.sh"]) {
    refuse(t, { ...COMPLETS, gates: chemin }, "chemin", "gates", /its value is a path on a machine/);
  }
  refuse(t, { ...COMPLETS, integrationBranch: "/srv/espace" }, "chemin", "integrationBranch", /path on a machine/);
});

test("a machine-specific limit — cook count, workspace folder — is refused, and the file is left untouched", (t) => {
  refuse(t, { ...COMPLETS, cooks: 3 }, "limite-machine", "cooks", /machine-specific setting/);
  refuse(t, { ...COMPLETS, workspaceFolder: "brigade-wt" }, "limite-machine", "workspaceFolder", /machine-specific setting/);
  refuse(t, { ...COMPLETS, station: { maxCooks: 2 } }, "limite-machine", "station", /each station sets it for itself/);
});

test("what is not a project setting, or not a valid one, is refused and named", (t) => {
  refuse(t, { ...COMPLETS, colour: "teal" }, "invalide", "colour", /is not a project setting/);
  refuse(t, { defaultCalibrations: COMPLETS.defaultCalibrations }, "invalide", "integrationBranch", /must be the name of a git branch/);
  refuse(t, { ...COMPLETS, integrationBranch: "feature..x" }, "invalide", "integrationBranch", /git branch/);
  refuse(t, { ...COMPLETS, calibrationCeiling: { model: "gpt", effort: "high" } }, "invalide", "calibrationCeiling.model", /opus, sonnet, haiku/);
  refuse(t, { ...COMPLETS, defaultCalibrations: { pass: { model: "opus", effort: "high" } } }, "invalide", "defaultCalibrations.pass", /not a role/);
  refuse(t, { ...COMPLETS, version: 1 }, "invalide", "version", /not a project setting/);
  refuse(t, "v2", "invalide", "", /JSON object/);
});

test("a long branch with its separators is not taken for a key", (t) => {
  const repertoire = clone(t);
  ecrireReglagesProjet(repertoire, { integrationBranch: "release/2026-10-21-versioned-project-settings-file" });
  assert.match(readFileSync(join(repertoire, FICHIER), "utf8"), /release\/2026-10-21-versioned-project-settings-file/);
});

test("a file that is not valid, or written by a newer brigade, is refused on reading — never half read", async (t) => {
  const lire = async (texte: string) => {
    const repertoire = clone(t);
    poser(repertoire, FICHIER, texte);
    return lireReglagesProjet(repertoire);
  };
  await assert.rejects(lire("{ not json"), (erreur: unknown) => erreur instanceof ReglageRefuse && /is not valid JSON/.test(erreur.message));
  await assert.rejects(lire(JSON.stringify({ version: 2, integrationBranch: "v2" })), /written by a newer brigade/);
  await assert.rejects(lire(JSON.stringify({ integrationBranch: "v2" })), /`version` must be a whole number/);
  await assert.rejects(lire(JSON.stringify({ version: 1, integrationBranch: "v2", cooks: 4 })), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.motif === "limite-machine");
  // Un secret commité par erreur n'est pas répété par le refus.
  const jeton = "github_pat_" + "11ABCDEFG0123456789abcdefghijklmnop";
  await assert.rejects(lire(JSON.stringify({ version: 1, integrationBranch: "v2", note: jeton })), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.motif === "secret" && !erreur.message.includes(jeton));
  await assert.rejects(lire(`{ "token": "${jeton}"`), (erreur: unknown) => erreur instanceof ReglageRefuse && !erreur.message.includes(jeton));
});
