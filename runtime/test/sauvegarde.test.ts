// La sauvegarde de l'état d'un projet, et sa restauration : un instantané
// cohérent du journal pris pendant que le runtime écrit, les flux bruts en un
// seul exemplaire, et un runtime qui redémarre sur ce qui a été restauré.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Base } from "../src/base.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { demarrer } from "../src/runtime.ts";
import { prendreInstantane, restaurer, sauvegarder, SauvegardeRefusee } from "../src/sauvegarde.ts";
import { CALIBRE, chef, cuisine, issue } from "./aides/cuisine.ts";
import { BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, faitInconnu, fauxGh, git, horloge, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const SRC = join(import.meta.dirname, "../src");
const [MAIN, SAUVEGARDER, RESTAURER] = ["main.ts", "sauvegarder.ts", "restaurer.ts"].map((fichier) => join(SRC, fichier)) as [string, string, string];
const REFUS = 2;

// Un projet dont le journal porte déjà deux faits, et deux flux de cooks.
function projet(t: TestContext, nom = "brigade") {
  const etat = repertoireTemporaire(t);
  const destination = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: etat, projet: nom, intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const noter = (type: string, ticket: number | null = 7) => runtime.journal.ajouter({ project: nom, ticket, author: "runtime", ...faitInconnu(type) });
  noter("ticket.vu");
  mkdirSync(join(etat, "runs"));
  writeFileSync(join(etat, "runs/7-aa.jsonl"), "flux du premier cook\n");
  writeFileSync(join(etat, "runs/7-aa.jsonl.stderr"), "");
  // Chaque sauvegarde a son heure : une par jour, à 03:30.
  let jour = 8;
  const options = (garder = 14) => {
    const heure = new Date(`2026-10-${String(jour++).padStart(2, "0")}T03:30:00.123Z`);
    return { repertoireEtat: etat, destination, garder, maintenant: () => heure };
  };
  const datees = () => readdirSync(destination).filter((nom) => nom !== "runs").sort();
  return { etat, destination, runtime, journal: runtime.journal, noter, options, datees };
}

// Fait échouer l'écriture de la réussite au journal, comme le ferait un disque
// plein — sans attendre le délai d'un journal tenu par un autre.
function refuserLeFait(journal: Journal): void {
  journal.base.script(
    "CREATE TRIGGER essai_disque_plein BEFORE INSERT ON events WHEN NEW.type = 'backup.completed' BEGIN SELECT RAISE(ABORT, 'disque plein'); END",
  );
}

function types(repertoire: string, fichier = "log.db"): string[] {
  const base = new Base(join(repertoire, fichier), { lectureSeule: true });
  try {
    return base.lire<{ type: string }>("SELECT type FROM events ORDER BY seq").map((ligne) => ligne.type);
  } finally {
    base.fermer();
  }
}

describe("la sauvegarde", { concurrency: 8 }, () => {
  test("l'instantané se prend pendant qu'une écriture est en cours : il porte ce qui était validé, et rien d'autre", (t) => {
    const { etat, journal, noter } = projet(t);
    const cible = join(repertoireTemporaire(t), "log.db");

    journal.base.transaction(() => {
      noter("ticket.pas-encore-valide");
      prendreInstantane(etat, cible);
    });

    assert.deepEqual(types(join(cible, ".."), "log.db"), ["runtime.started", "ticket.vu"]);
    // L'écrivain n'a pas été gêné : sa transaction a abouti.
    assert.deepEqual(journal.tout().map((e) => e.type), ["runtime.started", "ticket.vu", "ticket.pas-encore-valide"]);
    assert.deepEqual(readdirSync(join(cible, "..")), ["log.db"]);
  });

  test("une sauvegarde porte le journal, son manifeste et les flux bruts — ni le verrou, ni le dépôt, ni les worktrees", (t) => {
    const { etat, destination, options } = projet(t);
    mkdirSync(join(etat, "worktrees/7-aa"), { recursive: true });
    mkdirSync(join(etat, "depot"));

    const bilan = sauvegarder(options());

    assert.deepEqual(readdirSync(destination).sort(), ["2026-10-08T03-30-00Z", "runs"]);
    const datee = join(destination, "2026-10-08T03-30-00Z");
    assert.deepEqual(readdirSync(datee).sort(), ["log.db", "manifeste.json"]);
    assert.deepEqual(types(datee), ["runtime.started", "ticket.vu"]);
    assert.deepEqual(JSON.parse(readFileSync(join(datee, "manifeste.json"), "utf8")), {
      project: "brigade",
      at: "2026-10-08T03:30:00.123Z",
      lastSeq: 2,
      events: 2,
      streams: 2,
      node: process.version,
    });
    assert.deepEqual(readdirSync(join(destination, "runs")).sort(), ["7-aa.jsonl", "7-aa.jsonl.stderr"]);
    assert.deepEqual(bilan, { nom: "2026-10-08T03-30-00Z", chemin: datee, projet: "brigade", evenements: 2, dernierSeq: 2, flux: { copies: 2, total: 2 }, retirees: [], nonJournalisee: null });
  });

  test("une sauvegarde réussie s'écrit au journal du projet, au nom de la sauvegarde — après l'instantané, qui ne la contient pas", (t) => {
    const { journal, destination, options } = projet(t);

    sauvegarder(options());

    const fait = journal.tout().at(-1);
    assert.deepEqual(
      [fait?.type, fait?.author, fait?.project, fait?.ticket, fait?.payload],
      ["backup.completed", "sauvegarde", "brigade", null, { name: "2026-10-08T03-30-00Z", lastSeq: 2, events: 2, streams: 2 }],
    );
    assert.deepEqual(types(join(destination, "2026-10-08T03-30-00Z")), ["runtime.started", "ticket.vu"]);
  });

  test("les flux bruts ne pèsent qu'une fois : seul ce qui est neuf ou a changé est recopié, et rien n'est jamais retiré", (t) => {
    const { etat, destination, options } = projet(t);
    sauvegarder(options());
    const avant = statSync(join(destination, "runs/7-aa.jsonl.stderr")).ino;

    writeFileSync(join(etat, "runs/7-aa.jsonl"), "flux du premier cook\nqui a continué\n");
    writeFileSync(join(etat, "runs/8-bb.jsonl"), "flux du second cook\n");
    rmSync(join(etat, "runs/7-aa.jsonl.stderr"));
    const bilan = sauvegarder(options());

    assert.deepEqual(bilan?.flux, { copies: 2, total: 2 });
    assert.equal(readFileSync(join(destination, "runs/7-aa.jsonl"), "utf8"), "flux du premier cook\nqui a continué\n");
    assert.equal(readFileSync(join(destination, "runs/8-bb.jsonl"), "utf8"), "flux du second cook\n");
    // Disparu de la source, gardé par la sauvegarde — et pas réécrit.
    assert.equal(statSync(join(destination, "runs/7-aa.jsonl.stderr")).ino, avant);
  });

  test("la rotation ne garde que les dernières sauvegardes, et ne touche pas aux flux", (t) => {
    const { destination, options, datees } = projet(t);
    sauvegarder(options(2));
    sauvegarder(options(2));

    const bilan = sauvegarder(options(2));

    assert.deepEqual(datees(), ["2026-10-09T03-30-00Z", "2026-10-10T03-30-00Z"]);
    assert.deepEqual(bilan?.retirees, ["2026-10-08T03-30-00Z"]);
    assert.equal(existsSync(join(destination, "runs/7-aa.jsonl")), true);
  });

  test("une sauvegarde qui échoue ne laisse rien qui ait l'air d'une sauvegarde, et ne retire aucune des précédentes", (t) => {
    const { etat, runtime, options, datees } = projet(t);
    sauvegarder(options(1));
    runtime.arreter("test");
    writeFileSync(join(etat, "log.db"), "ceci n'est pas une base");
    rmSync(join(etat, "log.db-wal"), { force: true });

    assert.throws(() => sauvegarder(options(1)));

    assert.deepEqual(datees(), ["2026-10-08T03-30-00Z"]);
  });

  test("les restes d'une sauvegarde interrompue sont retirés au passage suivant ; une sauvegarde en cours est laissée", (t) => {
    const { destination, options, datees } = projet(t);
    const [morte, vive] = [join(destination, ".en-cours-2026-10-01T03-30-00Z"), join(destination, ".en-cours-2026-10-08T03-29-59Z")];
    mkdirSync(morte);
    mkdirSync(vive);
    const hier = new Date(Date.now() - 86_400_000);
    utimesSync(morte, hier, hier);

    sauvegarder(options());

    assert.deepEqual(datees(), [".en-cours-2026-10-08T03-29-59Z", "2026-10-08T03-30-00Z"]);
  });

  test("un répertoire d'état qui n'existe pas est refusé : un chemin mal écrit ne passe pas pour une sauvegarde sans rien à faire", (t) => {
    const destination = repertoireTemporaire(t);

    assert.throws(() => sauvegarder({ repertoireEtat: join(destination, "..", "brigade-etat-qui-n-existe-pas"), destination, garder: 14 }), SauvegardeRefusee);

    assert.deepEqual(readdirSync(destination), []);
  });

  test("une réussite qui ne peut pas s'écrire au journal reste une sauvegarde faite : c'est dit à part, et la rotation a lieu", (t) => {
    const { journal, options, datees } = projet(t);
    sauvegarder(options(1));
    const avant = journal.dernierSeq();
    refuserLeFait(journal);

    const bilan = sauvegarder(options(1));

    assert.match(bilan?.nonJournalisee ?? "", /disque plein/);
    assert.equal(journal.dernierSeq(), avant);
    assert.deepEqual(datees(), ["2026-10-09T03-30-00Z"]);
    assert.deepEqual(bilan?.retirees, ["2026-10-08T03-30-00Z"]);
  });

  test("un répertoire d'état sans journal n'a rien à sauvegarder : ni sauvegarde, ni journal créé", (t) => {
    const [etat, destination] = [repertoireTemporaire(t), repertoireTemporaire(t)];

    assert.equal(sauvegarder({ repertoireEtat: etat, destination, garder: 14 }), null);

    assert.deepEqual([readdirSync(etat), readdirSync(destination)], [[], []]);
  });

  test("une destination rangée dans le répertoire d'état est refusée : elle partirait avec lui", (t) => {
    const { etat, options } = projet(t);

    assert.throws(() => sauvegarder({ ...options(), destination: join(etat, "sauvegardes") }), SauvegardeRefusee);

    assert.equal(existsSync(join(etat, "sauvegardes")), false);
  });

  test("une destination qui porte déjà les sauvegardes d'un autre projet est refusée", (t) => {
    const brigade = projet(t);
    const thermigo = projet(t, "thermigo");
    sauvegarder(brigade.options());

    const lendemain = () => new Date("2026-10-09T03:30:00.000Z");
    assert.throws(() => sauvegarder({ ...thermigo.options(), destination: brigade.destination, maintenant: lendemain }), /sauvegardes du projet « brigade »/);

    assert.deepEqual(brigade.datees(), ["2026-10-08T03-30-00Z"]);
  });
});

describe("la restauration", { concurrency: 8 }, () => {
  test("elle pose le journal et les flux dans un répertoire neuf, sans verrou", (t) => {
    const { destination, options } = projet(t);
    const { chemin } = sauvegarder(options())!;
    const neuf = join(repertoireTemporaire(t), "etat");

    const bilan = restaurer({ sauvegarde: chemin, repertoireEtat: neuf });

    assert.deepEqual(readdirSync(neuf).sort(), ["log.db", "runs"]);
    assert.deepEqual(types(neuf), ["runtime.started", "ticket.vu"]);
    assert.deepEqual(readdirSync(join(neuf, "runs")).sort(), readdirSync(join(destination, "runs")).sort());
    assert.deepEqual(bilan, { projet: "brigade", prise: "2026-10-08T03:30:00.123Z", evenements: 2, dernierSeq: 2, flux: 2, fluxManquants: 0 });
  });

  test("elle n'écrase jamais un journal : un répertoire d'état qui en a un est refusé, intact", (t) => {
    const { etat, journal, options } = projet(t);
    const { chemin } = sauvegarder(options())!;
    const avant = journal.dernierSeq();

    assert.throws(() => restaurer({ sauvegarde: chemin, repertoireEtat: etat }), SauvegardeRefusee);

    assert.equal(journal.dernierSeq(), avant);
  });

  for (const reste of ["log.db-wal", "log.db-shm"]) {
    test(`un ${reste} resté dans la cible est refusé : rejoué sur le journal restauré, il le rendrait illisible`, (t) => {
      const { options } = projet(t);
      const { chemin } = sauvegarder(options())!;
      const cible = repertoireTemporaire(t);
      writeFileSync(join(cible, reste), "les restes d'un runtime tué");

      assert.throws(() => restaurer({ sauvegarde: chemin, repertoireEtat: cible }), new RegExp(`a déjà un journal \\(${reste}\\)`));

      assert.deepEqual(readdirSync(cible), [reste]);
    });
  }

  test("une sauvegarde datée copiée sans ses flux se restaure, et dit combien de flux manquent", (t) => {
    const { options } = projet(t);
    const { chemin } = sauvegarder(options())!;
    const seule = join(repertoireTemporaire(t), "2026-10-08T03-30-00Z");
    cpSync(chemin, seule, { recursive: true });
    const neuf = join(repertoireTemporaire(t), "etat");

    const bilan = restaurer({ sauvegarde: seule, repertoireEtat: neuf });

    assert.deepEqual([bilan.flux, bilan.fluxManquants], [0, 2]);
    assert.deepEqual(types(neuf), ["runtime.started", "ticket.vu"]);
  });

  test("une sauvegarde dont la base ne dit pas ce que dit son manifeste est refusée, et rien n'est posé", (t) => {
    const { options } = projet(t);
    const { chemin } = sauvegarder(options())!;
    const manifeste = JSON.parse(readFileSync(join(chemin, "manifeste.json"), "utf8"));
    writeFileSync(join(chemin, "manifeste.json"), JSON.stringify({ ...manifeste, lastSeq: 99 }));
    const neuf = join(repertoireTemporaire(t), "etat");

    assert.throws(() => restaurer({ sauvegarde: chemin, repertoireEtat: neuf }), /manifeste/);

    assert.equal(existsSync(neuf), false);
  });

  test("un chemin qui n'est pas une sauvegarde est refusé", (t) => {
    const vide = repertoireTemporaire(t);

    assert.throws(() => restaurer({ sauvegarde: vide, repertoireEtat: join(vide, "etat") }), SauvegardeRefusee);
  });
});

// Les deux commandes, chacune dans son process, comme le timer et le chef les lancent.
describe("sauvegarder et restaurer, en commandes", { concurrency: 8 }, () => {
  const commande = async (t: TestContext, cli: string, env: Record<string, string>, ...args: string[]) => {
    const enfant = lancer(t, cli, args, env);
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };

  test("sans destination déclarée, la sauvegarde refuse : elle ne la devine pas", async (t) => {
    const { etat } = projet(t);

    const { code, sortie } = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: etat });

    assert.equal(code, REFUS);
    assert.match(sortie, /BRIGADE_BACKUP_DIR n'est pas défini/);
  });

  test("une rétention illisible est un refus, avant d'avoir rien écrit", async (t) => {
    const { etat, destination, datees } = projet(t);

    const { code, sortie } = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: etat, BRIGADE_BACKUP_DIR: destination, BRIGADE_BACKUP_KEEP: "beaucoup" });

    assert.equal(code, REFUS);
    assert.match(sortie, /BRIGADE_BACKUP_KEEP invalide/);
    assert.deepEqual(datees(), []);
  });

  test("un refus de la sauvegarde sort avec le code 2, un échec avec le code 1", async (t) => {
    const { etat, destination, runtime } = projet(t);
    const refus = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: etat, BRIGADE_BACKUP_DIR: join(etat, "dedans") });
    runtime.arreter("test");
    writeFileSync(join(etat, "log.db"), "ceci n'est pas une base");
    rmSync(join(etat, "log.db-wal"), { force: true });

    const echec = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: etat, BRIGADE_BACKUP_DIR: destination });

    assert.deepEqual([refus.code, echec.code], [REFUS, 1]);
    assert.match(echec.sortie, /brigade : sauvegarde en échec/);
  });

  test("une réussite non journalisée et des flux manquants se disent, sans faire échouer la commande", async (t) => {
    const { etat, destination, journal } = projet(t);
    refuserLeFait(journal);

    const sauvegarde = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: etat, BRIGADE_BACKUP_DIR: destination });

    assert.equal(sauvegarde.code, 0, sauvegarde.sortie);
    assert.match(sauvegarde.sortie, /la sauvegarde est faite, mais sa réussite n'a pas pu s'écrire au journal/);
    const nom = /^brigade : sauvegarde (\S+) — /m.exec(sauvegarde.sortie)?.[1] ?? "";
    rmSync(join(destination, "runs"), { recursive: true });

    const restauration = await commande(t, RESTAURER, { BRIGADE_STATE_DIR: join(repertoireTemporaire(t), "etat") }, join(destination, nom));

    assert.equal(restauration.code, 0, restauration.sortie);
    assert.match(restauration.sortie, /2 flux bruts annoncés par la sauvegarde n'ont pas été trouvés/);
  });

  test("restaurer réclame une sauvegarde et un répertoire d'état", async (t) => {
    const { etat } = projet(t);

    assert.equal((await commande(t, RESTAURER, { BRIGADE_STATE_DIR: etat })).code, REFUS);
    assert.equal((await commande(t, RESTAURER, {}, "quelque-part")).code, REFUS);
  });

  test("restaurée sur une machine neuve, la sauvegarde d'un runtime en marche rend un runtime qui redémarre et relit ce qu'il avait servi", async (t) => {
    // Une cuisine sert un ticket sous grant `merge`, de la prise au merge.
    const ancienne = cuisine(t, { pass: true, issues: [issue(17, CALIBRE)] });
    chef(ancienne.repertoire, "grant.activated");
    await jusqua(() => ancienne.types(17).includes("ticket.served"));
    const run = String(ancienne.dernier("cook.launched", 17)?.run);
    const destination = repertoireTemporaire(t);

    // La sauvegarde est prise pendant que ce runtime tourne.
    const sauvegarde = await commande(t, SAUVEGARDER, { BRIGADE_STATE_DIR: ancienne.repertoire, BRIGADE_BACKUP_DIR: destination });
    assert.equal(sauvegarde.code, 0, sauvegarde.sortie);
    const nom = /^brigade : sauvegarde (\S+) — /m.exec(sauvegarde.sortie)?.[1] ?? "";
    assert.equal(ancienne.types().includes("backup.completed"), true);

    // La machine neuve : un répertoire d'état qui n'existe pas encore.
    const neuf = join(repertoireTemporaire(t), "etat");
    const restauration = await commande(t, RESTAURER, { BRIGADE_STATE_DIR: neuf }, join(destination, nom));
    assert.equal(restauration.code, 0, restauration.sortie);
    assert.equal(existsSync(join(neuf, "lock.db")), false);

    const gh = fauxGh(t);
    gh.issues([]);
    const clone = mkdtempSync(join(tmpdir(), "brigade-test-clone-"));
    t.after(() => rmSync(clone, { recursive: true, force: true }));
    git(clone, "init", "-q");
    const env = { ...ENV_GIT, BRIGADE_STATE_DIR: neuf, BRIGADE_PROJECT: "brigade", BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_CLAUDE_BIN: FAUX_CLAUDE };
    const runtime = lancer(t, MAIN, [], env);
    await runtime.attendre("démarré");

    // Il a démarré : le journal restauré était celui d'un runtime mort sans préavis.
    const journal = ouvrirJournal(neuf, { lectureSeule: true });
    t.after(() => journal.fermer());
    const apres = journal.tout().map((e) => e.type);
    assert.deepEqual(apres.filter((type) => type === "runtime.interrupted" || type === "runtime.started"), ["runtime.started", "runtime.interrupted", "runtime.started"]);
    // Tout ce qui précède la sauvegarde est là, à l'identique.
    const anciens = ancienne.journal.tout().filter((e) => e.type !== "backup.completed");
    const repris = journal.tout().slice(0, journal.tout().findIndex((e) => e.type === "runtime.interrupted"));
    assert.deepEqual(repris, anciens.slice(0, repris.length));
    assert.equal(repris.some((e) => e.type === "ticket.served" && e.ticket === 17), true);

    // Et le chef le relit avec ses commandes : le ticket servi, l'usage du grant, le relevé du cook.
    const lire = async (cli: string, ...args: string[]) => (await commande(t, join(SRC, cli), { BRIGADE_STATE_DIR: neuf }, ...args)).sortie;
    assert.match(await lire("relire.ts", "17"), /#17 {2}ticket\.served/);
    assert.match(await lire("grant-cli.ts"), /#17 {2}merge sur v2 .* mergée/);
    assert.match(await lire("montrer-station.ts"), new RegExp(`#17 {2}${run} {2}sonnet / low {2}fini {2}1 tour`));
    assert.match(await lire("montrer-pass.ts", "17"), /VERT — gates vertes/);
    assert.equal(readFileSync(join(neuf, "runs", `${run}.jsonl`), "utf8"), readFileSync(join(ancienne.repertoire, "runs", `${run}.jsonl`), "utf8"));

    runtime.process.kill("SIGTERM");
    assert.equal(await runtime.fin, 0);
  });
});

test("l'unité de sauvegarde lit le même état que le runtime, ne devine pas sa destination, et son timer la joue chaque nuit", () => {
  const lire = (fichier: string) => readFileSync(join(import.meta.dirname, "../deploy", fichier), "utf8");
  const [service, timer, runtime] = [lire("brigade-sauvegarde@.service"), lire("brigade-sauvegarde@.timer"), lire("brigade@.service")];
  const ligne = (unite: string, cle: string) => unite.split("\n").filter((l) => l.startsWith(`${cle}=`));

  assert.deepEqual(ligne(service, "Environment"), ["Environment=BRIGADE_STATE_DIR=/var/lib/brigade/%i"]);
  assert.deepEqual(ligne(service, "User"), ligne(runtime, "User"));
  assert.deepEqual(ligne(service, "WorkingDirectory"), ligne(runtime, "WorkingDirectory"));
  assert.deepEqual(ligne(service, "Type"), ["Type=oneshot"]);
  assert.match(service, /^ExecStart=.* node src\/sauvegarder\.ts$/m);
  assert.deepEqual(ligne(timer, "OnCalendar"), ["OnCalendar=*-*-* 03:30:00"]);
  assert.deepEqual(ligne(timer, "Persistent"), ["Persistent=true"]);
  assert.match(timer, /^WantedBy=timers\.target$/m);
});
