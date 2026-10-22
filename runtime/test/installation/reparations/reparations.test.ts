// Les réparations que la cuisine fait seule : un `.env` copié de son exemple,
// un gestionnaire de paquets installé sans sudo, la liste réseau complétée —
// chacune dite au journal, et un blocage quand elle est impossible.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../src/journal.ts";
import { blocagesDuJournal } from "../../../src/installation/blocages/blocages.ts";
import { reparer, type Systeme } from "../../../src/installation/reparations/reparations.ts";
import { SCRIPT_SETUP } from "../../../src/gates.ts";
import { aArreter, repertoireTemporaire } from "../../outils.ts";

const QUI = { projet: "demo", auteur: "station:box" };

function unDepot(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const dossier = join(racine, "depot");
  mkdirSync(dossier);
  mkdirSync(join(racine, "etat"));
  const journal = ouvrirJournal(join(racine, "etat"));
  aArreter(t, () => journal.fermer());
  const ecrire = (chemin: string, texte: string) => {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), texte);
  };
  const faits = () => journal.tout().filter(({ type }) => type === "repair.done").map((fait) => (fait.payload as { repair: string; sentence: string }));
  return { racine, dossier, journal, ecrire, faits };
}

// Un système où `installé` dit ce qui est sur le PATH.
function systeme(installe: Set<string>, echec?: string): { systeme: Systeme; installes: string[] } {
  const installes: string[] = [];
  return {
    installes,
    systeme: {
      disponible: async (commande) => installe.has(commande),
      installer: async (gestionnaire) => {
        if (echec !== undefined) throw new Error(echec);
        installes.push(gestionnaire);
        installe.add(gestionnaire);
      },
    },
  };
}

test("un .env absent est créé de son .env.example, sans blocage", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire("apps/api/.env.example", "PORT=3000\nDB=postgres://x\n");
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.equal(readFileSync(join(dossier, "apps/api/.env"), "utf8"), "PORT=3000\nDB=postgres://x\n");
  assert.deepEqual(resultat.blocages, []);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
  assert.equal(faits().length, 1);
  assert.equal(faits()[0]!.repair, "env:apps/api/.env");
  assert.match(faits()[0]!.sentence, /apps\/api\/\.env.*apps\/api\/\.env\.example/);
});

test("un .env déjà là n'est pas touché, et node_modules n'est pas fouillé", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire(".env.example", "A=1\n");
  ecrire(".env", "A=secret\n");
  ecrire("node_modules/x/.env.example", "B=1\n");
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.equal(readFileSync(join(dossier, ".env"), "utf8"), "A=secret\n");
  assert.equal(existsSync(join(dossier, "node_modules/x/.env")), false);
  assert.equal(faits().length, 0);
});

test("un dépôt pnpm sans pnpm : pnpm s'installe sans sudo, au dossier de l'utilisateur", async (t) => {
  const { dossier, journal, ecrire, faits, racine } = unDepot(t);
  ecrire("pnpm-lock.yaml", "lockfileVersion: 9\n");
  const sys = systeme(new Set());
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: sys.systeme, prefixe: join(racine, "local") });
  assert.deepEqual(sys.installes, ["pnpm"]);
  assert.deepEqual(resultat.blocages, []);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
  assert.match(faits()[0]!.sentence, /Installed `pnpm`.*without sudo/);
});

test("pnpm déjà là : rien n'est installé", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire("pnpm-lock.yaml", "x\n");
  const sys = systeme(new Set(["pnpm"]));
  await reparer({ dossier, journal, auteur: QUI, systeme: sys.systeme });
  assert.deepEqual(sys.installes, []);
  assert.equal(faits().length, 0);
});

test("l'installation de pnpm échoue : un blocage nomme pnpm, avec une phrase de cause", async (t) => {
  const { dossier, journal, ecrire, racine } = unDepot(t);
  ecrire("pnpm-lock.yaml", "x\n");
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set(), "npm ERR! code ENOTFOUND").systeme, prefixe: join(racine, "local") });
  assert.deepEqual(resultat.blocages, ["need:pnpm"]);
  const [b] = blocagesDuJournal(journal.base);
  assert.match(b!.message, /`pnpm`/);
  assert.match(b!.detail ?? "", /ENOTFOUND/);
});

test("un yarn.lock sans yarn : yarn s'installe", async (t) => {
  const { dossier, journal, ecrire, racine } = unDepot(t);
  ecrire("yarn.lock", "x\n");
  const sys = systeme(new Set());
  await reparer({ dossier, journal, auteur: QUI, systeme: sys.systeme, prefixe: join(racine, "local") });
  assert.deepEqual(sys.installes, ["yarn"]);
});

test("un setup qui joint un hôte absent de la liste réseau : l'hôte y est ajouté, une fois", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire(SCRIPT_SETUP, "#!/bin/bash\nnpm ci\ncurl -fsSL https://downloads.example.org/tool.tgz | tar xz\n");
  ecrire(".claude/brigade/reseau", "# hôtes\nregistry.npmjs.org\n");
  const sys = systeme(new Set()).systeme;
  await reparer({ dossier, journal, auteur: QUI, systeme: sys });
  const liste = readFileSync(join(dossier, ".claude/brigade/reseau"), "utf8");
  assert.match(liste, /^downloads\.example\.org$/m);
  assert.equal(liste.match(/^registry\.npmjs\.org$/gm)?.length, 1);
  assert.equal(faits().filter(({ repair }) => repair === "network").length, 1);
  // Rejoué : plus rien à ajouter.
  await reparer({ dossier, journal, auteur: QUI, systeme: sys });
  assert.equal(faits().filter(({ repair }) => repair === "network").length, 1);
});

test("une liste réseau qu'on ne peut pas écrire : un blocage, pas une exception", async (t) => {
  const { dossier, journal, ecrire } = unDepot(t);
  ecrire(SCRIPT_SETUP, "pip install -r requirements.txt\n");
  // Un fichier à la place du dossier `.claude/brigade/reseau`.
  mkdirSync(join(dossier, ".claude/brigade/reseau"), { recursive: true });
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.deepEqual(resultat.blocages, ["repair:network"]);
});

test("un blocage posé puis une réparation qui passe : le blocage est levé", async (t) => {
  const { dossier, journal, ecrire, racine } = unDepot(t);
  ecrire("pnpm-lock.yaml", "x\n");
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set(), "boom").systeme, prefixe: join(racine, "local") });
  assert.equal(blocagesDuJournal(journal.base).length, 1);
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme, prefixe: join(racine, "local") });
  assert.equal(blocagesDuJournal(journal.base).length, 0);
});
