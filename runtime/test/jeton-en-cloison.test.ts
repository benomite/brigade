// Le fichier du jeton, vu d'un lancement cloisonné par le vrai `bwrap` : ce
// qu'un cook en lirait, et ce qu'il y écrirait. Sauté, en le disant, là où
// `bwrap` n'est pas installé ou ne peut pas créer ses espaces de noms.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { configCloison, envelopper } from "../src/cloison.ts";
import { repertoireTemporaire } from "./outils.ts";

const BWRAP = "/usr/bin/bwrap";
const sansBwrap = !existsSync(BWRAP)
  ? `${BWRAP} n'est pas installé`
  : spawnSync(BWRAP, ["--ro-bind", "/", "/", "--dev", "/dev", "--", "true"]).status !== 0
    ? `${BWRAP} ne peut pas créer ses espaces de noms ici`
    : false;

test("un lancement cloisonné lit le fichier du jeton vide, et ne peut pas l'écrire — pas plus que les identifiants du compte", { skip: sansBwrap }, (t) => {
  const racine = repertoireTemporaire(t);
  const lieux = { repertoireEtat: join(racine, "etats/brigade"), clone: join(racine, "etats/brigade/depot") };
  mkdirSync(join(lieux.clone, ".git"), { recursive: true });
  const compte = join(racine, "compte");
  const identifiants = join(compte, ".claude/.credentials.json");
  mkdirSync(join(compte, ".claude"), { recursive: true });
  writeFileSync(identifiants, "{}\n", { mode: 0o600 });
  const jeton = join(racine, "secrets/brigade/jeton-claude");
  mkdirSync(join(racine, "secrets/brigade"), { recursive: true });
  writeFileSync(jeton, "le-jeton-de-la-machine\n", { mode: 0o600 });
  const cloison = configCloison(
    { BRIGADE_SANDBOX_BIN: BWRAP, BRIGADE_SANDBOX_HIDDEN: `${join(racine, "etats")}:${join(racine, "secrets")}`, HOME: compte, BRIGADE_CLAUDE_TOKEN_FILE: jeton },
    lieux,
  );

  // Pour chacun : ce qui s'en lit, puis si une écriture passe.
  const sonde = 'for f in "$@"; do printf "[%s]" "$(cat "$f" 2>&1)"; if (echo ecrase > "$f") 2>/dev/null; then echo " ecrit"; else echo " refuse"; fi; done';
  const { commande, args } = envelopper(cloison, { commande: "sh", args: ["-c", sonde, "sonde", jeton, identifiants] }, { cwd: "/tmp", depot: null });
  const rendu = spawnSync(commande, args, { encoding: "utf8", env: { PATH: process.env.PATH } });

  assert.equal(rendu.status, 0, rendu.stderr);
  assert.deepEqual(rendu.stdout.split("\n").filter(Boolean), ["[] refuse", "[{}] refuse"]);
  // Le vrai fichier n'a pas bougé.
  assert.equal(readFileSync(jeton, "utf8"), "le-jeton-de-la-machine\n");
  assert.equal(readFileSync(identifiants, "utf8"), "{}\n");
});
