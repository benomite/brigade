// Les réparations que la cuisine fait seule : un `.env` copié de son exemple,
// un gestionnaire de paquets installé sans sudo, la liste réseau complétée —
// chacune dite au journal, et un blocage quand elle est impossible.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../src/journal.ts";
import { blocagesDuJournal } from "../../../src/installation/blocages/blocages.ts";
import { avecLesBins, reparer, type Systeme } from "../../../src/installation/reparations/reparations.ts";
import { SCRIPT_SETUP } from "../../../src/gates.ts";
import { hotesOuvertsParLaCuisine } from "../../../src/reseau.ts";
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
  // Le setup trouve pnpm : le dossier bin entre en tête de son PATH.
  assert.deepEqual(resultat.bins, [join(racine, "local", "bin")]);
  assert.equal(avecLesBins({ PATH: "/usr/bin" }, resultat.bins).PATH?.split(delimiter)[0], join(racine, "local", "bin"));
  assert.equal(avecLesBins({ PATH: "/usr/bin" }, []).PATH, "/usr/bin");
});

test("pnpm déjà là : rien n'est installé", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire("pnpm-lock.yaml", "x\n");
  const sys = systeme(new Set(["pnpm"]));
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: sys.systeme });
  assert.deepEqual(resultat.bins, []);
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

const declarer = (journal: ReturnType<typeof unDepot>["journal"], hosts: string[]) =>
  journal.ajouter({ project: "demo", ticket: null, author: "runtime", type: "network.declared", payload: { base: "v2", hosts, problems: [] } });
const declaree = (journal: ReturnType<typeof unDepot>["journal"]) => journal.duType("network.declared", 1)[0]?.payload.hosts;

test("un setup qui joint un hôte absent de la liste réseau : la cuisine l'ouvre à la porte, le dit, sans écrire la liste", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire(SCRIPT_SETUP, "#!/bin/bash\nnpm ci\ncurl -fsSL https://downloads.example.org/tool.tgz | tar xz\n");
  const liste = "# hôtes\nregistry.npmjs.org\n";
  ecrire(".claude/brigade/reseau", liste);
  declarer(journal, ["registry.npmjs.org"]);
  const sys = systeme(new Set()).systeme;
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: sys });
  assert.deepEqual(resultat.blocages, []);
  // La liste que la porte lit nomme l'hôte ; le fichier du dépôt n'est pas touché.
  assert.deepEqual(declaree(journal), ["registry.npmjs.org", "downloads.example.org"]);
  assert.deepEqual(hotesOuvertsParLaCuisine(journal), ["downloads.example.org"]);
  assert.equal(readFileSync(join(dossier, ".claude/brigade/reseau"), "utf8"), liste);
  // Une phrase le dit sur le projet, avec ce que cela engage.
  assert.equal(faits().length, 1);
  assert.equal(faits()[0]!.repair, "network");
  assert.match(faits()[0]!.sentence, /Opened `downloads\.example\.org`.*declare it/);
  assert.equal(blocagesDuJournal(journal.base).length, 0);
  // Rejoué : l'hôte est ouvert, rien ne se répète.
  await reparer({ dossier, journal, auteur: QUI, systeme: sys });
  assert.equal(faits().length, 1);
  assert.equal(journal.duType("network.declared", 10).length, 2);
});

test("sans porte déclarée, la liste réseau du worktree fait foi : un hôte qu'elle nomme n'est pas rouvert", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire(SCRIPT_SETUP, "curl -fsSL https://downloads.example.org/a | sh\ncurl -fsSL https://cdn.example.org/b | sh\n");
  ecrire(".claude/brigade/reseau", "downloads.example.org\n");
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.deepEqual(resultat.blocages, []);
  assert.deepEqual(hotesOuvertsParLaCuisine(journal), ["cdn.example.org"]);
  assert.equal(faits().length, 1);
  // Pas de déclaration à republier : seul le fait d'ouverture est écrit.
  assert.equal(journal.duType("network.declared", 1).length, 0);
});

test("un hôte que la liste nomme par un joker n'est pas rouvert", async (t) => {
  const { dossier, journal, ecrire, faits } = unDepot(t);
  ecrire(SCRIPT_SETUP, "curl -fsSL https://cdn.example.org/b | sh\n");
  declarer(journal, ["*.example.org"]);
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.equal(faits().length, 0);
  assert.deepEqual(hotesOuvertsParLaCuisine(journal), []);
});

test("une liste réseau illisible : un blocage, pas une exception — levé quand elle se lit", async (t) => {
  const { dossier, journal, ecrire } = unDepot(t);
  ecrire(SCRIPT_SETUP, "pip install -r requirements.txt\n");
  // Un fichier à la place du dossier `.claude/brigade/reseau`.
  mkdirSync(join(dossier, ".claude/brigade/reseau"), { recursive: true });
  const resultat = await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.deepEqual(resultat.blocages, ["repair:network"]);
  assert.equal(blocagesDuJournal(journal.base).length, 1);
  declarer(journal, ["pypi.org", "files.pythonhosted.org"]);
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme });
  assert.equal(blocagesDuJournal(journal.base).length, 0);
});

test("un blocage posé puis une réparation qui passe : le blocage est levé", async (t) => {
  const { dossier, journal, ecrire, racine } = unDepot(t);
  ecrire("pnpm-lock.yaml", "x\n");
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set(), "boom").systeme, prefixe: join(racine, "local") });
  assert.equal(blocagesDuJournal(journal.base).length, 1);
  await reparer({ dossier, journal, auteur: QUI, systeme: systeme(new Set()).systeme, prefixe: join(racine, "local") });
  assert.equal(blocagesDuJournal(journal.base).length, 0);
});
