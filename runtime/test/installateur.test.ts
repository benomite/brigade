// Le geste d'installation de la box : `brigade-installer install <projet> …`
// déclare un projet de bout en bout, en root, par sa propre règle sudoers — et
// refuse tout le reste. Ni root, ni systemd, ni GitHub ici : la box d'essai
// (`aides/box.ts`). `uninstall` a son fichier : `desinstallateur.test.ts`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { EFFORTS, MODELES } from "../src/calibrage.ts";
import { decisionsPosees } from "../src/decisions.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { JAMAIS_ACCORDEES, jamaisAccordee } from "../src/grant.ts";
import { LABELS, verifier } from "../src/installation.ts";
import { CODES, lireDemande, portLibre, Refus, VARIABLES_POSEES } from "../src/installateur.ts";
import { BOX } from "../src/installateur-cli.ts";
import { principal as relire } from "../src/relire.ts";
import { prendreVerrou } from "../src/verrou.ts";
import { decider } from "./aides/cuisine.ts";
import { boite, CHEF, COMPTE, DEPLOIEMENT, PREMIER_PORT, type Boite, type Rendu } from "./aides/box.ts";
import { BASE, ENV_GIT, FAUX_CLAUDE, fauxGh, git, repertoireTemporaire } from "./outils.ts";

const GESTE = join(DEPLOIEMENT, "brigade-installer");
const SUDOERS = join(DEPLOIEMENT, "brigade-installer.sudoers");

// L'environnement que l'unité du projet donnera à son runtime : ce que le
// gabarit déclare, puis ses drop-ins, dans l'ordre où systemd les lit.
function environnementDuService(b: Boite, projet: string): Record<string, string> {
  const unite = `brigade@${projet}.service`;
  const fichiers = [join(b.unites, "brigade@.service"), ...readdirSync(join(b.unites, `${unite}.d`)).sort().map((nom) => join(b.unites, `${unite}.d`, nom))];
  return Object.fromEntries(fichiers.flatMap((fichier) => [...readFileSync(fichier, "utf8").matchAll(/^Environment=([A-Z_]+)=(.*)$/gm)].map(([, nom = "", valeur = ""]) => [nom, valeur.replaceAll("%i", projet)])));
}

const dropIn = (b: Boite, unite: string, fichier: string) => readFileSync(join(b.unites, `${unite}.d`, fichier), "utf8");
const ports = (rendu: Rendu) => rendu.json.ports as { porte: number; arbitre: number | null };

describe("la règle sudoers", () => {
  const regles = readFileSync(SUDOERS, "utf8").split("\n").filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"));

  test("elle nomme un seul exécutable, pour le groupe du geste, sans rien lui laisser régler", () => {
    assert.deepEqual(regles, ["%brigade-chefs ALL=(root) NOPASSWD: /usr/local/bin/brigade-installer"]);
  });

  test("elle passe `visudo -c -f` sans erreur", (t) => {
    const visudo = ["/usr/sbin/visudo", "/usr/bin/visudo", "/usr/local/sbin/visudo"].find((chemin) => existsSync(chemin));
    if (visudo === undefined) return t.skip("`visudo` n'est pas sur cette machine : la règle n'y est pas éprouvée");
    const juge = spawnSync(visudo, ["-c", "-f", SUDOERS], { encoding: "utf8" });
    assert.equal(juge.status, 0, juge.stderr);
    assert.match(juge.stdout, /parsed OK/);
  });

  test("le geste `brigade` ne peut pas le lancer : aucune commande du runtime ne le nomme", () => {
    const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.deepEqual(Object.values(scripts).filter((script) => script.includes("installateur")), []);
  });
});

describe("installer un projet", () => {
  test("de bout en bout : `installation` le dit prêt, et la sortie JSON rend les deux ports", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    // La box a un arbitre : son port est à elle, le même pour tous ses projets.
    mkdirSync(join(b.unites, "brigade-arbitre.service.d"));
    writeFileSync(join(b.unites, "brigade-arbitre.service.d/arbitre.conf"), "[Service]\nEnvironment=BRIGADE_ARBITER_PORT=4321\nEnvironment=BRIGADE_ARBITER_MAX_COOKS=12\n");

    const rendu = await b.geste(b.demande());

    assert.equal(rendu.code, 0, rendu.erreur);
    assert.equal(rendu.erreur, "");
    const [etat, sauvegardes] = [join(b.etats, "calculus"), join(b.sauvegardes, "calculus")];
    assert.deepEqual(rendu.json, {
      ok: true,
      action: "install",
      projet: "calculus",
      depot: "acme/calculus",
      branche: BASE,
      compte: COMPTE,
      etat,
      clone: join(etat, "depot"),
      sauvegardes,
      ports: { porte: PREMIER_PORT, arbitre: 4321 },
      unites: ["brigade@calculus.service", "brigade-porte@calculus.service", "brigade-sauvegarde@calculus.timer"],
      aSavoir: ["le calibrage du manager et du reviewer est posé au journal du projet, pas dans un drop-in : `brigade calculus station` le montre, `brigade calculus station manager-modele <modèle>` le change", "le runtime du projet n'est pas démarré : vérifier d'abord (`brigade calculus installation`), puis `sudo systemctl enable --now brigade@calculus.service`"],
    });

    // Ce que la partie « par projet » de docs/installer.md pose, et rien d'autre.
    assert.equal(git(join(etat, "depot"), "rev-parse", "--abbrev-ref", "HEAD"), BASE);
    assert.ok(lstatSync(sauvegardes).isDirectory());
    assert.deepEqual(readdirSync(join(b.unites, "brigade@calculus.service.d")).sort(), ["arbitre.conf", "cloison.conf", "porte.conf", "projet.conf"]);
    assert.equal(dropIn(b, "brigade@calculus.service", "cloison.conf"), readFileSync(join(b.box.deploiement, "cloison.conf"), "utf8"));
    assert.equal(dropIn(b, "brigade@calculus.service", "porte.conf"), dropIn(b, "brigade-porte@calculus.service", "porte.conf"));
    assert.match(dropIn(b, "brigade-sauvegarde@calculus.service", "projet.conf"), new RegExp(`^Environment=BRIGADE_BACKUP_DIR=${sauvegardes}$`, "m"));
    assert.deepEqual(b.actives(), ["brigade-sauvegarde@calculus.timer", "brigade-porte@calculus.service"]);
    // Le runtime du projet n'est ni démarré ni activé : la vérification d'abord.
    assert.deepEqual(b.appels().filter((appel) => !appel.startsWith("show ")), ["daemon-reload", "enable --now brigade-sauvegarde@calculus.timer", "enable --now brigade-porte@calculus.service"]);

    // Et `installation`, sur ce projet, dans l'environnement que son unité lui donnera.
    const gh = fauxGh(t);
    gh.repondre("repos/acme/calculus", { corps: { full_name: "acme/calculus", permissions: { push: true }, security_and_analysis: { secret_scanning_push_protection: { status: "enabled" } } } });
    gh.repondre("repos/acme/calculus/labels?per_page=100", { corps: LABELS.map(({ name }) => ({ name })) });
    // La branche d'intégration, protégée : ce compte n'administre pas le dépôt, il la lit par la branche.
    gh.repondre(`repos/acme/calculus/branches/${BASE}`, { corps: { name: BASE, protected: true } });
    const duService: Record<string, string> = { ...ENV_GIT, ...environnementDuService(b, "calculus"), HOME: b.home, BRIGADE_GH_BIN: gh.bin, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SYSTEMCTL_BIN: b.box.systemctl, BRIGADE_INSTALLER_CONFIG: b.box.config, CLAUDE_CODE_TMPDIR: b.racine };
    assert.equal(duService.BRIGADE_PROXY_PORT, String(PREMIER_PORT));
    assert.equal(duService.BRIGADE_ARBITER_PORT, "4321");
    // Le geste ne suppose aucune station, et n'en pose pas : il n'en manque
    // qu'une au projet, et `installation` dit laquelle variable la déclare.
    assert.deepEqual(
      (await verifier(duService)).filter((constat) => constat.etat === "manque").map((constat) => constat.texte),
      ["no station declared (BRIGADE_STATIONS is not set in the project's log): the runtime starts, but no cook would leave — tickets would stay queued"],
    );
    // Une fois déclarée par le chef, par le geste : au journal du projet, prêt.
    decider(etat, "BRIGADE_STATIONS", "box/claude:30:code");
    const constats = await verifier(duService);
    assert.deepEqual(constats.filter((constat) => constat.etat === "manque"), []);
    // La sauvegarde est programmée : la vérification ne le note pas.
    assert.deepEqual(constats.filter((constat) => constat.texte.includes("sauvegarde n'est pas programmée")), []);
  });

  test("deux projets de suite : chacun reçoit le port de sa porte, distinct, sans qu'aucun n'ait été fourni — celui de l'arbitre est à la box", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    b.pousser("acme/boutique");
    mkdirSync(join(b.unites, "brigade-arbitre.service.d"));
    // L'arbitre tient le premier port de la plage : il n'est donné à aucune porte.
    writeFileSync(join(b.unites, "brigade-arbitre.service.d/arbitre.conf"), `[Service]\nEnvironment=BRIGADE_ARBITER_PORT=${PREMIER_PORT}\n`);

    const [premier, second] = [await b.geste(b.demande("calculus")), await b.geste(b.demande("boutique"))];

    assert.deepEqual([premier.code, second.code], [0, 0], `${premier.erreur}\n${second.erreur}`);
    assert.deepEqual(ports(premier), { porte: PREMIER_PORT + 1, arbitre: PREMIER_PORT });
    assert.deepEqual(ports(second), { porte: PREMIER_PORT + 2, arbitre: PREMIER_PORT });
    assert.equal(new Set([ports(premier).porte, ports(second).porte, PREMIER_PORT]).size, 3);
    for (const projet of ["calculus", "boutique"]) assert.match(dropIn(b, `brigade@${projet}.service`, "arbitre.conf"), new RegExp(`^Environment=BRIGADE_ARBITER_PORT=${PREMIER_PORT}$`, "m"));
  });

  test("une box sans arbitre : le projet n'en reçoit pas, et le geste le dit", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const rendu = await b.geste(b.demande());
    assert.equal(rendu.code, 0, rendu.erreur);
    assert.deepEqual(ports(rendu), { porte: PREMIER_PORT, arbitre: null });
    assert.ok(!existsSync(join(b.unites, "brigade@calculus.service.d/arbitre.conf")));
    assert.match((rendu.json.aSavoir as string[]).join("\n"), /cette box n'a pas d'arbitre déclaré/);
  });

  test("un port que quelqu'un tient n'est pas attribué", async (t) => {
    const tenu = createServer();
    t.after(() => tenu.close());
    const port = await new Promise<number>((resoudre) => tenu.listen(0, "127.0.0.1", () => resoudre((tenu.address() as AddressInfo).port)));
    assert.equal(await portLibre(port), false);

    const b = boite(t);
    b.pousser("acme/calculus");
    writeFileSync(b.box.config, `sauvegardes=${b.sauvegardes}\nports=${port}-${port}\n`);
    const avant = b.photo();
    const rendu = await b.geste(b.demande(), { box: { portLibre } });
    assert.equal(rendu.code, CODES.boxPasPrete);
    assert.equal(rendu.json.motif, "aucun-port-libre");
    assert.deepEqual(b.photo(), avant);
  });

  test("la branche d'intégration se donne, ou se lit sur l'origine", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const rendu = await b.geste(b.demande("calculus", { "--branche": "recette" }));
    assert.equal(rendu.code, 0, rendu.erreur);
    assert.equal(rendu.json.branche, "recette");
    assert.match(dropIn(b, "brigade@calculus.service", "projet.conf"), /^Environment=BRIGADE_BASE_BRANCH=recette$/m);
  });

  test("un projet déjà installé n'est pas écrasé : message explicite, code non nul, état inchangé", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    assert.equal((await b.geste(b.demande())).code, 0);
    const avant = b.photo();

    const rendu = await b.geste(b.demande("calculus", { "--manager-modele": "opus", "--sauvegardes": join(b.sauvegardes, "ailleurs") }));

    assert.equal(rendu.code, CODES.dejaInstalle);
    assert.equal(rendu.json.ok, false);
    assert.equal(rendu.json.motif, "deja-installe");
    assert.match(rendu.erreur, /le projet « calculus » est déjà installé sur cette box .* rien n'est écrasé, rien n'a changé/);
    assert.deepEqual(b.photo(), avant);
  });

  test("un projet désinstallé se réinstalle : son état laissé là n'est pas un projet installé", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    // Ce qu'une désinstallation laisse : le journal du projet, dans son état.
    mkdirSync(join(b.etats, "calculus"), { recursive: true });
    writeFileSync(join(b.etats, "calculus/log.db"), "l'histoire de la cuisine\n");
    const rendu = await b.geste(b.demande());
    assert.equal(rendu.code, 0, rendu.erreur);
    assert.equal(readFileSync(join(b.etats, "calculus/log.db"), "utf8"), "l'histoire de la cuisine\n");
  });
});

describe("ce que le geste refuse, sans rien écrire sur la box", () => {
  // Chaque refus : un code non nul, un message, et la box telle qu'elle était.
  async function refuse(t: TestContext, args: (b: Boite) => string[], motif: string, message: RegExp, code: number = CODES.usage): Promise<void> {
    const b = boite(t);
    b.pousser("acme/calculus");
    const demande = args(b);
    const avant = b.photo();
    const rendu = await b.geste(demande);
    assert.equal(rendu.code, code, rendu.erreur);
    assert.deepEqual({ ok: rendu.json.ok, motif: rendu.json.motif, ecrit: rendu.json.ecrit }, { ok: false, motif, ecrit: false });
    assert.match(rendu.erreur, message);
    assert.match(rendu.erreur, /^brigade-installer : /);
    assert.deepEqual(b.photo(), avant);
    assert.deepEqual(b.appels().filter((appel) => !appel.startsWith("show ")), []);
  }

  test("une sous-commande inconnue", async (t) => {
    await refuse(t, (b) => ["exec", ...b.demande().slice(1)], "sous-commande-inconnue", /sous-commande inconnue : « exec »/);
    await refuse(t, (b) => ["desinstaller", ...b.demande().slice(1)], "sous-commande-inconnue", /ce geste ne connaît que `install`/);
    await refuse(t, () => [], "sous-commande-manquante", /il manque la sous-commande/);
  });

  test("une option `--exec`", async (t) => {
    await refuse(t, (b) => [...b.demande(), "--exec", "/bin/sh"], "option-inconnue", /option inconnue : « --exec »/);
    await refuse(t, (b) => ["install", "calculus", "--exec", "/bin/sh", ...b.demande().slice(2)], "option-inconnue", /option inconnue : « --exec »/);
  });

  for (const option of ["--port", "--porte", "--arbitre", "--compte", "--drop-in", "--unite", "--environnement", "--secrets", "--confirmer", "-x", "--depot=acme/calculus"]) {
    test(`un drapeau hors de la liste fermée : ${option}`, async (t) => {
      await refuse(t, (b) => [...b.demande(), option, "4000"], "option-inconnue", /option inconnue/);
    });
  }

  test("une option donnée deux fois, sans valeur, ou qui manque", async (t) => {
    await refuse(t, (b) => [...b.demande(), "--depot", "acme/autre"], "option-en-double", /--depot est donnée deux fois/);
    await refuse(t, (b) => [...b.demande("calculus", { "--branche": null }), "--branche"], "valeur-manquante", /--branche attend une valeur/);
    await refuse(t, (b) => b.demande("calculus", { "--reviewer-effort": null }), "option-manquante", /il manque --reviewer-effort — aucune n'a de défaut/);
    await refuse(t, (b) => [...b.demande(), "en-trop"], "argument-en-trop", /argument en trop : « en-trop »/);
  });

  for (const projet of ["Calculus", "calc ulus", "../calculus", "calculus/..", "calculus.service", "-calculus", "calc_ulus", "calculus;id", "c".repeat(64), ""]) {
    test(`un nom de projet hors motif : « ${projet.slice(0, 20)} »`, async (t) => {
      await refuse(t, (b) => ["install", projet, ...b.demande().slice(2)], projet.startsWith("-") ? "projet-manquant" : "projet-hors-motif", projet.startsWith("-") ? /il manque le projet/ : /nom de projet hors motif/);
    });
  }

  test("un chemin de sauvegarde relatif", async (t) => {
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": "sauvegardes/calculus" }), "sauvegardes-relatif", /est un chemin relatif — attendu un chemin absolu/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": "./calculus" }), "sauvegardes-relatif", /est un chemin relatif/);
  });

  test("un chemin de sauvegarde contenant `..`", async (t) => {
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/../etats/calculus` }), "sauvegardes-avec-points", /contient `\.\.`/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/calculus/..` }), "sauvegardes-avec-points", /contient `\.\.`/);
  });

  test("un chemin de sauvegarde qui n'est pas normalisé, ou porte ce qu'une unité développerait", async (t) => {
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}//calculus` }), "sauvegardes-non-normalise", /n'est pas normalisé/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/./calculus` }), "sauvegardes-non-normalise", /n'est pas normalisé/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/calculus/` }), "sauvegardes-non-normalise", /n'est pas normalisé/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/%i` }), "sauvegardes-hors-motif", /porte un segment hors motif/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/cal culus` }), "sauvegardes-hors-motif", /porte un segment hors motif/);
  });

  test("un chemin de sauvegarde hors de la racine autorisée", async (t) => {
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": join(b.racine, "ailleurs/calculus") }), "sauvegardes-hors-racine", /n'est pas sous la racine autorisée sur cette box/);
    await refuse(t, () => ["install", "calculus", "--depot", "acme/calculus", "--sauvegardes", "/etc/cron.d", "--manager-modele", "sonnet", "--manager-effort", "low", "--reviewer-modele", "sonnet", "--reviewer-effort", "low"], "sauvegardes-hors-racine", /n'est pas sous la racine autorisée/);
    // Ni la racine elle-même, ni un voisin dont le nom commence comme elle.
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": b.sauvegardes }), "sauvegardes-hors-racine", /n'est pas sous la racine autorisée/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}-bis/calculus` }), "sauvegardes-hors-racine", /n'est pas sous la racine autorisée/);
  });

  test("une destination de sauvegarde qu'un autre projet de la box tient déjà, ou qui la croise", async (t) => {
    // Ce qu'un autre projet a déclaré : sa sauvegarde refuserait de partager sa destination.
    const voisin = (b: Boite) => {
      mkdirSync(join(b.unites, "brigade-sauvegarde@boutique.service.d"));
      writeFileSync(join(b.unites, "brigade-sauvegarde@boutique.service.d/projet.conf"), `[Service]\nEnvironment=BRIGADE_BACKUP_DIR=${join(b.sauvegardes, "boutique")}\n`);
    };
    for (const chemin of ["boutique", "boutique/calculus"]) {
      await refuse(t, (b) => (voisin(b), b.demande("calculus", { "--sauvegardes": join(b.sauvegardes, chemin) })), "sauvegardes-deja-prises", /croise la destination d'un autre projet de cette box \(.*boutique\) : une destination par projet/);
    }
    await refuse(
      t,
      (b) => {
        mkdirSync(join(b.unites, "brigade-sauvegarde@boutique.service.d"));
        writeFileSync(join(b.unites, "brigade-sauvegarde@boutique.service.d/projet.conf"), `[Service]\nEnvironment=BRIGADE_BACKUP_DIR=${join(b.sauvegardes, "tous/boutique")}\n`);
        return b.demande("calculus", { "--sauvegardes": join(b.sauvegardes, "tous") });
      },
      "sauvegardes-deja-prises",
      /une destination par projet/,
    );
  });

  test("un chemin de sauvegarde qui passe par un lien, ou par un répertoire ouvert à d'autres", async (t) => {
    await refuse(
      t,
      (b) => {
        mkdirSync(join(b.racine, "ailleurs"));
        symlinkSync(join(b.racine, "ailleurs"), join(b.sauvegardes, "lien"));
        return b.demande("calculus", { "--sauvegardes": join(b.sauvegardes, "lien/calculus") });
      },
      "racine-des-sauvegardes",
      /passe par un répertoire que root ne tient pas seul : .*lien est un lien/,
      CODES.boxPasPrete,
    );
    await refuse(
      t,
      (b) => {
        mkdirSync(join(b.sauvegardes, "ouvert"));
        chmodSync(join(b.sauvegardes, "ouvert"), 0o777);
        return b.demande("calculus", { "--sauvegardes": join(b.sauvegardes, "ouvert/calculus") });
      },
      "racine-des-sauvegardes",
      /ouvert n'est pas à root seul/,
      CODES.boxPasPrete,
    );
  });

  test("un argument contenant un contenu de fichier", async (t) => {
    const contenu = "[Service]\nExecStart=/bin/sh -c 'id > /tmp/pris'\n";
    await refuse(t, (b) => b.demande("calculus", { "--manager-modele": `sonnet\n${contenu}` }), "contenu-de-fichier", /aucun argument de ce geste n'est un contenu de fichier/);
    await refuse(t, (b) => b.demande("calculus", { "--branche": `main\nEnvironment=BRIGADE_SECRETS_FILE=/etc/shadow` }), "contenu-de-fichier", /aucun argument de ce geste n'est un contenu de fichier/);
    await refuse(t, (b) => b.demande("calculus", { "--depot": `acme/calculus\r\n${contenu}` }), "contenu-de-fichier", /saut de ligne ou un caractère de contrôle/);
    await refuse(t, (b) => [...b.demande(), contenu], "contenu-de-fichier", /aucun argument de ce geste n'est un contenu de fichier/);
    await refuse(t, (b) => b.demande("calculus", { "--sauvegardes": `${b.sauvegardes}/${"a".repeat(300)}` }), "contenu-de-fichier", /plus de 256 caractères/);
  });

  test("un dépôt, une branche ou un calibrage hors de ce qui est accepté", async (t) => {
    for (const depot of ["https://github.com/acme/calculus", "acme/calculus.git", "acme", "acme/calculus/extra", "acme/..", "-acme/calculus", "acme/cal culus", "git@github.com:acme/calculus"]) {
      await refuse(t, (b) => b.demande("calculus", { "--depot": depot }), "depot-hors-motif", /n'est pas un dépôt GitHub/);
    }
    for (const branche of ["-b", "main..v2", "main lock", "main%i", "main.lock", "refs//heads", "main/"]) {
      await refuse(t, (b) => b.demande("calculus", { "--branche": branche }), "branche-hors-motif", /n'est pas un nom de branche que ce geste accepte/);
    }
    await refuse(t, (b) => b.demande("calculus", { "--manager-modele": "gpt" }), "calibrage-inconnu", new RegExp(`n'est pas dans la liste — ${MODELES.join(", ")}`));
    await refuse(t, (b) => b.demande("calculus", { "--reviewer-effort": "extreme" }), "calibrage-inconnu", new RegExp(`n'est pas dans la liste — ${EFFORTS.join(", ")}`));
  });

  test("une box qui n'est pas préparée : sans réglage à root seul, sans unités, sans compte, sans `bwrap`", async (t) => {
    const preparer = CODES.boxPasPrete;
    await refuse(t, (b) => (writeFileSync(b.box.config, "# rien\n"), b.demande()), "reglage-illisible", /ne dit pas `sauvegardes=`/, preparer);
    await refuse(t, (b) => (chmodSync(b.box.config, 0o666), b.demande()), "reglage-douteux", /n'est pas à root seul/, preparer);
    await refuse(t, (b) => (writeFileSync(b.box.config, `sauvegardes=${b.sauvegardes}\nexec=/bin/sh\n`), b.demande()), "reglage-illisible", /porte une ligne qui ne se lit pas : « exec=\/bin\/sh »/, preparer);
    await refuse(t, (b) => (writeFileSync(b.box.config, `sauvegardes=${b.sauvegardes}\nports=80-90\n`), b.demande()), "reglage-illisible", /plage de ports qui ne se lit pas/, preparer);
    await refuse(t, (b) => (writeFileSync(b.box.config, `sauvegardes=${b.racine}/nulle-part\n`), b.demande("calculus", { "--sauvegardes": `${b.racine}/nulle-part/calculus` })), "racine-des-sauvegardes", /n'existe pas/, preparer);
    await refuse(t, (b) => (writeFileSync(join(b.racine, "temoin/compte"), "root\n"), b.demande()), "compte-inconnu", /le runtime d'un projet ne tourne pas sous root/, preparer);
    await refuse(t, (b) => (writeFileSync(join(b.racine, "temoin/compte"), "inconnu\n"), b.demande()), "compte-inconnu", /n'existe pas sur cette box/, preparer);
    await refuse(t, (b) => (writeFileSync(join(b.box.deploiement, "cloison.conf"), "[Service]\nEnvironment=BRIGADE_SANDBOX_BIN=/nulle/part/bwrap\n"), b.demande()), "bwrap-absent", /`bwrap` n'est pas sur cette box/, preparer);
  });

  test("le réglage absent, ou les unités : rien n'est fait", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const config = join(b.racine, "absent.conf");
    const rendu = await b.geste(b.demande(), { box: { config } });
    assert.equal(rendu.code, CODES.boxPasPrete);
    assert.equal(rendu.json.motif, "reglage-absent");
    assert.ok(!existsSync(join(b.etats, "calculus")));

    const sansUnites = await b.geste(b.demande(), { box: { unites: join(b.racine, "sans-unites") } });
    assert.equal(sansUnites.code, CODES.boxPasPrete);
    assert.equal(sansUnites.json.motif, "unites-absentes");
    assert.ok(!existsSync(join(b.racine, "sans-unites")));
  });

  test("lancé sans être root : rien n'est fait, pas même un journal", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const avant = b.photo();
    const rendu = await b.geste(b.demande(), { box: { racine: (process.getuid?.() ?? 0) + 1 } });
    assert.equal(rendu.code, CODES.sansDroit);
    assert.equal(rendu.json.motif, "sans-droit");
    assert.match(rendu.erreur, /il se lance par `sudo brigade-installer …`/);
    assert.deepEqual(b.photo(), avant);
    assert.ok(!existsSync(b.box.journal));
  });

  test("un autre geste en cours : le second attend son tour, dehors", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    mkdirSync(b.box.journal);
    const verrou = prendreVerrou(b.box.journal);
    t.after(() => verrou.relacher());
    const avant = b.photo();
    const rendu = await b.geste(b.demande());
    assert.equal(rendu.code, CODES.occupe);
    assert.equal(rendu.json.motif, "occupe");
    assert.deepEqual(b.photo(), avant);
  });
});

describe("une installation qui n'aboutit pas se défait", () => {
  test("le dépôt ne se clone pas : la box est comme avant, et le projet s'installe ensuite", async (t) => {
    const b = boite(t);
    const avant = b.photo();

    const rendu = await b.geste(b.demande());

    assert.equal(rendu.code, CODES.echec);
    assert.deepEqual({ ok: rendu.json.ok, motif: rendu.json.motif, defait: rendu.json.defait, restes: rendu.json.restes }, { ok: false, motif: "echec", defait: true, restes: [] });
    assert.match(rendu.erreur, /le dépôt acme\/calculus n'a pas pu être cloné sous le compte « cuisine » .* ce qui avait été posé est retiré, la box est comme avant/);
    assert.deepEqual(b.photo(), avant);

    b.pousser("acme/calculus");
    assert.equal((await b.geste(b.demande())).code, 0);
  });

  test("une branche que l'origine n'a pas", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const avant = b.photo();
    const rendu = await b.geste(b.demande("calculus", { "--branche": "absente" }));
    assert.equal(rendu.code, CODES.echec);
    assert.match(rendu.erreur, /la branche `absente` n'existe pas sur l'origine de acme\/calculus/);
    assert.deepEqual(b.photo(), avant);
  });

  test("systemd refuse d'activer la porte : les drop-ins, le clone et la sauvegarde programmée sont retirés", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    b.refuserDActiver("brigade-porte@calculus.service");
    const avant = b.photo();

    const rendu = await b.geste(b.demande());

    assert.equal(rendu.code, CODES.echec);
    assert.equal(rendu.json.defait, true);
    assert.match(rendu.erreur, /`systemctl enable --now brigade-porte@calculus\.service` rend 1 : Failed to enable unit/);
    assert.deepEqual(b.photo(), { ...avant, [join(b.racine, "temoin/actives")]: createHash("sha256").update("").digest("hex") });
    assert.deepEqual(b.actives(), []);
    // Les unités sont relues une fois les drop-ins retirés.
    assert.deepEqual(b.appels().filter((appel) => !appel.startsWith("show ")).slice(-3), ["disable --now brigade-porte@calculus.service", "disable --now brigade-sauvegarde@calculus.timer", "daemon-reload"]);
  });

  test("coupé avant d'avoir cloné : rien ne reste", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const avant = b.photo();
    const coupe = new AbortController();
    coupe.abort();
    const rendu = await b.geste(b.demande(), { signal: coupe.signal });
    assert.equal(rendu.code, CODES.echec);
    assert.match(rendu.erreur, /le geste a été interrompu/);
    assert.deepEqual(b.photo(), avant);
  });
});

describe("le journal du geste", () => {
  test("chaque appel, accepté ou refusé, y ajoute qui, quand, quel projet, quelle action et le résultat", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const debut = new Date();

    assert.equal((await b.geste(b.demande(), { qui: "alice" })).code, 0);
    assert.equal((await b.geste(b.demande(), { qui: "associe" })).code, CODES.dejaInstalle);
    assert.equal((await b.geste(["exec", "calculus", "--exec", "/bin/sh"], { qui: "associe" })).code, CODES.usage);
    assert.equal((await b.geste(["install", "../etc", "--depot", "acme/x"], { qui: "alice" })).code, CODES.usage);
    assert.equal((await b.geste(b.demande("boutique"), { qui: "alice" })).code, CODES.echec);

    const fin = new Date();
    const journal = b.journal();
    for (const evenement of journal) assert.ok(debut.toISOString() <= evenement.at && evenement.at <= fin.toISOString(), evenement.at);
    const args = b.demande().slice(1);
    assert.deepEqual(
      journal.map(({ author, project, type, payload }) => ({ author, project, type, payload })),
      [
        { author: "alice", project: "calculus", type: "installer.started", payload: { action: "install", args, result: "started" } },
        { author: "alice", project: "calculus", type: "installer.used", payload: { action: "install", args, result: "installed", ports: { porte: PREMIER_PORT, arbitre: null } } },
        { author: "associe", project: "calculus", type: "installer.refused", payload: { action: "install", args, result: "refused", reason: "deja-installe" } },
        { author: "associe", project: "calculus", type: "installer.refused", payload: { action: "exec", args: ["calculus", "--exec", "/bin/sh"], result: "refused", reason: "sous-commande-inconnue" } },
        { author: "alice", project: "-", type: "installer.refused", payload: { action: "install", args: ["../etc", "--depot", "acme/x"], result: "refused", reason: "projet-hors-motif" } },
        { author: "alice", project: "boutique", type: "installer.started", payload: { action: "install", args: b.demande("boutique").slice(1), result: "started" } },
        {
          author: "alice",
          project: "boutique",
          type: "installer.failed",
          payload: { action: "install", args: b.demande("boutique").slice(1), result: "failed", reason: (journal.at(-1)?.payload as { reason: string }).reason, undone: true },
        },
      ],
    );
    assert.match((journal.at(-1)?.payload as { reason: string }).reason, /le dépôt acme\/boutique n'a pas pu être cloné/);
  });

  test("il se relit par la commande `journal`, une ligne par appel", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    assert.equal((await b.geste(b.demande())).code, 0);
    assert.equal((await b.geste(["exec", "calculus"])).code, CODES.usage);
    const lignes: string[] = [];
    relire({ args: [], env: { BRIGADE_STATE_DIR: b.box.journal }, dire: (ligne) => lignes.push(ligne), redire: (ligne) => lignes.push(ligne) });
    assert.equal(lignes.length, 3, lignes.join("\n"));
    assert.match(lignes[0] ?? "", /^1  \S+  calculus  -  installer\.started  alice  \{"action":"install",/);
    assert.match(lignes[1] ?? "", /  installer\.used  alice  .*"result":"installed","ports":\{"porte":4100,"arbitre":null\}\}$/);
    assert.match(lignes[2] ?? "", /  calculus  -  installer\.refused  alice  \{"action":"exec","args":\["calculus"\],"result":"refused","reason":"sous-commande-inconnue"\}$/);
  });

  test("un contenu de fichier n'y entre pas en entier, et qui lance sans `sudo` y est nommé par son compte", async (t) => {
    const b = boite(t);
    const long = "x".repeat(5000);
    assert.equal((await b.geste(["install", "calculus", "--depot", long], { qui: null })).code, CODES.usage);
    assert.equal((await b.geste(["install", "calculus", "--depot", "a"], { qui: "pas un\ncompte" })).code, CODES.usage);
    const [premier, second] = b.journal();
    assert.equal(JSON.stringify(premier?.payload).includes(long), false);
    assert.deepEqual((premier?.payload as { args: string[] }).args, ["calculus", "--depot", `${"x".repeat(120)}… (5000 caractères)`]);
    assert.ok(premier?.author !== undefined && premier.author === second?.author && !premier.author.includes("\n"));
  });

  test("sans journal où l'écrire, le geste ne fait rien", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    // Là où le journal devrait vivre : un fichier, pas un répertoire.
    writeFileSync(join(b.racine, "pas-un-repertoire"), "");
    const avant = b.photo();
    const rendu = await b.geste(b.demande(), { box: { journal: join(b.racine, "pas-un-repertoire") } });
    assert.equal(rendu.code, CODES.boxPasPrete);
    assert.equal(rendu.json.motif, "journal-indisponible");
    assert.match(rendu.erreur, /rien n'est fait, aucun usage ne passe sans trace/);
    assert.deepEqual(b.photo(), avant);
  });
});

describe("le plafond dur ne bouge pas", () => {
  // Ce qu'aucun grant n'autorise (#259), et ce par quoi une unité y mènerait.
  const INTERDITS = ["acces-prod", "accès-prod", "identifiants-max", "prod", "production", "credentials", "grant", "merge", "secrets", "claude-config-dir", "environnement", "home"];

  test("aucune option n'y mène : ni `accès-prod`, ni les identifiants du compte Max, sous aucune forme", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    const avant = b.photo();
    for (const interdit of INTERDITS) {
      for (const args of [[interdit, "calculus"], ["install", "calculus", interdit], [...b.demande(), `--${interdit}`], [...b.demande(), `--${interdit}`, "oui"], ["grant", "activer", interdit]]) {
        const rendu = await b.geste(args);
        assert.equal(rendu.code, CODES.usage, `${args.join(" ")} : ${rendu.erreur}`);
      }
    }
    assert.deepEqual(b.photo(), avant);
  });

  test("aucune valeur acceptée n'y mène : chaque valeur est un motif strict ou un mot d'une liste fermée", () => {
    const valide = ["install", "calculus", "--depot", "acme/calculus", "--sauvegardes", "/srv/sauvegardes/calculus", "--manager-modele", "sonnet", "--manager-effort", "low", "--reviewer-modele", "haiku", "--reviewer-effort", "max"];
    assert.deepEqual(lireDemande(valide), { projet: "calculus", depot: "acme/calculus", branche: null, sauvegardes: "/srv/sauvegardes/calculus", manager: { modele: "sonnet", effort: "low" }, reviewer: { modele: "haiku", effort: "max" } });
    // Ce qu'une valeur devrait porter pour écrire une ligne de plus dans une
    // unité, ou y faire développer quelque chose : aucune place ne le laisse passer.
    const charges = ["x\nEnvironment=CLAUDE_CONFIG_DIR=/tmp", "x Environment=A=b", "x%h/.claude", 'x"y', "x'y", "x\\ny", "x$HOME", "x;y", "x=y", "~/.claude/.credentials.json", "accès-prod"];
    for (const place of [1, 3, 5, 7, 9, 11, 13]) {
      for (const charge of charges) {
        const args = valide.with(place, place === 5 ? `/srv/sauvegardes/${charge}` : charge);
        assert.throws(() => lireDemande(args), Refus, args.join(" "));
      }
    }
  });

  test("après une installation : les unités ne portent que les variables du geste, la cloison livrée, et rien du compte n'a été lu ni écrit", async (t) => {
    const b = boite(t);
    b.pousser("acme/calculus");
    // La connexion Max du compte : le geste n'a aucune raison d'y toucher.
    const identifiants = join(b.home, ".claude/.credentials.json");
    mkdirSync(dirname(identifiants));
    writeFileSync(identifiants, '{"claudeAiOauth":{"accessToken":"le-jeton-du-compte"}}\n');
    chmodSync(identifiants, 0o000);
    const plafond = structuredClone(JAMAIS_ACCORDEES);

    const rendu = await b.geste(b.demande());

    assert.equal(rendu.code, 0, rendu.erreur);
    // Illisibles, les identifiants n'ont pas empêché le geste : il ne les ouvre pas.
    assert.equal(lstatSync(identifiants).mode & 0o777, 0);
    assert.deepEqual(readdirSync(b.home), [".claude"]);
    assert.deepEqual(readdirSync(dirname(identifiants)), [".credentials.json"]);

    // Tout ce que le geste a écrit dans les unités de la box.
    const poses = ["brigade@calculus.service", "brigade-porte@calculus.service", "brigade-sauvegarde@calculus.service"].flatMap((unite) =>
      readdirSync(join(b.unites, `${unite}.d`)).map((nom) => ({ unite, nom, contenu: dropIn(b, unite, nom) })),
    );
    const cloison = readFileSync(join(b.box.deploiement, "cloison.conf"), "utf8");
    for (const { unite, nom, contenu } of poses) {
      if (nom === "cloison.conf") {
        // La cloison telle que brigade la livre : ce qu'elle masque n'a pas bougé.
        assert.equal(contenu, cloison);
        continue;
      }
      const lignes = contenu.split("\n").filter((ligne) => ligne !== "" && !ligne.startsWith("#"));
      assert.equal(lignes[0], "[Service]", `${unite}.d/${nom}`);
      for (const ligne of lignes.slice(1)) {
        const [, variable] = /^Environment=([A-Z_]+)=[A-Za-z0-9_./-]+$/.exec(ligne) ?? [];
        assert.ok(variable !== undefined && (VARIABLES_POSEES as readonly string[]).includes(variable), `${unite}.d/${nom} : ${ligne}`);
      }
    }
    for (const variable of VARIABLES_POSEES) assert.doesNotMatch(variable, /SECRET|TOKEN|KEY|CLAUDE|ANTHROPIC|GITHUB_APPS|SANDBOX|HOME|PATH|PROD|GRANT/);
    assert.match(cloison, new RegExp(`^Environment=BRIGADE_SANDBOX_HIDDEN=${b.etats}:`, "m"));

    // Le plafond dur est celui d'avant : la liste, et son refus.
    assert.deepEqual(JAMAIS_ACCORDEES, plafond);
    assert.deepEqual(JAMAIS_ACCORDEES.map(({ action }) => action), ["identifiants-max", "acces-prod"]);
    assert.equal(jamaisAccordee("accès-prod")?.action, "acces-prod");
    assert.equal(jamaisAccordee("identifiants-max")?.action, "identifiants-max");
    // Et le projet neuf n'a aucun grant : son état ne porte que son clone.
    assert.deepEqual(readdirSync(join(b.etats, "calculus")), ["depot", "log.db"]);
    // Le calibrage demandé est une décision du chef : au journal du projet, et
    // dans aucune unité.
    const journal = ouvrirJournal(join(b.etats, "calculus"), { lectureSeule: true });
    try {
      assert.deepEqual(decisionsPosees(journal.base), { BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "haiku", BRIGADE_REVIEWER_EFFORT: "low" });
    } finally {
      journal.fermer();
    }
    // Rien de ce que le geste rend ou journalise ne porte la connexion du compte.
    assert.doesNotMatch(JSON.stringify([rendu.json, b.journal()]), /le-jeton-du-compte|credentials/);
  });
});

describe("le fichier que la règle sudoers nomme", () => {
  // Le `PATH` qu'il se donne, et là où `node` s'y trouve.
  const CHEMIN = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin";
  const node = CHEMIN.split(":").map((repertoire) => join(repertoire, "node")).find((chemin) => existsSync(chemin));
  const memeNode = node !== undefined && realpathSync(node) === realpathSync(process.execPath);
  const SANS_NODE = "`node` n'est pas, sous le `PATH` de systemd, celui qui joue la suite : le lancement du geste n'est pas éprouvé sur cette machine";

  test("il ne passe à `node` ni l'environnement de celui qui lance ni rien d'autre que ses arguments, un à un", (t) => {
    if (!memeNode) return t.skip(SANS_NODE);
    // Un clone de brigade où le geste lance un témoin à la place du vrai code.
    const racine = realpathSync(repertoireTemporaire(t));
    mkdirSync(join(racine, "runtime/deploy"), { recursive: true });
    mkdirSync(join(racine, "runtime/src"));
    mkdirSync(join(racine, "bin"));
    cpSync(GESTE, join(racine, "runtime/deploy/brigade-installer"));
    writeFileSync(join(racine, "runtime/src/installateur-cli.ts"), "console.log(JSON.stringify({ env: process.env, args: process.argv.slice(2) }));\n");
    // Lancé par son lien, comme sur la box (/usr/local/bin/brigade-installer).
    symlinkSync(join(racine, "runtime/deploy/brigade-installer"), join(racine, "bin/brigade-installer"));
    const args = ["install", "calculus", "--depot", "acme/calculus", "deux mots", "$(id)", "; rm -rf /", ""];
    // Ce que `bash` chargerait avant le geste, s'il lisait l'environnement de qui lance.
    writeFileSync(join(racine, "charge.sh"), `echo charge > '${join(racine, "charge")}'\n`);

    const lance = spawnSync(join(racine, "bin/brigade-installer"), args, {
      encoding: "utf8",
      cwd: racine,
      env: { PATH: `${join(racine, "bin")}:/nulle/part`, SUDO_USER: CHEF, NODE_OPTIONS: "--require /nulle/part.js", NODE_PATH: "/nulle/part", BRIGADE_STATE_DIR: "/nulle/part", BASH_ENV: join(racine, "charge.sh"), HOME: "/nulle/part" },
    });

    assert.equal(lance.status, 0, lance.stderr);
    const recu = JSON.parse(lance.stdout) as { env: Record<string, string>; args: string[] };
    assert.deepEqual(recu.args, args);
    assert.deepEqual(recu.env, { PATH: CHEMIN, SUDO_USER: CHEF });
    assert.ok(!existsSync(join(racine, "charge")));
  });

  test("lancé sans `sudo`, le vrai geste refuse et ne touche à rien", (t) => {
    if (!memeNode) return t.skip(SANS_NODE);
    if (process.getuid?.() === BOX.racine) return t.skip("la suite est jouée en root : le vrai geste n'y est pas lancé contre la vraie box");
    const journal = existsSync(BOX.journal);
    const lance = spawnSync(GESTE, ["install", "calculus", "--depot", "acme/calculus"], { encoding: "utf8", env: { PATH: "/nulle/part", SUDO_USER: "root" } });
    assert.equal(lance.status, CODES.sansDroit, lance.stderr);
    assert.deepEqual(JSON.parse(lance.stdout), { ok: false, action: "install", projet: "calculus", motif: "sans-droit", message: JSON.parse(lance.stdout).message });
    assert.match(lance.stderr, /^brigade-installer : ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`/);
    assert.equal(existsSync(BOX.journal), journal);
  });

  test("la box réelle est écrite dans le code, et nulle part ailleurs", () => {
    assert.deepEqual(
      { racine: BOX.racine, sol: BOX.sol, unites: BOX.unites, etats: BOX.etats, config: BOX.config, journal: BOX.journal, deploiement: BOX.deploiement, origine: BOX.origine("acme/calculus") },
      { racine: 0, sol: "/", unites: "/etc/systemd/system", etats: "/var/lib/brigade", config: "/etc/brigade-installer.conf", journal: "/var/lib/brigade-installer", deploiement: DEPLOIEMENT, origine: "https://github.com/acme/calculus.git" },
    );
    assert.deepEqual(BOX.environnement({ nom: "brigade", uid: 1001, gid: 1001, home: "/home/brigade" }), { PATH: CHEMIN, HOME: "/home/brigade", USER: "brigade", LOGNAME: "brigade" });
  });
});
