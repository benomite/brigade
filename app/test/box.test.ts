// La veille des cuisines, contre un faux `node` écrit par chaque test : ce qu'elle
// lance, ce qu'elle rend mot pour mot, ce qu'elle dit quand une commande échoue —
// et si c'est la station qu'elle n'a pas atteinte, ou la commande qui n'a pas répondu.
// Ni réseau ni station ; aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { openStandby, type Kitchen, type Reading } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const PARADE = { nom: "parade", dossier: "/projets/parade" };

// Un faux `node` : un script sh, dans le répertoire du test. `$D` y est ce
// répertoire ; `$1` est le point d'entrée du geste, `$2` le nom du projet, le reste la commande.
const PROJECT = ["status", "manager"];
const ALL = ["status", "station"];

function trial(t: TestContext, body: string, settings: { intervalleMs?: number; delaiMs?: number; node?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-box-"));
  const fake = join(root, "node");
  writeFileSync(fake, `#!/bin/sh\nD='${root}'\n${body}\n`);
  chmodSync(fake, 0o755);
  const kitchen: Kitchen = { locale: { node: settings.node ?? fake, runtime: root, racine: root, env: {} } };

  const readings: Reading[] = [];
  let expected: (() => void) | undefined;
  const standby = openStandby({
    // Large : un test qui veut une seconde lecture règle le sien.
    intervalleMs: settings.intervalleMs ?? 3_600_000,
    delaiMs: settings.delaiMs ?? 60_000,
    cuisine: () => kitchen,
    surLecture(reading) {
      readings.push(reading);
      expected?.();
    },
  });
  t.after(() => {
    standby.fermer();
    rmSync(root, { recursive: true, force: true });
  });

  // La première lecture, parmi celles reçues ou à venir, qui répond à la question.
  async function until(real: (reading: Reading) => boolean): Promise<Reading> {
    let rank = 0;
    for (;;) {
      for (; rank < readings.length; rank++) {
        const reading = readings[rank] as Reading;
        if (real(reading)) return reading;
      }
      await new Promise<void>((resolve) => (expected = resolve));
    }
  }
  const readOne = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "");
  return { veille: standby, lectures: readings, jusqua: until, racine: root, lu: readOne, cuisine: kitchen };
}

// Répond à `status`, `manager` et `station` comme le runtime, à une ligne près.
const ANSWERS = `case "$*" in
  *" status") printf 'projet     brigade\\nattend     1 décision attend le chef depuis 2 j\\n' ;;
  *" manager") printf 'manager               ALLUMÉ depuis le 2026-10-13T09:25:21.838Z (par chef)\\n' ;;
  *" station") printf 'machine                 tient\\nquota                   disponible\\n' ;;
esac`;

const text = (reading: Reading) => ("erreur" in reading ? reading.erreur : reading.sorties.map((output) => output.texte).join(""));

const pids = (writtenOnes: string) => writtenOnes.split("\n").filter(Boolean).map(Number);

// Rend la main quand ces process sont morts — ceux qui ont eu le temps de dire leur pid.
async function dead(writtenOnes: string): Promise<void> {
  for (const pid of pids(writtenOnes)) {
    for (;;) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe("la veille des cuisines", { concurrency: 8 }, () => {
  test("regarder un projet lance `status` et `manager` par le geste de la station et le nom du projet — et rend ce qu'elles disent mot pour mot", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne } = trial(t, `echo "$2 $3" >>"$D/appels"\n${ANSWERS}`);
    const before = Date.now();

    standby.regarder([BRIGADE], PROJECT, 7);
    const reading = await until(() => true);

    // L'une après l'autre : un projet ne lance jamais qu'une commande à la fois.
    assert.deepEqual(readOne("appels").trim().split("\n"), ["brigade status", "brigade manager"]);
    assert.deepEqual(reading, {
      projet: "brigade",
      // La demande à laquelle elle répond : la vue n'affiche que celle de l'écran qu'elle montre.
      demande: 7,
      a: reading.a,
      sorties: [
        { commande: "status", texte: "projet     brigade\nattend     1 décision attend le chef depuis 2 j\n" },
        { commande: "manager", texte: "manager               ALLUMÉ depuis le 2026-10-13T09:25:21.838Z (par chef)\n" },
      ],
    });
    // L'heure de la lecture est le seul fait que l'app ajoute.
    assert.ok(Date.parse(reading.a) >= before && Date.parse(reading.a) <= Date.now(), reading.a);
  });

  test("la station est atteinte, une commande y échoue : l'erreur dit laquelle, son code et ce qu'elle a écrit — la sortie de l'autre n'est pas montrée", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne } = trial(t, `echo x >>"$D/appels"\ncase "$*" in *" status") echo "brigade : ce journal n'a pas encore l'état" >&2; exit 1 ;; esac\n${ANSWERS}`);

    standby.regarder([BRIGADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.ok("erreur" in reading && !("sorties" in reading));
    assert.deepEqual([reading.atteinte, reading.cas], [true, null]);
    assert.match(reading.erreur, /geste\.ts brigade status\nbrigade : ce journal n'a pas encore l'état\n\n→ exit code 1$/);
    assert.equal(readOne("appels"), "x\n", "la commande suivante n'est pas lancée");
  });

  test("un projet inconnu de la station (le geste sort en 65) : c'est dit à part, avec ce que le geste en a dit, mot pour mot", { skip: WITHOUT_POSIX }, async (t) => {
    const REFUSAL = "brigade : projet inconnu sur cette station — « brigade » n'est pas un projet de la station";
    const { veille: standby, jusqua: until } = trial(t, `echo "${REFUSAL}" >&2\nexit 65`);

    standby.regarder([BRIGADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.ok("erreur" in reading);
    assert.deepEqual([reading.atteinte, reading.cas], [true, "projet-inconnu"]);
    assert.ok(reading.erreur.endsWith(`geste.ts brigade status\n${REFUSAL}\n\n→ exit code 65`), reading.erreur);
  });

  test("seul le code 65 dit un projet inconnu : ni un autre refus du geste, ni une commande en échec", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, `case "$2" in brigade) exit 66 ;; parade) exit 1 ;; esac\nexit 255`);

    standby.regarder([BRIGADE, PARADE, { nom: "tiers", dossier: "/projets/tiers" }], PROJECT, 1);

    for (const name of ["brigade", "parade", "tiers"]) {
      const reading = await until(({ projet: project }) => project === name);
      assert.ok("erreur" in reading && reading.cas !== "projet-inconnu", name);
    }
  });

  test("un lecteur sans le droit du geste (il sort en 68) : c'est dit à part, avec ce que la station a écrit, mot pour mot", { skip: WITHOUT_POSIX }, async (t) => {
    const REFUSAL = "brigade : « lecteur » n'a pas le droit de lancer le geste sur cette station";
    const { veille: standby, jusqua: until } = trial(t, `echo "${REFUSAL}" >&2\nexit 68`);

    standby.regarder([BRIGADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.ok("erreur" in reading);
    assert.deepEqual([reading.atteinte, reading.cas], [true, "sans-droit"]);
    assert.ok(reading.erreur.endsWith(`geste.ts brigade status\n${REFUSAL}\n\n→ exit code 68`), reading.erreur);
  });

  // 69 est le code du geste ; 127 est celui d'un shell, et ne dit aucun cas.
  test("une commande manque (le geste sort en 69) : c'est dit à part, avec ce que la station a écrit ; 127 ne dit aucun cas", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, `case "$2" in brigade) echo 'sh: line 1: git: command not found' >&2; exit 127 ;; esac\necho 'brigade : git manque sur cette station' >&2\nexit 69`);

    standby.regarder([BRIGADE, PARADE], PROJECT, 1);

    const code127 = await until(({ projet: project }) => project === "brigade");
    assert.ok("erreur" in code127);
    assert.deepEqual([code127.atteinte, code127.cas], [true, null]);
    assert.match(code127.erreur, /\nsh: line 1: git: command not found\n\n→ exit code 127$/);
    const withoutGit = await until(({ projet: project }) => project === "parade");
    assert.ok("erreur" in withoutGit);
    assert.deepEqual([withoutGit.atteinte, withoutGit.cas], [true, "commande-manque"]);
    assert.match(withoutGit.erreur, /\nbrigade : git manque sur cette station\n\n→ exit code 69$/);
  });

  test("le `node` de la station ne convient pas au runtime (le geste sort en 70) : c'est dit à part, avec ce que le geste a écrit", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, "echo 'brigade : `node` est en 20.1, le runtime réclame 26' >&2\nexit 70");

    standby.regarder([BRIGADE], PROJECT, 1);

    const reading = await until(({ projet: project }) => project === "brigade");
    assert.ok("erreur" in reading);
    assert.deepEqual([reading.atteinte, reading.cas], [true, "node-inapte"]);
    assert.match(reading.erreur, /\nbrigade : `node` est en 20\.1, le runtime réclame 26\n\n→ exit code 70$/);
  });

  test("les autres refus du geste et une commande du runtime en échec ne sont mis dans aucun cas : 64, 66, 67, 1, 2", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, `exit "\${2#p}"`);
    const codes = [64, 66, 67, 1, 2];

    standby.regarder(codes.map((code) => ({ nom: `p${code}`, dossier: "/projets/p" })), PROJECT, 1);

    for (const code of codes) {
      const reading = await until(({ projet: project }) => project === `p${code}`);
      assert.ok("erreur" in reading);
      assert.deepEqual([reading.atteinte, reading.cas], [true, null], String(code));
    }
  });

  // Aucun shell ne relit la ligne : le nom arrive entier, et rien de lui n'est exécuté.
  test("un nom que le shell découperait part en un seul argument : le geste reçoit le nom du fichier", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne } = trial(t, `shift\nprintf '%s\\n' "$#" "$@" >"$D/recu"`);

    standby.regarder([{ nom: "l'app du chef; touch /tmp/x", dossier: "/projets/app" }], ["status"], 1);
    await until(() => true);

    assert.deepEqual(readOne("recu").trim().split("\n"), ["2", "l'app du chef; touch /tmp/x", "status"]);
  });

  test("une commande qui échoue en ayant écrit sur ses deux sorties : les deux sont rapportées", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, `echo 'à moitié dit'\necho 'puis cassé' >&2\nexit 3`);

    standby.regarder([BRIGADE], PROJECT, 1);

    assert.match(text(await until(() => true)), /\npuis cassé\nà moitié dit\n\n→ exit code 3$/);
  });

  test("le `node` de la station introuvable : l'erreur du lancement est dite telle quelle, et la station n'est pas tenue pour atteinte", async (t) => {
    const { veille: standby, jusqua: until } = trial(t, "", { node: "/nulle/part/node" });

    standby.regarder([BRIGADE], PROJECT, 1);

    const reading = await until(() => true);
    assert.match(text(reading), /^\$ \/nulle\/part\/node .*\n→ spawn \/nulle\/part\/node ENOENT$/s);
    assert.ok("erreur" in reading && !reading.atteinte);
    assert.equal(reading.cas, null, "rien n'a été lancé : rien n'a été dit");
  });

  test("ça se rafraîchit seul : les lectures se suivent sans qu'on les demande", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, `case "$*" in *" status") echo x >>"$D/tours"; echo "lecture n° $(wc -l <"$D/tours" | tr -d ' ')" ;; esac`, { intervalleMs: 5 });

    standby.regarder([BRIGADE], PROJECT, 1);

    await until((reading) => text(reading).includes("lecture n° 3"));
  });

  test("après une erreur, la lecture suivante qui réussit la remplace — et l'inverse", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, racine: root } = trial(t, `[ -f "$D/panne" ] && { echo 'en panne' >&2; exit 1; }\n${ANSWERS}`, { intervalleMs: 5 });
    writeFileSync(join(root, "panne"), "");

    standby.regarder([BRIGADE], PROJECT, 1);
    await until((reading) => "erreur" in reading);
    rmSync(join(root, "panne"));
    const back = await until((reading) => "sorties" in reading);
    writeFileSync(join(root, "panne"), "");
    const fallenBack = await until((reading) => "erreur" in reading && reading.a > back.a);

    assert.ok(!("erreur" in back));
    assert.ok(!("sorties" in fallenBack));
  });

  // Le signal du délai tue le geste — sans code, donc sans rien qui dise jusqu'où il était allé.
  test("une commande qui meurt du signal du délai : c'est le délai qui est dit, et la station est tenue pour atteinte", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne } = trial(t, `echo $$ >>"$D/pids"\nexec sleep 600`, { delaiMs: 200 });

    standby.regarder([BRIGADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.match(text(reading), /\n→ no answer within 0\.2 s: the command was stopped$/);
    assert.ok("erreur" in reading && reading.atteinte);
    assert.equal(reading.cas, null, "c'est le délai qui l'a arrêtée");
    await dead(readOne("pids"));
  });

  test("une commande arrêtée parce qu'elle en rendait trop avait joint la station : elle est tenue pour atteinte", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until } = trial(t, "exec yes");

    standby.regarder([BRIGADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.ok("erreur" in reading && reading.atteinte);
    assert.match(reading.erreur.slice(-200), /\n→ stdout maxBuffer length exceeded$/);
  });

  test("regarder un autre projet arrête la lecture du premier : plus rien n'arrive de lui", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, lectures: readings, jusqua: until, lu: readOne } = trial(t, `case "$2" in brigade) echo $$ >>"$D/pids"; exec sleep 600 ;; esac\n${ANSWERS}`);

    standby.regarder([BRIGADE], PROJECT, 1);
    // La commande du premier est partie, et ne rendra rien.
    while (pids(readOne("pids")).length < 1) await new Promise((resolve) => setTimeout(resolve, 10));
    standby.regarder([PARADE], PROJECT, 1);
    const reading = await until(() => true);

    assert.equal(reading.projet, "parade");
    await dead(readOne("pids"));
    assert.deepEqual(readings.map(({ projet: project }) => project), ["parade"]);
  });

  test("fermer arrête tout : la commande en cours meurt, et plus aucune lecture ne part", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, lectures: readings, jusqua: until, lu: readOne, racine: root } = trial(t, `echo x >>"$D/tours"\n[ -f "$D/retenir" ] && { echo $$ >>"$D/pids"; exec sleep 600; }\n${ANSWERS}`, { intervalleMs: 5 });

    standby.regarder([BRIGADE], PROJECT, 1);
    await until(() => true);
    writeFileSync(join(root, "retenir"), "");
    // Une commande d'un tour suivant est partie, et ne rendra rien.
    while (pids(readOne("pids")).length < 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const received = readings.length;
    standby.fermer();

    await dead(readOne("pids"));
    const turns = readOne("tours");
    // Leur mort ne relance rien, et ne dit rien : ni lecture, ni erreur.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(readings.length, received);
    assert.equal(readOne("tours"), turns);
  });

  test("un projet dont la cuisine n'est pas sur cet ordinateur n'est pas lu", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-box-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const readings: Reading[] = [];
    const { promise: readEntry, resolve } = Promise.withResolvers<void>();
    const kitchen: Kitchen = { locale: { node: "/nulle/part/node", runtime: root, racine: root, env: {} } };
    const standby = openStandby({
      intervalleMs: 3_600_000,
      delaiMs: 60_000,
      cuisine: (project: Project) => (project.nom === "local" ? undefined : kitchen),
      surLecture(reading) {
        readings.push(reading);
        resolve();
      },
    });
    t.after(() => standby.fermer());

    standby.regarder([{ nom: "local", dossier: "/projets/local" }, BRIGADE], PROJECT, 1);
    await readEntry;

    assert.deepEqual(readings.map(({ projet: project }) => project), ["brigade"]);
  });

  test("« Tous les projets » : tous les projets sont lus, avec les commandes demandées", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne } = trial(t, `echo "$2 $3" >>"$D/appels"\n${ANSWERS}`);

    standby.regarder([BRIGADE, PARADE], ALL, 1);
    const brigade = await until(({ projet: project }) => project === "brigade");
    const parade = await until(({ projet: project }) => project === "parade");

    assert.deepEqual(readOne("appels").trim().split("\n").sort(), ["brigade station", "brigade status", "parade station", "parade status"]);
    for (const reading of [brigade, parade]) {
      assert.ok("sorties" in reading);
      assert.deepEqual(reading.sorties.map(({ commande: command }) => command), ALL);
      assert.equal(reading.sorties[1]?.texte, "machine                 tient\nquota                   disponible\n");
    }
  });

  test("un projet muet ne retient pas les autres : ils sont lus, et relus, pendant qu'il ne répond pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, lectures: readings, jusqua: until, lu: readOne } = trial(t, `case "$2" in brigade) echo $$ >>"$D/pids"; exec sleep 600 ;; esac\necho x >>"$D/tours"\n${ANSWERS}`, { intervalleMs: 5 });

    standby.regarder([BRIGADE, PARADE], ALL, 1);
    while (pids(readOne("pids")).length < 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const first = await until(({ projet: project }) => project === "parade");
    await until(({ projet: project, a }) => project === "parade" && a > first.a);

    assert.ok(readings.every(({ projet: project }) => project === "parade"));
  });

  test("chaque projet a son état : l'un lu, l'autre lu avec une commande en échec, le troisième sans station lancée", { skip: WITHOUT_POSIX }, async (t) => {
    const THIRD = { nom: "tiers", dossier: "/projets/tiers" };
    const { veille: standby, jusqua: until } = trial(
      t,
      `case "$2" in
  parade) echo "brigade : « station » n'est pas une commande du runtime — celles de cette installation : status" >&2; exit 66 ;;
esac
${ANSWERS}`,
    );

    standby.regarder([BRIGADE, PARADE], ALL, 1);
    const brigade = await until(({ projet: project }) => project === "brigade");
    const parade = await until(({ projet: project }) => project === "parade");

    assert.ok("sorties" in brigade);
    assert.ok("erreur" in parade && parade.atteinte);
    assert.match(parade.erreur, /geste\.ts parade status\nbrigade : « station » n'est pas une commande du runtime — celles de cette installation : status\n\n→ exit code 66$/);

    const without = trial(t, "", { node: "/nulle/part/node" });
    without.veille.regarder([THIRD], ALL, 1);
    const third = await without.jusqua(({ projet: project }) => project === "tiers");
    assert.ok("erreur" in third && !third.atteinte);
    assert.match(third.erreur, /\n→ spawn \/nulle\/part\/node ENOENT$/);
  });
});

describe("plusieurs veilles, un passage par projet", () => {
  // Un faux `node` qui note quand il commence et quand il finit ; `status` ne finit que lâché.
  const SLOW = `echo "debut $2 $3" >>"$D/appels"
case "$*" in *" status") while [ ! -e "$D/lache" ]; do sleep 0.02; done ;; esac
echo "fin $2 $3" >>"$D/appels"
echo ok`;

  const standbyOf = (kitchen: Kitchen, onRead: (reading: Reading) => void, passage?: Map<string, Promise<unknown>>) =>
    openStandby({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => kitchen, surLecture: onRead, ...(passage === undefined ? {} : { passage }) });

  test("`status` et `faits` d'un même projet ne partent pas de front : la seconde veille attend que la première ait fini", { skip: WITHOUT_POSIX }, async (t) => {
    const { racine: root, lu: readOne, cuisine: kitchen } = trial(t, SLOW);
    const passage = new Map<string, Promise<unknown>>();
    const { promise: facts, resolve: onFacts } = Promise.withResolvers<Reading>();
    const { promise: elsewhere, resolve: onElsewhere } = Promise.withResolvers<Reading>();
    const heldOne = standbyOf(kitchen, () => {}, passage);
    const someFacts = standbyOf(kitchen, onFacts, passage);
    const other = standbyOf(kitchen, onElsewhere, passage);
    t.after(() => [heldOne, someFacts, other].forEach((openOne) => openOne.fermer()));

    heldOne.regarder([BRIGADE], ["status"], 1);
    someFacts.regarder([BRIGADE], ["faits"], 1);
    // Un autre projet, par le même passage, n'attend personne : sa lecture aboutit pendant
    // que `status` tient — et laisse à un `faits` parti de front le temps de s'écrire.
    other.regarder([PARADE], ["faits"], 1);
    await elsewhere;
    // Parti le premier, `status` peut n'avoir encore rien écrit quand l'autre projet a déjà
    // fini, sur un poste chargé : c'est sa ligne qu'on attend, pas une durée.
    while (!readOne("appels").includes("debut brigade status")) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(readOne("appels").trim().split("\n").filter((line) => line.includes(" brigade ")), ["debut brigade status"]);

    writeFileSync(join(root, "lache"), "");
    await facts;

    assert.deepEqual(readOne("appels").trim().split("\n").filter((line) => line.includes(" brigade ")), ["debut brigade status", "fin brigade status", "debut brigade faits", "fin brigade faits"]);
  });

  test("sans passage partagé, une veille ne retient pas l'autre", { skip: WITHOUT_POSIX }, async (t) => {
    const { racine: root, lu: readOne, cuisine: kitchen } = trial(t, SLOW);
    const { promise: facts, resolve: onFacts } = Promise.withResolvers<Reading>();
    const heldOne = standbyOf(kitchen, () => {});
    const someFacts = standbyOf(kitchen, onFacts);
    t.after(() => [heldOne, someFacts].forEach((openOne) => openOne.fermer()));

    heldOne.regarder([BRIGADE], ["status"], 1);
    someFacts.regarder([BRIGADE], ["faits"], 1);
    await facts;
    const calls = readOne("appels");
    // `status` est lâché avant que le répertoire du test parte : son process ne lui survit pas.
    writeFileSync(join(root, "lache"), "");

    assert.ok(!calls.includes("fin brigade status"));
  });
});
