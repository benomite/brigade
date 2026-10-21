// Retirer un projet : de l'app, ou de sa box — deux gestes. Le premier contre le vrai
// fichier des projets, le second contre un faux `ssh` qui tient lieu de box : il a son
// drop-in et son journal, deux fichiers du test, et rend ce que le geste de la box rend
// — son objet, et ses phrases, celles du runtime, pas une copie. Ni réseau ni box.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { direDesinstallation, lireRetrait, type Plan } from "../../runtime/src/desinstallateur.ts";
import { ouvrirVeille } from "../src/box.ts";
import type { Projet } from "../src/config.ts";
import { argumentsDuRetrait, DESINSTALLER, gesteDeRetrait, lancerRetrait, PLANIFIER, RETIRER, tenirRetraits, type Demande, type Montre, type Rendu, type Retrait } from "../src/retrait.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";
const GESTE = "sudo -n /usr/local/bin/brigade-installer uninstall calculus";
const ETAT = "/var/lib/brigade/calculus";
const JOURNAL = "le journal de calculus, sur la box\n";

// Ce que le geste de la box dit d'un projet installé et servi : son plan, avec ou sans son journal.
const plan = (journal: boolean): Plan => ({
  projet: "calculus",
  retire: {
    unites: [{ unite: "brigade@calculus.service", enMarche: true }],
    dropIns: ["/etc/systemd/system/brigade@calculus.service.d"],
    clone: `${ETAT}/depot`,
    worktrees: 2,
    versions: null,
    ports: [3129],
    journal: journal ? ETAT : null,
  },
  garde: { journal: journal ? null : ETAT, sauvegardes: "/srv/sauvegardes/calculus" },
  perdus: [],
  aSavoir: [],
});
// Ce qu'il écrit : ses phrases sur sa sortie d'erreur, son objet sur sa sortie standard (runtime/src/installateur-cli.ts).
const phrases = (fait: "plan" | "desinstalle", journal: boolean) =>
  direDesinstallation({ fait, plan: plan(journal) }, { projet: "calculus", plan: fait === "plan", confirmation: fait === "plan" ? null : "calculus", journal });
const objet = (fait: "plan" | "desinstalle", journal: boolean) => JSON.stringify({ ok: true, action: "uninstall", fait, ...plan(journal) });

// Une ligne que le faux ssh écrit telle quelle, quoi qu'elle porte.
const dit = (ligne: string) => `printf '%s\\n' '${ligne.replaceAll("'", `'\\''`)}'`;
const NOTE = `echo "$*" >>"$D/appels"`;
// La box : son plan ne change rien ; confirmée, elle retire le drop-in — et le journal, s'il lui est demandé.
const STATION = [
  NOTE,
  'case "$*" in *--supprimer-le-journal*) j=supprime ;; *) j=garde ;; esac',
  'case "$*" in',
  '  *--plan*) cat "$D/rendus/plan-$j.err" >&2; cat "$D/rendus/plan-$j.out" ;;',
  '  *) rm -f "$D/box/drop-in"; if [ $j = supprime ]; then rm -f "$D/box/journal"; fi; cat "$D/rendus/desinstalle-$j.err" >&2; cat "$D/rendus/desinstalle-$j.out" ;;',
  "esac",
].join("\n");
// Elle répond au plan, et autre chose à sa confirmation.
const confirmee = (corps: string) => `${NOTE}\ncase "$*" in *--plan*) cat "$D/rendus/plan-garde.err" >&2; cat "$D/rendus/plan-garde.out"; exit 0 ;; esac\n${corps}`;
// Un refus du geste : son objet sur la sortie standard, sa phrase sur la sortie d'erreur, son code.
const refus = (code: number, motif: string, message: string, plus: object = { ecrit: false }) =>
  `${dit(`brigade-installer : ${message}`)} >&2\n${dit(JSON.stringify({ ok: false, action: "uninstall", projet: "calculus", motif, message, ...plus }))}\nexit ${code}`;

// Un essai : le fichier des projets, suivi comme dans l'app, la box — un faux `ssh`, un
// script sh où `$D` est le répertoire du test — et les retraits, branchés comme dans main.ts.
function essai(t: TestContext, corps: string = STATION, contenu?: (racine: string) => unknown, delais = { plan: 60_000, execution: 60_000 }) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-retrait-"));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(ssh, 0o755);
  for (const dossier of ["calculus", "parade", "box", "rendus"]) mkdirSync(join(racine, dossier));
  writeFileSync(join(racine, "box/drop-in"), "[Service]\n");
  writeFileSync(join(racine, "box/journal"), JOURNAL);
  for (const fait of ["plan", "desinstalle"] as const) {
    for (const journal of [false, true]) {
      const nom = join(racine, "rendus", `${fait}-${journal ? "supprime" : "garde"}`);
      writeFileSync(`${nom}.err`, `${phrases(fait, journal).join("\n")}\n`);
      writeFileSync(`${nom}.out`, `${objet(fait, journal)}\n`);
    }
  }
  const chemin = join(racine, "app.json");
  const calculus: Projet = { nom: "calculus", dossier: join(racine, "calculus"), box: { hote: "box" } };
  writeFileSync(chemin, JSON.stringify(contenu?.(racine) ?? { hotes: ["box"], projets: [{ nom: "calculus", dossier: calculus.dossier, hote: "box" }, { nom: "parade", dossier: join(racine, "parade") }] }));
  const partis: string[] = [];
  const suivi = suivreConfiguration({ chemin, surChangement: (_, quittes) => void partis.push(...quittes) });
  const desinstalles: string[] = [];
  const demandes: Demande[] = [];
  const retraits = tenirRetraits({
    chemin,
    retirer: suivi.retirer,
    lancer: (servi, demande) => {
      demandes.push(demande);
      return lancerRetrait({ ssh, delaiMs: demande.plan ? delais.plan : delais.execution, connexionS: 10 }, servi, demande);
    },
    surDesinstalle: (nom) => void desinstalles.push(nom),
  });
  t.after(() => {
    suivi.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  const appels = () => lu("appels").split("\n").filter(Boolean);
  const declares = () => (JSON.parse(readFileSync(chemin, "utf8")) as { projets: { nom: string }[] }).projets.map(({ nom }) => nom);
  return { racine, ssh, chemin, suivi, retraits, calculus, partis, desinstalles, demandes, lu, appels, declares };
}

// Le geste de box d'un projet qui en a une.
function geste(retrait: Retrait | undefined) {
  const pose = retrait?.desinstaller.geste;
  assert.ok(pose !== undefined, "ce projet n'a pas de geste de box");
  return pose;
}
const texte = (montre: Montre | undefined) => (montre === undefined ? "" : [montre.titre, ...("obtenu" in montre ? [montre.obtenu] : []), ...("suite" in montre ? montre.suite : [])].join("\n"));

describe("retirer un projet : deux gestes, deux libellés", () => {
  test("deux actions distinctes sont proposées pour un projet, et leurs libellés disent laquelle touche à quoi", (t) => {
    const { retraits, calculus, chemin } = essai(t);

    const { retirer, desinstaller } = retraits.etat(calculus);

    assert.equal(retirer.libelle, "Remove from the app");
    assert.equal(desinstaller.libelle, "Uninstall from the station");
    assert.deepEqual([retirer.libelle, desinstaller.libelle, PLANIFIER], [RETIRER, DESINSTALLER, "See what the station would remove"]);
    // Chacun dit ce qu'il ne fait pas : le premier ne touche pas à la box, le second ne retire rien de l'app.
    assert.ok(retirer.lignes.some((ligne) => ligne.includes(chemin)));
    assert.match(retirer.lignes.join("\n"), /Nothing is sent to station “box”: the project stays installed there.*with its log intact/);
    assert.match(desinstaller.lignes.join("\n"), /the station first states its plan, removing nothing/);
    assert.match(desinstaller.lignes.join("\n"), /It stays in the app: removing it from there is the other action/);
  });

  test("un projet sans box n'a que le premier : il n'y a rien à désinstaller, et c'est dit", (t) => {
    const { retraits, racine, appels } = essai(t);

    const { retirer, desinstaller } = retraits.etat({ nom: "parade", dossier: join(racine, "parade") });

    assert.equal(retirer.libelle, RETIRER);
    assert.equal(desinstaller.geste, undefined);
    assert.match(desinstaller.lignes.join("\n"), /“parade” does not say where its station is: the app has nothing to uninstall there/);
    assert.deepEqual(appels(), []);
  });
});

describe("retirer de l'app", () => {
  test("il ne fait aucun appel à la box : le projet quitte le fichier et la barre, et son journal sur la box est inchangé", (t) => {
    const { retraits, calculus, suivi, partis, demandes, appels, declares, lu, racine } = essai(t);

    const rendu = retraits.retirerDeLApp(calculus);

    // Ni `ssh` lancé, ni rien de demandé à la box — et la box est comme avant.
    assert.deepEqual(appels(), []);
    assert.deepEqual(demandes, []);
    assert.equal(lu("box/journal"), JOURNAL);
    assert.equal(existsSync(join(racine, "box/drop-in")), true);
    // L'app, elle, ne l'a plus : ni dans le fichier, ni dans la liste que la barre montre.
    assert.deepEqual(declares(), ["parade"]);
    assert.deepEqual(suivi.configuration().projets.map(({ nom }) => nom), ["parade"]);
    assert.deepEqual(partis, ["calculus"]);
    assert.ok("avis" in rendu);
    assert.equal(rendu.avis.titre, "“calculus” is removed from the app.");
    assert.match(rendu.avis.lignes.join("\n"), /Nothing was sent to station “box”: the project is still installed there, and its log was not touched\./);
    assert.match(rendu.avis.lignes.join("\n"), /Uninstalling it from the station is another action/);
  });

  test("même après un plan demandé à la box, le retirer de l'app n'y envoie rien de plus", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, demandes, appels, lu, declares } = essai(t);
    await retraits.planifier(calculus);

    retraits.retirerDeLApp(calculus);

    // Rien d'autre n'a été demandé à la box que ce plan : ni lancé, ni même en route.
    assert.deepEqual(demandes, [{ plan: true, journal: false }]);
    assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan`]);
    assert.equal(lu("box/journal"), JOURNAL);
    assert.deepEqual(declares(), ["parade"]);
  });

  test("un projet sans box se retire de même, et l'avis ne parle d'aucune box", (t) => {
    const { retraits, racine, declares, appels } = essai(t);

    const rendu = retraits.retirerDeLApp({ nom: "parade", dossier: join(racine, "parade") });

    assert.ok("avis" in rendu);
    assert.deepEqual(rendu.avis.lignes, ["It had no station: there was nothing else to remove."]);
    assert.deepEqual(declares(), ["calculus"]);
    assert.deepEqual(appels(), []);
  });

  test("un fichier que l'app n'a pas pu relire n'est pas réécrit : le projet n'est pas retiré, et la raison est dite", (t) => {
    const { retraits, calculus, chemin, suivi, appels } = essai(t);
    writeFileSync(chemin, '{ "projets": [');

    const rendu = retraits.retirerDeLApp(calculus);

    assert.ok("refus" in rendu);
    assert.match(rendu.refus, /^Not removed — the app does not write to a file it could not re-read — unreadable JSON: /);
    assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
    assert.deepEqual(suivi.configuration().projets.map(({ nom }) => nom), ["calculus", "parade"]);
    assert.deepEqual(appels(), []);
  });
});

describe("ce qui part vers la box pour désinstaller", () => {
  test("le geste de désinstallation, par sudo et par son chemin : le plan, ou la confirmation qui nomme le projet — le journal seulement s'il est demandé", () => {
    assert.equal(gesteDeRetrait("calculus", { plan: true, journal: false }), `${GESTE} --plan`);
    assert.equal(gesteDeRetrait("calculus", { plan: true, journal: true }), `${GESTE} --plan --supprimer-le-journal`);
    assert.equal(gesteDeRetrait("calculus", { plan: false, confirmation: "calculus", journal: false }), `${GESTE} --confirmer calculus`);
    assert.equal(gesteDeRetrait("calculus", { plan: false, confirmation: "calculus", journal: true }), `${GESTE} --confirmer calculus --supprimer-le-journal`);
  });

  test("le geste de la box lit ce que l'app lui envoie comme l'écran l'a recueilli", () => {
    assert.deepEqual(lireRetrait(argumentsDuRetrait("calculus", { plan: true, journal: false })), { projet: "calculus", plan: true, confirmation: null, journal: false });
    assert.deepEqual(lireRetrait(argumentsDuRetrait("calculus", { plan: true, journal: true })), { projet: "calculus", plan: true, confirmation: null, journal: true });
    assert.deepEqual(lireRetrait(argumentsDuRetrait("calculus", { plan: false, confirmation: "calculus", journal: false })), { projet: "calculus", plan: false, confirmation: "calculus", journal: false });
    assert.deepEqual(lireRetrait(argumentsDuRetrait("calculus", { plan: false, confirmation: "calculus", journal: true })), { projet: "calculus", plan: false, confirmation: "calculus", journal: true });
  });

  test("ssh ne peut rien demander, et reçoit l'hôte du projet tel quel, après `--`", { skip: SANS_POSIX }, async (t) => {
    const { ssh, appels } = essai(t);

    const rendu = await lancerRetrait({ ssh, delaiMs: 60_000, connexionS: 10 }, { nom: "calculus", box: { hote: "chef@autre-box" } }, { plan: true, journal: false });

    assert.equal(rendu.etat, "plan");
    assert.deepEqual(appels(), [`${OPTIONS} -- chef@autre-box ${GESTE} --plan`]);
  });

  test("le shell de la box rend le nom au geste en un seul argument, sans rien en exécuter", { skip: SANS_POSIX }, async (t) => {
    // Le faux ssh fait ce que fait la box : son shell lit la ligne. `sudo` y note ses arguments, un par ligne.
    const { ssh, lu, racine } = essai(t, `for geste; do :; done\nsudo() { printf '%s\\n' "$@" >"$D/recus"; }\neval "$geste"`);
    const nom = `calculus'; touch ${racine}/pirate; $(touch ${racine}/pirate)`;

    await lancerRetrait({ ssh, delaiMs: 60_000, connexionS: 10 }, { nom, box: { hote: "box" } }, { plan: false, confirmation: nom, journal: true });

    assert.deepEqual(lu("recus").trimEnd().split("\n"), ["-n", "/usr/local/bin/brigade-installer", "uninstall", nom, "--confirmer", nom, "--supprimer-le-journal"]);
    assert.equal(existsSync(join(racine, "pirate")), false);
  });
});

describe("désinstaller de la box", () => {
  test("le plan d'abord : ce que la box dit qu'elle retirerait est affiché mot pour mot, et rien n'est retiré", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels, lu, racine, desinstalles } = essai(t);

    const { plan: montre, desinstallerRefuse } = geste(await retraits.planifier(calculus));

    assert.equal(montre?.etat, "plan");
    assert.match(montre?.titre ?? "", /^STATION “box” HAS DRAWN UP ITS UNINSTALL PLAN — nothing is removed yet/);
    // Chaque phrase du geste, telle qu'il l'a écrite : l'app n'en compose aucune.
    for (const phrase of phrases("plan", false)) assert.ok(texte(montre).includes(phrase), `le plan affiché n'a pas « ${phrase} »`);
    assert.match(texte(montre), /The log is not part of what the station would remove: it keeps it \(\/var\/lib\/brigade\/calculus\)\./);
    // Un seul appel, le plan — et la box est comme avant.
    assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan`]);
    assert.equal(lu("box/journal"), JOURNAL);
    assert.equal(existsSync(join(racine, "box/drop-in")), true);
    assert.deepEqual(desinstalles, []);
    // Le plan rendu, la désinstallation se propose : il reste à la confirmer.
    assert.equal(desinstallerRefuse, undefined);
  });

  test("sans plan, rien ne s'exécute : la désinstallation est refusée, et rien ne part vers la box", async (t) => {
    const { retraits, calculus, appels, lu } = essai(t);

    assert.match(geste(retraits.etat(calculus)).desinstallerRefuse ?? "", /^No uninstall: the station has not yet said what it would remove/);
    const { issue } = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(issue?.etat, "pas-parti");
    assert.match(texte(issue), /The station has not yet said what it would remove: “See what the station would remove” first/);
    assert.deepEqual(appels(), []);
    assert.equal(lu("box/journal"), JOURNAL);
  });

  const SANS_NOM: [string, unknown, RegExp][] = [
    ["rien n'est écrit", "", /You have not typed the project name/],
    ["le nom est incomplet", "calculu", /You typed “calculu”, and the project is called “calculus”/],
    ["c'est le nom d'un autre projet", "parade", /You typed “parade”, and the project is called “calculus”/],
    ["la casse diffère", "Calculus", /You typed “Calculus”, and the project is called “calculus”/],
    ["la vue n'envoie pas un texte", true, /You have not typed the project name/],
  ];
  for (const [quoi, saisi, raison] of SANS_NOM) {
    test(`le plan rendu, ${quoi} : rien n'est exécuté tant que le chef n'a pas confirmé en nommant le projet`, { skip: SANS_POSIX }, async (t) => {
      const { retraits, calculus, appels, lu, racine, desinstalles } = essai(t);
      await retraits.planifier(calculus);

      const pose = geste(await retraits.desinstaller(calculus, saisi));

      assert.equal(pose.issue?.etat, "pas-parti");
      assert.match(texte(pose.issue), /^NOTHING WAS SENT TO THE STATION/);
      assert.match(texte(pose.issue), raison);
      // Le plan, et lui seul : la box n'a rien reçu d'autre, et n'a rien perdu.
      assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan`]);
      assert.equal(lu("box/journal"), JOURNAL);
      assert.equal(existsSync(join(racine, "box/drop-in")), true);
      assert.deepEqual(desinstalles, []);
      // Le plan vaut toujours : il reste à écrire le bon nom.
      assert.equal(pose.plan?.etat, "plan");
    });
  }

  test("confirmée en nommant le projet, la box retire ce que son plan disait — et sans l'option, le journal existe encore, et l'écran le dit", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels, lu, racine, desinstalles } = essai(t);
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, " calculus "));

    assert.equal(pose.issue?.etat, "desinstalle");
    assert.equal(pose.issue?.titre, "UNINSTALLED FROM STATION “box”");
    for (const phrase of phrases("desinstalle", false)) assert.ok(texte(pose.issue).includes(phrase), `ce qui est affiché n'a pas « ${phrase} »`);
    assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan`, `${OPTIONS} -- box ${GESTE} --confirmer calculus`]);
    // La box a retiré le projet, pas son journal.
    assert.equal(existsSync(join(racine, "box/drop-in")), false);
    assert.equal(lu("box/journal"), JOURNAL);
    assert.match(texte(pose.issue), /The project's log still exists on the station: \/var\/lib\/brigade\/calculus\. The uninstall did not delete it\./);
    assert.deepEqual(desinstalles, ["calculus"]);
    // Le plan a servi : une autre désinstallation en redemande un.
    assert.equal(pose.plan, undefined);
  });

  test("l'option qui supprime le journal est décochée par défaut, et son avertissement est là avant qu'on la coche", (t) => {
    const { retraits, calculus } = essai(t);

    const { journal } = geste(retraits.etat(calculus));

    assert.equal(journal.coche, false);
    assert.equal(journal.libelle, "Also delete the project's log on the station");
    assert.match(journal.avertissement.join("\n"), /Unticked — the default/);
    assert.match(journal.avertissement.join("\n"), /cannot be undone/);
  });

  test("cochée, l'option part avec le plan et avec la désinstallation : le journal est supprimé, et l'écran le dit — un plan demandé sans elle ne vaut plus", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels, lu, racine } = essai(t);
    await retraits.planifier(calculus);

    // Cocher lâche le plan rendu sans l'option : rien ne s'exécute sur sa foi.
    const cochee = geste(retraits.direJournal(calculus, true));
    assert.equal(cochee.journal.coche, true);
    assert.equal(cochee.plan, undefined);
    assert.match(cochee.desinstallerRefuse ?? "", /^No uninstall: the station has not yet said what it would remove/);
    assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
    assert.equal(lu("box/journal"), JOURNAL);

    const planifie = geste(await retraits.planifier(calculus));
    for (const phrase of phrases("plan", true)) assert.ok(texte(planifie.plan).includes(phrase), `le plan affiché n'a pas « ${phrase} »`);
    assert.match(texte(planifie.plan), /The log is part of what the station would remove \(\/var\/lib\/brigade\/calculus\): deleting it cannot be undone\./);
    assert.equal(lu("box/journal"), JOURNAL);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "desinstalle");
    assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan`, `${OPTIONS} -- box ${GESTE} --plan --supprimer-le-journal`, `${OPTIONS} -- box ${GESTE} --confirmer calculus --supprimer-le-journal`]);
    assert.equal(existsSync(join(racine, "box/journal")), false);
    assert.match(texte(pose.issue), /The project's log was deleted along with its state \(\/var\/lib\/brigade\/calculus\): this cannot be undone\./);
  });

  test("décocher lâche de même le plan qui emportait le journal", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels } = essai(t);
    retraits.direJournal(calculus, true);
    await retraits.planifier(calculus);

    const decochee = geste(retraits.direJournal(calculus, false));

    assert.equal(decochee.journal.coche, false);
    assert.equal(decochee.plan, undefined);
    assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
    assert.deepEqual(appels(), [`${OPTIONS} -- box ${GESTE} --plan --supprimer-le-journal`]);
  });

  test("après une désinstallation réussie, le projet n'est plus pilotable depuis l'app : elle le signale, et ne lit plus sa box", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, ssh } = essai(t);
    // Tant qu'il est sur sa box, l'app le voit tel que le fichier le dit.
    assert.equal(retraits.vu(calculus), calculus);
    await retraits.planifier(calculus);
    assert.equal(retraits.vu(calculus), calculus);

    await retraits.desinstaller(calculus, "calculus");

    const vu = retraits.vu(calculus);
    assert.equal(vu.box, undefined);
    assert.equal(vu.desinstalle?.titre, "UNINSTALLED FROM STATION “box” — can no longer be driven from the app");
    assert.doesNotMatch(vu.desinstalle?.titre ?? "", /REACHED/);
    assert.match(vu.desinstalle?.lignes.join("\n") ?? "", /The app no longer reads its station, and writes nothing to it/);
    assert.match(vu.desinstalle?.lignes.join("\n") ?? "", /The project's log still exists on the station: \/var\/lib\/brigade\/calculus/);
    assert.match(vu.desinstalle?.lignes.join("\n") ?? "", /“Remove from the app”/);
    assert.deepEqual({ nom: vu.nom, dossier: vu.dossier }, { nom: calculus.nom, dossier: calculus.dossier });
    // La veille n'a plus de box à lire pour lui : rien ne part. Une lecture qui part prend
    // le passage de son projet à l'instant où elle est demandée — celle du projet tel que le
    // fichier le déclare le prend, celle du projet tel que l'app le montre ne prend rien.
    const passage = new Map<string, Promise<unknown>>();
    const veille = ouvrirVeille({ ssh, intervalleMs: 60_000, delaiMs: 60_000, connexionS: 10, passage, surLecture: () => {} });
    t.after(veille.fermer);
    veille.regarder([vu], ["status"], 1);
    assert.deepEqual([...passage.keys()], []);
    veille.regarder([calculus], ["status"], 2);
    assert.deepEqual([...passage.keys()], ["calculus"]);
    veille.fermer();
    // Arrêtée, sa lecture a quand même lancé le faux ssh : il est attendu, pour qu'il
    // n'écrive plus dans le répertoire du test quand celui-ci est effacé.
    await passage.get("calculus");
    // Ce qui reste à faire de lui est l'autre geste, et il le dit.
    const { retirer, desinstaller } = retraits.etat(calculus);
    assert.match(retirer.lignes.join("\n"), /It is uninstalled from station “box”/);
    assert.match(desinstaller.lignes.join("\n"), /It is uninstalled from station “box”/);
  });

  test("désinstallé, journal gardé : le geste se rejoue avec l'option, par le même chemin — le plan, puis la confirmation", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels, racine } = essai(t);
    await retraits.planifier(calculus);
    await retraits.desinstaller(calculus, "calculus");

    retraits.direJournal(calculus, true);
    assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
    await retraits.planifier(calculus);
    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "desinstalle");
    assert.equal(appels().length, 4);
    assert.equal(existsSync(join(racine, "box/journal")), false);
    assert.match(retraits.vu(calculus).desinstalle?.lignes.join("\n") ?? "", /The project's log was deleted along with its state/);
  });

  test("la box retient la désinstallation (code 81) : sa phrase est montrée mot pour mot, rien n'est dit désinstallé, et le projet reste pilotable", { skip: SANS_POSIX }, async (t) => {
    const message = "le clone de « calculus » porte ce que l'origine n'a pas — le pousser, ou le défaire, puis rejouer ; rien n'est retiré :\n  depot : 2 commits que l'origine n'a pas";
    const { retraits, calculus, desinstalles } = essai(t, confirmee(refus(81, "travail-jamais-pousse", message)));
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "refuse");
    assert.equal(pose.issue?.titre, "STATION “box” REFUSED (travail-jamais-pousse) — nothing is removed");
    assert.ok(texte(pose.issue).includes(`brigade-installer : ${message}`));
    assert.match(texte(pose.issue), /→ exit code 81/);
    assert.equal(retraits.vu(calculus), calculus);
    assert.deepEqual(desinstalles, []);
    // Rien n'a changé sur la box : son plan vaut toujours.
    assert.equal(pose.plan?.etat, "plan");
  });

  test("une désinstallation arrêtée en chemin (code 79) : ce que la box dit fait, et ce qui reste, est montré — le plan ne vaut plus, et rien n'est dit désinstallé", { skip: SANS_POSIX }, async (t) => {
    const message = "`systemctl daemon-reload` rend 1 : échec — la désinstallation s'est arrêtée là, et se rejoue. Fait : brigade@calculus.service (arrêtée, désactivée). Reste : systemctl daemon-reload";
    const { retraits, calculus, desinstalles } = essai(t, confirmee(refus(79, "echec", message, { retires: ["brigade@calculus.service (arrêtée, désactivée)"], restes: ["systemctl daemon-reload"] })));
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "inachevee");
    assert.ok(texte(pose.issue).includes(`brigade-installer : ${message}`));
    assert.match(texte(pose.issue), /ask the station for its plan again: it will say what is left/);
    assert.equal(pose.plan, undefined);
    assert.match(pose.desinstallerRefuse ?? "", /^No uninstall/);
    assert.equal(retraits.vu(calculus), calculus);
    assert.deepEqual(desinstalles, []);
  });

  test("la box ne connaît pas le projet (code 65) : il n'y a pas de plan, et l'écran renvoie à l'autre geste", { skip: SANS_POSIX }, async (t) => {
    const message = "le projet « calculus » n'est pas connu de cette box : ni drop-in sous /etc/systemd/system, ni état sous /var/lib/brigade — rien n'est fait, rien n'a changé. Elle ne porte aucun projet";
    const { retraits, calculus } = essai(t, `${NOTE}\n${refus(65, "projet-inconnu", message)}`);

    const pose = geste(await retraits.planifier(calculus));

    assert.equal(pose.plan?.etat, "refuse");
    assert.ok(texte(pose.plan).includes(`brigade-installer : ${message}`));
    assert.match(texte(pose.plan), /there is nothing to uninstall there.*“Remove from the app”/);
    assert.match(pose.desinstallerRefuse ?? "", /^No uninstall/);
    assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
  });

  test("la box est injoignable (ssh sort en 255) : pas de plan, donc rien à confirmer — et l'écran dit où lire ce que ssh a dit", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, appels } = essai(t, `${NOTE}\necho 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255`);

    const pose = geste(await retraits.planifier(calculus));

    assert.equal(pose.plan?.etat, "injoignable");
    assert.equal(pose.plan?.titre, "STATION “box” COULD NOT BE REACHED — nothing is removed");
    assert.match(texte(pose.plan), /ssh: connect to host box port 22: Connection refused\n\n→ exit code 255/);
    assert.match(texte(pose.plan), /docs\/installer\.md, section 2, « Joindre »/);
    assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
    assert.equal(appels().length, 1);
  });

  // Ce que `sudo` répond sur une box préparée avant le geste : sa phrase, et son code.
  const ABSENTS: [string, string][] = [
    ["le geste n'est pas posé sur la box", `echo 'sudo: /usr/local/bin/brigade-installer: command not found' >&2\nexit 1`],
    ["sa règle sudoers ne le donne pas à ce compte", `echo 'sudo: a password is required' >&2\nexit 1`],
    ["le compte est enfermé dans une commande forcée, qui rend 0 et autre chose", "echo 'brigade : usage'\nexit 0"],
    ["la box rend l'objet d'une autre action", `${dit(JSON.stringify({ ok: true, action: "install", projet: "calculus", ports: { porte: 3129 } }))}`],
    ["la box rend le plan d'un autre projet", `${dit(JSON.stringify({ ok: true, action: "uninstall", fait: "plan", ...plan(false), projet: "parade" }))}`],
  ];
  for (const [quoi, corps] of ABSENTS) {
    test(`${quoi} : ce n'est pas un plan — l'écran dit quoi faire et où, sans le faire, et rien ne peut s'exécuter`, { skip: SANS_POSIX }, async (t) => {
      const { retraits, calculus, appels } = essai(t, `${NOTE}\n${corps}`);

      const pose = geste(await retraits.planifier(calculus));

      assert.equal(pose.plan?.etat, "geste-absent");
      assert.match(texte(pose.plan), /docs\/installer\.md, section 3, « Préparer » — « Le geste d'installation »/);
      assert.match(pose.desinstallerRefuse ?? "", /^No uninstall/);
      assert.equal(geste(await retraits.desinstaller(calculus, "calculus")).issue?.etat, "pas-parti");
      assert.equal(appels().length, 1);
    });
  }

  test("ssh sort en 255 pendant la désinstallation : jamais jointe ou session perdue en route, son code ne le dit pas — l'app ne dit ni « rien n'est retiré », ni « désinstallé », et le plan ne vaut plus", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, desinstalles } = essai(t, confirmee("echo 'Connection to station closed by remote host.' >&2\nexit 255"));
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "injoignable");
    assert.equal(pose.issue?.titre, "`ssh` FAILED WITHOUT AN ANSWER FROM STATION “box”");
    assert.doesNotMatch(texte(pose.issue), /nothing is removed/);
    assert.match(texte(pose.issue), /Connection to station closed by remote host\.\n\n→ exit code 255/);
    assert.match(texte(pose.issue), /if it lost it on the way, the uninstall may have started/);
    assert.match(texte(pose.issue), /The app does not report this project as uninstalled/);
    // Rien ne se rejoue sur la foi du plan d'avant : la box a pu changer.
    assert.equal(pose.plan, undefined);
    assert.match(pose.desinstallerRefuse ?? "", /^No uninstall/);
    assert.equal(retraits.vu(calculus), calculus);
    assert.deepEqual(desinstalles, []);
  });

  test("un nom que le système refuse de passer à ssh — un caractère nul — ne lance rien : c'est dit, sans que rien reste en route", async (t) => {
    const { ssh, retraits, calculus, appels } = essai(t);
    const nul = { ...calculus, nom: "calc\u0000ulus" };

    const rendu = await lancerRetrait({ ssh, delaiMs: 60_000, connexionS: 10 }, { nom: nul.nom, box: { hote: "box" } }, { plan: true, journal: false });
    const pose = geste(await retraits.planifier(nul));

    assert.equal(rendu.etat, "injoignable");
    assert.equal(pose.plan?.etat, "injoignable");
    assert.equal(pose.planifierRefuse, undefined);
    assert.deepEqual(appels(), []);
  });

  test("la box répond à la confirmation par un plan : ce n'est pas une désinstallation, et rien n'est dit désinstallé", { skip: SANS_POSIX }, async (t) => {
    const { retraits, calculus, desinstalles } = essai(t, confirmee(`cat "$D/rendus/plan-garde.out"`));
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "geste-absent");
    assert.equal(retraits.vu(calculus), calculus);
    assert.deepEqual(desinstalles, []);
    assert.equal(pose.plan, undefined);
  });

  // Le délai n'est pas une course : arrêté tôt ou tard, un `ssh` qui n'a rien rendu donne le même rendu.
  test("un ssh arrêté au délai pendant la désinstallation n'a pas dit où la box en était : l'app ne le dit pas désinstallé, et le plan ne vaut plus", { skip: SANS_POSIX }, async (t) => {
    // Le plan a tout son temps : seule la désinstallation est laissée sans réponse.
    const { retraits, calculus, desinstalles } = essai(t, confirmee("exec sleep 600"), undefined, { plan: 60_000, execution: 200 });
    await retraits.planifier(calculus);

    const pose = geste(await retraits.desinstaller(calculus, "calculus"));

    assert.equal(pose.issue?.etat, "sans-reponse");
    assert.match(texte(pose.issue), /→ no answer in 0\.2 s: ssh stopped/);
    assert.match(texte(pose.issue), /the app does not know where the station stood/);
    assert.match(texte(pose.issue), /The app does not report this project as uninstalled/);
    assert.equal(pose.plan, undefined);
    assert.equal(retraits.vu(calculus), calculus);
    assert.deepEqual(desinstalles, []);
  });
});

describe("ce qui est tenu d'une désinstallation", () => {
  // Une box dont chaque réponse attend que le test la donne.
  function tenue() {
    const demandes: { demande: Demande; rendre(rendu: Rendu): void }[] = [];
    const desinstalles: string[] = [];
    const retraits = tenirRetraits({
      chemin: "/chef/app.json",
      retirer: () => undefined,
      lancer: (_, demande) => new Promise((rendre) => void demandes.push({ demande, rendre })),
      surDesinstalle: (nom) => void desinstalles.push(nom),
    });
    const calculus: Projet = { nom: "calculus", dossier: "/projets/calculus", box: { hote: "box" } };
    return { retraits, demandes, desinstalles, calculus };
  }
  const PLAN: Rendu = { etat: "plan", journal: { garde: ETAT, retire: null }, obtenu: "le plan" };
  const FAIT: Rendu = { etat: "desinstalle", journal: { garde: ETAT, retire: null }, obtenu: "retiré" };

  test("le plan demandé se dit en cours, et ne se double pas : deux clics, une seule demande à la box", async () => {
    const { retraits, demandes, calculus } = tenue();

    const premier = retraits.planifier(calculus);
    const second = retraits.planifier(calculus);

    const enCours = geste(retraits.etat(calculus));
    assert.equal(enCours.plan?.etat, "en-cours");
    assert.match(enCours.planifierRefuse ?? "", /^The plan has been requested/);
    assert.match(enCours.desinstallerRefuse ?? "", /^No uninstall: the station has not yet said/);
    assert.equal(demandes.length, 1);
    demandes[0]?.rendre(PLAN);
    assert.equal(geste(await premier).plan?.etat, "plan");
    assert.equal(geste(await second).plan?.etat, "plan");
  });

  test("la case changée pendant que le plan est en route : ce plan-là n'est plus à personne", async () => {
    const { retraits, demandes, calculus } = tenue();
    const demande = retraits.planifier(calculus);

    retraits.direJournal(calculus, true);
    demandes[0]?.rendre(PLAN);

    const pose = geste(await demande);
    assert.equal(pose.plan, undefined);
    assert.equal(pose.journal.coche, true);
    assert.match(pose.desinstallerRefuse ?? "", /^No uninstall/);
  });

  test("la désinstallation en route se dit en cours, ne se double pas, et ne laisse ni changer la case ni redemander le plan", async () => {
    const { retraits, demandes, desinstalles, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;

    const premier = retraits.desinstaller(calculus, "calculus");
    const second = retraits.desinstaller(calculus, "calculus");

    const enCours = geste(retraits.etat(calculus));
    assert.equal(enCours.issue?.etat, "en-cours");
    assert.match(enCours.desinstallerRefuse ?? "", /^The uninstall is under way/);
    assert.match(enCours.planifierRefuse ?? "", /^The uninstall is under way/);
    assert.match(enCours.journal.refus ?? "", /^The uninstall is under way/);
    // La case ne bouge pas sous une désinstallation partie avec l'autre réglage.
    assert.equal(geste(retraits.direJournal(calculus, true)).journal.coche, false);
    await retraits.planifier(calculus);
    assert.deepEqual(demandes.map(({ demande }) => demande), [{ plan: true, journal: false }, { plan: false, confirmation: "calculus", journal: false }]);
    demandes[1]?.rendre(FAIT);
    assert.equal(geste(await premier).issue?.etat, "desinstalle");
    assert.equal(geste(await second).issue?.etat, "desinstalle");
    assert.deepEqual(desinstalles, ["calculus"]);
  });

  test("une désinstallation arrêtée en chemin dont le code s'est perdu se reconnaît à son motif : pas un refus sans effet, et le plan ne vaut plus", async () => {
    const { retraits, demandes, desinstalles, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;
    const desinstalle = retraits.desinstaller(calculus, "calculus");

    demandes[1]?.rendre({ etat: "refuse", motif: "echec", code: null, obtenu: "arrêtée là" });

    const pose = geste(await desinstalle);
    assert.equal(pose.issue?.etat, "inachevee");
    assert.doesNotMatch(texte(pose.issue), /nothing is removed/);
    assert.equal(pose.plan, undefined);
    assert.deepEqual(desinstalles, []);
  });

  test("rejouée sur un projet déjà désinstallé, une désinstallation qui n'aboutit pas ne l'en dédit pas — mais l'app ne dit plus savoir où est son journal", async () => {
    const { retraits, demandes, desinstalles, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;
    const desinstalle = retraits.desinstaller(calculus, "calculus");
    demandes[1]?.rendre(FAIT);
    await desinstalle;
    assert.match(retraits.vu(calculus).desinstalle?.lignes.join("\n") ?? "", /The project's log still exists on the station/);

    // Le chef veut aussi supprimer le journal : le plan, la confirmation — et `ssh` est arrêté au délai.
    retraits.direJournal(calculus, true);
    const replanifie = retraits.planifier(calculus);
    demandes[2]?.rendre({ etat: "plan", journal: { garde: null, retire: ETAT }, obtenu: "le plan" });
    await replanifie;
    const rejouee = retraits.desinstaller(calculus, "calculus");
    demandes[3]?.rendre({ etat: "sans-reponse", obtenu: "ssh arrêté" });
    const pose = geste(await rejouee);

    assert.equal(pose.issue?.etat, "sans-reponse");
    assert.match(texte(pose.issue), /This project is still reported as uninstalled — it already was/);
    assert.doesNotMatch(texte(pose.issue), /does not report this project as uninstalled/);
    const vu = retraits.vu(calculus);
    assert.equal(vu.box, undefined);
    assert.match(vu.desinstalle?.lignes.join("\n") ?? "", /The app no longer knows where its log stands/);
    assert.doesNotMatch(vu.desinstalle?.lignes.join("\n") ?? "", /still exists/);
    // La vue est prévenue les deux fois : ce que l'app dit du projet a changé.
    assert.deepEqual(desinstalles, ["calculus", "calculus"]);
  });

  test("la réponse d'une box quittée entre-temps ne prend la place de rien : le projet, sur sa nouvelle box, garde ce qui y est tenu", async () => {
    const { retraits, demandes, calculus } = tenue();
    const demande = retraits.planifier(calculus);
    const ailleurs: Projet = { ...calculus, box: { hote: "autre-box" } };
    // Le fichier change pendant que la première box répond : sur l'autre, le chef a coché l'option.
    retraits.direJournal(ailleurs, true);

    demandes[0]?.rendre(PLAN);
    await demande;

    const pose = geste(retraits.etat(ailleurs));
    assert.equal(pose.hote, "autre-box");
    assert.equal(pose.journal.coche, true);
    assert.equal(pose.plan, undefined);
  });

  test("tant que la box n'a pas répondu de sa désinstallation, le projet ne se retire pas de l'app : sa réponse n'aurait plus où se lire", async () => {
    const { retraits, demandes, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;
    const desinstalle = retraits.desinstaller(calculus, "calculus");

    const retenu = retraits.retirerDeLApp(calculus);

    assert.deepEqual(retenu, { refus: "Not removed — its uninstall from station “box” is under way: wait for what the station says, then remove it from the app." });
    demandes[1]?.rendre(FAIT);
    await desinstalle;
    // La box a répondu : il se retire, et l'avis dit ce qu'il en était.
    const retire = retraits.retirerDeLApp(calculus);
    assert.ok("avis" in retire);
    assert.deepEqual(retire.avis.lignes, ["It had been uninstalled from station “box”: only what it said it keeps remains there."]);
    assert.equal(retraits.vu(calculus), calculus);
  });

  test("le projet change de box : ni le plan, ni le « désinstallé » obtenus de l'autre ne valent ici", async () => {
    const { retraits, demandes, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;
    const desinstalle = retraits.desinstaller(calculus, "calculus");
    demandes[1]?.rendre(FAIT);
    await desinstalle;
    assert.equal(retraits.vu(calculus).box, undefined);

    const ailleurs: Projet = { ...calculus, box: { hote: "autre-box" } };

    assert.equal(retraits.vu(ailleurs), ailleurs);
    const pose = geste(retraits.etat(ailleurs));
    assert.equal(pose.hote, "autre-box");
    assert.equal(pose.plan, undefined);
    assert.equal(pose.issue, undefined);
  });

  test("le projet a quitté la liste : rien n'est gardé de sa désinstallation", async () => {
    const { retraits, demandes, calculus } = tenue();
    const planifie = retraits.planifier(calculus);
    demandes[0]?.rendre(PLAN);
    await planifie;
    const desinstalle = retraits.desinstaller(calculus, "calculus");
    demandes[1]?.rendre(FAIT);
    await desinstalle;

    retraits.oublier("calculus");

    assert.equal(retraits.vu(calculus), calculus);
    assert.equal(geste(retraits.etat(calculus)).issue, undefined);
  });

  test("un projet sans box ne demande rien à personne : ni plan, ni désinstallation", async () => {
    const { retraits, demandes } = tenue();
    const parade: Projet = { nom: "parade", dossier: "/projets/parade" };

    assert.equal((await retraits.planifier(parade)).desinstaller.geste, undefined);
    assert.equal((await retraits.desinstaller(parade, "parade")).desinstaller.geste, undefined);
    assert.equal(retraits.direJournal(parade, true).desinstaller.geste, undefined);
    assert.equal(demandes.length, 0);
  });
});
