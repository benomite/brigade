// La désinstallation d'un projet par le geste de la box :
// `brigade-installer uninstall <projet> --plan` dit ce qui serait retiré sans
// rien modifier, `--confirmer <projet>` le retire — et le journal du projet
// survit, sauf `--supprimer-le-journal`. Ni root, ni systemd, ni GitHub ici :
// la box d'essai (`aides/box.ts`), où chaque projet est d'abord installé par
// le geste lui-même.
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../src/appel.ts";
import { lireRetrait, type Plan } from "../src/desinstallateur.ts";
import { principal as sousLeCompte } from "../src/desinstaller-sous-le-compte.ts";
import { CODES, Refus } from "../src/installateur.ts";
import { BOX } from "../src/installateur-cli.ts";
import { prendreVerrou } from "../src/verrou.ts";
import { boite, COMPTE, DEPLOIEMENT, PREMIER_PORT, type Boite, type Rendu } from "./aides/box.ts";
import { BASE, git, lancer } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const TIENT_VERROU = join(import.meta.dirname, "aides/tient-verrou.ts");
const HISTOIRE = "l'histoire de la cuisine\n";

// Une box où ces projets viennent d'être installés par le geste.
async function installee(t: TestContext, ...projets: string[]): Promise<Boite> {
  const b = boite(t);
  for (const projet of projets.length === 0 ? ["calculus"] : projets) {
    b.pousser(`acme/${projet}`);
    const rendu = await b.geste(b.demande(projet));
    assert.equal(rendu.code, 0, rendu.erreur);
  }
  return b;
}

// Ce qu'un projet servi porte de plus qu'un projet tout juste installé : son
// journal, son verrou, les flux de ses cooks, un worktree, les versions que la
// bascule lui a posées et leur drop-in, et une cadence de sauvegarde à lui.
function servir(b: Boite, projet = "calculus"): void {
  const etat = join(b.etats, projet);
  writeFileSync(join(etat, "log.db"), HISTOIRE);
  prendreVerrou(etat).relacher();
  mkdirSync(join(etat, "runs/12"), { recursive: true });
  writeFileSync(join(etat, "runs/12/flux.jsonl"), '{"type":"result"}\n');
  git(join(etat, "depot"), "worktree", "add", "-q", "-b", "cook/a", join(etat, "worktrees/a"), `origin/${BASE}`);
  // Un fichier suivi dont la date a bougé sans que son contenu change : ce que
  // `git status` rafraîchirait dans l'index du clone, s'il s'y autorisait.
  utimesSync(join(etat, "depot/CLAUDE.md"), new Date(0), new Date(0));
  mkdirSync(join(b.versions, projet, "abc1234/runtime"), { recursive: true });
  writeFileSync(join(b.versions, projet, "abc1234/runtime/package.json"), "{}\n");
  symlinkSync("abc1234", join(b.versions, projet, "en-service"));
  writeFileSync(join(b.unites, `brigade@${projet}.service.d/code.conf`), `[Service]\nWorkingDirectory=${join(b.versions, projet, "en-service/runtime")}\n`);
  mkdirSync(join(b.unites, `brigade-sauvegarde@${projet}.timer.d`));
  writeFileSync(join(b.unites, `brigade-sauvegarde@${projet}.timer.d/override.conf`), "[Timer]\nOnCalendar=\nOnCalendar=*-*-* 04:00:00\n");
}

const retire = (rendu: Rendu) => rendu.json.retire as Plan["retire"];
const garde = (rendu: Rendu) => rendu.json.garde as Plan["garde"];
const dropIns = (b: Boite, projet: string, ...unites: string[]) => unites.map((unite) => join(b.unites, `${unite.replace("@", `@${projet}`)}.d`));
// Ce que `systemctl` a reçu depuis `rang`, hors lectures.
const gestes = (b: Boite, rang = 0) => b.appels().slice(rang).filter((appel) => !appel.startsWith("show "));
// La photo d'une box, sans ce qui vit sous ces chemins.
const sans = (photo: Record<string, string>, chemins: string[]) => Object.fromEntries(Object.entries(photo).filter(([chemin]) => !chemins.some((retire) => chemin === retire || chemin.startsWith(`${retire}/`))));

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("le plan d'une désinstallation", { concurrency: 8 }, () => {
  test("`--plan` liste ce qui serait retiré — unités, drop-ins, clone, worktrees, versions, port — et ne modifie rien sur la box", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t, "calculus", "boutique");
    servir(b);
    const [etat, avant, rang] = [join(b.etats, "calculus"), b.photo(), b.appels().length];

    const rendu = await b.geste(["uninstall", "calculus", "--plan"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(rendu.json, {
      ok: true,
      action: "uninstall",
      fait: "plan",
      projet: "calculus",
      retire: {
        // Le runtime n'a jamais été démarré : systemd n'a rien à en arrêter.
        unites: [
          { unite: "brigade-sauvegarde@calculus.timer", enMarche: true },
          { unite: "brigade-porte@calculus.service", enMarche: true },
        ],
        dropIns: dropIns(b, "calculus", "brigade@.service", "brigade-sauvegarde@.service", "brigade-sauvegarde@.timer", "brigade-porte@.service"),
        clone: join(etat, "depot"),
        worktrees: 1,
        versions: join(b.versions, "calculus"),
        ports: [PREMIER_PORT],
        journal: null,
      },
      garde: { journal: etat, sauvegardes: join(b.sauvegardes, "calculus") },
      perdus: [],
      aSavoir: [],
    });
    // La box est, à l'octet près, celle d'avant — et systemd n'a rien reçu qu'une lecture.
    assert.deepEqual(b.photo(), avant);
    assert.deepEqual(gestes(b, rang), []);

    // Ce qu'un humain en lit : la liste, ce qui est gardé, et comment le faire.
    const lignes = rendu.erreur.split("\n");
    assert.equal(lignes[0], "brigade-installer : désinstaller « calculus » retirerait de cette box :");
    for (const attendu of [
      /^  unité {10}brigade-porte@calculus\.service — arrêtée et désactivée : elle tourne$/,
      new RegExp(`^  drop-ins {7}${join(b.unites, "brigade@calculus.service.d")}$`),
      new RegExp(`^  clone réservé {2}${join(etat, "depot")}$`),
      /^  worktrees {6}1 worktree de cook$/,
      new RegExp(`^  versions {7}${join(b.versions, "calculus")} `),
      new RegExp(`^  port {11}${PREMIER_PORT} — libéré : la box peut le réattribuer$`),
    ]) {
      assert.equal(lignes.filter((ligne) => attendu.test(ligne)).length, 1, `${attendu}\n${rendu.erreur}`);
    }
    assert.match(rendu.erreur, new RegExp(`\nGardé :\n  journal {8}${etat} — .*Seul \`--supprimer-le-journal\` le retire\n  sauvegardes {4}${join(b.sauvegardes, "calculus")} — ce geste n'y touche jamais\n`));
    assert.equal(lignes.at(-1), "Rien n'a changé sur la box. Pour le faire : `sudo brigade-installer uninstall calculus --confirmer calculus`");
  });

  test("le journal du projet : gardé par défaut, retiré par `--supprimer-le-journal` — le plan le dit dans les deux cas, et ne change rien", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    const [etat, avant] = [join(b.etats, "calculus"), b.photo()];

    const [defaut, explicite] = [await b.geste(["uninstall", "calculus", "--plan"]), await b.geste(["uninstall", "calculus", "--plan", "--supprimer-le-journal"])];

    assert.deepEqual([defaut.code, explicite.code], [0, 0], `${defaut.erreur}\n${explicite.erreur}`);
    assert.deepEqual({ retire: retire(defaut).journal, garde: garde(defaut).journal }, { retire: null, garde: etat });
    assert.match(defaut.erreur, new RegExp(`\nGardé :\n  journal {8}${etat} `));
    assert.deepEqual({ retire: retire(explicite).journal, garde: garde(explicite).journal }, { retire: etat, garde: null });
    assert.match(explicite.erreur, new RegExp(`\n  journal {8}${etat} — l'état du projet, son journal compris : supprimé, sans retour \\(\`--supprimer-le-journal\`\\)\nGardé :\n  sauvegardes `));
    assert.match(explicite.erreur, /Pour le faire : `sudo brigade-installer uninstall calculus --confirmer calculus --supprimer-le-journal`$/);
    // Hors le journal, les deux plans disent la même chose.
    assert.deepEqual({ ...retire(explicite), journal: null }, retire(defaut));
    assert.deepEqual(b.photo(), avant);
  });

  test("ce que le clone porte et que l'origine n'a pas est nommé, et le plan dit que la désinstallation refusera", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    writeFileSync(join(b.etats, "calculus/depot/brouillon.txt"), "en cours\n");
    const avant = b.photo();

    const rendu = await b.geste(["uninstall", "calculus", "--plan"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(rendu.json.perdus, [`uncommitted in ${join(b.etats, "calculus/depot")}: brouillon.txt`]);
    assert.match((rendu.json.aSavoir as string[]).join("\n"), /la désinstallation refuse tant qu'il en reste/);
    assert.match(rendu.erreur, /Ce que le clone porte et que l'origine n'a pas :\n {2}uncommitted in .*: brouillon\.txt\n/);
    assert.deepEqual(b.photo(), avant);
  });

  test("un clone qui porte des centaines de fichiers jamais poussés : le plan en nomme deux cents, et compte le reste", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    for (let rang = 0; rang < 205; rang++) writeFileSync(join(b.etats, "calculus/depot", `brouillon-${String(rang).padStart(3, "0")}.txt`), "en cours\n");

    const rendu = await b.geste(["uninstall", "calculus", "--plan"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    const perdus = rendu.json.perdus as string[];
    assert.equal(perdus.length, 201);
    assert.match(perdus[199] ?? "", /brouillon-199\.txt$/);
    assert.equal(perdus[200], "… et 5 de plus");
  });

  test("un runtime qui tourne : le plan dit qu'il sera arrêté, et que son clone ne s'inventorie qu'ensuite", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    b.demarrer("brigade@calculus.service");
    const avant = b.photo();

    const rendu = await b.geste(["uninstall", "calculus", "--plan"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(retire(rendu).unites[0], { unite: "brigade@calculus.service", enMarche: true });
    assert.deepEqual({ clone: retire(rendu).clone, worktrees: retire(rendu).worktrees }, { clone: join(b.etats, "calculus/depot"), worktrees: null });
    assert.match((rendu.json.aSavoir as string[]).join("\n"), /le runtime du projet tourne : il est arrêté d'abord, et ses cooks avec lui/);
    assert.match(rendu.erreur, /\n {2}worktrees {6}ceux de ses cooks — comptés une fois le runtime arrêté\n/);
    assert.deepEqual(b.photo(), avant);
  });
});

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("désinstaller un projet", { concurrency: 8 }, () => {
  test("sans confirmation : rien n'est effacé, et le geste dit comment confirmer", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    const [avant, rang] = [b.photo(), b.appels().length];

    const nue = await b.geste(["uninstall", "calculus"]);
    const avecLeJournal = await b.geste(["uninstall", "calculus", "--supprimer-le-journal"]);
    const autre = await b.geste(["uninstall", "calculus", "--confirmer", "boutique"]);

    for (const rendu of [nue, avecLeJournal, autre]) {
      assert.equal(rendu.code, CODES.sansConfirmation, rendu.erreur);
      assert.deepEqual({ ok: rendu.json.ok, ecrit: rendu.json.ecrit }, { ok: false, ecrit: false });
      assert.match(rendu.erreur, /^brigade-installer : rien n'est retiré : /);
    }
    assert.equal(nue.json.motif, "sans-confirmation");
    assert.match(nue.erreur, /désinstaller « calculus » se confirme en le nommant — `sudo brigade-installer uninstall calculus --confirmer calculus` ; `--plan` dit d'abord ce qui serait retiré$/);
    assert.match(avecLeJournal.erreur, /`sudo brigade-installer uninstall calculus --confirmer calculus --supprimer-le-journal`/);
    assert.equal(autre.json.motif, "confirmation-d-un-autre");
    assert.match(autre.erreur, /la confirmation nomme « boutique », pas « calculus »/);
    assert.deepEqual(b.photo(), avant);
    assert.deepEqual(gestes(b, rang), []);
  });

  test("confirmée par le nom du projet : elle retire ce que le plan listait, et rien d'autre — le journal reste, les autres projets aussi", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t, "calculus", "boutique");
    servir(b);
    const etat = join(b.etats, "calculus");
    const plan = await b.geste(["uninstall", "calculus", "--plan"]);
    const [avant, rang] = [b.photo(), b.appels().length];

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual({ ok: rendu.json.ok, action: rendu.json.action, fait: rendu.json.fait, projet: rendu.json.projet }, { ok: true, action: "uninstall", fait: "desinstalle", projet: "calculus" });
    assert.deepEqual(retire(rendu), retire(plan));
    assert.deepEqual(garde(rendu), garde(plan));
    assert.match(rendu.erreur, /^brigade-installer : « calculus » est désinstallé de cette box — retiré :\n/);

    // Chaque chose que le plan listait n'y est plus…
    const retires = [...retire(plan).dropIns, retire(plan).clone as string, join(etat, "worktrees"), retire(plan).versions as string];
    for (const chemin of retires) assert.equal(lstatSync(chemin, { throwIfNoEntry: false }), undefined, chemin);
    assert.deepEqual(gestes(b, rang), ["disable --now brigade-sauvegarde@calculus.timer", "disable --now brigade-porte@calculus.service", "daemon-reload"]);
    assert.deepEqual(b.actives(), ["brigade-sauvegarde@boutique.timer", "brigade-porte@boutique.service"]);
    // … et tout le reste de la box est tel qu'il était : le journal du projet,
    // ses flux, ses sauvegardes, et l'autre projet en entier.
    const actives = join(b.racine, "temoin/actives");
    assert.deepEqual(b.photo(), { ...sans(avant, retires), [actives]: b.photo()[actives] });
    assert.equal(readFileSync(join(etat, "log.db"), "utf8"), HISTOIRE);
    assert.ok(existsSync(join(etat, "runs/12/flux.jsonl")));
    assert.ok(lstatSync(join(b.sauvegardes, "calculus")).isDirectory());
    assert.ok(existsSync(join(b.etats, "boutique/depot/.git")));
  });

  test("le journal n'est supprimé qu'avec `--supprimer-le-journal` : l'état part alors avec le projet, pas ses sauvegardes", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t, "calculus", "boutique");
    servir(b);
    const etat = join(b.etats, "calculus");
    const avant = b.photo();

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus", "--supprimer-le-journal"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual({ retire: retire(rendu).journal, garde: garde(rendu).journal }, { retire: etat, garde: null });
    assert.equal(lstatSync(etat, { throwIfNoEntry: false }), undefined);
    const actives = join(b.racine, "temoin/actives");
    assert.deepEqual(b.photo(), { ...sans(avant, [...retire(rendu).dropIns, etat, join(b.versions, "calculus")]), [actives]: b.photo()[actives] });
    assert.ok(lstatSync(join(b.sauvegardes, "calculus")).isDirectory());
    assert.equal((b.journal().at(-1)?.payload as { journal: string }).journal, "removed");
  });

  test("les ports du projet désinstallé redeviennent attribuables : le projet suivant reçoit le sien", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t, "calculus", "boutique");
    b.pousser("acme/atelier");

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);
    const suivant = await b.geste(b.demande("atelier"));

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(retire(rendu).ports, [PREMIER_PORT]);
    assert.equal(suivant.code, 0, suivant.erreur);
    // `boutique` tient toujours le second.
    assert.deepEqual(suivant.json.ports, { porte: PREMIER_PORT, arbitre: null });
  });

  test("un projet désinstallé se réinstalle sur son journal, et une désinstallation rejouée ne trouve plus rien", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    assert.equal((await b.geste(["uninstall", "calculus", "--confirmer", "calculus"])).code, 0);
    const [avant, rang] = [b.photo(), b.appels().length];

    // Son état est encore là : la box le connaît, et n'a plus rien à en retirer.
    const rejouee = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);
    assert.equal(rejouee.code, 0, rejouee.erreur);
    assert.match(rejouee.erreur, /^brigade-installer : il ne reste rien de « calculus » à retirer de cette box\nGardé :\n {2}journal /);
    assert.deepEqual(b.photo(), avant);
    assert.deepEqual(gestes(b, rang), []);

    const reinstalle = await b.geste(b.demande());
    assert.equal(reinstalle.code, 0, reinstalle.erreur);
    assert.equal(readFileSync(join(b.etats, "calculus/log.db"), "utf8"), HISTOIRE);

    // Son journal retiré avec lui, la box ne le connaît plus.
    assert.equal((await b.geste(["uninstall", "calculus", "--confirmer", "calculus", "--supprimer-le-journal"])).code, 0);
    assert.equal((await b.geste(["uninstall", "calculus", "--plan"])).code, CODES.inconnu);
  });

  test("un runtime qui tourne est arrêté d'abord, puis son clone retiré", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    b.demarrer("brigade@calculus.service");
    const rang = b.appels().length;

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(gestes(b, rang), ["disable --now brigade@calculus.service", "disable --now brigade-sauvegarde@calculus.timer", "disable --now brigade-porte@calculus.service", "daemon-reload"]);
    assert.deepEqual(b.actives(), []);
    // Comptés une fois le runtime arrêté.
    assert.deepEqual({ clone: retire(rendu).clone, worktrees: retire(rendu).worktrees }, { clone: join(b.etats, "calculus/depot"), worktrees: 1 });
    assert.ok(!existsSync(join(b.etats, "calculus/depot")));
    assert.equal(readFileSync(join(b.etats, "calculus/log.db"), "utf8"), HISTOIRE);
  });
});

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("ce que la désinstallation refuse, sans rien modifier sur la box", { concurrency: 8 }, () => {
  // Chaque refus : un code non nul, un message, et la box telle qu'elle était.
  async function refuse(b: Boite, args: string[], motif: string, message: RegExp, code: number = CODES.usage): Promise<void> {
    const [avant, rang] = [b.photo(), b.appels().length];
    const rendu = await b.geste(args);
    assert.equal(rendu.code, code, `${args.join(" ")} : ${rendu.erreur}`);
    assert.deepEqual({ ok: rendu.json.ok, action: rendu.json.action, motif: rendu.json.motif, ecrit: rendu.json.ecrit }, { ok: false, action: "uninstall", motif, ecrit: false }, args.join(" "));
    assert.match(rendu.erreur, message);
    assert.match(rendu.erreur, /^brigade-installer : /);
    assert.deepEqual(b.photo(), avant, args.join(" "));
    assert.deepEqual(gestes(b, rang), []);
  }
  const FORMES = [["--plan"], [], ["--confirmer", "fantome"], ["--confirmer", "fantome", "--supprimer-le-journal"]];

  test("un projet inconnu de la box : un message clair, sous toutes les formes de l'appel", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t, "calculus", "boutique");
    for (const forme of FORMES) {
      await refuse(b, ["uninstall", "fantome", ...forme], "projet-inconnu", /le projet « fantome » n'est pas connu de cette box : ni drop-in sous .*, ni état sous .* — rien n'est fait, rien n'a changé\. Elle porte : boutique, calculus$/, CODES.inconnu);
    }
    const vide = boite(t);
    await refuse(vide, ["uninstall", "calculus", "--plan"], "projet-inconnu", /Elle ne porte aucun projet$/, CODES.inconnu);
  });

  test("tout ce qui n'est pas dans sa liste fermée : une option d'ailleurs, un chemin, une valeur en trop", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    const appel = (...options: string[]) => ["uninstall", "calculus", ...options];
    await refuse(b, appel("--plan", "--confirmer", "calculus"), "plan-et-confirmation", /--plan ne retire rien, il ne se confirme pas/);
    await refuse(b, appel("--confirmer"), "valeur-manquante", /--confirmer attend le nom du projet : `--confirmer calculus`/);
    await refuse(b, appel("--confirmer", "--supprimer-le-journal"), "valeur-manquante", /--confirmer attend le nom du projet/);
    await refuse(b, appel("--plan", "--plan"), "option-en-double", /--plan est donnée deux fois/);
    await refuse(b, appel("--confirmer", "calculus", "calculus"), "argument-en-trop", /argument en trop : « calculus »/);
    for (const option of ["--exec", "--force", "--etat", "--clone", "--depot", "--sauvegardes", "--supprimer-les-sauvegardes", "--journal", "-y", "--confirmer=calculus"]) {
      await refuse(b, appel("--confirmer", "calculus", option), "option-inconnue", /option inconnue : « .* » — celles de la désinstallation : --plan, --confirmer, --supprimer-le-journal$/);
      await refuse(b, appel(option, "/var/lib/brigade", "--confirmer", "calculus"), "option-inconnue", /option inconnue/);
    }
    for (const projet of ["../calculus", "calculus/depot", "/var/lib/brigade/calculus", "Calculus", "calculus.service", "*"]) {
      await refuse(b, ["uninstall", projet, "--confirmer", projet], "projet-hors-motif", /nom de projet hors motif/);
    }
    await refuse(b, ["uninstall"], "projet-manquant", /il manque le projet\nusage : sudo brigade-installer uninstall <projet> --plan/);
    assert.throws(() => lireRetrait(b.demande()), Refus);
    assert.deepEqual(lireRetrait(appel("--supprimer-le-journal", "--confirmer", "calculus")), { projet: "calculus", plan: false, confirmation: "calculus", journal: true });
  });

  test("un clone qui porte ce que l'origine n'a pas retient la désinstallation confirmée — avec ou sans le journal", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    writeFileSync(join(b.etats, "calculus/worktrees/a/travail.txt"), "en cours\n");
    for (const journal of [[], ["--supprimer-le-journal"]]) {
      await refuse(b, ["uninstall", "calculus", "--confirmer", "calculus", ...journal], "travail-jamais-pousse", /le clone de « calculus » porte ce que l'origine n'a pas .* rien n'est retiré :\n {2}uncommitted in .*worktrees\/a: travail\.txt$/, CODES.retenu);
    }
  });

  test("un clone qui contient l'état n'est jamais supprimé : la garantie du runtime retient le geste, plan compris", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    const etat = join(b.etats, "calculus");
    writeFileSync(join(etat, "log.db"), HISTOIRE);
    // Le clone réservé désigne, par un lien, le répertoire d'état lui-même.
    rmSync(join(etat, "depot"), { recursive: true });
    git(etat, "init", "-q");
    symlinkSync(".", join(etat, "depot"));
    for (const forme of [["--plan"], ["--confirmer", "calculus"], ["--confirmer", "calculus", "--supprimer-le-journal"]]) {
      await refuse(b, ["uninstall", "calculus", ...forme], "retenu-par-le-runtime", /la désinstallation du runtime refuse — the state directory .* is inside the clone .*: removing it would take the log with it — nothing is removed$/, CODES.retenu);
    }
    assert.equal(readFileSync(join(etat, "log.db"), "utf8"), HISTOIRE);
  });

  test("un répertoire qui n'est pas un clone n'est pas pris pour le clone réservé", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    const depot = join(b.etats, "calculus/depot");
    rmSync(depot, { recursive: true });
    mkdirSync(depot);
    writeFileSync(join(depot, "important.txt"), "à garder\n");
    await refuse(b, ["uninstall", "calculus", "--confirmer", "calculus"], "retenu-par-le-runtime", /is not a git clone: nothing is removed$/, CODES.retenu);
  });

  test("ce que root retirerait lui-même et qui contient l'état du projet n'est jamais retiré", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    const [avant, etat] = [b.photo(), join(b.etats, "calculus")];
    // Une box dont les versions de la bascule vivraient là où vivent les états.
    for (const forme of [["--plan"], ["--confirmer", "calculus"], ["--confirmer", "calculus", "--supprimer-le-journal"]]) {
      const rendu = await b.geste(["uninstall", "calculus", ...forme], { box: { versions: b.etats } });
      assert.equal(rendu.code, CODES.retenu, rendu.erreur);
      assert.equal(rendu.json.motif, "etat-dedans");
      assert.match(rendu.erreur, new RegExp(`${etat} contient l'état du projet \\(${etat}\\) : le retirer emporterait le journal — rien n'est retiré$`));
    }
    assert.deepEqual(b.photo(), avant);
  });

  test("un runtime lancé hors de systemd tient encore le projet : rien n'est retiré", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    // Dans son process à lui : relire `lock.db` d'ici, pour la photo, rendrait
    // le verrou que ce process-ci tiendrait.
    await lancer(t, TIENT_VERROU, [join(b.etats, "calculus")]).attendre("tenu");
    for (const forme of [["--plan"], ["--confirmer", "calculus"]]) {
      await refuse(b, ["uninstall", "calculus", ...forme], "retenu-par-le-runtime", /the project's runtime is still running on .*: stop it first — nothing is removed$/, CODES.retenu);
    }
    // Ce qui la retiendrait ne cache pas, à qui ne l'a pas confirmée, comment le faire.
    await refuse(b, ["uninstall", "calculus"], "sans-confirmation", /se confirme en le nommant/, CODES.sansConfirmation);
  });

  test("ce qui est au compte du service ne se lit ni ne se retire que sous lui : sans pouvoir prendre son uid, rien n'est fait", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits) (this test uses a shell script of its own, POSIX mode bits, uids); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    if (process.getuid?.() === 0) return t.skip("la suite est jouée en root : prendre l'uid d'un autre compte y réussit");
    const b = await installee(t);
    servir(b);
    // Le compte du service est un autre que celui qui joue la suite.
    const getent = join(b.racine, "bin/getent-d-un-autre");
    writeFileSync(getent, `#!/bin/sh\necho "${COMPTE}:x:${(process.getuid?.() ?? 0) + 1}:${(process.getgid?.() ?? 0) + 1}::${b.home}:/bin/sh"\n`, { mode: 0o755 });
    const avant = b.photo();
    for (const forme of [["--plan"], ["--confirmer", "calculus"], ["--confirmer", "calculus", "--supprimer-le-journal"]]) {
      const rendu = await b.geste(["uninstall", "calculus", ...forme], { box: { getent } });
      assert.equal(rendu.code, CODES.boxPasPrete, rendu.erreur);
      assert.match(rendu.erreur, /la désinstallation du runtime, lancée sous le compte « cuisine », n'a pas répondu \(elle rend null\) : spawn E(PERM|INVAL) — rien n'est fait$/);
    }
    assert.deepEqual(b.photo(), avant);
  });

  test("un drop-in qui est un lien, ou un projet que ses unités posent ailleurs : le geste ne suit aucun chemin", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    const ailleurs = join(b.racine, "ailleurs");
    mkdirSync(ailleurs);
    writeFileSync(join(ailleurs, "important.txt"), "à garder\n");

    const lien = join(b.unites, "brigade-sauvegarde@calculus.timer.d");
    symlinkSync(ailleurs, lien);
    await refuse(b, ["uninstall", "calculus", "--confirmer", "calculus"], "repertoire-douteux", /brigade-sauvegarde@calculus\.timer\.d ne se retire pas : .*brigade-sauvegarde@calculus\.timer\.d est un lien — ce geste ne retire, en root, que ce que root tient seul ; rien n'est fait$/, CODES.boxPasPrete);
    rmSync(lien);

    writeFileSync(join(b.unites, "brigade@calculus.service.d/zz-ailleurs.conf"), `[Service]\nEnvironment=BRIGADE_REPO_DIR=${ailleurs}\n`);
    await refuse(b, ["uninstall", "calculus", "--confirmer", "calculus"], "projet-pose-ailleurs", new RegExp(`les unités de « calculus » le posent ailleurs que ce geste \\(BRIGADE_REPO_DIR=${ailleurs} `), CODES.boxPasPrete);
    assert.equal(readFileSync(join(ailleurs, "important.txt"), "utf8"), "à garder\n");
  });

  test("un autre geste en cours : le plan aussi attend son tour", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    const verrou = prendreVerrou(b.box.journal);
    t.after(() => verrou.relacher());
    await refuse(b, ["uninstall", "calculus", "--plan"], "occupe", /un autre geste d'installation est en cours/, CODES.occupe);
  });
});

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("une désinstallation qui s'arrête en chemin", { concurrency: 8 }, () => {
  test("le runtime arrêté, son clone porte ce que l'origine n'a pas : elle s'arrête là, dit ce qui est fait et ce qui reste, et se rejoue", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    b.demarrer("brigade@calculus.service");
    const brouillon = join(b.etats, "calculus/depot/brouillon.txt");
    writeFileSync(brouillon, "en cours\n");
    const [avant, rang] = [b.photo(), b.appels().length];

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);

    assert.equal(rendu.code, CODES.echec);
    assert.deepEqual({ ok: rendu.json.ok, motif: rendu.json.motif, retires: rendu.json.retires }, { ok: false, motif: "echec", retires: ["brigade@calculus.service (arrêtée, désactivée)"] });
    assert.deepEqual((rendu.json.restes as string[]).slice(0, 2), [`${join(b.etats, "calculus/depot")} (le clone réservé et les worktrees)`, "brigade-sauvegarde@calculus.timer (arrêtée, désactivée)"]);
    assert.equal((rendu.json.restes as string[]).at(-1), "systemctl daemon-reload");
    assert.match(rendu.erreur, /brouillon\.txt — la désinstallation s'est arrêtée là, et se rejoue\. Fait : brigade@calculus\.service \(arrêtée, désactivée\)\. Reste : /);
    // Seul le runtime a été arrêté : tout le reste est là.
    assert.deepEqual(gestes(b, rang), ["disable --now brigade@calculus.service"]);
    const actives = join(b.racine, "temoin/actives");
    assert.deepEqual(b.photo(), { ...avant, [actives]: b.photo()[actives] });
    assert.deepEqual(b.actives(), ["brigade-sauvegarde@calculus.timer", "brigade-porte@calculus.service"]);

    rmSync(brouillon);
    const rejouee = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"]);
    assert.equal(rejouee.code, 0, rejouee.erreur);
    assert.ok(!existsSync(join(b.etats, "calculus/depot")));
  });

  test("coupée avant son premier geste : rien n'est retiré", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    const avant = b.photo();
    const coupe = new AbortController();
    coupe.abort();

    const rendu = await b.geste(["uninstall", "calculus", "--confirmer", "calculus"], { signal: coupe.signal });

    assert.equal(rendu.code, CODES.echec);
    assert.deepEqual(rendu.json.retires, []);
    assert.match(rendu.erreur, /le geste a été interrompu — la désinstallation s'est arrêtée là, et se rejoue\. Rien n'a été retiré\. Reste : /);
    assert.deepEqual(b.photo(), avant);
  });
});

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("le journal du geste, pour une désinstallation", { concurrency: 8 }, () => {
  test("chaque appel — plan, refus, exécution — y ajoute qui, quand, quel projet et quoi", { skip: posixOnly("brigade-installer checks process.getuid() against root, and Windows has no uid (the job refused every gesture with sans-droit, 77); past it, the test box needs #!/bin/sh fakes of systemctl and getent and a root-only journal (lstat uid and mode bits); on the Windows job: brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chef…") }, async (t) => {
    const b = await installee(t);
    servir(b);
    b.demarrer("brigade@calculus.service");
    writeFileSync(join(b.etats, "calculus/depot/brouillon.txt"), "en cours\n");
    const deja = b.journal().length;
    const debut = new Date();

    assert.equal((await b.geste(["uninstall", "calculus", "--plan"], { qui: "benoit" })).code, 0);
    assert.equal((await b.geste(["uninstall", "calculus"], { qui: "associe" })).code, CODES.sansConfirmation);
    assert.equal((await b.geste(["uninstall", "fantome", "--confirmer", "fantome"], { qui: "associe" })).code, CODES.inconnu);
    assert.equal((await b.geste(["uninstall", "calculus", "--exec", "/bin/sh"], { qui: "associe" })).code, CODES.usage);
    assert.equal((await b.geste(["uninstall", "calculus", "--confirmer", "calculus"], { qui: "benoit" })).code, CODES.echec);
    rmSync(join(b.etats, "calculus/depot/brouillon.txt"));
    assert.equal((await b.geste(["uninstall", "calculus", "--confirmer", "calculus"], { qui: "benoit" })).code, 0);

    const fin = new Date();
    const journal = b.journal().slice(deja);
    for (const evenement of journal) assert.ok(debut.toISOString() <= evenement.at && evenement.at <= fin.toISOString(), evenement.at);
    const confirmee = { action: "uninstall", args: ["calculus", "--confirmer", "calculus"] };
    const echec = journal[5]?.payload as { reason: string; left: string[] };
    assert.deepEqual(
      journal.map(({ author, project, type, payload }) => ({ author, project, type, payload })),
      [
        { author: "benoit", project: "calculus", type: "installer.planned", payload: { action: "uninstall", args: ["calculus", "--plan"], result: "planned" } },
        { author: "associe", project: "calculus", type: "installer.refused", payload: { action: "uninstall", args: ["calculus"], result: "refused", reason: "sans-confirmation" } },
        { author: "associe", project: "fantome", type: "installer.refused", payload: { action: "uninstall", args: ["fantome", "--confirmer", "fantome"], result: "refused", reason: "projet-inconnu" } },
        { author: "associe", project: "calculus", type: "installer.refused", payload: { action: "uninstall", args: ["calculus", "--exec", "/bin/sh"], result: "refused", reason: "option-inconnue" } },
        { author: "benoit", project: "calculus", type: "installer.started", payload: { ...confirmee, result: "started" } },
        { author: "benoit", project: "calculus", type: "installer.failed", payload: { ...confirmee, result: "failed", reason: echec.reason, removed: ["brigade@calculus.service (arrêtée, désactivée)"], left: echec.left } },
        { author: "benoit", project: "calculus", type: "installer.started", payload: { ...confirmee, result: "started" } },
        { author: "benoit", project: "calculus", type: "installer.used", payload: { ...confirmee, result: "uninstalled", ports: [PREMIER_PORT], journal: "kept" } },
      ],
    );
    assert.match(echec.reason, /carries what the origin does not have[^]*brouillon\.txt/);
    assert.equal(echec.left[0], `${join(b.etats, "calculus/depot")} (le clone réservé et les worktrees)`);
  });
});

// Chaque test a ses lieux — répertoires, dépôt, GitHub : ils se jouent de front.
describe("ce que la désinstallation lance", { concurrency: 8 }, () => {
  test("le pas joué sous le compte du service n'accepte que `--confirmer`", () => {
    const redit: string[] = [];
    const appel = (args: string[]) => () => sousLeCompte({ args, env: {}, dire: () => assert.fail("rien n'est rendu"), redire: (ligne) => redit.push(ligne) });
    for (const args of [["--plan"], ["--confirmer", "--confirmer"], ["/var/lib/brigade"]]) assert.throws(appel(args), (levee) => levee instanceof Sortie && levee.code === 2);
    assert.equal(redit.length, 3);
  });

  test("les versions d'un projet se retirent là où la bascule les pose : à côté du clone de brigade", () => {
    assert.equal(BOX.versions, `${join(DEPLOIEMENT, "../..")}-versions`);
  });
});
