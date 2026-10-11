// La veille de la box, contre un faux `ssh` écrit par chaque test : ce qu'elle
// lance, ce qu'elle rend mot pour mot, ce qu'elle dit quand elle n'atteint rien —
// et si c'est la box qu'elle n'a pas atteinte, ou la commande qui n'a pas répondu.
// Ni réseau ni box ; aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirVeille, type Lecture } from "../src/box.ts";

const COMMANDE = "sudo -u brigade BRIGADE_STATE_DIR=/var/lib/brigade/brigade npm --silent --prefix /opt/brigade/runtime";
const BRIGADE = { nom: "brigade", dossier: "/projets/brigade", box: { hote: "box", commande: COMMANDE } };
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "autre-box", commande: "npm --prefix /opt/parade/runtime" } };

// Un faux `ssh` : un script sh, dans le répertoire du test. `$D` y est ce
// répertoire, `$*` ses arguments — l'hôte, puis la commande distante.
const PROJET = ["status", "grant"];
const KITCHEN = ["status", "station"];
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

function essai(t: TestContext, corps: string, reglages: { intervalleMs?: number; delaiMs?: number; ssh?: string } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-box-"));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(ssh, 0o755);

  const lectures: Lecture[] = [];
  let attendue: (() => void) | undefined;
  const veille = ouvrirVeille({
    ssh: reglages.ssh ?? ssh,
    // Large : un test qui veut une seconde lecture règle le sien.
    intervalleMs: reglages.intervalleMs ?? 3_600_000,
    delaiMs: reglages.delaiMs ?? 60_000,
    connexionS: 10,
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
  return { veille, lectures, jusqua, racine, lu };
}

// Répond à `status` et à `grant` comme le runtime, à une ligne près.
const REPOND = `case "$*" in
  *"run status") printf 'projet     brigade\\nattend     1 décision attend le chef depuis 2 j\\n' ;;
  *"run grant") printf 'grant merge           ABSENT — jamais donné\\n' ;;
  *"run station") printf 'machine                 tient\\nquota                   disponible\\n' ;;
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

describe("la veille de la box", { concurrency: 8 }, () => {
  test("regarder un projet lance `status` et `grant` sur sa box, par ssh, avec la commande du chef — et rend ce qu'elles disent mot pour mot", async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo "$*" >>"$D/appels"\n${REPOND}`);
    const avant = Date.now();

    veille.regarder([BRIGADE], PROJET, 7);
    const lecture = await jusqua(() => true);

    // L'une après l'autre : un projet n'ouvre jamais qu'une connexion à la fois.
    assert.deepEqual(lu("appels").trim().split("\n"), [`${OPTIONS} -- box ${COMMANDE} run status`, `${OPTIONS} -- box ${COMMANDE} run grant`]);
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

  test("la box n'est pas atteinte (ssh sort en 255) : c'est une erreur, avec ce que ssh a écrit et son code — et rien d'autre", async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo x >>"$D/appels"\necho 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255`);

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture);
    assert.equal(lecture.atteinte, false);
    assert.match(lecture.erreur, /^\$ \S+ -o BatchMode=yes -o ConnectTimeout=10 -- box .* run status\n/);
    assert.match(lecture.erreur, /\nssh: connect to host box port 22: Connection refused\n/);
    assert.match(lecture.erreur, /\n→ code de sortie 255$/);
    assert.ok(!("sorties" in lecture), "une erreur prend la place de l'état");
    assert.equal(lu("appels"), "x\n", "la commande suivante n'est pas lancée");
  });

  test("la box est atteinte, une commande y échoue : l'erreur dit laquelle, son code et ce qu'elle a écrit — la sortie de l'autre n'est pas montrée", async (t) => {
    const { veille, jusqua } = essai(t, `case "$*" in *"run grant") echo "brigade : ce journal n'a pas encore l'état des grants" >&2; exit 1 ;; esac\n${REPOND}`);

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture && !("sorties" in lecture));
    assert.equal(lecture.atteinte, true);
    assert.match(lecture.erreur, /run grant\nbrigade : ce journal n'a pas encore l'état des grants\n\n→ code de sortie 1$/);
  });

  test("une commande qui échoue en ayant écrit sur ses deux sorties : les deux sont rapportées", async (t) => {
    const { veille, jusqua } = essai(t, `echo 'à moitié dit'\necho 'puis cassé' >&2\nexit 3`);

    veille.regarder([BRIGADE], PROJET, 1);

    assert.match(texte(await jusqua(() => true)), /\npuis cassé\nà moitié dit\n\n→ code de sortie 3$/);
  });

  test("ssh introuvable : l'erreur du lancement est dite telle quelle", async (t) => {
    const { veille, jusqua } = essai(t, "", { ssh: "/nulle/part/ssh" });

    veille.regarder([BRIGADE], PROJET, 1);

    const lecture = await jusqua(() => true);
    assert.match(texte(lecture), /^\$ \/nulle\/part\/ssh .*\n→ spawn \/nulle\/part\/ssh ENOENT$/s);
    assert.ok("erreur" in lecture && !lecture.atteinte);
  });

  test("ça se rafraîchit seul : les lectures se suivent sans qu'on les demande", async (t) => {
    const { veille, jusqua } = essai(t, `case "$*" in *"run status") echo x >>"$D/tours"; echo "lecture n° $(wc -l <"$D/tours" | tr -d ' ')" ;; esac`, { intervalleMs: 5 });

    veille.regarder([BRIGADE], PROJET, 1);

    await jusqua((lecture) => texte(lecture).includes("lecture n° 3"));
  });

  test("après une erreur, la lecture suivante qui réussit la remplace — et l'inverse", async (t) => {
    const { veille, jusqua, racine } = essai(t, `[ -f "$D/panne" ] && { echo 'ssh: Connection timed out' >&2; exit 255; }\n${REPOND}`, { intervalleMs: 5 });
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

  // Éprouvé contre un vrai OpenSSH, devant un agent qui ne répond pas (une
  // confirmation attendue) : `ConnectTimeout` est passé, `ssh` pend, et le signal
  // du délai le tue — sans code, donc sans rien qui dise jusqu'où il était allé.
  test("un ssh qui meurt du signal du délai n'a pas dit s'il avait joint la box : c'est dit, et la box n'est pas tenue pour atteinte", async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo $$ >>"$D/pids"\nexec sleep 600`, { delaiMs: 200 });

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.match(texte(lecture), /\n→ aucune réponse en 0,2 s : ssh arrêté, sans avoir dit s'il avait joint la box$/);
    assert.ok("erreur" in lecture && !lecture.atteinte);
    await morts(lu("pids"));
  });

  // Éprouvé contre un vrai OpenSSH : connecté, il attrape le signal du délai et
  // sort de lui-même en 255 — le code d'une box qu'il n'aurait pas atteinte.
  test("un ssh connecté dont la commande ne rend rien sort en 255 quand le délai l'arrête : c'est le délai qui est dit, et la box est tenue pour atteinte", async (t) => {
    const { veille, jusqua } = essai(t, `trap 'kill $!; exit 255' TERM\nsleep 600 &\nwait`, { delaiMs: 200, intervalleMs: 5 });

    veille.regarder([BRIGADE], PROJET, 1);
    // Un faux ssh que le délai arrête avant qu'il ait posé son `trap` meurt du signal : le tour suivant le relance.
    const lecture = await jusqua((lecture) => "erreur" in lecture && lecture.atteinte);

    assert.match(texte(lecture), /\n→ aucune réponse en 0,2 s : ssh arrêté$/);
  });

  test("un ssh arrêté parce qu'il en rendait trop avait joint la box : la box est tenue pour atteinte", async (t) => {
    const { veille, jusqua } = essai(t, "exec yes");

    veille.regarder([BRIGADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture && lecture.atteinte);
    assert.match(lecture.erreur.slice(-200), /\n→ stdout maxBuffer length exceeded$/);
  });

  test("regarder un autre projet arrête la lecture du premier : plus rien n'arrive de lui", async (t) => {
    const { veille, lectures, jusqua, lu } = essai(t, `case "$5 $6" in "-- box") echo $$ >>"$D/pids"; exec sleep 600 ;; esac\n${REPOND}`);

    veille.regarder([BRIGADE], PROJET, 1);
    // Le ssh du premier est parti, et ne rendra rien.
    while (pids(lu("pids")).length < 1) await new Promise((resoudre) => setTimeout(resoudre, 10));
    veille.regarder([PARADE], PROJET, 1);
    const lecture = await jusqua(() => true);

    assert.equal(lecture.projet, "parade");
    await morts(lu("pids"));
    assert.deepEqual(lectures.map(({ projet }) => projet), ["parade"]);
  });

  test("fermer arrête tout : le ssh en cours meurt, et plus aucune lecture ne part", async (t) => {
    const { veille, lectures, jusqua, lu, racine } = essai(t, `echo x >>"$D/tours"\n[ -f "$D/retenir" ] && { echo $$ >>"$D/pids"; exec sleep 600; }\n${REPOND}`, { intervalleMs: 5 });

    veille.regarder([BRIGADE], PROJET, 1);
    await jusqua(() => true);
    writeFileSync(join(racine, "retenir"), "");
    // Un ssh d'un tour suivant est parti, et ne rendra rien.
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

  test("un projet qui ne dit pas où est sa box n'est pas lu", async (t) => {
    const { veille, lectures, jusqua } = essai(t, `echo x >>"$D/appels"\n${REPOND}`);

    veille.regarder([{ nom: "local", dossier: "/projets/local" }, BRIGADE], PROJET, 1);
    await jusqua(() => true);

    assert.deepEqual(lectures.map(({ projet }) => projet), ["brigade"]);
  });

  test("la kitchen : tous les projets sont lus, chacun sur sa box, avec les commandes demandées", async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo "$*" >>"$D/appels"\n${REPOND}`);

    veille.regarder([BRIGADE, PARADE], KITCHEN, 1);
    const brigade = await jusqua(({ projet }) => projet === "brigade");
    const parade = await jusqua(({ projet }) => projet === "parade");

    assert.deepEqual(lu("appels").trim().split("\n").sort(), [
      `${OPTIONS} -- autre-box npm --prefix /opt/parade/runtime run station`,
      `${OPTIONS} -- autre-box npm --prefix /opt/parade/runtime run status`,
      `${OPTIONS} -- box ${COMMANDE} run station`,
      `${OPTIONS} -- box ${COMMANDE} run status`,
    ]);
    for (const lecture of [brigade, parade]) {
      assert.ok("sorties" in lecture);
      assert.deepEqual(lecture.sorties.map(({ commande }) => commande), KITCHEN);
      assert.equal(lecture.sorties[1]?.texte, "machine                 tient\nquota                   disponible\n");
    }
  });

  test("un projet muet ne retient pas les autres : ils sont lus, et relus, pendant qu'il ne répond pas", async (t) => {
    const { veille, lectures, jusqua, lu } = essai(t, `case "$5 $6" in "-- box") echo $$ >>"$D/pids"; exec sleep 600 ;; esac\necho x >>"$D/tours"\n${REPOND}`, { intervalleMs: 5 });

    veille.regarder([BRIGADE, PARADE], KITCHEN, 1);
    while (pids(lu("pids")).length < 1) await new Promise((resoudre) => setTimeout(resoudre, 10));
    const premiere = await jusqua(({ projet }) => projet === "parade");
    await jusqua(({ projet, a }) => projet === "parade" && a > premiere.a);

    assert.ok(lectures.every(({ projet }) => projet === "parade"));
  });

  test("chaque projet a son état : l'un lu, l'autre joint sans répondre, le troisième pas joint", async (t) => {
    const TIERS = { nom: "tiers", dossier: "/projets/tiers", box: { hote: "box-eteinte", commande: "npm --prefix /opt/tiers/runtime" } };
    const { veille, jusqua } = essai(
      t,
      `case "$6" in
  autre-box) echo 'npm error Missing script: "station"' >&2; exit 1 ;;
  box-eteinte) echo 'ssh: connect to host box-eteinte port 22: Operation timed out' >&2; exit 255 ;;
esac
${REPOND}`,
    );

    veille.regarder([BRIGADE, PARADE, TIERS], KITCHEN, 1);
    const brigade = await jusqua(({ projet }) => projet === "brigade");
    const parade = await jusqua(({ projet }) => projet === "parade");
    const tiers = await jusqua(({ projet }) => projet === "tiers");

    assert.ok("sorties" in brigade);
    assert.ok("erreur" in parade && parade.atteinte);
    assert.match(parade.erreur, /run status\nnpm error Missing script: "station"\n\n→ code de sortie 1$/);
    assert.ok("erreur" in tiers && !tiers.atteinte);
    assert.match(tiers.erreur, /\nssh: connect to host box-eteinte port 22: Operation timed out\n\n→ code de sortie 255$/);
  });
});
