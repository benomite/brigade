// Un projet qui cuit sur cet ordinateur (#1122) : la station de ce poste le sert — il a sa ligne
// dans sa configuration —, et l'app le lit ici, par le geste de cette station, sans `ssh` ni
// `hote`, au même rythme qu'une box. Le lieu vivant l'emporte sur `app.json` : une cuisine qui
// passe de la box à cet ordinateur, ou l'inverse, est lue à sa nouvelle place dès la lecture
// suivante. Les faux `ssh` de ces tests posent une marque s'ils sont lancés : aucun test n'attend
// une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { pourLaBarre } from "../src/barre.ts";
import { GESTE, mots, ouvrirVeille, type Lecture, type Locale } from "../src/box.ts";
import { COUTS, projetsLus } from "../src/onglets.ts";
import { servisPar, tenirCuisinesIci } from "../src/poste/cuisine-ici.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const RUNTIME = join(import.meta.dirname, "../../runtime");

// Un poste d'essai : le répertoire de sa station, un faux `node` qui joue son geste — il note ce
// qu'il a reçu et répond comme le runtime —, et un faux `ssh` qui laisse sa marque s'il est lancé.
function essai(t: TestContext, { intervalleMs = 3_600_000 } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-ici-"));
  const station = join(racine, "station");
  const node = join(racine, "node");
  const ssh = join(racine, "ssh");
  writeFileSync(
    node,
    `#!/bin/sh\nprintf '%s|%s|%s\\n' "$PWD" "$BRIGADE_STATION_DIR" "$*" >> '${racine}/node-lance'\nshift\nprintf 'projet     %s\\nici        %s\\n' "$1" "$2"\n`,
  );
  writeFileSync(ssh, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${racine}/ssh-lance'\ncase "$*" in *" status") printf 'projet     sur la box\\n' ;; esac\n`);
  chmodSync(node, 0o755);
  chmodSync(ssh, 0o755);
  const locale: Locale = { node, runtime: join(racine, "runtime"), racine: station, env: { PATH: process.env.PATH } };
  // Le geste se lance depuis le dossier du runtime, comme celui d'une box.
  mkdirSync(locale.runtime);
  // Les lignes de la configuration de la station, telles qu'elle les écrit : aucune, sans fichier.
  const servir = (...lignes: string[]) => {
    rmSync(station, { recursive: true, force: true });
    if (lignes.length === 0) return;
    mkdirSync(station, { recursive: true });
    writeFileSync(join(station, "projets"), `${lignes.join("\n")}\n`);
  };
  const changes: (readonly string[])[] = [];
  const cuisines = tenirCuisinesIci({ locale, surChangement: (servis) => changes.push(servis) });

  const lectures: Lecture[] = [];
  let attendue: (() => void) | undefined;
  const veille = ouvrirVeille({
    ssh,
    intervalleMs,
    delaiMs: 60_000,
    connexionS: 10,
    cuisine: cuisines.cuisineDe,
    surLecture(lecture) {
      lectures.push(lecture);
      attendue?.();
    },
  });
  t.after(() => {
    veille.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
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
  return { veille, lectures, jusqua, lu, servir, cuisines, changes, locale, station };
}

const texte = (lecture: Lecture) => ("erreur" in lecture ? lecture.erreur : lecture.sorties.map((sortie) => sortie.texte).join(""));

describe("où cuit un projet : la configuration de la station de cet ordinateur", () => {
  test("ses projets sont le premier champ de chaque ligne entière — ni blanc, ni commentaire, ni ligne à moitié", (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-servis-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    assert.deepEqual(servisPar(racine), []);
    writeFileSync(
      join(racine, "projets"),
      ["# projet  dépôt  branche", "", "mirrorlab  BOBL-tech/mirrorlab  main", "  espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/x.env", "orphelin benomite/orphelin", "# brigade:debut", "mirrorlab autre/x main"].join("\n"),
    );
    assert.deepEqual(servisPar(racine), ["mirrorlab", "espace"]);
  });

  test("le lieu vivant l'emporte : servi ici, il se lit ici même avec un « hote » ; sinon sur sa box ; sans « hote », nulle part", (t) => {
    const { servir, cuisines, locale } = essai(t);
    const avecBox = { nom: "espace", box: { hote: "box" } };
    const sansBox = { nom: "mirrorlab" };
    assert.deepEqual(cuisines.cuisineDe(avecBox), { hote: "box" });
    assert.equal(cuisines.cuisineDe(sansBox), undefined);
    servir("mirrorlab BOBL-tech/mirrorlab main", "espace benomite/espace main");
    assert.deepEqual(cuisines.cuisineDe(avecBox), { locale });
    assert.deepEqual(cuisines.cuisineDe(sansBox), { locale });
    assert.equal(cuisines.ici("mirrorlab"), true);
    assert.equal(cuisines.ici("cantine"), false);
  });

  test("une app qui n'est pas une station ne lit rien ici : chaque projet reste sur sa box", (t) => {
    const { servir } = essai(t);
    servir("espace benomite/espace main");
    const poste = tenirCuisinesIci({ locale: undefined });
    assert.deepEqual(poste.cuisineDe({ nom: "espace", box: { hote: "box" } }), { hote: "box" });
    assert.equal(poste.cuisineDe({ nom: "espace" }), undefined);
    assert.equal(poste.ici("espace"), false);
  });

  test("quand les projets servis ici changent, il le dit une fois — la vue et les alertes suivent", async (t) => {
    const { servir, cuisines, changes } = essai(t);
    cuisines.cuisineDe({ nom: "mirrorlab" });
    await Promise.resolve();
    assert.deepEqual(changes, []);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    cuisines.cuisineDe({ nom: "mirrorlab" });
    cuisines.ici("mirrorlab");
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"]]);
    servir();
    assert.equal(cuisines.ici("mirrorlab"), false);
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"], []]);
  });
});

describe("un projet qui cuit ici se lit sans ssh, comme une box", () => {
  test("sans « hote », sa lecture part par le geste de la station de ce poste — dans le dossier du runtime, avec son répertoire — et aucun ssh n'est lancé", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu, servir, locale } = essai(t);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status", "station"], 3);

    const lecture = await jusqua(() => true);
    assert.equal(lecture.projet, "mirrorlab");
    assert.equal(lecture.demande, 3);
    assert.ok("sorties" in lecture, texte(lecture));
    assert.deepEqual(
      lecture.sorties.map(({ commande }) => commande),
      ["status", "station"],
    );
    assert.equal(texte(lecture), "projet     mirrorlab\nici        status\nprojet     mirrorlab\nici        station\n");
    assert.equal(lu("node-lance"), [`${locale.runtime}|${locale.racine}|${join(locale.runtime, GESTE)} mirrorlab status`, `${locale.runtime}|${locale.racine}|${join(locale.runtime, GESTE)} mirrorlab station`, ""].join("\n"));
    assert.equal(lu("ssh-lance"), "", "aucun ssh pour un projet qui cuit ici");
  });

  test("il se relit au rythme de la veille, comme une box — et jamais par ssh", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu, servir, lectures } = essai(t, { intervalleMs: 5 });
    servir("mirrorlab BOBL-tech/mirrorlab main");
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);
    await jusqua(() => lectures.length >= 3);
    assert.ok(lectures.every((lecture) => "sorties" in lecture));
    assert.equal(lu("ssh-lance"), "", "aucun ssh pour un projet qui cuit ici");
  });

  test("sa cuisine passe de la box à cet ordinateur, puis y revient : la lecture suivante suit, sans que rien ne change du projet déclaré", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu, servir, lectures } = essai(t, { intervalleMs: 5 });
    // Le même projet, tel que `app.json` le déclare d'un bout à l'autre : avec son « hote ».
    const espace = { nom: "espace", dossier: "/projets/espace", box: { hote: "box" } };
    veille.regarder([espace], ["status"], 1);

    await jusqua((lecture) => texte(lecture) === "projet     sur la box\n");
    assert.match(lu("ssh-lance"), /-- box brigade espace status/);
    assert.equal(lu("node-lance"), "");

    // La box → cet ordinateur.
    servir("espace benomite/espace main");
    const ici = await jusqua((lecture) => texte(lecture).startsWith("projet     espace\n"));
    const sshAvant = lu("ssh-lance");
    // La lecture d'après est encore ici : la box n'est plus jointe.
    await jusqua((lecture) => lectures.indexOf(lecture) > lectures.indexOf(ici) && texte(lecture).startsWith("projet     espace\n"));
    assert.equal(lu("ssh-lance"), sshAvant, "plus aucun ssh tant qu'il cuit ici");

    // Cet ordinateur → la box.
    servir();
    const retour = await jusqua((lecture) => lectures.indexOf(lecture) > lectures.indexOf(ici) && texte(lecture) === "projet     sur la box\n");
    assert.ok(lectures.indexOf(retour) > lectures.indexOf(ici));
    assert.ok(lu("ssh-lance").length > sshAvant.length, "de nouveau lu par ssh sur sa box");
  });

  test("le vrai geste de la station : lancé ici, un projet qu'elle ne sert pas est refusé par son code — atteinte, et le cas dit, sans ssh", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-geste-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    writeFileSync(join(racine, "projets"), "autre benomite/autre main\n");
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\ntouch '${racine}/ssh-lance'\nexit 255\n`);
    chmodSync(ssh, 0o755);
    const locale: Locale = { node: process.execPath, runtime: RUNTIME, racine, env: { PATH: process.env.PATH, HOME: racine } };
    let recue: ((lecture: Lecture) => void) | undefined;
    const lue = new Promise<Lecture>((resoudre) => (recue = resoudre));
    // Ce que la station sert est lu en vrai : ici, elle croit servir « mirrorlab », sa configuration dit le contraire.
    const veille = ouvrirVeille({ ssh, intervalleMs: 3_600_000, delaiMs: 60_000, connexionS: 10, cuisine: () => ({ locale }), surLecture: (lecture) => recue?.(lecture) });
    t.after(() => veille.fermer());
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);

    const lecture = await lue;
    assert.ok("erreur" in lecture);
    assert.equal(lecture.atteinte, true);
    assert.equal(lecture.cas, "projet-inconnu");
    assert.match(lecture.erreur, /« mirrorlab » n'a pas de ligne dans sa configuration/);
    assert.match(lecture.erreur, /→ exit code 65$/);
    assert.equal(existsSync(join(racine, "ssh-lance")), false, "aucun ssh");
  });

  test("les mots d'une commande sont ceux qu'un shell donnerait au geste", () => {
    assert.deepEqual(mots("measures --last 7d --by 1"), ["measures", "--last", "7d", "--by", "1"]);
    assert.deepEqual(mots("  log  --last 200 "), ["log", "--last", "200"]);
    assert.deepEqual(mots(`pass 14 comment 'l'\\''export, enfin'`), ["pass", "14", "comment", "l'export, enfin"]);
  });
});

describe("ce que la vue en reçoit", () => {
  test("la barre marque `ici` le projet qui cuit sur cet ordinateur — jamais celui que l'app a désinstallé", () => {
    const configuration = {
      chemin: "/tmp/app.json",
      projets: [
        { nom: "mirrorlab", dossier: "/p/m" },
        { nom: "espace", dossier: "/p/e", box: { hote: "box" } },
        { nom: "parti", dossier: "/p/p", desinstalle: { hote: "box", a: "2026-10-20T10:00:00Z", titre: "uninstalled", lignes: [] } },
      ],
    };
    const ici = (nom: string) => nom !== "espace";
    const vus = pourLaBarre(configuration, undefined, ici).projets;
    assert.deepEqual(
      vus.map(({ nom, ici: marque }) => [nom, marque]),
      [
        ["mirrorlab", true],
        ["espace", undefined],
        ["parti", undefined],
      ],
    );
    assert.deepEqual(
      projetsLus(COUTS, undefined, vus).map(({ nom }) => nom),
      ["mirrorlab", "espace"],
    );
  });
});
