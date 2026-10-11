// La veille de la box, contre un faux `ssh` écrit par chaque test : ce qu'elle
// lance, ce qu'elle rend mot pour mot, ce qu'elle dit quand elle n'atteint rien.
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

    veille.regarder(BRIGADE);
    const lecture = await jusqua(() => true);

    assert.deepEqual(lu("appels").trim().split("\n").sort(), [`-o BatchMode=yes -- box ${COMMANDE} run grant`, `-o BatchMode=yes -- box ${COMMANDE} run status`]);
    assert.deepEqual(lecture, {
      projet: "brigade",
      a: lecture.a,
      sorties: [
        { commande: "status", texte: "projet     brigade\nattend     1 décision attend le chef depuis 2 j\n" },
        { commande: "grant", texte: "grant merge           ABSENT — jamais donné\n" },
      ],
    });
    // L'heure de la lecture est le seul fait que l'app ajoute.
    assert.ok(Date.parse(lecture.a) >= avant && Date.parse(lecture.a) <= Date.now(), lecture.a);
  });

  test("la box n'est pas atteinte : c'est une erreur, avec ce que ssh a écrit et son code — et rien d'autre", async (t) => {
    const { veille, jusqua } = essai(t, `echo 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255`);

    veille.regarder(BRIGADE);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture);
    assert.match(lecture.erreur, /^\$ \S+ -o BatchMode=yes -- box .* run (status|grant)\n/);
    assert.match(lecture.erreur, /\nssh: connect to host box port 22: Connection refused\n/);
    assert.match(lecture.erreur, /\n→ code de sortie 255$/);
    assert.ok(!("sorties" in lecture), "une erreur prend la place de l'état");
  });

  test("une seule des deux commandes échoue : l'erreur prend toute la place, la sortie de l'autre n'est pas montrée", async (t) => {
    const { veille, jusqua } = essai(t, `case "$*" in *"run grant") echo "brigade : ce journal n'a pas encore l'état des grants" >&2; exit 1 ;; esac\n${REPOND}`);

    veille.regarder(BRIGADE);
    const lecture = await jusqua(() => true);

    assert.ok("erreur" in lecture && !("sorties" in lecture));
    assert.match(lecture.erreur, /run grant\nbrigade : ce journal n'a pas encore l'état des grants\n\n→ code de sortie 1$/);
  });

  test("une commande qui échoue en ayant écrit sur ses deux sorties : les deux sont rapportées", async (t) => {
    const { veille, jusqua } = essai(t, `echo 'à moitié dit'\necho 'puis cassé' >&2\nexit 3`);

    veille.regarder(BRIGADE);

    assert.match(texte(await jusqua(() => true)), /\npuis cassé\nà moitié dit\n\n→ code de sortie 3$/);
  });

  test("ssh introuvable : l'erreur du lancement est dite telle quelle", async (t) => {
    const { veille, jusqua } = essai(t, "", { ssh: "/nulle/part/ssh" });

    veille.regarder(BRIGADE);

    assert.match(texte(await jusqua(() => true)), /^\$ \/nulle\/part\/ssh .*\n→ spawn \/nulle\/part\/ssh ENOENT$/s);
  });

  test("ça se rafraîchit seul : les lectures se suivent sans qu'on les demande", async (t) => {
    const { veille, jusqua } = essai(t, `case "$*" in *"run status") echo x >>"$D/tours"; echo "lecture n° $(wc -l <"$D/tours" | tr -d ' ')" ;; esac`, { intervalleMs: 5 });

    veille.regarder(BRIGADE);

    await jusqua((lecture) => texte(lecture).includes("lecture n° 3"));
  });

  test("après une erreur, la lecture suivante qui réussit la remplace — et l'inverse", async (t) => {
    const { veille, jusqua, racine } = essai(t, `[ -f "$D/panne" ] && { echo 'ssh: Connection timed out' >&2; exit 255; }\n${REPOND}`, { intervalleMs: 5 });
    writeFileSync(join(racine, "panne"), "");

    veille.regarder(BRIGADE);
    await jusqua((lecture) => "erreur" in lecture);
    rmSync(join(racine, "panne"));
    const revenue = await jusqua((lecture) => "sorties" in lecture);
    writeFileSync(join(racine, "panne"), "");
    const retombee = await jusqua((lecture) => "erreur" in lecture && lecture.a > revenue.a);

    assert.ok(!("erreur" in revenue));
    assert.ok(!("sorties" in retombee));
  });

  test("un ssh qui ne rend rien est arrêté passé le délai, et c'est dit", async (t) => {
    const { veille, jusqua, lu } = essai(t, `echo $$ >>"$D/pids"\nexec sleep 600`, { delaiMs: 200 });

    veille.regarder(BRIGADE);
    const lecture = await jusqua(() => true);

    assert.match(texte(lecture), /\n→ aucune réponse en 0,2 s : ssh arrêté$/);
    await morts(lu("pids"));
  });

  test("regarder un autre projet arrête la lecture du premier : plus rien n'arrive de lui", async (t) => {
    const { veille, lectures, jusqua, lu } = essai(t, `case "$3 $4" in "-- box") echo $$ >>"$D/pids"; exec sleep 600 ;; esac\n${REPOND}`);

    veille.regarder(BRIGADE);
    // Les deux ssh du premier sont partis, et ne rendront rien.
    while (pids(lu("pids")).length < 2) await new Promise((resoudre) => setTimeout(resoudre, 10));
    veille.regarder(PARADE);
    const lecture = await jusqua(() => true);

    assert.equal(lecture.projet, "parade");
    await morts(lu("pids"));
    assert.deepEqual(lectures.map(({ projet }) => projet), ["parade"]);
  });

  test("fermer arrête tout : le ssh en cours meurt, et plus aucune lecture ne part", async (t) => {
    const { veille, lectures, jusqua, lu, racine } = essai(t, `echo x >>"$D/tours"\n[ -f "$D/retenir" ] && { echo $$ >>"$D/pids"; exec sleep 600; }\n${REPOND}`, { intervalleMs: 5 });

    veille.regarder(BRIGADE);
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

    veille.regarder({ nom: "local", dossier: "/projets/local" });
    veille.regarder(BRIGADE);
    await jusqua(() => true);

    assert.deepEqual(lectures.map(({ projet }) => projet), ["brigade"]);
  });
});
