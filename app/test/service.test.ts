// La mise en service d'un projet, après l'ajout : amorcer son dépôt, merger,
// vérifier, démarrer — et ses trois états : init non mergé, vérification
// incomplète, tout prêt. La vérification se joue contre un faux `ssh` écrit par
// chaque test, les terminaux contre de faux pty : ni réseau, ni box, ni `claude`.
// Aucun test n'attend une durée — une vérification rend la main quand elle a fini.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Projet } from "../src/config.ts";
import { commandeDeDemarrage, INIT, tenirServices, verifier, type Parcours } from "../src/service.ts";
import { ouvrirTerminaux, type Lancement, type Terminal } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const CALCULUS: Projet = { nom: "calculus", dossier: "/projets/calculus", box: { hote: "box" } };
const PARADE: Projet = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Ce que `installation` écrit d'un projet prêt, et d'un projet à qui il manque
// deux choses — recopié de docs/installer.md, « Vérifier que le projet est prêt ».
const PRET = [
  "",
  "Sur la machine",
  "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
  "",
  "Dans le dépôt",
  "  ok        bindings : bloc présent, branche d'intégration `main`",
  "",
  "Sur GitHub",
  "  à savoir  la push protection de GitHub n'est pas constatée sur chef/calculus (GitHub en dit : `disabled`)",
  "            → docs/installer.md, « Déclarer le projet »",
  "",
  "brigade : projet « calculus » : prêt — rien ne manque pour lancer un cook",
].join("\n");
const INCOMPLET = [
  "",
  "Dans le dépôt",
  "  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel",
  "            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`",
  "",
  "Sur GitHub",
  "  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …",
  "            → la même commande, suivie de `labels`",
  "",
  "brigade : projet « calculus » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste",
].join("\n");

// Ce que le faux ssh écrit, tel quel, sur sa sortie standard.
const dit = (texte: string) => `cat <<'FIN'\n${texte}\nFIN`;
const NOTE = `echo "$*" >>"$D/appels"`;
// Prêt dès que le fichier `pret` est posé dans le répertoire du test ; incomplet d'ici là.
const SELON = `${NOTE}\nif [ -f "$D/pret" ]; then\n${dit(PRET)}\nelse\n${dit(INCOMPLET)}\nexit 1\nfi`;

type FauxPty = Lancement & { ecrits: string[] };

// Un essai : un faux `ssh` — un script sh, où `$D` est le répertoire du test —, de
// faux pty, et la mise en service branchée dessus comme dans le process principal (main.ts).
function essai(t: TestContext, corps: string) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-service-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(ssh, 0o755);

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
  const reglages = { ssh, delaiMs: 60_000, connexionS: 10 };
  const services = tenirServices({ verifier: (servi) => verifier(reglages, servi), session: terminaux.session, shell: terminaux.shell });
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  const poser = (nom: string) => writeFileSync(join(racine, nom), "");
  // Ce que les terminaux ont reçu : chaque pty lancé, et ce qui y a été écrit.
  const terminal = () => lances.map(({ commande, args, dossier, ecrits }) => ({ lance: [commande, ...args, dossier].join(" "), ecrits }));
  return { racine, reglages, services, lu, poser, terminal };
}

// Le parcours d'un projet qui a une box : le test échoue net s'il n'en a pas.
function parcours(rendu: Parcours | undefined): Parcours {
  assert.ok(rendu, "ce projet n'a pas de mise en service");
  return rendu;
}
const refus = (rendu: Terminal | { refus: string }): string => ("refus" in rendu ? rendu.refus : "");

describe("vérifier : `installation`, lancée une fois sur la box du projet", () => {
  test("ce qui part est le geste de la box, comme la veille le lance — `brigade <nom> installation`, sans terminal ni rien de plus", async (t) => {
    const { reglages, lu } = essai(t, `${NOTE}\n${dit(PRET)}`);

    await verifier(reglages, { nom: "calculus", box: { hote: "chef@box" } });

    assert.equal(lu("appels"), `${OPTIONS} -- chef@box brigade calculus installation\n`);
  });

  test("sortie en 0 avec sa ligne de verdict : prêt — et ce qu'elle a écrit est rendu en entier, `à savoir` compris", async (t) => {
    const { reglages } = essai(t, dit(PRET));

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "pret");
    assert.equal("obtenu" in rendu && rendu.obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade calculus installation\n${PRET}\n\n→ code de sortie 0`);
    assert.ok(!Number.isNaN(Date.parse(rendu.a)));
  });

  test("sortie en 1 : incomplète — chaque point qui manque est rendu avec la flèche de ce qui reste à faire, mot pour mot", async (t) => {
    const { reglages } = essai(t, `${dit(INCOMPLET)}\nexit 1`);

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "incomplete");
    const obtenu = "obtenu" in rendu ? rendu.obtenu : "";
    assert.equal(obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade calculus installation\n${INCOMPLET}\n\n→ code de sortie 1`);
    // Les deux manques, chacun suivi de son geste.
    const lignes = obtenu.split("\n");
    for (const manque of lignes.filter((ligne) => ligne.includes("MANQUE"))) assert.match(lignes[lignes.indexOf(manque) + 1] ?? "", /^ +→ /);
    assert.equal(lignes.filter((ligne) => ligne.includes("MANQUE")).length, 2);
  });

  test("sortie en 2 : la commande a été lancée et a refusé son environnement — pas prêt, et ce qu'elle a dit sur sa sortie d'erreur est rendu", async (t) => {
    const { reglages } = essai(t, `echo 'brigade : BRIGADE_MAX_TURNS : « beaucoup » n'"'"'est pas un entier' >&2\nexit 2`);

    const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

    assert.equal(rendu.etat, "incomplete");
    assert.match("obtenu" in rendu ? rendu.obtenu : "", /BRIGADE_MAX_TURNS : « beaucoup » n'est pas un entier\n\n→ code de sortie 2$/);
  });

  test("un 0 sans la ligne de verdict n'est pas un « prêt » : une commande forcée qui remplace celle de l'app, un autre projet", async (t) => {
    for (const sortie of ["Bienvenue sur la box.", PRET.replace("« calculus »", "« parade »"), INCOMPLET, ""]) {
      const { reglages } = essai(t, dit(sortie));

      const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

      assert.equal(rendu.etat, "illisible", sortie);
      assert.ok("obtenu" in rendu && rendu.obtenu.includes(sortie));
    }
  });

  test("la ligne de verdict attendue est celle que le runtime écrit", () => {
    const cli = readFileSync(join(RACINE, "runtime/src/installation-cli.ts"), "utf8");

    assert.ok(cli.includes("brigade : projet « ${projet} » : prêt"), "`installation` n'écrit plus son verdict sous cette forme");
    assert.ok(PRET.includes("brigade : projet « calculus » : prêt"));
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
    test(`sortie en ${code} : aucun verdict — le cas que ce code prouve (${cas}), et ce que la box a rendu`, async (t) => {
      const { reglages } = essai(t, `echo 'ce que la box en dit' >&2\nexit ${code}`);

      const rendu = await verifier(reglages, { nom: "calculus", box: { hote: "box" } });

      assert.equal(rendu.etat, "sans-verdict");
      assert.deepEqual("cas" in rendu && [rendu.cas, rendu.atteinte], [cas, atteinte]);
      assert.match("erreur" in rendu ? rendu.erreur : "", new RegExp(`ce que la box en dit\\n\\n→ code de sortie ${code}$`));
    });
  }

  test("un code qui ne dit aucun cas, sur une box jointe : aucun verdict, et rien n'en est déduit", async (t) => {
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
    for (const hote of ["-oProxyCommand=sh", "--"]) assert.match(refus(commandeDeDemarrage({ ...CALCULUS, box: { hote } }) as { refus: string }), /^rien n'est écrit : « hote » commence par un tiret/);
    for (const hote of ["box\rrm -rf ~", "box\n", "bo\x1bx"]) assert.match(refus(commandeDeDemarrage({ ...CALCULUS, box: { hote } }) as { refus: string }), /^rien n'est écrit : « hote » porte un caractère de contrôle/);
  });

  test("rien n'est écrit pour un nom qui n'est celui d'aucune instance : la box le refuserait, et son unité ne se nomme pas", () => {
    for (const nom of ["Calculus", "mon projet", "calculus; reboot", "-calculus", "calculus\r"]) {
      assert.match(refus(commandeDeDemarrage({ ...CALCULUS, nom }) as { refus: string }), /^rien n'est écrit : /, nom);
    }
  });

  test("un projet sans box n'a rien à démarrer", () => {
    assert.match(refus(commandeDeDemarrage({ nom: "calculus", dossier: "/p" }) as { refus: string }), /ne dit pas où est sa box/);
  });
});

describe("la mise en service : init non mergé, vérification incomplète, tout prêt", () => {
  test("au départ, l'init n'est pas dit mergé : l'app dit qu'il doit l'être avant de continuer, et ne propose ni la vérification ni le démarrage", async (t) => {
    const { services, lu, terminal } = essai(t, SELON);

    const depart = parcours(services.parcours(CALCULUS));

    assert.equal(depart.etape, "init");
    assert.equal(depart.merge, false);
    assert.match(depart.consigne.join("\n"), /Le résultat de `\/brigade:init` doit être mergé sur la branche d'intégration avant de continuer/);
    assert.match(depart.verifierRefuse ?? "", /n'est pas dit mergé/);
    assert.match(depart.demarrerRefuse ?? "", /^Pas de démarrage : le résultat de `\/brigade:init` n'est pas dit mergé/);
    // Refusés ici aussi, pas seulement grisés dans la vue : rien ne part vers la box, rien n'est écrit.
    assert.equal(parcours(await services.verifier(CALCULUS)).verification, undefined);
    assert.equal(refus(services.demarrer(CALCULUS)), depart.demarrerRefuse);
    assert.equal(lu("appels"), "");
    assert.deepEqual(terminal(), []);
  });

  test("amorcer : l'espace du projet reçoit la session `/brigade:init`, dans son dossier — et rien n'en est déduit : l'init n'est toujours pas dit mergé", (t) => {
    const { services, terminal } = essai(t, SELON);

    const second = services.amorcer(CALCULUS);

    assert.equal(INIT, "/brigade:init");
    assert.deepEqual(terminal(), [{ lance: "claude /brigade:init /projets/calculus", ecrits: [] }]);
    assert.ok(!("refus" in second) && second.genre === "second" && second.projet === "calculus");
    const apres = parcours(services.parcours(CALCULUS));
    assert.deepEqual([apres.etape, apres.suivi, apres.merge], ["init", true, false]);
    assert.ok(apres.demarrerRefuse);
  });

  test("dit mergé, pas encore vérifié : la vérification se propose, le démarrage toujours pas", (t) => {
    const { services, lu, terminal } = essai(t, SELON);

    const dit = parcours(services.direMerge(CALCULUS, true));

    assert.deepEqual([dit.etape, dit.merge, dit.verifierRefuse], ["verification", true, undefined]);
    assert.match(dit.demarrerRefuse ?? "", /^Pas de démarrage : la box n'a pas encore vérifié ce projet/);
    assert.equal(refus(services.demarrer(CALCULUS)), dit.demarrerRefuse);
    assert.equal(lu("appels"), "");
    assert.deepEqual(terminal(), []);
  });

  test("vérification incomplète : le résultat est montré en entier, chaque manque avec ce qui reste à faire — et le démarrage est refusé, sans rien écrire", async (t) => {
    const { services, lu, terminal } = essai(t, SELON);
    services.direMerge(CALCULUS, true);

    const verifie = parcours(await services.verifier(CALCULUS));

    assert.equal(lu("appels"), `${OPTIONS} -- box brigade calculus installation\n`);
    assert.equal(verifie.etape, "verification");
    const { verification } = verifie;
    assert.ok(verification?.etat === "incomplete");
    assert.equal(verification.titre, "PAS PRÊT");
    assert.ok(verification.obtenu.includes(INCOMPLET), "la sortie d'`installation` n'est pas montrée en entier");
    assert.match(verification.suite.join("\n"), /Chaque ligne `MANQUE` nomme un point qui n'est pas prêt, et la flèche \(`→`\) dessous ce qui reste à faire/);
    // « La même commande », telle qu'elle se tape depuis ce poste.
    assert.match(verification.suite.join("\n"), /`ssh box brigade calculus installation`/);
    assert.match(verifie.demarrerRefuse ?? "", /^Pas de démarrage : `installation` ne dit pas le projet prêt/);
    assert.equal(refus(services.demarrer(CALCULUS)), verifie.demarrerRefuse);
    assert.deepEqual(terminal(), []);
  });

  test("tout prêt : le démarrage devient possible dès qu'`installation` le rapporte — un shell s'ouvre dans l'espace, la commande y est écrite, et rien ne l'envoie", async (t) => {
    const { services, poser, terminal } = essai(t, SELON);
    services.direMerge(CALCULUS, true);
    assert.equal(parcours(await services.verifier(CALCULUS)).etape, "verification");

    // Le chef a réglé ce qui manquait : la même vérification, rejouée.
    poser("pret");
    const pret = parcours(await services.verifier(CALCULUS));

    assert.equal(pret.etape, "pret");
    assert.ok(pret.verification?.etat === "pret");
    assert.equal(pret.verification.titre, "PRÊT");
    assert.ok(pret.verification.obtenu.includes(PRET));
    assert.equal(pret.demarrerRefuse, undefined);

    const shell = services.demarrer(CALCULUS);

    assert.ok(!("refus" in shell) && shell.genre === "shell" && shell.projet === "calculus");
    assert.deepEqual(terminal(), [{ lance: "/bin/zsh -l /projets/calculus", ecrits: ["ssh -t box sudo systemctl enable --now brigade@calculus.service"] }]);
    assert.match(shell.note, /^écrit dans ce shell, sans Entrée : `ssh -t box sudo systemctl enable --now brigade@calculus\.service`/);
  });

  test("une box qui ne rend pas son verdict n'est pas une box prête : ce que l'app a obtenu est montré, avec son cas, et le démarrage est refusé", async (t) => {
    const { services, terminal } = essai(t, "echo 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255");
    services.direMerge(CALCULUS, true);

    const verifie = parcours(await services.verifier(CALCULUS));

    assert.equal(verifie.etape, "verification");
    assert.ok(verifie.verification?.etat === "sans-verdict");
    assert.equal(verifie.verification.titre, "PAS JOINT");
    assert.deepEqual([verifie.verification.echec.cas, verifie.verification.echec.atteinte], ["ssh-en-echec", false]);
    assert.match(verifie.verification.echec.erreur, /Connection refused/);
    assert.match(verifie.demarrerRefuse ?? "", /^Pas de démarrage : `installation` n'a pas rendu son verdict/);
    assert.ok("refus" in services.demarrer(CALCULUS));
    assert.deepEqual(terminal(), []);
  });

  test("un 0 qui n'est pas le verdict d'`installation` ne permet pas de démarrer", async (t) => {
    const { services } = essai(t, dit("Bienvenue sur la box."));
    services.direMerge(CALCULUS, true);

    const verifie = parcours(await services.verifier(CALCULUS));

    assert.equal(verifie.etape, "verification");
    assert.ok(verifie.verification?.etat === "illisible");
    assert.equal(verifie.verification.titre, "PAS DE VERDICT");
    assert.ok("refus" in services.demarrer(CALCULUS));
  });

  test("une vérification en cours se dit et ne se double pas — et tant qu'elle court, le « prêt » d'avant ne vaut plus : rien ne démarre sur un verdict qu'on refait", async (t) => {
    // Le faux ssh ne répond que lorsque le test le lui dit.
    const { services, poser, lu, racine } = essai(t, `${NOTE}\nwhile [ ! -f "$D/reponds" ]; do sleep 0.05; done\n${dit(PRET)}`);
    services.direMerge(CALCULUS, true);

    const premiere = services.verifier(CALCULUS);
    const seconde = services.verifier(CALCULUS);

    const pendant = parcours(services.parcours(CALCULUS));
    assert.equal(pendant.etape, "verification");
    assert.equal(pendant.verification?.etat, "en-cours");
    assert.match(pendant.verifierRefuse ?? "", /en cours/);
    assert.match(pendant.demarrerRefuse ?? "", /^Pas de démarrage : la vérification est en cours/);
    assert.ok("refus" in services.demarrer(CALCULUS));

    poser("reponds");
    assert.equal(parcours(await premiere).etape, "pret");
    assert.equal(parcours(await seconde).etape, "pret");
    assert.equal(lu("appels").split("\n").filter(Boolean).length, 1);

    // Rejouée, elle retire le « prêt » d'avant tant qu'elle n'a pas répondu.
    rmSync(join(racine, "reponds"));
    const rejouee = services.verifier(CALCULUS);
    assert.equal(parcours(services.parcours(CALCULUS)).etape, "verification");
    assert.ok("refus" in services.demarrer(CALCULUS));
    poser("reponds");
    assert.equal(parcours(await rejouee).etape, "pret");
  });

  test("se dédire du merge ramène à l'init non mergé : le verdict d'avant est lâché, et celui d'une vérification encore en route aussi", async (t) => {
    const { services, poser } = essai(t, `while [ ! -f "$D/reponds" ]; do sleep 0.05; done\n${dit(PRET)}`);
    services.direMerge(CALCULUS, true);
    const enRoute = services.verifier(CALCULUS);

    const dedit = parcours(services.direMerge(CALCULUS, false));
    poser("reponds");
    await enRoute;

    assert.deepEqual([dedit.etape, dedit.verification], ["init", undefined]);
    const apres = parcours(services.parcours(CALCULUS));
    assert.deepEqual([apres.etape, apres.merge, apres.verification], ["init", false, undefined]);
    assert.ok("refus" in services.demarrer(CALCULUS));
  });

  test("chaque projet a sa mise en service : le « prêt » de l'un ne démarre pas l'autre", async (t) => {
    const { services, terminal } = essai(t, dit(PRET));
    services.direMerge(CALCULUS, true);
    await services.verifier(CALCULUS);

    assert.equal(parcours(services.parcours(CALCULUS)).etape, "pret");
    assert.equal(parcours(services.parcours(PARADE)).etape, "init");
    assert.ok("refus" in services.demarrer(PARADE));
    assert.deepEqual(terminal(), []);
  });

  test("un projet qui change de box, ou qui quitte la liste, repart de l'init non mergé : son « prêt » était celui d'une autre box", async (t) => {
    const { services } = essai(t, dit(PRET));
    services.direMerge(CALCULUS, true);
    await services.verifier(CALCULUS);

    assert.equal(parcours(services.parcours({ ...CALCULUS, box: { hote: "autre-box" } })).etape, "init");

    services.direMerge(CALCULUS, true);
    await services.verifier(CALCULUS);
    services.oublier("calculus");
    assert.deepEqual([parcours(services.parcours(CALCULUS)).etape, parcours(services.parcours(CALCULUS)).suivi], ["init", false]);
  });

  test("un projet ajouté par l'écran est suivi : sa mise en service s'ouvre d'elle-même dans son espace ; un autre l'a repliée", (t) => {
    const { services } = essai(t, SELON);

    assert.equal(parcours(services.parcours(CALCULUS)).suivi, false);
    services.suivre(CALCULUS);

    assert.equal(parcours(services.parcours(CALCULUS)).suivi, true);
    assert.equal(parcours(services.parcours(PARADE)).suivi, false);
  });

  test("un projet sans box n'a pas de mise en service : rien à vérifier, rien à démarrer", async (t) => {
    const { services, lu, terminal } = essai(t, SELON);
    const sansBox: Projet = { nom: "calculus", dossier: "/projets/calculus" };

    assert.equal(services.parcours(sansBox), undefined);
    assert.equal(services.direMerge(sansBox, true), undefined);
    assert.equal(await services.verifier(sansBox), undefined);
    assert.match(refus(services.amorcer(sansBox)), /ne dit pas où est sa box/);
    assert.match(refus(services.demarrer(sansBox)), /ne dit pas où est sa box/);
    assert.equal(lu("appels"), "");
    assert.deepEqual(terminal(), []);
  });

  test("un projet dont le dossier n'est pas là n'a pas de terminal : ni session, ni shell — sa box, elle, se vérifie", async (t) => {
    const { services, terminal } = essai(t, dit(PRET));
    const refuse: Projet = { ...CALCULUS, refus: "dossier introuvable : /projets/calculus" };

    assert.equal(refus(services.amorcer(refuse)), "« calculus » ne s'ouvre pas : dossier introuvable : /projets/calculus");
    services.direMerge(refuse, true);
    assert.equal(parcours(await services.verifier(refuse)).etape, "pret");
    assert.equal(refus(services.demarrer(refuse)), "« calculus » ne s'ouvre pas : dossier introuvable : /projets/calculus");
    assert.deepEqual(terminal(), []);
  });
});
