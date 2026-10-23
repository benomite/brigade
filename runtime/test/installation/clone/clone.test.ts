import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { blocage, DETAIL_MAX } from "../../../src/installation/blocages/blocages.ts";
import { blocageDuClone, clonerEnReparant } from "../../../src/installation/clone/clone.ts";
import { ENQUETE_MUETTE, lireLEchecDuClone } from "../../../src/projets/echec-du-clone.ts";
import { CloneEnEchec } from "../../../src/projets/preparer.ts";

const FAUX_GH = join(import.meta.dirname, "faux-gh-ssh.ts");
const salle = () => {
  const racine = mkdtempSync(join(tmpdir(), "brigade-clone-"));
  const journal = join(racine, "journal");
  const config = join(racine, "gh-config");
  for (const dossier of [journal, config]) mkdirSync(dossier, { recursive: true });
  return { racine, journal, config, nettoyer: () => rmSync(racine, { recursive: true, force: true }) };
};

test("Host key verification failed sous git_protocol ssh : le clone se refait en HTTPS, sans rien changer à la configuration de gh", async () => {
  const { racine, journal, config, nettoyer } = salle();
  const avant = { ...process.env };
  Object.assign(process.env, { FAUX_JOURNAL: journal, GH_CONFIG_DIR: config });
  try {
    const clone = join(racine, "clones/shop");
    await clonerEnReparant({ gh: FAUX_GH, depot: "acme/shop", clone });
    assert.ok(existsSync(join(clone, ".git")));
    assert.deepEqual(readFileSync(join(journal, "essais"), "utf8").trim().split("\n"), ["-", "4"]);
    assert.deepEqual(readdirSync(config), []);
    assert.equal(process.env.GIT_CONFIG_COUNT, avant.GIT_CONFIG_COUNT);
  } finally {
    for (const nom of ["FAUX_JOURNAL", "GH_CONFIG_DIR"]) if (avant[nom] === undefined) delete process.env[nom];
    nettoyer();
  }
});

test("un accès réel refusé n'est pas retenté, et devient un blocage d'une phrase sans « exit status 128 », la sortie brute dans detail", async () => {
  const { racine, journal, nettoyer } = salle();
  Object.assign(process.env, { FAUX_JOURNAL: journal, FAUX_REFUS: "1" });
  try {
    const erreur = await clonerEnReparant({ gh: FAUX_GH, depot: "acme/shop", clone: join(racine, "c") }).then(
      () => null,
      (e: unknown) => e,
    );
    assert.ok(erreur instanceof CloneEnEchec);
    assert.equal(readFileSync(join(journal, "essais"), "utf8").trim().split("\n").length, 1);
    const echec = lireLEchecDuClone({ station: "shop-box", depot: "acme/shop", erreurs: erreur.erreurs, enquete: { ...ENQUETE_MUETTE, compte: "shop-box", jeton: "oauth", proprietaire: true }, reessaieToutesLes: 30 });
    const pose = blocage(blocageDuClone(echec));
    assert.doesNotMatch(pose.message, /exit status 128/);
    assert.match(pose.message, /^shop-box cannot see acme\/shop/);
    assert.equal(pose.message.split("\n").length, 1);
    assert.equal(pose.link, "https://github.com/acme/shop/settings/access");
    assert.match(pose.detail ?? "", /exit status 128/);
    assert.ok((pose.detail ?? "").length <= DETAIL_MAX);
  } finally {
    delete process.env.FAUX_JOURNAL;
    delete process.env.FAUX_REFUS;
    nettoyer();
  }
});
