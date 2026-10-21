// L'installation guidée d'un projet : ses étapes lues sur sa box, chacune faite par la
// commande du runtime qui la fait, ce que le chef aura à faire lui-même annoncé d'emblée,
// et la reprise après fermeture. Les commandes `installation etapes`, `stations`,
// `protection` et `decisions` sont celles du runtime, jouées dans ce process sur un vrai
// journal : seuls `installation` — la vérification, qui interroge la machine — et GitHub
// sont simulés. La vérification seule se joue aussi contre un faux `ssh` écrit par chaque
// test, les terminaux contre de faux pty : ni réseau, ni box, ni `claude`. Aucun test
// n'attend une durée — une action rend la main quand elle a fini.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../runtime/src/appel.ts";
import { decisionsPosees, gesteDe, poserDecision } from "../../runtime/src/decisions.ts";
import { ETAPES, terminer } from "../../runtime/src/etapes.ts";
import { nommerEtape, principal as etapes } from "../../runtime/src/etapes-cli.ts";
import { principal as stations } from "../../runtime/src/declarer-stations.ts";
import { etapesAReprendre, type Constat } from "../../runtime/src/installation.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as decisions } from "../../runtime/src/poser-decisions.ts";
import { commande as protection, type ClientGitHub } from "../../runtime/src/proteger-branche.ts";
import { verdictDeLaPanne, verdictDesConstats } from "../../runtime/src/verdict.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { lancerGeste, type Reglages, type Rendu, type Servi } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { commandeDeDemarrage, COMMANDES, INIT, JUGEMENT, jugementDe, lireCourante, lireEtapes, lireJugement, lireProtection, lireStations, manquesDe, tenirServices, VERIFICATION, verdictDe, type Guide } from "../src/service.ts";
import { ouvrirTerminaux, type Lancement, type Terminal } from "../src/terminaux.ts";
import { jouerLaVue, repos, type Faux } from "./aides/fausse-vue.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const RACINE = join(import.meta.dirname, "../..");
const CALCULUS: Projet = { nom: "calculus", dossier: "/projets/calculus", box: { hote: "box" } };
const PARADE: Projet = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Ce que `installation` écrit de ses constats, ligne à ligne, dans la forme de
// runtime/src/installation-cli.ts (`ecrire`) — le test « le runtime écrit ses manques dans la
// forme que l'app lit » la compare à son source. C'est aussi la sortie brute que son verdict
// structuré (`installation --json`, runtime/src/verdict.ts) porte, au caractère près.
const TITRES = { machine: "Sur la machine", depot: "Dans le dépôt", github: "Sur GitHub" } as const;
const MARQUES = { ok: "ok", manque: "MISSING", note: "note" } as const;
function ecrite(constats: Constat[], projet = "calculus"): string {
  const lignes: string[] = [];
  for (const ou of ["machine", "depot", "github"] as const) {
    lignes.push("", TITRES[ou]);
    for (const { etat, texte, geste, etape } of constats.filter((constat) => constat.ou === ou)) {
      lignes.push(`  ${MARQUES[etat].padEnd(10)}${texte}`);
      if (geste !== undefined) lignes.push(`            → ${geste}`);
      if (etape !== undefined) lignes.push(`            → step to resume: ${nommerEtape(etape)} (${etape})`);
    }
  }
  const manques = constats.filter(({ etat }) => etat === "manque").length;
  lignes.push(
    "",
    manques === 0
      ? `brigade : project “${projet}” : ready — nothing is missing to launch a cook`
      : `brigade : project “${projet}” : ${manques} missing : no cook must be launched while any is left — to resume: ${etapesAReprendre(constats).map(nommerEtape).join(", ")}`,
  );
  return `${lignes.join("\n")}\n`;
}

// Un projet prêt, avec une ligne `à savoir` ; un projet à qui il manque deux choses — l'une au
// chef, par une commande exacte, l'autre que brigade lève seule.
const PRETS: Constat[] = [
  { ou: "machine", etat: "ok", texte: "les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible" },
  { ou: "depot", etat: "ok", texte: "bindings : bloc présent, branche d'intégration `main`" },
  { ou: "github", etat: "note", texte: "la push protection de GitHub n'est pas constatée sur chef/calculus (GitHub en dit : `disabled`)", geste: "docs/installer.md, « Déclarer le projet »" },
];
const INCOMPLETS: Constat[] = [
  {
    ou: "depot",
    etat: "manque",
    texte: "`.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel",
    geste: "`git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`",
    simple: "les gates du dépôt (`.claude/brigade/gates.sh`) ne sont pas exécutables : brigade ne peut pas les lancer",
    remede: { qui: "chef", commande: "git update-index --chmod=+x .claude/brigade/gates.sh" },
  },
  { ou: "github", etat: "manque", texte: "le cache des labels du dépôt est périmé", geste: "rien à faire : le runtime le relit à son prochain passage", simple: "brigade n'a pas encore relu les étiquettes du dépôt : elle le fait seule à son prochain passage", remede: { qui: "brigade" } },
];
const PRET = ecrite(PRETS);
const INCOMPLET = ecrite(INCOMPLETS);
// La vérification qui plante sur /etc/sudoers.d : la panne connue #654.
const EACCES = Object.assign(new Error("EACCES: permission denied, lstat '/etc/sudoers.d/brigade-installer'"), { code: "EACCES" });

// Ce que la vérification rend, en texte (`installation`) et structurée (`installation --json`) —
// l'une et l'autre par les fonctions du runtime qui les écrivent. Une erreur : elle a planté.
function rendue(verification: Constat[] | Error, json: boolean): { code: number; sortie: string; erreurs: string } {
  if (verification instanceof Error) {
    return json ? { code: 1, sortie: JSON.stringify(verdictDeLaPanne(verification)), erreurs: "" } : { code: 1, sortie: "", erreurs: `brigade : ${verification.message}` };
  }
  const verdict = verdictDesConstats(verification, ecrite(verification));
  const code = verdict.verdict === "pret" ? 0 : 1;
  return json ? { code, sortie: JSON.stringify(verdict), erreurs: "" } : { code, sortie: verdict.brut.slice(0, -1), erreurs: "" };
}

// Ce que le faux ssh écrit, tel quel, sur sa sortie standard.
const dit = (texte: string) => `cat <<'FIN'\n${texte}\nFIN`;
const NOTE = `echo "$*" >>"$D/appels"`;

type FauxPty = Lancement & { ecrits: string[] };

// De faux pty : chaque terminal lancé, et ce qui y a été écrit.
function fauxTerminaux() {
  const lances: FauxPty[] = [];
  const terminaux = ouvrirTerminaux({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(lancement) {
      const faux: FauxPty = { ...lancement, ecrits: [] };
      lances.push(faux);
      return { ecrire: (donnees) => void faux.ecrits.push(donnees), redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
  });
  // Ce que les terminaux ont reçu : chaque pty lancé, et ce qui y a été écrit.
  const terminal = () => lances.map(({ commande, args, dossier, ecrits }) => ({ lance: [commande, ...args, dossier].join(" "), ecrits }));
  return { terminaux, terminal };
}

// Un essai de la vérification seule : un faux `ssh` — un script sh, où `$D` est le répertoire du test.
function essai(t: TestContext, corps: string) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-service-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const reglages = { ssh, delaiMs: 60_000, connexionS: 10 };
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  return { racine, reglages, lu };
}

const refus = (rendu: Terminal | { refus: string }): string => ("refus" in rendu ? rendu.refus : "");

// `installation`, lancée sur la box par le geste, comme l'écran la lance — et ce que son rendu prouve.
const verifier = async (reglages: Reglages, servi: Servi) => verdictDe(await lancerGeste(reglages, servi, VERIFICATION), servi.nom, reglages.delaiMs);
// `installation --json`, lancée comme « Vérifier » la lance — et le verdict que l'écran en lit.
const juger = async (reglages: Reglages, servi: Servi) => jugementDe(await lancerGeste(reglages, servi, JUGEMENT), reglages.delaiMs);

describe("le contrôle d'un projet installé : `installation`, en texte, lancée une fois sur la box du projet", () => {
  test("ce qui part est le geste de la box, comme la veille le lance — `brigade <nom> installation`, sans terminal ni rien de plus", { skip: SANS_POSIX }, async (t) => {
    const { reglages, lu } = essai(t, `${NOTE}\n${dit(PRET)}`);

    await verifier(reglages, { nom: "calculus", box: { hote: "chef@box" } });

    assert.equal(lu("appels"), `${OPTIONS} -- chef@box brigade calculus installation\n`);
  });

  test("sortie en 0 avec sa ligne de verdict : prêt — et ce qu'elle a écrit est rendu en entier, `à savoir` compris", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, dit(PRET));

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "pret");
    assert.equal("obtenu" in rendu && rendu.obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade calculus installation\n${PRET}\n\n→ exit code 0`);
    assert.ok(!Number.isNaN(Date.parse(rendu.a)));
  });

  test("sortie en 1 : incomplète — chaque point qui manque est rendu avec la flèche de ce qui reste à faire, mot pour mot", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, `${dit(INCOMPLET)}\nexit 1`);

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "incomplete");
    const obtenu = "obtenu" in rendu ? rendu.obtenu : "";
    assert.equal(obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade calculus installation\n${INCOMPLET}\n\n→ exit code 1`);
    // Les deux manques, chacun suivi de son geste.
    const lignes = obtenu.split("\n");
    for (const manque of lignes.filter((ligne) => ligne.includes("MISSING"))) assert.match(lignes[lignes.indexOf(manque) + 1] ?? "", /^ +→ /);
    assert.equal(lignes.filter((ligne) => ligne.includes("MISSING")).length, 2);
  });

  test("sortie en 2 : la commande a été lancée et a refusé son environnement — pas prêt, et ce qu'elle a dit sur sa sortie d'erreur est rendu", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, `echo 'brigade : BRIGADE_MAX_TURNS : « beaucoup » n'"'"'est pas un entier' >&2\nexit 2`);

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "incomplete");
    assert.match("obtenu" in rendu ? rendu.obtenu : "", /BRIGADE_MAX_TURNS : « beaucoup » n'est pas un entier\n\n→ exit code 2$/);
  });

  test("un 0 sans la ligne de verdict n'est pas un « prêt » : une commande forcée qui remplace celle de l'app, un autre projet", { skip: SANS_POSIX }, async (t) => {
    for (const sortie of ["Bienvenue sur la box.", PRET.replace("“calculus”", "“parade”"), INCOMPLET, ""]) {
      const { reglages } = essai(t, dit(sortie));

      const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

      assert.equal(rendu.etat, "illisible", sortie);
      assert.ok("obtenu" in rendu && rendu.obtenu.includes(sortie));
    }
  });

  test("la ligne de verdict attendue est celle que le runtime écrit", () => {
    const cli = readFileSync(join(RACINE, "runtime/src/installation-cli.ts"), "utf8");

    assert.ok(cli.includes("brigade : project “${projet}” : ready"), "`installation` n'écrit plus son verdict sous cette forme");
    assert.ok(PRET.includes("brigade : project “calculus” : ready"));
  });

  const ECHECS: [number, string, boolean][] = [
    [255, "ssh-en-echec", false],
    [65, "projet-inconnu", true],
    [68, "sans-droit", true],
    [69, "commande-manque", true],
    [70, "node-inapte", true],
    [127, "commande-manque", true],
  ];
  for (const [code, cas, atteinte] of ECHECS) {
    test(`sortie en ${code} : aucun verdict — le cas que ce code prouve (${cas}), et ce que la box a rendu`, { skip: SANS_POSIX }, async (t) => {
      const { reglages } = essai(t, `echo 'ce que la box en dit' >&2\nexit ${code}`);

      const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

      assert.equal(rendu.etat, "sans-verdict");
      assert.deepEqual("cas" in rendu && [rendu.cas, rendu.atteinte], [cas, atteinte]);
      assert.match("erreur" in rendu ? rendu.erreur : "", new RegExp(`ce que la box en dit\\n\\n→ exit code ${code}$`));
    });
  }

  test("un code qui ne dit aucun cas, sur une box jointe : aucun verdict, et rien n'en est déduit", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, "echo 'brigade : « installation » n'\"'\"'est pas une commande du runtime' >&2\nexit 66");

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "sans-verdict");
    assert.deepEqual("cas" in rendu && [rendu.cas, rendu.atteinte], [null, true]);
  });

  test("un `ssh` qui ne se lance pas : aucun verdict, et la box n'est pas dite jointe", async (t) => {
    const { reglages, racine } = essai(t, "");

    const rendu = await verifier({ ...reglages, ssh: join(racine, "absent") }, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "sans-verdict");
    assert.deepEqual("cas" in rendu && [rendu.cas, rendu.atteinte], [null, false]);
  });
});

// « Vérifier », sur l'écran : `installation --json`, que le faux ssh rend comme le runtime l'écrit.
const juge = (verification: Constat[] | Error) => {
  const { code, sortie } = rendue(verification, true);
  return `${dit(sortie)}\nexit ${code}`;
};

describe("« Vérifier » : `installation --json`, et le verdict que l'écran en lit", () => {
  test("ce qui part est le geste de la box — `brigade <nom> installation --json`, sans terminal ni rien de plus", { skip: SANS_POSIX }, async (t) => {
    const { reglages, lu } = essai(t, `${NOTE}\n${juge(PRETS)}`);

    await juger(reglages, { nom: "calculus", box: { hote: "chef@box" } });

    assert.equal(lu("appels"), `${OPTIONS} -- chef@box brigade calculus installation --json\n`);
  });

  test("prêt : le verdict en une phrase, aucun manque, la ligne `à savoir` à part — et ce que l'app a obtenu porte la sortie brute, intacte, à la place de son objet", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, juge(PRETS));

    const rendu = await juger(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.ok(rendu.etat === "jugee" && rendu.jugement.verdict === "pret");
    assert.match(rendu.jugement.phrase, /^prêt/);
    assert.deepEqual(rendu.jugement.aSavoir, [{ texte: PRETS[2]?.texte, geste: PRETS[2]?.geste }]);
    assert.equal(rendu.jugement.brut, PRET);
    assert.equal(rendu.obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade calculus installation --json\n${PRET}\n→ exit code 0`);
  });

  test("pas prêt : autant de manques que la vérification en constate, chacun en mots simples avec qui le lève — les lignes `à savoir` n'en sont pas", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, juge(QUATRE));

    const rendu = await juger(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.ok(rendu.etat === "jugee" && rendu.jugement.verdict === "pas-pret");
    assert.equal(rendu.jugement.phrase, "pas prêt : 4 choses à faire");
    assert.deepEqual(
      rendu.jugement.manques.map((manque) => [manque.texte, manque.acteur, manque.acteur === "chef" ? (manque.action ?? manque.commande) : null]),
      [
        [SANS_GESTES[0]?.simple, "chef", "sudo git -C /opt/brigade pull --ff-only"],
        [SANS_GESTES[1]?.simple, "chef", "stations"],
        ["la branche d'intégration `main` n'est pas protégée sur GitHub", "chef", "protection"],
        [INCOMPLETS[1]?.simple, "brigade", null],
      ],
    );
    assert.equal(rendu.jugement.aSavoir.length, 1);
    assert.equal(rendu.jugement.brut, ecrite(QUATRE));
  });

  test("plantée sur /etc/sudoers.d : la vérification n'est pas allée au bout — la panne connue #654, rien n'est constaté du projet, et sa ligne d'erreur est la sortie brute", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, juge(EACCES));

    const rendu = await juger(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.ok(rendu.etat === "jugee" && rendu.jugement.verdict === "plantee");
    assert.equal(rendu.jugement.panne.connue?.issue, 654);
    assert.match(rendu.jugement.phrase, /problème de brigade, pas de ton projet/);
    assert.equal(rendu.jugement.brut, `brigade : ${EACCES.message}\n`);
    assert.match(rendu.obtenu, /lstat '\/etc\/sudoers\.d\/brigade-installer'\n\n→ exit code 1$/);
  });

  test("un runtime d'avant le verdict, une commande forcée, un verdict que son code dément : rien n'est lu, et ce que la box a rendu est gardé", { skip: SANS_POSIX }, async (t) => {
    const cas = [
      "echo 'brigade : usage : … installation -- [labels | setup [<cooks>] | uninstall [--confirm]]' >&2\nexit 2",
      dit("Bienvenue sur la box."),
      dit(PRET),
      `${dit(rendue(QUATRE, true).sortie)}\nexit 0`,
      `${dit(rendue(PRETS, true).sortie)}\nexit 1`,
    ];
    for (const corps of cas) {
      const { reglages } = essai(t, corps);

      const rendu = await juger(reglages, { nom: "calculus", box: { hote: "box" } });

      assert.equal(rendu.etat, "illisible", corps);
      assert.match("obtenu" in rendu ? rendu.obtenu : "", /\n→ exit code [012]$/);
    }
  });

  test("rien n'est venu d'elle : aucun verdict — le cas de la veille", { skip: SANS_POSIX }, async (t) => {
    const { reglages } = essai(t, "echo 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255");

    const rendu = await juger(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.ok(rendu.etat === "sans-verdict");
    assert.equal(rendu.cas, "ssh-en-echec");
  });

  test("le verdict se lit dans la forme où le runtime l'écrit ; une forme qu'il ne connaît pas n'est pas lue", () => {
    for (const verification of [PRETS, QUATRE, EACCES, new Error("ENOSPC: no space left on device")]) {
      const { sortie } = rendue(verification, true);
      assert.equal(lireJugement(sortie)?.verdict, JSON.parse(sortie).verdict);
    }
    for (const sortie of ["", "{}", '{"verdict":"pret","phrase":"prêt","brut":""}', '{"verdict":"pret","phrase":"prêt","brut":"","manques":[{"texte":"x"}],"aSavoir":[]}', '{"verdict":"ailleurs","phrase":"","brut":"","manques":[],"aSavoir":[]}']) {
      assert.equal(lireJugement(sortie), undefined, sortie);
    }
  });
});

describe("ce que « Démarrer » écrit", () => {
  test("le geste de docs/installer.md, « Servir le premier ticket », et celui que la box nomme en fin d'installation — porté par un `ssh` qui a un terminal", () => {
    const doc = readFileSync(join(RACINE, "docs/installer.md"), "utf8");
    const installateur = readFileSync(join(RACINE, "runtime/src/installateur.ts"), "utf8");
    assert.ok(doc.includes("sudo systemctl enable --now brigade@<projet>"), "docs/installer.md ne donne plus ce geste");
    assert.ok(installateur.includes("sudo systemctl enable --now ${unites.runtime}"), "le geste d'installation ne nomme plus ce geste");

    assert.deepEqual(commandeDeDemarrage(CALCULUS), { commande: "ssh -t box sudo systemctl enable --now brigade@calculus.service" });
  });

  test("rien de ce qui s'écrit ne porte de quoi l'envoyer, et un hôte que le shell du poste découperait s'écrit cité", () => {
    assert.deepEqual(commandeDeDemarrage({ ...CALCULUS, box: { hote: "chef@box.exemple:22" } }), { commande: "ssh -t chef@box.exemple:22 sudo systemctl enable --now brigade@calculus.service" });
    assert.deepEqual(commandeDeDemarrage({ ...CALCULUS, box: { hote: "box; rm -rf ~" } }), { commande: "ssh -t 'box; rm -rf ~' sudo systemctl enable --now brigade@calculus.service" });
  });

  test("rien n'est écrit pour un hôte que `ssh` lirait comme une option, ou qui porte de quoi envoyer la commande", () => {
    for (const hote of ["-oProxyCommand=sh", "--"]) assert.match(refus(commandeDeDemarrage({ ...CALCULUS, box: { hote } }) as { refus: string }), /^nothing is written: “hote” starts with a dash/);
    for (const hote of ["box\rrm -rf ~", "box\n", "bo\x1bx"]) assert.match(refus(commandeDeDemarrage({ ...CALCULUS, box: { hote } }) as { refus: string }), /^nothing is written: “hote” has a control character/);
  });

  test("rien n'est écrit pour un nom qui n'est celui d'aucune instance : la box le refuserait, et son unité ne se nomme pas", () => {
    for (const nom of ["Calculus", "mon projet", "calculus; reboot", "-calculus", "calculus\r"]) {
      assert.match(refus(commandeDeDemarrage({ ...CALCULUS, nom }) as { refus: string }), /^nothing is written: /, nom);
    }
  });

  test("un projet sans box n'a rien à démarrer", () => {
    assert.match(refus(commandeDeDemarrage({ nom: "calculus", dossier: "/p" }) as { refus: string }), /does not say where its station is/);
  });
});

// --- L'installation guidée.

// Ce qu'`installation` écrit quand le code de brigade posé sur la box est trop vieux : un
// manque sur la machine, que l'étape « verification » règle — dans la forme de
// runtime/src/installation-cli.ts, son étape nommée par le runtime lui-même.
const GESTE_A_NIVEAU = "`sudo git -C /opt/brigade pull --ff-only` — docs/installer.md, « Mettre brigade à jour »";
const GESTE_TROP_VIEUX = "le code de brigade posé sur la box (/opt/brigade) est en retard sur celui que le runtime exige — un projet lancé avec lui ferait autre chose que ce que le runtime attend";
const SANS_GESTES: Constat[] = [
  {
    ou: "machine",
    etat: "manque",
    texte: GESTE_TROP_VIEUX,
    geste: GESTE_A_NIVEAU,
    etape: "verification",
    simple: "le code de brigade posé sur la box est trop ancien : un projet lancé avec lui échouerait",
    remede: { qui: "chef", commande: "sudo git -C /opt/brigade pull --ff-only" },
  },
  {
    ou: "machine",
    etat: "manque",
    texte: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente",
    geste: "`brigade calculus installation stations`",
    etape: "stations",
    simple: "aucune station n'est déclarée : aucun cook ne partirait",
    remede: { qui: "chef", action: "stations" },
  },
  { ou: "github", etat: "note", texte: "la push protection de GitHub n'est pas constatée sur chef/calculus", geste: "docs/installer.md, « Déclarer le projet »" },
];
const SANS_GESTE = ecrite(SANS_GESTES);
// Trois manques du chef — une commande, une étape que l'app fait, une étape où se choisir — et un de brigade.
const QUATRE: Constat[] = [
  ...SANS_GESTES,
  { ou: "github", etat: "manque", texte: "`main` n'est pas protégée sur chef/calculus", geste: "la même commande, suivie de `protection poser`", etape: "protection", simple: "la branche d'intégration `main` n'est pas protégée sur GitHub", remede: { qui: "chef", action: "protection" } },
  ...INCOMPLETS.filter(({ remede }) => remede?.qui === "brigade"),
];

// Une box simulée pour un projet : son journal, où le runtime note les étapes et les décisions ;
// GitHub, par un client simulé ; et `installation`, la vérification, que le test règle. Chaque
// commande que l'écran lance par le geste de la box est jouée par la commande du runtime.
function boxSimulee(t: TestContext, reglage: { admin?: boolean; calibrage?: boolean; verification?: (box: { stations: boolean; protegee: boolean }) => Constat[] | Error } = {}) {
  const etat = mkdtempSync(join(tmpdir(), "brigade-app-guide-"));
  t.after(() => rmSync(etat, { recursive: true, force: true }));
  const env = {
    BRIGADE_STATE_DIR: etat,
    BRIGADE_PROJECT: "calculus",
    BRIGADE_GITHUB_REPO: "chef/calculus",
    BRIGADE_BASE_BRANCH: "main",
    BRIGADE_CLAUDE_BIN: join(import.meta.dirname, "aides/faux-claude.sh"),
    PATH: "",
  };
  // Le geste d'installation pose le calibrage du manager et du reviewer (runtime/src/installateur.ts).
  const journal = ouvrirJournal(etat);
  const calibrage = [["BRIGADE_MANAGER_MODEL", "sonnet"], ["BRIGADE_MANAGER_EFFORT", "medium"], ["BRIGADE_REVIEWER_MODEL", "sonnet"], ["BRIGADE_REVIEWER_EFFORT", "medium"]] as const;
  for (const [nom, valeur] of reglage.calibrage === false ? calibrage.slice(1) : calibrage) {
    poserDecision(journal, { projet: "calculus", nom, valeur, auteur: "installeur" });
  }
  journal.fermer();

  let protegee = false;
  const github: ClientGitHub = async ({ methode, chemin }) => {
    if (chemin === "repos/chef/calculus" && methode === "GET") return { statut: 200, corps: { private: false, permissions: { admin: reglage.admin ?? true }, security_and_analysis: { secret_scanning_push_protection: { status: "enabled" } } }, scopes: ["repo"] };
    if (chemin === "repos/chef/calculus/branches/main") return { statut: 200, corps: { protected: protegee }, scopes: null };
    if (chemin === "user") return { statut: 200, corps: { login: "chef" }, scopes: null };
    if (chemin.endsWith("/protection") && methode === "PUT") return (protegee = true), { statut: 200, corps: {}, scopes: null };
    if (chemin.endsWith("/protection")) return protegee ? { statut: 200, corps: { required_pull_request_reviews: { required_approving_review_count: 0 }, enforce_admins: { enabled: true } }, scopes: null } : { statut: 404, corps: { message: "Branch not protected" }, scopes: null };
    return { statut: 500, corps: null, scopes: null };
  };
  const stationsDeclarees = () => {
    const lu = ouvrirJournal(etat, { lectureSeule: true });
    try {
      return decisionsPosees(lu.base).BRIGADE_STATIONS !== undefined;
    } finally {
      lu.fermer();
    }
  };
  // Par défaut, la box a tous ses gestes : ne manque que ce que les étapes posent.
  const verification = () =>
    reglage.verification?.({ stations: stationsDeclarees(), protegee }) ??
    (stationsDeclarees() && protegee ? PRETS : INCOMPLETS);

  const appels: string[] = [];
  async function jouer(args: string[], dire: (ligne: string) => void, redire: (ligne: string) => void): Promise<void> {
    const [sous, ...reste] = args;
    const appel = { args: reste, env, dire, redire };
    // `installation`, en texte ou structurée (`--json`) : ce que la vérification a constaté.
    if (sous === undefined || (sous === "--json" && reste.length === 0)) {
      const { code, sortie, erreurs } = rendue(verification(), sous === "--json");
      if (sortie !== "") dire(sortie);
      if (erreurs !== "") redire(erreurs);
      if (code !== 0) throw new Sortie(code);
      return;
    }
    // La dernière étape joue la vérification, puis termine — ou remet à faire (runtime/src/etapes-cli.ts).
    if (sous === "etapes" && reste.join(" ") === "demarrage faite") {
      const { code } = rendue(verification(), false);
      const ouvert = ouvrirJournal(etat);
      const fin = terminer(ouvert, { projet: "calculus", aReprendre: code === 0 ? [] : ["verification"], auteur: "chef" });
      ouvert.fermer();
      if (fin.terminee) return dire(`brigade : installation terminée : « Vérifier » est vert — les ${ETAPES.length} étapes sont faites, la cuisine est prête à servir`);
      dire("brigade : l'installation n'est pas terminée : « Vérifier » n'est pas vert");
      throw new Sortie(1);
    }
    if (sous === "etapes") return etapes(appel);
    if (sous === "stations") return stations(appel);
    if (sous === "decisions") return decisions(appel);
    if (sous === "protection") return protection(appel, github);
    redire("brigade : usage");
    throw new Sortie(2);
  }
  // Ce que le geste de la box rend d'une commande : ses deux sorties, et son code.
  async function lancer(servi: { nom: string }, commande: string): Promise<Rendu> {
    appels.push(commande);
    const [premier, ...args] = commande.split(" ");
    const sortie: string[] = [];
    const erreurs: string[] = [];
    let code = 0;
    try {
      if (premier !== "installation" || servi.nom !== "calculus") throw new Sortie(65);
      await jouer(args, (ligne) => void sortie.push(ligne), (ligne) => void erreurs.push(ligne));
    } catch (erreur) {
      if (!(erreur instanceof Sortie)) throw erreur;
      code = erreur.code;
    }
    const echec = code === 0 ? null : Object.assign(new Error(`Command failed: ${commande}`), { code, killed: false, cmd: commande });
    return { lance: `$ ssh ${OPTIONS} -- box brigade calculus ${commande}`, erreur: echec, sortie: sortie.map((ligne) => `${ligne}\n`).join(""), erreurs: erreurs.map((ligne) => `${ligne}\n`).join("") };
  }
  // Ce que le journal porte, relu par la commande du runtime — pas par l'app.
  const etapesAuJournal = async () => {
    const dit: string[] = [];
    await etapes({ args: ["--json"], env, dire: (ligne) => void dit.push(ligne), redire: () => {} });
    return lireEtapes(dit.join("\n"));
  };
  return { env, appels, lancer, etapesAuJournal, protegee: () => protegee };
}

// L'app, ouverte sur cette box : ses installations, branchées comme dans le process principal (main.ts).
function app(box: ReturnType<typeof boxSimulee>) {
  const { terminaux, terminal } = fauxTerminaux();
  const pousses: Guide[] = [];
  const services = tenirServices({ delaiMs: 60_000, lancer: box.lancer, session: terminaux.session, shell: terminaux.shell, surGuide: (guide) => void pousses.push(guide) });
  return { services, terminal, pousses };
}

async function guide(services: ReturnType<typeof tenirServices>, projet: Projet = CALCULUS): Promise<Guide> {
  return (await services.guide(projet)) ?? assert.fail("ce projet n'a pas d'installation");
}
const etats = (lu: Guide) => Object.fromEntries(lu.etapes.map(({ id, etat }) => [id, etat]));

describe("l'installation guidée : toutes les étapes, d'emblée", () => {
  test("ouvert sur un projet à installer, l'écran montre chaque étape avec son état, à quoi elle sert et ce qui se passe si on la saute — avant toute action, rien n'est écrit", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);

    const lu = await guide(services);

    assert.deepEqual(
      lu.etapes.map(({ rang, id, titre, etat, sert, sauter, geste }) => ({ rang, id, titre, etat, sert, sauter, geste })),
      ETAPES.map(({ id, titre, sert, sauter, geste }, rang) => ({ rang: rang + 1, id, titre, etat: "todo", sert, sauter, geste })),
    );
    assert.equal(lu.courante, "ajout");
    assert.match(lu.titre, /^Installation — 0 of 7 steps done · now: 1\. Ajouter le projet sur la box$/);
    // Replié : un projet qui n'a rien entamé ne lance rien d'autre que la lecture de ses étapes.
    assert.equal(lu.deplie, false);
    assert.deepEqual(box.appels, [COMMANDES.etapes]);
    assert.deepEqual(terminal(), []);
  });

  test("un projet ajouté par l'écran : l'ajout est noté fait — la box a répondu pour lui —, et la vérification part d'elle-même", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);

    const lu = await guide(services);

    assert.equal(lu.deplie, true);
    assert.deepEqual(box.appels.slice(0, 4), [COMMANDES.etapes, "installation etapes ajout faite", COMMANDES.etapes, JUGEMENT]);
    assert.deepEqual(etats(lu), { ajout: "done", init: "todo", verification: "done", stations: "todo", protection: "todo", decisions: "todo", demarrage: "todo" });
    assert.equal(lu.courante, "init");
    assert.equal(lu.etapes.find(({ courante }) => courante)?.id, "init");
    assert.equal((await box.etapesAuJournal())?.courante, "init");
  });

  test("sur une box sans geste à jour, la commande unique et sa raison sont dites d'emblée, sans qu'aucun bouton ait été pressé — et la vérification attend le chef", async (t) => {
    const box = boxSimulee(t, { verification: () => SANS_GESTES });
    const { services } = app(box);
    services.suivre(CALCULUS);

    const lu = await guide(services);

    assert.equal(lu.annonces.etat, "lues");
    const geste = lu.annonces.liste.find(({ texte }) => texte === GESTE_TROP_VIEUX);
    assert.deepEqual(geste, { titre: "On the station, by someone with `sudo` there", texte: GESTE_TROP_VIEUX, geste: GESTE_A_NIVEAU });
    // Le manque des stations n'est pas un geste de box : il a son étape, et son bouton.
    assert.ok(!lu.annonces.liste.some(({ texte }) => texte.startsWith("aucune station déclarée")));
    assert.equal(etats(lu).verification, "waiting");
    assert.deepEqual(lu.etapes.find(({ id }) => id === "verification")?.manques, [{ texte: GESTE_TROP_VIEUX, geste: GESTE_A_NIVEAU, etape: "verification" }]);
    assert.equal(lu.etapes.find(({ id }) => id === "stations")?.manques.length, 1);
    // Ce que le chef aura à faire lui-même est aussi dit d'avance : la session d'init, et le démarrage du service, un geste `root`.
    assert.deepEqual(
      lu.annonces.liste.map(({ titre, geste: commande }) => [titre, commande]),
      [
        ["2. Amorcer le dépôt", null],
        ["On the station, by someone with `sudo` there", GESTE_A_NIVEAU],
        ["7. Démarrer la cuisine", "ssh -t box sudo systemctl enable --now brigade@calculus.service"],
      ],
    );
  });

  test("la vérification d'ouverture ne part qu'une fois : rouvrir l'espace relit les étapes, sans la relancer", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    const avant = box.appels.filter((commande) => commande === JUGEMENT).length;

    await guide(services);

    assert.equal(box.appels.filter((commande) => commande === JUGEMENT).length, avant);
  });
});

describe("chaque geste est un bouton ou une réponse", () => {
  test("init : la session `/brigade:init` s'ouvre dans le second ; « mergé » est noté par la box, et l'étape suivante devient la courante", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    const second = services.amorcer(CALCULUS);
    assert.ok(!("refus" in second) && second.genre === "second");
    assert.deepEqual(terminal(), [{ lance: `claude ${INIT} /projets/calculus`, ecrits: [] }]);

    assert.equal(await services.direMerge(CALCULUS, true), undefined);
    const lu = await guide(services);

    assert.ok(box.appels.includes("installation etapes init faite"));
    assert.equal(etats(lu).init, "done");
    assert.equal(lu.courante, "stations");
    assert.match(lu.fait?.titre ?? "", /merge of `\/brigade:init` is recorded/);
  });

  test("stations : celles que la box fournit sont proposées, sans plafond ; déclarées au plafond choisi, l'étape est faite", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);

    const avant = await guide(services);
    const detail = avant.etapes.find(({ id }) => id === "stations")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "stations");
    assert.deepEqual(detail.lu, { proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"] }], absent: null, declarees: [] });

    // Un plafond qui manque : rien ne part.
    const appels = box.appels.length;
    assert.match((await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 0 }]))?.refus ?? "", /has no default/);
    assert.match((await services.declarerStations(CALCULUS, []))?.refus ?? "", /at least one station/);
    assert.match((await services.declarerStations(CALCULUS, [{ nom: "box/claude; reboot", cooks: 2 }]))?.refus ?? "", /not a station its main station provides/);
    assert.equal(box.appels.length, appels);

    assert.equal(await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]), undefined);
    const apres = await guide(services);

    assert.ok(box.appels.includes("installation stations box/claude:2:code+raisonnement"));
    assert.equal(etats(apres).stations, "done");
    assert.equal(apres.courante, "protection");
  });

  test("protection : la branche est protégée par un bouton ; sans les droits, ce qui manque est dit avec l'action qui le donne, et l'étape attend le chef", async (t) => {
    const box = boxSimulee(t, { admin: false });
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 1 }]);

    const avant = await guide(services);
    const detail = avant.etapes.find(({ id }) => id === "protection")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "protection");
    assert.equal(detail.lu.protection, "absente");
    assert.match(detail.lu.droits[0]?.action ?? "", /donner le rôle Admin sur chef\/calculus à `chef`/);

    await services.proteger(CALCULUS);
    const bloquee = await guide(services);

    assert.equal(etats(bloquee).protection, "waiting");
    assert.equal(bloquee.fait?.ok, false);
    assert.equal(box.protegee(), false);
  });

  test("décisions : une à la fois, sa question et ses options ; celles que le démarrage ne réclame pas se posent ou se passent", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 1 }]);
    await services.proteger(CALCULUS);

    const avant = await guide(services);
    assert.equal(avant.courante, "decisions");
    const detail = avant.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "decisions");
    // Le calibrage est posé par l'ajout : la première qui reste ne retient pas le démarrage.
    assert.equal(detail.lu.courante?.nom, gesteDe("BRIGADE_DRIFT_TICKET_TOKENS"));
    assert.equal(detail.passable, true);
    assert.match(detail.lu.courante?.question ?? "", /tokens/);

    assert.match((await services.repondre(CALCULUS, ["500000; reboot"]))?.refus ?? "", /not a value the station reads/);
    assert.equal(await services.repondre(CALCULUS, ["500000"]), undefined);
    // Le démarrage ne réclamait rien : la box note l'étape faite dès la première réponse. Celles
    // qui restent se présentent encore, une à une, jusqu'à la fin de l'installation.
    const repondu = await guide(services);
    assert.equal(etats(repondu).decisions, "done");
    assert.equal(repondu.courante, "demarrage");
    const suivante = repondu.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(suivante?.etat === "lu" && suivante.id === "decisions");
    assert.equal(suivante.lu.courante?.nom, gesteDe("BRIGADE_DRIFT_LOST_TOKENS"));
    assert.equal(suivante.passable, false);
    assert.match((await services.passerDecisions(CALCULUS))?.refus ?? "", /not the current one/);
    assert.equal(await services.repondre(CALCULUS, ["2000000"]), undefined);
    assert.ok(box.appels.includes("installation decisions courante 2000000"));
  });

  test("les décisions qui ne retiennent pas le démarrage se passent : l'étape est notée faite, sans réponse", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    for (const etape of ["init", "stations", "protection"]) await box.lancer({ nom: "calculus" }, `installation etapes ${etape} faite`);
    assert.equal((await guide(services)).courante, "decisions");

    assert.equal(await services.passerDecisions(CALCULUS), undefined);

    assert.ok(box.appels.includes("installation etapes decisions faite"));
    assert.equal(etats(await guide(services)).decisions, "done");
  });

  test("une décision que le démarrage réclame ne se passe pas : elle se répond", async (t) => {
    // Un projet ajouté avant que l'ajout pose le calibrage : le modèle du manager n'en a pas.
    const box = boxSimulee(t, { calibrage: false });
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    for (const etape of ["init", "stations", "protection"]) await box.lancer({ nom: "calculus" }, `installation etapes ${etape} faite`);

    const lu = await guide(services);
    const detail = lu.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "decisions");
    assert.deepEqual([detail.lu.courante?.nom, detail.lu.courante?.reclamee, detail.passable], [gesteDe("BRIGADE_MANAGER_MODEL"), true, false]);
    assert.match((await services.passerDecisions(CALCULUS))?.refus ?? "", /start still requires a decision/);

    assert.equal(await services.repondre(CALCULUS, ["sonnet"]), undefined);
    assert.equal(etats(await guide(services)).decisions, "done");
  });

  test("une seule action à la fois : la seconde est refusée, et rien ne part pour elle", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    const premiere = services.direMerge(CALCULUS, true);
    const seconde = await services.proteger(CALCULUS);
    await premiere;

    assert.match(seconde?.refus ?? "", /Another installation action is running/);
    assert.ok(!box.appels.includes("installation protection poser"));
  });
});

describe("de « Ajouter le projet » à « installation terminée »", () => {
  test("bout en bout par des boutons et des réponses : rien n'est à coller dans un terminal, sauf le démarrage du service, annoncé dès l'ouverture et écrit par l'app", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);
    // L'écran d'ajout vient d'installer le projet sur sa box.
    services.suivre(CALCULUS);
    const ouvert = await guide(services);
    const annonce = ouvert.annonces.liste.find(({ titre }) => titre === "7. Démarrer la cuisine")?.geste;
    assert.equal(annonce, "ssh -t box sudo systemctl enable --now brigade@calculus.service");

    services.amorcer(CALCULUS);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]);
    await services.proteger(CALCULUS);
    while ((await guide(services)).courante === "decisions") {
      const detail = (await guide(services)).etapes.find(({ id }) => id === "decisions")?.detail;
      assert.ok(detail?.etat === "lu" && detail.id === "decisions");
      assert.equal(await services.passerDecisions(CALCULUS), undefined);
    }
    assert.equal((await guide(services)).courante, "demarrage");

    const shell = await services.demarrer(CALCULUS);

    assert.ok(!("refus" in shell) && shell.genre === "shell");
    const fini = await guide(services);
    assert.equal(fini.courante, null);
    assert.ok(fini.etapes.every(({ etat }) => etat === "done"));
    assert.equal(fini.titre, "Installation — finished: the 7 steps are done");
    assert.deepEqual(fini.annonces.liste, []);
    assert.equal((await box.etapesAuJournal())?.courante, null);
    // Ce que l'app a mis dans un terminal : la session d'init, et le démarrage — écrit, pas envoyé.
    assert.deepEqual(terminal(), [
      { lance: `claude ${INIT} /projets/calculus`, ecrits: [] },
      { lance: "/bin/zsh -l /projets/calculus", ecrits: [annonce] },
    ]);
    // Chaque commande partie vers la box est une commande du runtime, sous `installation`.
    assert.ok(box.appels.every((commande) => commande === "installation" || commande.startsWith("installation ")), box.appels.join("\n"));
  });

  test("« Démarrer » sur une box qui n'est pas verte : rien n'est terminé, rien n'est écrit, et les étapes à reprendre le redisent", async (t) => {
    let vert = true;
    const box = boxSimulee(t, { verification: () => (vert ? PRETS : SANS_GESTES) });
    const { services, terminal } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    for (const etape of ["init", "stations", "protection", "decisions"]) await box.lancer({ nom: "calculus" }, `installation etapes ${etape} faite`);
    assert.equal((await guide(services)).courante, "demarrage");

    vert = false;
    const rendu = await services.demarrer(CALCULUS);

    assert.match(refus(rendu), /^Nothing is written: the station did not say everything is green/);
    assert.deepEqual(terminal(), []);
    const lu = await guide(services);
    assert.equal(lu.fait?.ok, false);
    assert.equal(lu.courante, "verification");
  });

  test("« Démarrer » n'écrit rien avant la dernière étape", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);
    await guide(services);

    assert.match(refus(await services.demarrer(CALCULUS)), /not at its last step/);
    assert.ok(!box.appels.includes("installation etapes demarrage faite"));
    assert.deepEqual(terminal(), []);
  });
});

describe("fermer l'app, la rouvrir : l'installation reprend où elle en était", () => {
  test("une app neuve sur un projet à mi-installation montre les mêmes étapes faites, met en avant la courante, et s'ouvre d'elle-même", async (t) => {
    const box = boxSimulee(t);
    const avant = app(box);
    avant.services.suivre(CALCULUS);
    await guide(avant.services);
    await avant.services.direMerge(CALCULUS, true);
    await avant.services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]);
    const laissee = await guide(avant.services);

    // L'app est fermée : rien de ce qu'elle tenait ne reste. Une autre s'ouvre, sur la même box.
    const apres = app(box);
    const reprise = await guide(apres.services);

    assert.deepEqual(etats(reprise), etats(laissee));
    assert.deepEqual(etats(reprise), { ajout: "done", init: "done", verification: "done", stations: "done", protection: "todo", decisions: "todo", demarrage: "todo" });
    assert.equal(reprise.courante, "protection");
    assert.deepEqual(reprise.etapes.filter(({ courante }) => courante).map(({ id }) => id), ["protection"]);
    assert.equal(reprise.deplie, true);
    assert.match(reprise.titre, /4 of 7 steps done · now: 5\. Protéger la branche d'intégration$/);
    const detail = reprise.etapes.find(({ id }) => id === "protection")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "protection");
  });
});

describe("ce que la box ne rend pas", () => {
  test("une box pas jointe : aucune étape n'est inventée, ce que l'app a obtenu est montré avec son cas", async (t) => {
    const { services } = (() => {
      const { terminaux } = fauxTerminaux();
      const lancer = async (): Promise<Rendu> => ({ lance: "$ ssh box", erreur: Object.assign(new Error("ssh"), { code: 255, killed: false, cmd: "ssh" }), sortie: "", erreurs: "ssh: connect to host box port 22: Connection refused\n" });
      return { services: tenirServices({ delaiMs: 60_000, lancer, session: terminaux.session, shell: terminaux.shell, surGuide: () => {} }) };
    })();

    const lu = await guide(services);

    assert.deepEqual(lu.etapes, []);
    assert.ok(lu.lecture.etat === "echec");
    assert.equal(lu.lecture.titre, "NOT REACHED");
    assert.equal(lu.titre, "Installation — the station did not return its steps");
  });

  test("un runtime d'avant les étapes : ce qu'il a rendu est montré, et ce qui l'explique", async (t) => {
    const { terminaux } = fauxTerminaux();
    const lancer = async (): Promise<Rendu> => ({ lance: "$ ssh box", erreur: Object.assign(new Error("usage"), { code: 2, killed: false, cmd: "ssh" }), sortie: "", erreurs: "brigade : usage : … installation -- [labels | setup [<cooks>] | desinstaller [--confirmer]]\n" });
    const services = tenirServices({ delaiMs: 60_000, lancer, session: terminaux.session, shell: terminaux.shell, surGuide: () => {} });

    const lu = await guide(services);

    assert.ok(lu.lecture.etat === "illisible");
    assert.match(lu.lecture.obtenu, /desinstaller \[--confirmer\]\]\n\n→ exit code 2$/);
    assert.match(lu.lecture.lignes.join("\n"), /predates this step/);
  });

  test("un projet sans box n'a pas d'installation : rien à lire, rien à faire, rien à démarrer", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);
    const sansBox: Projet = { nom: "calculus", dossier: "/projets/calculus" };

    assert.equal(await services.guide(sansBox), undefined);
    assert.match((await services.direMerge(sansBox, true))?.refus ?? "", /does not say where its station is/);
    assert.match((await services.verifier(sansBox))?.refus ?? "", /does not say where its station is/);
    assert.match(refus(services.amorcer(sansBox)), /does not say where its station is/);
    assert.match(refus(await services.demarrer(sansBox)), /does not say where its station is/);
    assert.deepEqual(box.appels, []);
    assert.deepEqual(terminal(), []);
  });

  test("un projet dont le dossier n'est pas là n'a pas de terminal : ni session, ni shell — sa box, elle, s'installe", async (t) => {
    const box = boxSimulee(t);
    const { services, terminal } = app(box);
    const refuse: Projet = { ...CALCULUS, refus: "dossier introuvable : /projets/calculus" };

    assert.equal(refus(services.amorcer(refuse)), "“calculus” does not open: dossier introuvable : /projets/calculus");
    assert.equal(await services.direMerge(refuse, true), undefined);
    assert.equal(etats(await guide(services, refuse)).init, "done");
    assert.equal(refus(await services.demarrer(refuse)), "“calculus” does not open: dossier introuvable : /projets/calculus");
    assert.deepEqual(terminal(), []);
  });

  test("chaque projet a son installation, et un projet qui change de box repart de ce que dit la nouvelle", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    assert.equal((await guide(services, PARADE)).lecture.etat, "echec");
    assert.equal((await guide(services, { ...CALCULUS, box: { hote: "autre-box" } })).deplie, true);
    services.oublier("calculus");
    assert.equal((await guide(services)).deplie, true);
  });
});

describe("ce que l'app lit du runtime : ses formes, telles qu'il les écrit", () => {
  test("un manque se lit avec sa flèche et l'étape qu'il nomme ; une flèche sous `à savoir` ne retient rien", () => {
    assert.deepEqual(manquesDe(SANS_GESTE), [
      { texte: GESTE_TROP_VIEUX, geste: GESTE_A_NIVEAU, etape: "verification" },
      { texte: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente", geste: "`brigade calculus installation stations`", etape: "stations" },
    ]);
    assert.deepEqual(manquesDe(PRET), []);
    assert.equal(manquesDe(INCOMPLET).length, 2);
  });

  test("le runtime écrit ses manques dans la forme que l'app lit", () => {
    const cli = readFileSync(join(RACINE, "runtime/src/installation-cli.ts"), "utf8");
    assert.ok(cli.includes("console.log(`  ${MARQUES[constat.etat].padEnd(10)}${constat.texte}`);"));
    assert.ok(cli.includes("console.log(`            → ${constat.geste}`);"));
    assert.ok(cli.includes("console.log(`            → step to resume: ${nommerEtape(constat.etape)} (${constat.etape})`);"));
  });

  test("une forme que l'app ne connaît pas n'est pas lue : rien n'en est déduit", () => {
    for (const lire of [lireEtapes, lireStations, lireProtection, lireCourante]) {
      for (const sortie of ["", "Bienvenue sur la box.", "{}", '{"etapes":"non","courante":null}', "[1,2]"]) assert.equal(lire(sortie), undefined, sortie);
    }
    assert.equal(lireEtapes('{"courante":"ailleurs","etapes":[]}'), undefined);
  });
});

describe("l'écran, tel que la vue le pose", () => {
  // L'espace de « calculus », ouvert par sa case de la barre, sur l'installation que l'app tient de sa box.
  async function ouvrirLEcran(lu: Guide) {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [CALCULUS], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      service: () => lu,
    });
    vue.element("projets").children[1]?.click();
    await repos();
    return vue;
  }
  // Ce que l'écran dit au survol : le nom accessible de chaque icône d'aide posée dessous.
  const survols = (element: Faux) => element.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);

  test("toutes les étapes, chacune avec son état, à quoi elle sert et ce qui se passe si on la saute ; la courante mise en avant ; ce qui sera au chef, en tête", async (t) => {
    const box = boxSimulee(t, { verification: () => SANS_GESTES });
    const { services } = app(box);
    services.suivre(CALCULUS);
    const lu = await guide(services);

    const vue = await ouvrirLEcran(lu);

    const service = vue.element("service") as Faux & { open?: boolean };
    assert.equal(service.hidden, false);
    assert.equal(service.open, true);
    // #699 : même en cours, l'installation ne redirige pas — le clic sur un projet ouvre le rail, pas Paramètres.
    assert.equal(vue.element("etat").hidden, true);
    assert.equal(vue.element("service-titre").textContent, lu.titre);
    const etapes = vue.element("service-etapes").children;
    assert.equal(etapes.length, ETAPES.length);
    for (const [rang, etape] of ETAPES.entries()) {
      const posee = etapes[rang];
      assert.ok(posee !== undefined);
      assert.ok(posee.textContent.includes(`${rang + 1}. ${etape.titre}`));
      // Le mode d'emploi d'une étape n'est pas écrit à plat : il est au survol de son titre.
      assert.ok(survols(posee).some((dit) => dit.includes(`What it is for: ${etape.sert}`) && dit.includes(`If you skip it: ${etape.sauter}`)), etape.id);
      assert.doesNotMatch(posee.dessous("p").map(({ textContent }) => textContent).join("\n"), /What it is for:|If you skip it:/, etape.id);
    }
    assert.deepEqual(etapes.map(({ className }) => className), ["", "courante", "", "", "", "", ""]);
    assert.deepEqual(etapes.map(({ dataset }) => dataset.etat), ["done", "todo", "waiting", "todo", "todo", "todo", "todo"]);
    // La commande unique et sa raison, en tête, avant tout bouton.
    const tete = vue.element("service-tete");
    assert.ok(tete.textContent.includes(GESTE_TROP_VIEUX));
    // La commande exacte n'est pas écrite à plat : elle est au survol de sa ligne.
    assert.ok(survols(tete).includes(GESTE_A_NIVEAU));
    assert.ok(survols(tete).includes("ssh -t box sudo systemctl enable --now brigade@calculus.service"));
    // L'étape courante a ses boutons ; les autres n'en ont pas.
    assert.deepEqual(etapes[1]?.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), ["Initialize the project in the second", "The initialization is merged onto the integration branch"]);
    assert.ok(etapes.filter((_, rang) => rang !== 1).every((etape) => etape.dessous("button").every(({ className }) => className === "aide")));
  });

  test("les stations se déclarent par une case et un nombre : la vue porte le choix, sans rien écrire elle-même", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);
    const lu = await guide(services);

    const vue = await ouvrirLEcran(lu);
    const stations = vue.element("service-etapes").children[3];
    assert.ok(stations !== undefined);
    const nombre = stations.dessous("input").find((champ) => (champ as Faux & { type?: string }).type === "number");
    assert.ok(nombre !== undefined);
    nombre.value = "3";
    stations.dessous("button").find(({ textContent }) => textContent === "Declare the stations")?.click();
    await repos();

    assert.deepEqual(vue.dernier("declarerStations"), ["calculus", [{ nom: "box/claude", cooks: 3 }]]);
  });

  // Le bloc de « Vérifier », sous son bouton : le verdict, puis ce qu'il dit.
  const verificationDe = (vue: Awaited<ReturnType<typeof ouvrirLEcran>>) => vue.element("service-tete").dessous("div").find(({ className }) => className === "verification") ?? assert.fail("aucune vérification posée");
  const partie = (verification: Faux, classe: string) => verification.children.find(({ className }) => className === classe);
  // Le mode d'emploi qu'elle portait, et le verdict qu'il accompagnait : plus rien de cela.
  const MODE_D_EMPLOI = /Each `MANQUE` line|the arrow \(`→`\)|Where the arrow says|holds nothing back —|NOT READY/;
  const RANG_DES_STATIONS = ETAPES.findIndex(({ id }) => id === "stations") + 1;

  test("prêt : la première ligne est la phrase « prêt », sans manque ni mode d'emploi ; la ligne `à savoir` à part ; aucune sortie brute", async (t) => {
    const box = boxSimulee(t, { verification: () => PRETS });
    const { services } = app(box);
    services.suivre(CALCULUS);
    const lu = await guide(services);
    assert.ok(lu.verification?.etat === "pret");

    const vue = await ouvrirLEcran(lu);

    const verification = verificationDe(vue);
    const [premiere] = verification.children;
    assert.equal(premiere?.textContent, "prêt : rien ne manque pour lancer un cook");
    assert.equal(premiere?.dataset.verdict, "pret");
    assert.equal(verification.dessous("li").length, 0);
    assert.doesNotMatch(vue.element("service-tete").textContent, MODE_D_EMPLOI);
    // Le geste de la ligne `à savoir` est au survol, pas écrit après une flèche.
    const aSavoir = partie(verification, "a-savoir");
    assert.deepEqual(aSavoir?.dessous("p").map(({ textContent }) => textContent), [`${PRETS[2]?.texte}?`]);
    assert.deepEqual(survols(aSavoir ?? verification), [PRETS[2]?.geste]);
    // La sortie brute n'est montrée nulle part : ni « detail », ni bloc.
    assert.equal(partie(verification, "detail"), undefined);
    assert.equal(verification.dessous("pre").length, 0);
    assert.ok(lu.verification.detail.includes(PRET));
  });

  test("pas prêt : « pas prêt : N choses à faire », une ligne par manque avec qui agit — au chef un bouton ou la commande exacte, à copier ; à brigade, rien", async (t) => {
    const box = boxSimulee(t, { verification: () => QUATRE });
    const { services } = app(box);
    services.suivre(CALCULUS);
    const lu = await guide(services);
    assert.ok(lu.verification?.etat === "pas-pret");

    const vue = await ouvrirLEcran(lu);

    const verification = verificationDe(vue);
    assert.equal(verification.children[0]?.textContent, "pas prêt : 4 choses à faire");
    const lignes = verification.dessous("li");
    const textes = (poses: Faux[]) => poses.map(({ textContent }) => textContent);
    assert.deepEqual(lignes.map(({ dataset }) => dataset.acteur), ["chef", "chef", "chef", "brigade"]);
    assert.deepEqual(lignes.map((ligne) => ligne.dessous("strong")[0]?.textContent), ["you:", "you:", "you:", "brigade, on its own — nothing for you to do:"]);
    assert.ok(lignes[0]?.textContent.includes(SANS_GESTES[0]?.simple ?? "∅"));
    // Un geste que l'app ne fait pas : la commande exacte, au survol — jamais écrite à plat.
    assert.equal(lignes[0]?.dessous("pre").length, 0);
    assert.deepEqual(survols(lignes[0] ?? verification), ["sudo git -C /opt/brigade pull --ff-only"]);
    // Un geste que l'app fait : son bouton — ou, pour un choix, celui qui mène à son étape.
    assert.deepEqual(textes(lignes[1]?.dessous("button") ?? []), [`Go to step ${RANG_DES_STATIONS}. ${ETAPES[RANG_DES_STATIONS - 1]?.titre}`]);
    assert.deepEqual(textes(lignes[2]?.dessous("button") ?? []), ["Protect the integration branch"]);
    lignes[2]?.dessous("button")[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("proteger"), ["calculus"]);
    // Ce que brigade lève seule n'a ni bouton ni commande.
    assert.deepEqual([lignes[3]?.dessous("button").length, lignes[3]?.dessous("pre").length], [0, 0]);
    // La ligne `à savoir` n'est pas un manque : à part, hors du compte.
    assert.equal(partie(verification, "a-savoir")?.dessous("p").length, 1);
    assert.ok(!lignes.some(({ textContent }) => textContent.includes("push protection")));
    assert.doesNotMatch(vue.element("service-tete").textContent, MODE_D_EMPLOI);
    assert.equal(partie(verification, "detail"), undefined);
  });

  test("plantée sur /etc/sudoers.d : « problème de brigade, pas de ton projet », #654, rien à faire — nulle part « NOT READY », et rien n'est noté de la box", async (t) => {
    const box = boxSimulee(t, { verification: () => EACCES });
    const { services } = app(box);
    services.suivre(CALCULUS);
    const lu = await guide(services);
    assert.ok(lu.verification?.etat === "plantee");

    const vue = await ouvrirLEcran(lu);

    const verification = verificationDe(vue);
    const phrase = verification.children[0]?.textContent ?? "";
    assert.match(phrase, /problème de brigade, pas de ton projet/);
    assert.match(phrase, /#654/);
    assert.match(phrase, /tu n'as rien à faire/);
    assert.equal(verification.dessous("li").length, 0);
    assert.ok(verification.dessous("p").some(({ textContent }) => textContent.startsWith("#654 — ")));
    assert.doesNotMatch(vue.element("service-tete").textContent, MODE_D_EMPLOI);
    assert.ok(!vue.element("service-tete").textContent.includes("NOT READY"));
    assert.ok(lu.verification.detail.includes(`brigade : ${EACCES.message}\n`));
    // Rien n'a été constaté du projet : l'étape « verification » n'est pas notée.
    assert.equal(etats(lu).verification, "todo");
  });

  test("terminée : l'écran d'installation n'est plus posé — ni étapes numérotées, ni « Verify » : l'espace est le rail", async (t) => {
    const box = boxSimulee(t, { verification: () => PRETS });
    const { services } = app(box);
    await guide(services);
    for (const etape of ["init", "stations", "protection", "decisions"]) await box.lancer({ nom: "calculus" }, `installation etapes ${etape} faite`);
    await box.lancer({ nom: "calculus" }, "installation etapes demarrage faite");
    const lu = await guide(services);
    assert.equal(lu.termine, true);

    const vue = await ouvrirLEcran(lu);

    assert.equal((vue.element("service") as Faux & { hidden?: boolean }).hidden, true);
    assert.equal(vue.element("service-etapes").children.length, 0);
    assert.ok(!vue.element("service-tete").textContent.includes("Verify"));
  });
});

describe("un projet installé n'affiche jamais l'écran d'installation", () => {
  const finies = JSON.stringify({ courante: null, etapes: ETAPES.map(({ id, titre, sert, sauter, geste }) => ({ id, titre, etat: "done", sert, sauter, geste })) });
  // Une box qui dit l'installation terminée, puis — si on le lui demande — ne répond plus.
  function boxInstallee() {
    const { terminaux } = fauxTerminaux();
    const etat = { muette: false };
    const lancer = async (_servi: unknown, commande: string): Promise<Rendu> => {
      if (etat.muette) return { lance: "$ ssh box", erreur: Object.assign(new Error("ssh"), { code: 255, killed: false, cmd: "ssh" }), sortie: "", erreurs: "ssh: connect to host box port 22: Connection refused\n" };
      return { lance: `$ ssh box ${commande}`, erreur: null, sortie: commande === COMMANDES.etapes ? `${finies}\n` : "", erreurs: "" };
    };
    const services = tenirServices({ delaiMs: 60_000, lancer, session: terminaux.session, shell: terminaux.shell, surGuide: () => {} });
    return { services, etat };
  }

  test("installation terminée : le guide dit qu'il n'y a rien à montrer", async () => {
    const { services } = boxInstallee();
    assert.equal((await guide(services)).termine, true);
  });

  test("installée, puis la box ne répond plus : on ne retombe pas sur l'écran d'installation", async () => {
    const { services, etat } = boxInstallee();
    assert.equal((await guide(services)).termine, true);
    etat.muette = true;
    const lu = await guide(services);
    assert.ok(lu.lecture.etat === "echec");
    assert.equal(lu.termine, true);
  });

  test("installation pas terminée : l'écran s'affiche comme avant, même si la box cesse de répondre ensuite", async (t) => {
    const box = boxSimulee(t);
    const { services } = app(box);
    assert.equal((await guide(services)).termine, false);
  });
});
