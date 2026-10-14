// Le geste de mise en service de la box : `brigade-mise-en-service <projet>`
// met à jour le clone de brigade puis bascule le projet, en root, par sa propre
// règle sudoers — et refuse tout le reste sans rien toucher. Ni root, ni
// systemd, ni réseau ici : une box entière sous un répertoire, une origine nue
// pour le clone, et des doublures de `systemctl` et de `id`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { lireCompteRendu } from "../src/version.ts";
import { git, repertoireTemporaire } from "./outils.ts";

const DEPLOIEMENT = join(import.meta.dirname, "../deploy");
const GESTE = join(DEPLOIEMENT, "brigade-mise-en-service");
const BASCULE = join(DEPLOIEMENT, "brigade-bascule");
const FAUX_SYSTEMCTL = join(import.meta.dirname, "aides/fausse-box-systemctl.sh");
const USAGE = 64;
const PROJET_INCONNU = 65;
const SYSTEMD_MUET = 67;
const CLONE_PAS_A_JOUR = 69;
const REVENUE = 73;
const PAS_PREPAREE = 76;
const SANS_DROIT = 77;
const PROJET = "calculus";
const UNITE = `brigade@${PROJET}.service`;
// Le `PATH` que le geste s'écrit : celui qu'une unité reçoit de systemd. La box
// d'essai y met le sien, comme elle met ses chemins dans les unités qu'elle copie.
const CHEMIN_DU_GESTE = "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\n";

const cite = (mot: string) => `'${mot.replaceAll("'", `'\\''`)}'`;

type Rendu = { code: number | null; sortie: string; erreur: string };

type Box = {
  racine: string;
  clone: string;
  // Là où vivent les versions du projet, et son lien `en-service`.
  versions: string;
  // Un commit de plus sur l'origine du clone : un runtime qui démarrera ainsi.
  livrer: (demarrage?: "ok" | "refus") => string;
  // Lance le geste par son lien, comme `sudo` le lancerait — dans
  // l'environnement de celui qui lance, où tout est piégé, et de son répertoire.
  geste: (args: string[], fichier?: string) => Rendu;
  // Le chemin de ce fichier, lu du répertoire de celui qui lance.
  deLa: (fichier: string) => string;
  // Pose le geste (le `PATH` de la box d'essai écrit dedans) dans ce répertoire.
  poser: (repertoire: string) => string;
  // Dès lors, la bascule du clone est la vraie.
  vraieBascule: () => void;
  // Dès lors, la bascule témoin sort avec ce code.
  basculeRend: (code: number) => void;
  // Ce que la bascule témoin a reçu, ou `null` si elle n'a pas été lancée : ses
  // arguments, son environnement, et le commit du clone à ce moment.
  bascule: () => { args: string[]; env: Record<string, string>; commit: string } | null;
  // Dès lors, celui qui lance porte cet uid.
  lancePar: (uid: number) => void;
  // Les appels reçus par `systemctl`, dans l'ordre.
  appels: () => string[];
  // Le commit courant du clone.
  commit: () => string;
  enService: () => string | null;
  // Tout ce que la box porte, hors des appels notés : chaque chemin, et
  // l'empreinte de chaque fichier.
  photo: () => Record<string, string>;
  // Vrai si quoi que ce soit de l'environnement de celui qui lance a servi.
  piege: () => boolean;
};

// Une box installée : le clone de brigade (à root, ici à qui joue la suite), son
// origine, deux projets déclarés (`calculus`, `boutique`), le geste posé par
// son lien. La bascule du clone est un témoin : elle note ce qu'elle reçoit.
function box(t: TestContext): Box {
  const racine = realpathSync(repertoireTemporaire(t));
  const sous = (...noms: string[]) => join(racine, ...noms);
  const [origine, travail, clone, unites, bin, liens, pieges] = [sous("origine.git"), sous("travail"), sous("opt/brigade"), sous("unites"), sous("bin"), sous("usr-local-bin"), sous("pieges")];
  const versions = sous("opt/brigade-versions", PROJET);
  for (const repertoire of [sous("etat", PROJET), bin, liens, pieges, join(unites, `${UNITE}.d`), join(unites, "brigade@boutique.service.d")]) mkdirSync(repertoire, { recursive: true });
  writeFileSync(join(unites, `${UNITE}.d`, "projet.conf"), "[Service]\nEnvironment=BRIGADE_BASE_BRANCH=main\n");
  writeFileSync(join(unites, "brigade@boutique.service.d", "projet.conf"), "[Service]\nEnvironment=BRIGADE_BASE_BRANCH=main\n");
  writeFileSync(join(unites, "brigade@.service"), "le gabarit\n");

  const executable = (chemin: string, lignes: string[]) => {
    writeFileSync(chemin, ["#!/bin/sh", ...lignes, ""].join("\n"));
    chmodSync(chemin, 0o755);
  };
  // Le geste ne passe rien de l'environnement : la doublure de `systemctl` sait
  // d'elle-même où est sa box — et note ce qu'elle en aurait reçu quand même.
  // Comme systemd, elle rend pour toute instance les drop-ins de son gabarit
  // (`compte.conf`, docs/installer.md) : ils ne font pas un projet.
  mkdirSync(join(unites, "brigade@.service.d"));
  writeFileSync(join(unites, "brigade@.service.d/compte.conf"), "[Service]\nUser=cuisine\n");
  executable(join(bin, "systemctl"), [
    `[ -z "\${SUDO_USER+x}\${GIT_DIR+x}" ] || echo "systemctl a reçu l'environnement" >> ${cite(sous("piege"))}`,
    `[ "$1 $2 $3" = "show -p DropInPaths" ] && printf '%s ' ${cite(join(unites, "brigade@.service.d/compte.conf"))}`,
    `FAUSSE_BOX=${cite(racine)} exec ${cite(FAUX_SYSTEMCTL)} "$@"`,
  ]);
  executable(join(bin, "journalctl"), [`echo "journald : $*"`]);
  executable(join(bin, "id"), [`[ "$*" = "-u" ] || exit 1`, `cat ${cite(sous("uid"))}`]);
  writeFileSync(sous("uid"), "0\n");
  // Ce que l'environnement de celui qui lance ferait lancer, s'il était suivi.
  for (const nom of ["git", "systemctl", "id", "env", "realpath", "dirname", "brigade-bascule"]) executable(join(pieges, nom), [`echo "${nom} $*" >> ${cite(sous("piege"))}`, "exit 1"]);
  writeFileSync(sous("charge.sh"), `echo "BASH_ENV" >> ${cite(sous("piege"))}\n`);

  git(racine, "init", "-q", "--bare", "--initial-branch=v2", origine);
  git(racine, "init", "-q", "--initial-branch=v2", travail);
  mkdirSync(join(travail, "runtime/deploy"), { recursive: true });
  mkdirSync(join(travail, "runtime/src"));
  // Le geste et la bascule sont posés dans le clone par la box d'essai, pas livrés.
  writeFileSync(join(travail, ".gitignore"), "brigade-bascule\nbrigade-mise-en-service\n");
  writeFileSync(join(travail, "runtime/deploy/brigade@.service"), "le gabarit\n");
  writeFileSync(join(travail, "runtime/src/main.ts"), "// le runtime\n");
  let livraisons = 0;
  const livrer: Box["livrer"] = (demarrage = "ok") => {
    writeFileSync(join(travail, "runtime/demarrage"), `${demarrage}\n`);
    writeFileSync(join(travail, "runtime/src/version"), `${++livraisons}\n`);
    git(travail, "add", ".");
    git(travail, "commit", "-q", "-m", `livraison ${livraisons}`);
    git(travail, "push", "-q", origine, "v2");
    return git(travail, "rev-parse", "HEAD");
  };
  livrer();
  git(racine, "clone", "-q", "--branch", "v2", origine, clone);

  const chemin = `${bin}:${process.env.PATH ?? ""}`;
  const poser: Box["poser"] = (repertoire) => {
    const source = readFileSync(GESTE, "utf8");
    assert.equal(source.split(CHEMIN_DU_GESTE).length, 2, "le geste écrit son `PATH` une fois, celui de systemd");
    mkdirSync(repertoire, { recursive: true });
    writeFileSync(join(repertoire, "brigade-mise-en-service"), source.replace(CHEMIN_DU_GESTE, `PATH=${cite(chemin)}\n`));
    chmodSync(join(repertoire, "brigade-mise-en-service"), 0o755);
    return join(repertoire, "brigade-mise-en-service");
  };
  // Lancé par son lien, comme sur la box (/usr/local/bin/brigade-mise-en-service).
  symlinkSync(poser(join(clone, "runtime/deploy")), join(liens, "brigade-mise-en-service"));
  executable(join(clone, "runtime/deploy/brigade-bascule"), [
    `{ echo "$#"; for argument; do echo "$argument"; done; } > ${cite(sous("bascule.args"))}`,
    `env > ${cite(sous("bascule.env"))}`,
    `git -C ${cite(clone)} rev-parse HEAD > ${cite(sous("bascule.commit"))}`,
    `echo "la bascule a parlé"`,
    `exit "$(cat ${cite(sous("bascule.code"))} 2>/dev/null || echo 0)"`,
  ]);

  const lire = (fichier: string) => (existsSync(sous(fichier)) ? readFileSync(sous(fichier), "utf8").split("\n").slice(0, -1) : []);
  const voir = (vue: Record<string, string>, fichier: string) => {
    const lu = lstatSync(fichier);
    if (lu.isSymbolicLink()) vue[fichier] = `lien vers ${readlinkSync(fichier)}`;
    else if (lu.isDirectory()) {
      vue[fichier] = "répertoire";
      for (const nom of readdirSync(fichier).sort()) voir(vue, join(fichier, nom));
    } else vue[fichier] = createHash("sha256").update(readFileSync(fichier)).digest("hex");
    return vue;
  };
  return {
    racine,
    clone,
    versions,
    livrer,
    poser,
    geste: (args, fichier = join(liens, "brigade-mise-en-service")) => {
      const fin = spawnSync(fichier, args, {
        encoding: "utf8",
        cwd: pieges,
        env: {
          PATH: `${pieges}:/nulle/part`,
          BASH_ENV: sous("charge.sh"),
          ENV: sous("charge.sh"),
          HOME: "/nulle/part",
          GIT_DIR: "/nulle/part",
          GIT_WORK_TREE: "/nulle/part",
          GIT_SSH_COMMAND: join(pieges, "git"),
          GIT_EXEC_PATH: pieges,
          FAUSSE_BOX: "/nulle/part",
          BRIGADE_BASCULE_GARDE: "une valeur que la bascule refuserait",
          SUDO_USER: "benoit",
        },
      });
      return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
    },
    deLa: (fichier) => relative(pieges, fichier),
    vraieBascule: () => {
      copyFileSync(BASCULE, join(clone, "runtime/deploy/brigade-bascule"));
      chmodSync(join(clone, "runtime/deploy/brigade-bascule"), 0o755);
    },
    basculeRend: (code) => writeFileSync(sous("bascule.code"), `${code}\n`),
    bascule: () => {
      if (!existsSync(sous("bascule.args"))) return null;
      const [nombre, ...args] = lire("bascule.args");
      assert.equal(Number(nombre), args.length, "un argument de la bascule tient sur plusieurs lignes");
      // Ce que le shell du témoin pose de lui-même n'est pas reçu du geste.
      const env = Object.fromEntries(lire("bascule.env").map((ligne) => [ligne.split("=", 1)[0] ?? "", ligne.slice(ligne.indexOf("=") + 1)]).filter(([nom = ""]) => !["PWD", "OLDPWD", "SHLVL", "_"].includes(nom)));
      return { args, env, commit: lire("bascule.commit")[0] ?? "" };
    },
    lancePar: (uid) => writeFileSync(sous("uid"), `${uid}\n`),
    appels: () => lire("appels"),
    commit: () => git(clone, "rev-parse", "HEAD"),
    enService: () => {
      try {
        return readlinkSync(join(versions, "en-service"));
      } catch {
        return null;
      }
    },
    photo: () => {
      const vue = voir({}, racine);
      delete vue[sous("appels")];
      return vue;
    },
    piege: () => existsSync(sous("piege")),
  };
}

describe("la règle sudoers", () => {
  const regles = (fichier: string) => readFileSync(join(DEPLOIEMENT, fichier), "utf8").split("\n").filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"));

  test("elle nomme un seul exécutable, pour le compte que l'unité livrée fait tourner, sans rien lui laisser régler", () => {
    const unite = readFileSync(join(DEPLOIEMENT, "brigade@.service"), "utf8");
    const compte = /^User=(\S+)\s*$/m.exec(unite)?.[1];
    assert.ok(compte !== undefined && /^[a-z_][a-z0-9_-]*$/.test(compte), "l'unité livrée ne nomme pas son compte");
    assert.deepEqual(regles("brigade-mise-en-service.sudoers"), [`${compte} ALL=(root) NOPASSWD: /usr/local/bin/brigade-mise-en-service`]);
  });

  test("le compte de chaque unité livrée est le même, et la règle ne passe par aucun groupe", () => {
    const comptes = readdirSync(DEPLOIEMENT).filter((nom) => nom.endsWith(".service")).map((nom) => /^User=(\S+)\s*$/m.exec(readFileSync(join(DEPLOIEMENT, nom), "utf8"))?.[1]);
    assert.deepEqual([...new Set(comptes)], [comptes[0]]);
    assert.ok(regles("brigade-mise-en-service.sudoers").every((ligne) => !ligne.startsWith("%")));
  });

  test("elle passe `visudo -c -f` sans erreur", (t) => {
    const visudo = ["/usr/sbin/visudo", "/usr/bin/visudo", "/usr/local/sbin/visudo"].find((chemin) => existsSync(chemin));
    if (visudo === undefined) return t.skip("`visudo` n'est pas sur cette machine : la règle n'y est pas éprouvée");
    const juge = spawnSync(visudo, ["-c", "-f", join(DEPLOIEMENT, "brigade-mise-en-service.sudoers")], { encoding: "utf8" });
    assert.equal(juge.status, 0, juge.stderr);
    assert.match(juge.stdout, /parsed OK/);
  });

  test("chaque règle de la box nomme un geste par son chemin entier — ni joker, ni argument, ni shell, ni `ALL` pour commande ou pour compte", () => {
    const fichiers = readdirSync(DEPLOIEMENT).filter((nom) => nom.endsWith(".sudoers")).sort();
    assert.deepEqual(fichiers, ["brigade-installer.sudoers", "brigade-mise-en-service.sudoers"]);
    for (const fichier of fichiers) {
      // Une règle par fichier, qui nomme le geste dont le fichier porte le nom.
      const [regle, ...autres] = regles(fichier);
      assert.deepEqual(autres, [], fichier);
      assert.ok(regle !== undefined, fichier);
      assert.match(regle, new RegExp(`^%?[a-z_][a-z0-9_-]* ALL=\\(root\\) NOPASSWD: /usr/local/bin/${fichier.replace(/\.sudoers$/, "")}$`), fichier);
    }
  });

  test("celle du geste d'installation n'a pas bougé", () => {
    assert.deepEqual(regles("brigade-installer.sudoers"), ["%brigade-chefs ALL=(root) NOPASSWD: /usr/local/bin/brigade-installer"]);
  });

  test("le fichier qu'elle nomme est exécutable, et ne lit rien de l'environnement en se lançant (`bash -p`)", () => {
    assert.ok((statSync(GESTE).mode & 0o111) !== 0);
    assert.equal(readFileSync(GESTE, "utf8").split("\n")[0], "#!/bin/bash -p");
  });
});

describe("ce que le geste refuse, sans rien toucher", () => {
  // Rien n'a bougé sur la box, la bascule n'a pas été lancée, et rien de
  // l'environnement de celui qui lance n'a servi.
  const rienTouche = (b: Box, avant: Record<string, string>) => {
    assert.deepEqual(b.photo(), avant);
    assert.equal(b.bascule(), null);
    assert.ok(!b.piege());
  };

  test("sans argument : l'usage, et rien d'autre", (t) => {
    const b = box(t);
    b.livrer();
    const avant = b.photo();

    const { code, sortie, erreur } = b.geste([]);

    assert.equal(code, USAGE);
    assert.equal(sortie, "");
    assert.equal(erreur, "usage : brigade-mise-en-service <projet>\n");
    assert.deepEqual(b.appels(), []);
    rienTouche(b, avant);
  });

  test("un argument de plus — un commit, une option, un second projet — est refusé : le geste ne prend qu'un projet", (t) => {
    const b = box(t);
    const livre = b.livrer();
    const avant = b.photo();

    for (const args of [[PROJET, livre], [PROJET, "HEAD~1"], [PROJET, "--force"], [PROJET, "boutique"], ["--", PROJET], [PROJET, ""]]) {
      const { code, sortie, erreur } = b.geste(args);

      assert.equal(code, USAGE, args.join(" "));
      assert.equal(sortie, "");
      assert.equal(erreur, `brigade-mise-en-service : un seul argument, le nom du projet — 2 ont été donnés\nusage : brigade-mise-en-service <projet>\n`);
    }
    assert.deepEqual(b.appels(), []);
    rienTouche(b, avant);
  });

  test("ce qui n'est pas un nom de projet — un `/`, un espace, une option, une commande — est refusé avant toute question à systemd", (t) => {
    const b = box(t);
    b.livrer();
    const avant = b.photo();

    const refuses = [
      "",
      "../calculus",
      "calculus/",
      "/opt/brigade",
      b.clone,
      "calculus boutique",
      " calculus",
      "calculus ",
      "calculus\nboutique",
      "calculus\n",
      "Calculus",
      "calculus.service",
      "calculus@boutique",
      "-h",
      "--help",
      "-calculus",
      "$(id)",
      "`id`",
      "calculus;id",
      "calculus*",
      "cal?ulus",
      "calculus HEAD~1",
    ];
    for (const nom of refuses) {
      const { code, sortie, erreur } = b.geste([nom]);

      assert.equal(code, USAGE, JSON.stringify(nom));
      assert.equal(sortie, "");
      assert.equal(erreur, `brigade-mise-en-service : « ${nom} » n'est pas un nom de projet — attendu des minuscules, des chiffres et des tirets (brigade, thermigo), rien d'autre\n`);
    }
    assert.deepEqual(b.appels(), []);
    rienTouche(b, avant);
  });

  test("un projet que la box ne connaît pas : le clone n'est pas mis à jour, rien n'est basculé", (t) => {
    const b = box(t);
    b.livrer();
    const avant = b.photo();

    const { code, sortie, erreur } = b.geste(["thermigo"]);

    assert.equal(code, PROJET_INCONNU);
    assert.equal(sortie, "");
    assert.equal(erreur, "brigade-mise-en-service : projet inconnu sur cette box — « thermigo » n'a pas de drop-in (`sudo systemctl edit brigade@thermigo.service`, docs/installer.md)\n");
    // Une lecture, et une seule : rien n'a été demandé d'autre à systemd.
    assert.deepEqual(b.appels(), ["show -p DropInPaths --value brigade@thermigo.service"]);
    rienTouche(b, avant);
  });

  test("ce qui fait un projet est le drop-in de son instance : ni celui du gabarit, ni un nom proche d'un projet déclaré", (t) => {
    const b = box(t);
    const avant = b.photo();

    for (const nom of ["thermigo", "calcul", "alculus", "calculus-2", "boutiqu"]) assert.equal(b.geste([nom]).code, PROJET_INCONNU, nom);

    rienTouche(b, avant);
  });

  test("systemd ne répond pas : le projet n'est pas tenu pour connu", (t) => {
    const b = box(t);
    b.livrer();
    writeFileSync(join(b.racine, "en-panne"), "DropInPaths");
    const avant = b.photo();

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, SYSTEMD_MUET);
    assert.equal(sortie, "");
    assert.match(erreur, /^Failed to connect to bus\nbrigade-mise-en-service : systemd n'a pas répondu pour brigade@calculus\.service \(`systemctl show -p DropInPaths` rend 1\) — rien n'a été touché\n$/);
    rienTouche(b, avant);
  });

  test("lancé sans `sudo` : il le dit, avec la commande, avant de rien lire de la box", (t) => {
    const b = box(t);
    b.livrer();
    b.lancePar(1000);
    const avant = b.photo();

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, SANS_DROIT);
    assert.equal(sortie, "");
    assert.equal(erreur, "brigade-mise-en-service : ce geste met à jour le clone de root et relance des unités systemd : il se lance par `sudo brigade-mise-en-service calculus`\n");
    assert.deepEqual(b.appels(), []);
    rienTouche(b, avant);
  });

  test("lancé d'une version posée, pas du clone : il n'y a là ni clone à mettre à jour ni bascule à lancer", (t) => {
    const b = box(t);
    b.livrer();
    const posee = b.poser(join(b.versions, "3f2a9c1d0b7e/runtime/deploy"));
    const avant = b.photo();

    const { code, sortie, erreur } = b.geste([PROJET], posee);

    assert.equal(code, PAS_PREPAREE);
    assert.equal(sortie, "");
    assert.match(erreur, /^brigade-mise-en-service : \S+\/opt\/brigade-versions\/calculus\/3f2a9c1d0b7e n'est pas un clone de brigade avec sa bascule .* — rien n'a été touché\n$/);
    rienTouche(b, avant);
  });
});

describe("mettre un projet en service", () => {
  test("le clone est mis à jour, puis la bascule est lancée pour ce projet, et pour lui seul", (t) => {
    const b = box(t);
    const avant = b.commit();
    b.livrer();
    const livre = b.livrer();

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, 0, erreur);
    assert.equal(erreur, "");
    // Le clone est à jour avec son origine avant que la bascule soit lancée :
    // c'est ce commit qu'elle met en service.
    assert.equal(b.commit(), livre);
    const recu = b.bascule();
    assert.deepEqual(recu?.args, [PROJET]);
    assert.equal(recu?.commit, livre);
    // Ce que le clone a reçu est dit, puis la bascule parle.
    assert.equal(sortie, `brigade-mise-en-service : le clone (${b.clone}) passe de ${avant.slice(0, 12)} à ${livre.slice(0, 12)} — 2 commit(s) reçu(s) de son origine\nla bascule a parlé\n`);
    // Systemd n'a été que lu, et pour ce projet.
    assert.deepEqual(b.appels(), [`show -p DropInPaths --value ${UNITE}`]);
  });

  test("ni lui ni la bascule ne reçoivent rien de l'environnement de celui qui lance", (t) => {
    const b = box(t);
    b.livrer();

    const { code, erreur } = b.geste([PROJET]);

    assert.equal(code, 0, erreur);
    // La bascule ne reçoit que le `PATH` du geste : ni la garde de celui qui
    // lance, ni de quoi dérouter `git`, ni le nom que `sudo` lui donne.
    assert.deepEqual(Object.keys(b.bascule()?.env ?? {}), ["PATH"]);
    assert.doesNotMatch(b.bascule()?.env.PATH ?? "", /pieges|nulle\/part/);
    // Ni son `PATH`, ni son `BASH_ENV`, ni ses variables de `git` n'ont rien lancé.
    assert.ok(!b.piege());
  });

  test("lancé par un chemin relatif, du clone lui-même : c'est le même geste", (t) => {
    const b = box(t);
    const livre = b.livrer();

    const { code, erreur } = b.geste([PROJET], b.deLa(join(b.clone, "runtime/deploy/brigade-mise-en-service")));

    assert.equal(code, 0, erreur);
    assert.equal(b.commit(), livre);
    assert.deepEqual(b.bascule()?.args, [PROJET]);
    assert.ok(!b.piege());
  });

  test("un clone qui n'a rien reçu : il le dit, et bascule quand même — une version posée peut ne pas être servie", (t) => {
    const b = box(t);
    const courant = b.commit();

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, 0, erreur);
    assert.equal(sortie, `brigade-mise-en-service : le clone (${b.clone}) n'a rien reçu de son origine : il reste sur ${courant.slice(0, 12)}\nla bascule a parlé\n`);
    assert.deepEqual(b.bascule()?.args, [PROJET]);
    assert.equal(b.commit(), courant);
  });

  test("le code de sortie de la bascule est celui du geste", (t) => {
    const b = box(t);
    b.livrer();
    b.basculeRend(REVENUE);

    const { code } = b.geste([PROJET]);

    assert.equal(code, REVENUE);
    assert.deepEqual(b.bascule()?.args, [PROJET]);
  });

  test("une origine qui ne répond pas : la bascule n'est pas lancée, et le geste ne sort pas en `0`", (t) => {
    const b = box(t);
    b.livrer();
    const courant = b.commit();
    renameSync(join(b.racine, "origine.git"), join(b.racine, "origine-partie.git"));

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, CLONE_PAS_A_JOUR);
    assert.equal(sortie, "");
    // Les mots de `git`, puis ce que le geste en fait.
    assert.match(erreur, /origine\.git/);
    assert.match(erreur, /\nbrigade-mise-en-service : le clone \(\S+\/opt\/brigade\) n'a pas pu être mis à jour depuis son origine \(`git pull --ff-only` rend \d+, ses mots sont au-dessus\) — rien n'a été basculé, la version en service de « calculus » n'a pas bougé \(docs\/installer\.md, « Mettre brigade à jour »\)\n$/);
    assert.equal(b.bascule(), null);
    assert.equal(b.commit(), courant);
    assert.deepEqual(b.appels(), [`show -p DropInPaths --value ${UNITE}`]);
  });

  test("un clone qui a divergé de son origine est refusé, pas fusionné", (t) => {
    const b = box(t);
    writeFileSync(join(b.clone, "runtime/src/retouche"), "posée à la main sur la box\n");
    git(b.clone, "add", ".");
    git(b.clone, "commit", "-q", "-m", "une retouche que l'origine n'a pas");
    // Le clone a de quoi signer une fusion : ce n'est pas faute d'identité qu'il n'en fait pas.
    git(b.clone, "config", "user.name", "root");
    git(b.clone, "config", "user.email", "root@box.test");
    const retouche = b.commit();
    b.livrer();

    const { code, sortie } = b.geste([PROJET]);

    assert.equal(code, CLONE_PAS_A_JOUR);
    assert.equal(sortie, "");
    assert.equal(b.bascule(), null);
    // Ni commit de fusion ni clone déplacé : il est tel qu'il était.
    assert.equal(b.commit(), retouche);
    assert.equal(git(b.clone, "status", "--porcelain"), "");
  });
});

describe("avec la vraie bascule", () => {
  test("ce que l'origine a reçu est en service au bout du geste", (t) => {
    const b = box(t);
    b.vraieBascule();
    const premier = b.commit();
    assert.equal(b.geste([PROJET]).code, 0);
    assert.equal(b.enService(), premier);
    const livre = b.livrer();

    const { code, sortie, erreur } = b.geste([PROJET]);

    assert.equal(code, 0, erreur);
    assert.equal(b.commit(), livre);
    assert.equal(b.enService(), livre);
    assert.equal(readlinkSync(join(b.versions, "precedente")), premier);
    // Le runtime a été relancé sur la version posée du commit livré, pas sur le clone.
    assert.equal(readFileSync(join(b.racine, "demarres"), "utf8").split("\n").slice(0, -1).at(-1), join(b.versions, livre, "runtime"));
    assert.match(sortie, new RegExp(`^brigade-mise-en-service : le clone .* passe de ${premier.slice(0, 12)} à ${livre.slice(0, 12)} — 1 commit\\(s\\) reçu\\(s\\) de son origine\nbrigade-bascule : ${UNITE.replace(".", "\\.")} a démarré sur ${livre.slice(0, 12)}`));
    // L'autre projet de la box n'a rien vu.
    assert.deepEqual(b.appels().filter((appel) => appel.includes("boutique")), []);
    assert.ok(!b.piege());
  });

  test("une version qui ne démarre pas : la précédente revient seule, et le geste sort avec le code de la bascule", (t) => {
    const b = box(t);
    b.vraieBascule();
    const premier = b.commit();
    assert.equal(b.geste([PROJET]).code, 0);
    const livre = b.livrer("refus");

    const { code, erreur } = b.geste([PROJET]);

    assert.equal(code, REVENUE);
    assert.equal(b.enService(), premier);
    assert.match(erreur, new RegExp(`brigade-bascule : ${livre.slice(0, 12)} n'a pas démarré pour ${UNITE.replace(".", "\\.")}`));
    assert.match(erreur, /est revenue en service/);
    // Le clone, lui, a avancé : c'est la version qu'il porte qui a été refusée.
    assert.equal(b.commit(), livre);
    // Ce que le runtime revenu lit à côté des versions pour dire l'échec dans la
    // file (`mettre-en-service.ts`) : la version refusée, et le motif de la bascule.
    const rendu = lireCompteRendu(b.versions);
    assert.equal(rendu.refusee, livre);
    assert.equal(rendu["en-service"], premier);
    assert.ok(rendu.motif && erreur.includes(`n'a pas démarré pour ${UNITE} — ${rendu.motif}\n`), erreur);
  });
});
