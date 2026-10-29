// La veille des cuisines, contre un faux `node` écrit par chaque test : ce qu'elle
// lance, ce qu'elle rend mot pour mot, ce qu'elle dit quand une commande échoue —
// et si c'est la station qu'elle n'a pas atteinte, ou la commande qui n'a pas répondu.
// Ni réseau ni station ; aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirVeille, type Cuisine, type Lecture } from "../src/box.ts";
import type { Projet } from "../src/config.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const BRIGADE = { nom: "brigade", dossier: "/projets/brigade" };
const PARADE = { nom: "parade", dossier: "/projets/parade" };

// Un faux `node` : un script sh, dans le répertoire du test. `$D` y est ce
// répertoire ; `$1` est le point d'entrée du geste, `$2` le nom du projet, le reste la commande.
const PROJET = ["status", "grant"];
const TOUS = ["status", "station"];

function essai(t: TestContext, corps: string, reglages: { intervalleMs?: number; delaiMs?: number; node?: string } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-box-"));
  const faux = join(racine, "node");
  writeFileSync(faux, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(faux, 0o755);
  const cuisine: Cuisine = { locale: { node: reglages.node ?? faux, runtime: racine, racine, env: {} } };

  const lectures: Lecture[] = [];
  let attendue: (() => void) | undefined;
  const veille = ouvrirVeille({
    // Large : un test qui veut une seconde lecture règle le sien.
    intervalleMs: reglages.intervalleMs ?? 3_600_000,
    delaiMs: reglages.delaiMs ?? 60_000,
    cuisine: () => cuisine,
    surLecture(lecture) {
      lectures.push(lecture);
      attendue?.();
    },
  });
  t.after(() => {
    veille.fermer();
    rmSync(racine, { recursive: true, force: true });
  });

  // La première lecture, parmi celles reçues ou à venir, qui répond à la question.
  async function jusqua(vraie: (lecture: Lecture) => boolean): Promise<Lecture> {
    let rang = 0;
    for (;;) {
      for (; rang < lectures.length; rang++) {
        const lecture = lectures[rang] as Lecture;
        if (vraie(lecture)) return lecture;
      }
      await new Promise<void>((resoudre) => (attendue = resoudre));
    }
  }
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  return { veille, lectures, jusqua, racine, lu, cuisine };
}

// Répond à `status`, `grant` et `station` comme le runtime, à une ligne près.
const REPOND = `case "$*" in
  *" status") printf 'projet     brigade\\nattend     1 décision attend le chef depuis 2 j\\n' ;;
  *" grant") printf 'grant merge           ABSENT — jamais donné\\n' ;;
  *" station") printf 'machine                 tient\\nquota                   disponible\\n' ;;
esac`;

const texte = (lecture: Lecture) => ("erreur" in lecture ? lecture.erreur : lecture.sorties.map((sortie) => sortie.texte).join(""));

const pids = (ecrits: string) => ecrits.split("\n").filter(Boolean).map(Number);

// Rend la main quand ces process sont morts — ceux qui ont eu le temps de dire leur pid.
async function morts(ecrits: string): Promise<void> {
  for (const pid of pids(ecrits)) {
    for (;;) {
      try {
        process.kill(pid, 0);
      } catch {
        break;
      }
      await new Promise((resoudre) => setTimeout(resoudre, 10));
    }
  }
}

describe("la veille des cuisines", { concurrency: 8 }, () => {
  test("regarder un projet lance `status` et `grant` par le geste de la station et le nom du projet — et rend ce qu'elles disent mot pour mot", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo "$2 $3" >>"$D/appels"\n${REPOND}`);
    const avant = Date.now();

    veille.regarder([BRIGADE], PROJET, 7);
    const lecture = await jusqua(() => true);

    // L'une après l'autre : un projet ne lance jamais qu'une commande à la fois.
    assert.deepEqual(lu("appels").trim().split("\n"), ["brigade status", "brigade grant"]);
    assert.deepEqual(lecture, {
      projet: "brigade",
      // La demande à laquelle elle répond : la vue n'affiche que celle de l'écran qu'elle montre.
      demande: 7,
      a: lecture.a,
      sorties: [
        { commande: "status", texte: "projet     brigade\nattend     1 décision attend le chef depuis 2 j\n" },
        { commande: "grant", texte: "grant merge           ABSENT — jamais donné\n" },
      ],
    });
    // L'heure de la lecture est le seul fait que l'app ajoute.
    assert.ok(Date.parse(lecture.a) >= avant && Date.parse(lecture.a) <= Date.now(), lecture.a);
  });

  test("la station est atteinte, une commande y échoue : l'erreur dit laquelle, son code et ce qu'elle a écrit — la sortie de l'autre n'est pas montrée", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo x >>"$D/appels"\ncase "$*" in *" status") echo "brigade : ce journal n'a pas encore l'état" >&2; exit 1 ;; esac\n${REPOND}`);

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture && !("sorties" in lecture));
    assert.deepEqual([lecture.atteinte, lecture.cas], [true, null]);
    assert.match(lecture.erreur, /geste\.ts brigade status\nbrigade : ce journal n'a pas encore l'état\n\n→ exit code 1$/);
    assert.equal(lu("appels"), "x\n", "la commande suivante n'est pas lancée");
  });

  test("un projet inconnu de la station (le geste sort en 65) : c'est dit à part, avec ce que le geste en a dit, mot pour mot", { skip: SANS_POSIX }, async (t) => {
    const REFUS = "brigade : projet inconnu sur cette station — « brigade » n'est pas un projet de la station";
    const { veille, jusqua } = essai(t, `echo "${REFUS}" >&2\nexit 65`);

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture);
    assert.deepEqual([lecture.atteinte, lecture.cas], [true, "projet-inconnu"]);
    assert.ok(lecture.erreur.endsWith(`geste.ts brigade status\n${REFUS}\n\n→ exit code 65`), lecture.erreur);
  });

  test("seul le code 65 dit un projet inconnu : ni un autre refus du geste, ni une commande en échec", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, `case "$2" in brigade) exit 66 ;; parade) exit 1 ;; esac\nexit 255`);

    veille.regarder([BRIGADE, PARADE, { nom: "tiers", dossier: "/projets/tiers" }], PROJET, 1);

    for (const nom of ["brigade", "parade", "tiers"]) {
      const lecture = await jusqua(({ projet }) => projet === nom);
      assert.ok("erreur" in lecture && lecture.cas !== "projet-inconnu", nom);
    }
  });

  test("un lecteur sans le droit du geste (il sort en 68) : c'est dit à part, avec ce que la station a écrit, mot pour mot", { skip: SANS_POSIX }, async (t) => {
    const REFUS = "brigade : « lecteur » n'a pas le droit de lancer le geste sur cette station";
    const { veille, jusqua } = essai(t, `echo "${REFUS}" >&2\nexit 68`);

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture);
    assert.deepEqual([lecture.atteinte, lecture.cas], [true, "sans-droit"]);
    assert.ok(lecture.erreur.endsWith(`geste.ts brigade status\n${REFUS}\n\n→ exit code 68`), lecture.erreur);
  });

  // 69 est le code du geste ; 127 est celui d'un shell, et ne dit aucun cas.
  test("une commande manque (le geste sort en 69) : c'est dit à part, avec ce que la station a écrit ; 127 ne dit aucun cas", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, `case "$2" in brigade) echo 'sh: line 1: git: command not found' >&2; exit 127 ;; esac\necho 'brigade : git manque sur cette station' >&2\nexit 69`);

    veille.regarder([BRIGADE, PARADE], PROJET, 1);

    const code127 = await jusqua(({ projet }) => projet === "brigade");
    assert.ok("erreur" in code127);
    assert.deepEqual([code127.atteinte, code127.cas], [true, null]);
    assert.match(code127.erreur, /\nsh: line 1: git: command not found\n\n→ exit code 127$/);
    const sansGit = await jusqua(({ projet }) => projet === "parade");
    assert.ok("erreur" in sansGit);
    assert.deepEqual([sansGit.atteinte, sansGit.cas], [true, "commande-manque"]);
    assert.match(sansGit.erreur, /\nbrigade : git manque sur cette station\n\n→ exit code 69$/);
  });

  test("le `node` de la station ne convient pas au runtime (le geste sort en 70) : c'est dit à part, avec ce que le geste a écrit", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, "echo 'brigade : `node` est en 20.1, le runtime réclame 26' >&2\nexit 70");

    veille.regarder([BRIGADE], PROJET, 1);

    const lecture = await jusqua(({ projet }) => projet === "brigade");
    assert.ok("erreur" in lecture);
    assert.deepEqual([lecture.atteinte, lecture.cas], [true, "node-inapte"]);
    assert.match(lecture.erreur, /\nbrigade : `node` est en 20\.1, le runtime réclame 26\n\n→ exit code 70$/);
  });

  test("les autres refus du geste et une commande du runtime en échec ne sont mis dans aucun cas : 64, 66, 67, 1, 2", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, `exit "\${2#p}"`);
    const codes = [64, 66, 67, 1, 2];

    veille.regarder(codes.map((code) => ({ nom: `p${code}`, dossier: "/projets/p" })), PROJET, 1);

    for (const code of codes) {
      const lecture = await jusqua(({ projet }) => projet === `p${code}`);
      assert.ok("erreur" in lecture);
      assert.deepEqual([lecture.atteinte, lecture.cas], [true, null], String(code));
    }
  });

  // Aucun shell ne relit la ligne : le nom arrive entier, et rien de lui n'est exécuté.
  test("un nom que le shell découperait part en un seul argument : le geste reçoit le nom du fichier", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu } = essai(t, `shift\nprintf '%s\\n' "$#" "$@" >"$D/recu"`);

    veille.regarder([{ nom: "l'app du chef; touch /tmp/x", dossier: "/projets/app" }], ["status"], 1);
    await jusqua(() => true);

    assert.deepEqual(lu("recu").trim().split("\n"), ["2", "l'app du chef; touch /tmp/x", "status"]);
  });

  test("une commande qui échoue en ayant écrit sur ses deux sorties : les deux sont rapportées", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, `echo 'à moitié dit'\necho 'puis cassé' >&2\nexit 3`);

    veille.regarder([BRIGADE], PROJET, 1);

    assert.match(texte(await jusqua(() => true)), /\npuis cassé\nà moitié dit\n\n→ exit code 3$/);
  });

  test("le `node` de la station introuvable : l'erreur du lancement est dite telle quelle, et la station n'est pas tenue pour atteinte", async (t) => {
    const { veille, jusqua } = essai(t, "", { node: "/nulle/part/node" });

    veille.regarder([BRIGADE], PROJET, 1);

    const lecture = await jusqua(() => true);
    assert.match(texte(lecture), /^\$ \/nulle\/part\/node .*\n→ spawn \/nulle\/part\/node ENOENT$/s);
    assert.ok("erreur" in lecture && !lecture.atteinte);
    assert.equal(lecture.cas, null, "rien n'a été lancé : rien n'a été dit");
  });

  test("ça se rafraîchit seul : les lectures se suivent sans qu'on les demande", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, `case "$*" in *" status") echo x >>"$D/tours"; echo "lecture n° $(wc -l <"$D/tours" | tr -d ' ')" ;; esac`, { intervalleMs: 5 });

    veille.regarder([BRIGADE], PROJET, 1);

    await jusqua((lecture) => texte(lecture).includes("lecture n° 3"));
  });

  test("après une erreur, la lecture suivante qui réussit la remplace — et l'inverse", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, racine } = essai(t, `[ -f "$D/panne" ] && { echo 'en panne' >&2; exit 1; }\n${REPOND}`, { intervalleMs: 5 });
    writeFileSync(join(racine, "panne"), "");

    veille.regarder([BRIGADE], PROJET, 1);
    await jusqua((lecture) => "erreur" in lecture);
    rmSync(join(racine, "panne"));
    const revenue = await jusqua((lecture) => "sorties" in lecture);
    writeFileSync(join(racine, "panne"), "");
    const retombee = await jusqua((lecture) => "erreur" in lecture && lecture.a > revenue.a);

    assert.ok(!("erreur" in revenue));
    assert.ok(!("sorties" in retombee));
  });

  // Le signal du délai tue le geste — sans code, donc sans rien qui dise jusqu'où il était allé.
  test("une commande qui meurt du signal du délai : c'est le délai qui est dit, et la station est tenue pour atteinte", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo $$ >>"$D/pids"\nexec sleep 600`, { delaiMs: 200 });

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.match(texte(lecture), /\n→ no answer within 0\.2 s: the command was stopped$/);
    assert.ok("erreur" in lecture && lecture.atteinte);
    assert.equal(lecture.cas, null, "c'est le délai qui l'a arrêtée");
    await morts(lu("pids"));
  });

  test("une commande arrêtée parce qu'elle en rendait trop avait joint la station : elle est tenue pour atteinte", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua } = essai(t, "exec yes");

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture && lecture.atteinte);
    assert.match(lecture.erreur.slice(-200), /\n→ stdout maxBuffer length exceeded$/);
  });

  test("regarder un autre projet arrête la lecture du premier : plus rien n'arrive de lui", { skip: SANS_POSIX }, async (t) => {
    const { veille, lectures, jusqua, lu } = essai(t, `case "$2" in brigade) echo $$ >>"$D/pids"; exec sleep 600 ;; esac\n${REPOND}`);

    veille.regarder([BRIGADE], PROJET, 1);
    // La commande du premier est partie, et ne rendra rien.
    while (pids(lu("pids")).length < 1) await new Promise((resoudre) => setTimeout(resoudre, 10));
    veille.regarder([PARADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.equal(lecture.projet, "parade");
    await morts(lu("pids"));
    assert.deepEqual(lectures.map(({ projet }) => projet), ["parade"]);
  });

  test("fermer arrête tout : la commande en cours meurt, et plus aucune lecture ne part", { skip: SANS_POSIX }, async (t) => {
    const { veille, lectures, jusqua, lu, racine } = essai(t, `echo x >>"$D/tours"\n[ -f "$D/retenir" ] && { echo $$ >>"$D/pids"; exec sleep 600; }\n${REPOND}`, { intervalleMs: 5 });

    veille.regarder([BRIGADE], PROJET, 1);
    await jusqua(() => true);
    writeFileSync(join(racine, "retenir"), "");
    // Une commande d'un tour suivant est partie, et ne rendra rien.
    while (pids(lu("pids")).length < 1) await new Promise((resoudre) => setTimeout(resoudre, 10));
    const recues = lectures.length;
    veille.fermer();

    await morts(lu("pids"));
    const tours = lu("tours");
    // Leur mort ne relance rien, et ne dit rien : ni lecture, ni erreur.
    await new Promise((resoudre) => setImmediate(resoudre));
    assert.equal(lectures.length, recues);
    assert.equal(lu("tours"), tours);
  });

  test("un projet dont la cuisine n'est pas sur cet ordinateur n'est pas lu", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-box-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const lectures: Lecture[] = [];
    const { promise: lue, resolve } = Promise.withResolvers<void>();
    const cuisine: Cuisine = { locale: { node: "/nulle/part/node", runtime: racine, racine, env: {} } };
    const veille = ouvrirVeille({
      intervalleMs: 3_600_000,
      delaiMs: 60_000,
      cuisine: (projet: Projet) => (projet.nom === "local" ? undefined : cuisine),
      surLecture(lecture) {
        lectures.push(lecture);
        resolve();
      },
    });
    t.after(() => veille.fermer());

    veille.regarder([{ nom: "local", dossier: "/projets/local" }, BRIGADE], PROJET, 1);
    await lue;

    assert.deepEqual(lectures.map(({ projet }) => projet), ["brigade"]);
  });

  test("« Tous les projets » : tous les projets sont lus, avec les commandes demandées", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo "$2 $3" >>"$D/appels"\n${REPOND}`);

    veille.regarder([BRIGADE, PARADE], TOUS, 1);
    const brigade = await jusqua(({ projet }) => projet === "brigade");
    const parade = await jusqua(({ projet }) => projet === "parade");

    assert.deepEqual(lu("appels").trim().split("\n").sort(), ["brigade station", "brigade status", "parade station", "parade status"]);
    for (const lecture of [brigade, parade]) {
      assert.ok("sorties" in lecture);
      assert.deepEqual(lecture.sorties.map(({ commande }) => commande), TOUS);
      assert.equal(lecture.sorties[1]?.texte, "machine                 tient\nquota                   disponible\n");
    }
  });

  test("un projet muet ne retient pas les autres : ils sont lus, et relus, pendant qu'il ne répond pas", { skip: SANS_POSIX }, async (t) => {
    const { veille, lectures, jusqua, lu } = essai(t, `case "$2" in brigade) echo $$ >>"$D/pids"; exec sleep 600 ;; esac\necho x >>"$D/tours"\n${REPOND}`, { intervalleMs: 5 });

    veille.regarder([BRIGADE, PARADE], TOUS, 1);
    while (pids(lu("pids")).length < 1) await new Promise((resoudre) => setTimeout(resoudre, 10));
    const premiere = await jusqua(({ projet }) => projet === "parade");
    await jusqua(({ projet, a }) => projet === "parade" && a > premiere.a);

    assert.ok(lectures.every(({ projet }) => projet === "parade"));
  });

  test("chaque projet a son état : l'un lu, l'autre lu avec une commande en échec, le troisième sans station lancée", { skip: SANS_POSIX }, async (t) => {
    const TIERS = { nom: "tiers", dossier: "/projets/tiers" };
    const { veille, jusqua } = essai(
      t,
      `case "$2" in
  parade) echo "brigade : « station » n'est pas une commande du runtime — celles de cette installation : status" >&2; exit 66 ;;
esac
${REPOND}`,
    );

    veille.regarder([BRIGADE, PARADE], TOUS, 1);
    const brigade = await jusqua(({ projet }) => projet === "brigade");
    const parade = await jusqua(({ projet }) => projet === "parade");

    assert.ok("sorties" in brigade);
    assert.ok("erreur" in parade && parade.atteinte);
    assert.match(parade.erreur, /geste\.ts parade status\nbrigade : « station » n'est pas une commande du runtime — celles de cette installation : status\n\n→ exit code 66$/);

    const sans = essai(t, "", { node: "/nulle/part/node" });
    sans.veille.regarder([TIERS], TOUS, 1);
    const tiers = await sans.jusqua(({ projet }) => projet === "tiers");
    assert.ok("erreur" in tiers && !tiers.atteinte);
    assert.match(tiers.erreur, /\n→ spawn \/nulle\/part\/node ENOENT$/);
  });
});

describe("plusieurs veilles, un passage par projet", () => {
  // Un faux `node` qui note quand il commence et quand il finit ; `status` ne finit que lâché.
  const LENT = `echo "debut $2 $3" >>"$D/appels"
case "$*" in *" status") while [ ! -e "$D/lache" ]; do sleep 0.02; done ;; esac
echo "fin $2 $3" >>"$D/appels"
echo ok`;

  const veilleDe = (cuisine: Cuisine, surLecture: (lecture: Lecture) => void, passage?: Map<string, Promise<unknown>>) =>
    ouvrirVeille({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => cuisine, surLecture, ...(passage === undefined ? {} : { passage }) });

  test("`status` et `faits` d'un même projet ne partent pas de front : la seconde veille attend que la première ait fini", { skip: SANS_POSIX }, async (t) => {
    const { racine, lu, cuisine } = essai(t, LENT);
    const passage = new Map<string, Promise<unknown>>();
    const { promise: faits, resolve: surFaits } = Promise.withResolvers<Lecture>();
    const { promise: ailleurs, resolve: surAilleurs } = Promise.withResolvers<Lecture>();
    const tenue = veilleDe(cuisine, () => {}, passage);
    const desFaits = veilleDe(cuisine, surFaits, passage);
    const autre = veilleDe(cuisine, surAilleurs, passage);
    t.after(() => [tenue, desFaits, autre].forEach((ouverte) => ouverte.fermer()));

    tenue.regarder([BRIGADE], ["status"], 1);
    desFaits.regarder([BRIGADE], ["faits"], 1);
    // Un autre projet, par le même passage, n'attend personne : sa lecture aboutit pendant
    // que `status` tient — et laisse à un `faits` parti de front le temps de s'écrire.
    autre.regarder([PARADE], ["faits"], 1);
    await ailleurs;
    // Parti le premier, `status` peut n'avoir encore rien écrit quand l'autre projet a déjà
    // fini, sur un poste chargé : c'est sa ligne qu'on attend, pas une durée.
    while (!lu("appels").includes("debut brigade status")) await new Promise((resoudre) => setTimeout(resoudre, 10));
    assert.deepEqual(lu("appels").trim().split("\n").filter((ligne) => ligne.includes(" brigade ")), ["debut brigade status"]);

    writeFileSync(join(racine, "lache"), "");
    await faits;

    assert.deepEqual(lu("appels").trim().split("\n").filter((ligne) => ligne.includes(" brigade ")), ["debut brigade status", "fin brigade status", "debut brigade faits", "fin brigade faits"]);
  });

  test("sans passage partagé, une veille ne retient pas l'autre", { skip: SANS_POSIX }, async (t) => {
    const { racine, lu, cuisine } = essai(t, LENT);
    const { promise: faits, resolve: surFaits } = Promise.withResolvers<Lecture>();
    const tenue = veilleDe(cuisine, () => {});
    const desFaits = veilleDe(cuisine, surFaits);
    t.after(() => [tenue, desFaits].forEach((ouverte) => ouverte.fermer()));

    tenue.regarder([BRIGADE], ["status"], 1);
    desFaits.regarder([BRIGADE], ["faits"], 1);
    await faits;
    const appels = lu("appels");
    // `status` est lâché avant que le répertoire du test parte : son process ne lui survit pas.
    writeFileSync(join(racine, "lache"), "");

    assert.ok(!appels.includes("fin brigade status"));
  });
});
