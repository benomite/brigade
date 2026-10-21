import assert from "node:assert/strict";
import { test } from "node:test";
import { nomPrive, valeurPrivee } from "../../src/reglages-projet/prive.ts";

test("the project settings' own names and values pass the sieve", () => {
  for (const nom of ["version", "integrationBranch", "defaultCalibrations", "calibrationCeiling", "manager", "reviewer", "model", "effort"]) assert.equal(nomPrive(nom), null, nom);
  for (const valeur of ["v2", "main", "release/2026", "cook/1302-6e402176", "opus", "sonnet", "haiku", "low", "medium", "high", "xhigh", "max"]) assert.equal(valeurPrivee(valeur), null, valeur);
});

test("a name that says a secret or a credential is a secret", () => {
  for (const nom of ["token", "GH_TOKEN", "apiKey", "api_key", "password", "clientSecret", "credentials", "privateKey", "authHeader", "jeton", "motDePasse"]) assert.equal(nomPrive(nom)?.motif, "secret", nom);
});

test("a name that says what a machine sets for itself is a machine-specific limit", () => {
  for (const nom of ["cooks", "maxCooks", "cookCount", "workspace", "workspaceFolder", "worktrees", "cpus", "cores", "parallelism", "concurrency", "stations", "capabilities", "sandbox", "host", "stateDir", "path"]) {
    assert.equal(nomPrive(nom)?.motif, "limite-machine", nom);
  }
});

test("a value shaped like a known key or token is a secret", () => {
  for (const valeur of [
    "ghp_" + "abcdefghijklmnopqrstuvwxyz0123456789",
    "github_pat_" + "11ABCDEFG0123456789abcdefghij",
    "sk-ant-oat01-" + "abcdefghijklmnop",
    "sk_live_" + "abcdefghijklmnop",
    "AKIA" + "ABCDEFGHIJKLMNOP",
    "xoxb-" + "1234567890-abcdef",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
    "https://chef:hunter2@example.com/repo.git",
    "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  ]) {
    assert.equal(valeurPrivee(valeur)?.motif, "secret", valeur);
  }
});

test("an absolute path, POSIX or Windows, or one under the home folder, is a machine path", () => {
  for (const valeur of ["/home/chef", "/Users/chef/espace", "~", "~/brigade-wt", "$HOME/x", "${HOME}/x", "%USERPROFILE%\\x", "C:\\brigade", "D:/brigade", "\\\\nas\\share", "run /var/lib/brigade/x"]) {
    assert.equal(valeurPrivee(valeur)?.motif, "chemin", valeur);
  }
  for (const valeur of [".claude/brigade/gates.sh", "docs/runtime/README.md"]) assert.equal(valeurPrivee(valeur), null, valeur);
});
