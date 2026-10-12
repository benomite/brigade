// Ajouter un projet en l'installant sur sa box : ce que l'écran refuse avant de
// l'appeler, ce qui part vers elle, et ce que l'app fait de sa réponse — contre un
// faux `ssh` écrit par chaque test, et le vrai fichier des projets. Ni réseau ni box ;
// ce que le geste de la box accepte se lit dans le runtime, pas dans une copie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import * as calibrage from "../../runtime/src/calibrage.ts";
import { lireDemande, Refus } from "../../runtime/src/installateur.ts";
import { boxes } from "../src/config.ts";
import { ajouterSurBox, argumentsDuGeste, declarerTelQuel, depotDe, EFFORTS, gesteDeBox, installer, lireDepot, lireSaisie, MODELES, refusDeSaisie, type Champ, type Issue, type Saisie } from "../src/installation.ts";
import { suivreConfiguration } from "../src/suivi.ts";

const SAISIE: Saisie = {
  dossier: "/projets/calculus",
  nom: "calculus",
  depot: "chef/calculus",
  hote: "box",
  manager: { modele: "opus", effort: "high" },
  reviewer: { modele: "sonnet", effort: "medium" },
  sauvegardes: "/srv/sauvegardes/calculus",
};
const GESTE = "sudo -n /usr/local/bin/brigade-installer install calculus --depot chef/calculus --sauvegardes /srv/sauvegardes/calculus --manager-modele opus --manager-effort high --reviewer-modele sonnet --reviewer-effort medium";
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Ce que le geste de la box rend d'un projet installé, sur une ligne — ses ports, il les a attribués.
const INSTALLE = JSON.stringify({
  ok: true,
  action: "install",
  projet: "calculus",
  depot: "chef/calculus",
  branche: "main",
  compte: "brigade",
  etat: "/var/lib/brigade/calculus",
  clone: "/var/lib/brigade/calculus/depot",
  sauvegardes: "/srv/sauvegardes/calculus",
  ports: { porte: 3129, arbitre: 4100 },
  unites: ["brigade@calculus.service", "brigade-porte@calculus.service", "brigade-sauvegarde@calculus.timer"],
  aSavoir: ["le runtime du projet n'est pas démarré : vérifier d'abord (`brigade calculus installation`), puis `sudo systemctl enable --now brigade@calculus.service`"],
});
// Une ligne que le faux ssh écrit telle quelle, quoi qu'elle porte.
const dit = (ligne: string) => `printf '%s\\n' '${ligne.replaceAll("'", `'\\''`)}'`;
const REPOND = `echo "$*" >>"$D/appels"\n${dit(INSTALLE)}`;
// Un refus du geste : son objet sur la sortie standard, sa phrase sur la sortie d'erreur, son code.
const refus = (code: number, motif: string, message: string) =>
  `echo "$*" >>"$D/appels"\n${dit(`brigade-installer : ${message}`)} >&2\n${dit(JSON.stringify({ ok: false, action: "install", projet: "calculus", motif, message, ecrit: false }))}\nexit ${code}`;

// Un essai : le fichier des projets, suivi comme dans l'app, un dossier de projet
// qui existe, et un faux `ssh` — un script sh, où `$D` est le répertoire du test.
function essai(t: TestContext, corps: string, contenu: unknown = { hotes: ["box", "chef@autre-box"], projets: [] }, delaiMs = 60_000) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-installation-"));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\n${corps}\n`);
  chmodSync(ssh, 0o755);
  mkdirSync(join(racine, "calculus"));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  const suivi = suivreConfiguration({ chemin, surChangement: () => {} });
  t.after(() => {
    suivi.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const saisie: Saisie = { ...SAISIE, dossier: join(racine, "calculus") };
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  // L'ajout tel que le process principal le branche (main.ts).
  const ajouter = (recu: unknown = saisie): Promise<Issue> =>
    ajouterSurBox(recu, {
      boxes: boxes(suivi.configuration()),
      refusDAjout: suivi.refusDAjout,
      ajouter: suivi.ajouter,
      installer: (lue) => installer({ ssh, delaiMs, connexionS: 10 }, lue),
    });
  const declares = () => (JSON.parse(readFileSync(chemin, "utf8")) as { projets: unknown[] }).projets;
  return { racine, ssh, suivi, saisie, lu, ajouter, declares };
}

const lignes = (issue: Issue) => ("lignes" in issue ? [issue.titre, ...issue.lignes].join("\n") : "");

describe("ce que l'écran d'ajout demande", () => {
  test("le calibrage proposé est celui que la box accepte : ses deux listes fermées, et rien d'autre", () => {
    assert.deepEqual(MODELES, calibrage.MODELES);
    assert.deepEqual(EFFORTS, calibrage.EFFORTS);
  });

  test("une saisie complète n'a aucun champ signalé — pour l'une comme pour l'autre des deux box déclarées", () => {
    assert.deepEqual(refusDeSaisie(SAISIE, ["box", "chef@autre-box"]), {});
    assert.deepEqual(refusDeSaisie({ ...SAISIE, hote: "chef@autre-box" }, ["box", "chef@autre-box"]), {});
  });

  const VIDES: [Champ, Partial<Saisie>, RegExp][] = [
    ["dossier", { dossier: "" }, /^Choisis le dossier/],
    ["nom", { nom: " " }, /^Il manque le nom du projet/],
    ["depot", { depot: "" }, /^Il manque le dépôt GitHub/],
    ["hote", { hote: "" }, /^Choisis la box/],
    ["manager-modele", { manager: { modele: "", effort: "high" } }, /^Le modèle du manager n'a pas de défaut/],
    ["manager-effort", { manager: { modele: "opus", effort: "" } }, /^L'effort du manager n'a pas de défaut/],
    ["reviewer-modele", { reviewer: { modele: "", effort: "medium" } }, /^Le modèle du reviewer n'a pas de défaut/],
    ["reviewer-effort", { reviewer: { modele: "sonnet", effort: "" } }, /^L'effort du reviewer n'a pas de défaut/],
    ["sauvegardes", { sauvegardes: "  " }, /^La destination des sauvegardes n'a pas de défaut/],
  ];
  for (const [champ, vide, raison] of VIDES) {
    test(`« ${champ} » vide : ce champ est signalé, lui seul, et rien n'est envoyé à la box`, async (t) => {
      const { saisie, ajouter, lu, declares } = essai(t, REPOND);

      const issue = await ajouter({ ...saisie, ...vide });

      assert.equal(issue.etat, "champs");
      assert.deepEqual(Object.keys(issue.etat === "champs" ? issue.champs : {}), [champ]);
      assert.match((issue.etat === "champs" && issue.champs[champ]) || "", raison);
      assert.equal(lu("appels"), "");
      assert.deepEqual(declares(), []);
    });
  }

  test("rien n'a de défaut : une saisie vide signale chaque champ, les quatre du calibrage et les sauvegardes compris", () => {
    assert.deepEqual(Object.keys(refusDeSaisie(lireSaisie({}), ["box"])), ["dossier", "nom", "depot", "hote", "manager-modele", "manager-effort", "reviewer-modele", "reviewer-effort", "sauvegardes"]);
    // Ce que la vue n'a pas envoyé comme un texte n'est pas pris pour une valeur.
    assert.deepEqual(lireSaisie({ nom: 12, manager: "opus", reviewer: { modele: " sonnet ", effort: null } }), { ...lireSaisie({}), reviewer: { modele: "sonnet", effort: "" } });
  });

  test("un calibrage hors des listes, une destination relative, une box qui n'est pas déclarée : signalés, avec ce qui est attendu", () => {
    const signales = refusDeSaisie({ ...SAISIE, hote: "inconnue", manager: { modele: "gpt", effort: "high" }, reviewer: { modele: "sonnet", effort: "extrême" }, sauvegardes: "~/sauvegardes" }, ["box"]);

    assert.deepEqual(Object.keys(signales), ["hote", "manager-modele", "reviewer-effort", "sauvegardes"]);
    assert.equal(signales.hote, "« inconnue » n'est pas une box déclarée.");
    assert.match(signales["manager-modele"] ?? "", /« gpt » n'est pas dans la liste — opus, sonnet, haiku\.$/);
    assert.match(signales["reviewer-effort"] ?? "", /« extrême » n'est pas dans la liste — low, medium, high, xhigh, max\.$/);
    assert.match(signales.sauvegardes ?? "", /chemin relatif — attendu un chemin absolu, sur la box\.$/);
  });

  test("sans aucune box déclarée, le champ dit où en déclarer une — et rien ne part", () => {
    assert.match(refusDeSaisie({ ...SAISIE, hote: "" }, []).hote ?? "", /^Aucune box n'est déclarée : déclares-en une/);
    assert.equal(refusDeSaisie(SAISIE, []).hote, "« box » n'est pas une box déclarée.");
  });

  test("un nom que la box refuse est refusé avant tout appel à la box, avec la raison affichée", async (t) => {
    const { saisie, ajouter, lu, declares } = essai(t, REPOND);

    for (const [nom, raison] of [["Calculus", /^La box refuse ce nom — il contient « C »\. Attendu : minuscules, chiffres et tirets/], ["mon projet", /il contient espace/], ["-calculus", /il commence par un tiret/]] as const) {
      const issue = await ajouter({ ...saisie, nom });

      assert.equal(issue.etat, "champs", nom);
      assert.match((issue.etat === "champs" && issue.champs.nom) || "", raison);
    }
    assert.equal(lu("appels"), "");
    assert.deepEqual(declares(), []);
  });

  test("le dépôt se refuse comme la box le refuserait : ce que son geste n'accepte pas n'y part pas — et rien de plus", () => {
    const depots = ["chef/calculus", "Chef-2/calc.ulus_3", "a/b", "chef", "chef/", "/calculus", "chef/calculus.git", "https://github.com/chef/calculus", "chef/calc ulus", "-chef/calculus", "chef-/calculus", "chef/..", "chef/.", "chef/a/b", "chef/$(id)"];
    for (const depot of depots) {
      let box: string | undefined;
      try {
        lireDemande(argumentsDuGeste({ ...SAISIE, depot }));
      } catch (erreur) {
        assert.ok(erreur instanceof Refus, depot);
        box = erreur.motif;
      }
      assert.equal(refusDeSaisie({ ...SAISIE, depot }, ["box"]).depot === undefined, box === undefined, `${depot} — la box : ${box}`);
    }
  });
});

describe("le dépôt du dossier choisi", () => {
  test("une origine GitHub dit son dépôt, quelle que soit sa forme — une autre ne dit rien", () => {
    for (const origine of ["https://github.com/chef/calculus.git", "https://github.com/chef/calculus", "https://github.com/chef/calculus/", "git@github.com:chef/calculus.git", "ssh://git@github.com/chef/calculus.git", "https://jeton@github.com/chef/calculus.git\n"]) {
      assert.equal(depotDe(origine), "chef/calculus", origine);
    }
    assert.equal(depotDe("git@github.com:chef/calc.ulus.git"), "chef/calc.ulus");
    for (const origine of ["", "git@gitlab.com:chef/calculus.git", "https://github.com/chef", "/srv/git/calculus.git", "https://github.com.pirate.example/chef/calculus", "https://github.com/chef/calculus/issues"]) {
      assert.equal(depotDe(origine), undefined, origine);
    }
  });

  test("il se lit dans l'origine du dossier — et un dossier sans origine lisible le dit, sans rien inventer", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-depot-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const [clone, ailleurs, nu] = ["clone", "ailleurs", "nu"].map((nom) => join(racine, nom)) as [string, string, string];
    for (const [dossier, origine] of [[clone, "git@github.com:chef/calculus.git"], [ailleurs, "https://jeton@gitlab.com/chef/calculus.git"]] as const) {
      execFileSync("git", ["init", "-q", dossier]);
      execFileSync("git", ["-C", dossier, "remote", "add", "origin", origine]);
    }
    mkdirSync(nu);

    assert.deepEqual(await lireDepot("git", clone), { depot: "chef/calculus" });
    const autre = await lireDepot("git", ailleurs);
    assert.match("raison" in autre ? autre.raison : "", /n'est pas une adresse github\.com que l'app sait lire : écris son dépôt GitHub\.$/);
    // L'origine n'est pas redite : elle peut porter un jeton.
    assert.doesNotMatch(JSON.stringify(autre), /jeton/);
    const sans = await lireDepot("git", nu);
    assert.match("raison" in sans ? sans.raison : "", /^L'origine de ce dossier ne se lit pas/);
    assert.match("raison" in (await lireDepot(join(racine, "pas-de-git"), clone)) ? "dit" : "", /dit/);
  });
});

describe("ce qui part vers la box", () => {
  test("le geste d'installation, par sudo et par son chemin, avec ce qui a été saisi — et aucun port", () => {
    assert.equal(gesteDeBox(SAISIE), GESTE);
    assert.doesNotMatch(GESTE, /port/i);
  });

  test("le geste de la box lit ce que l'app lui envoie comme l'écran l'a recueilli", () => {
    assert.deepEqual(lireDemande(argumentsDuGeste(SAISIE)), {
      projet: "calculus",
      depot: "chef/calculus",
      // La box la lit sur l'origine du dépôt : l'écran ne la demande pas.
      branche: null,
      sauvegardes: "/srv/sauvegardes/calculus",
      manager: { modele: "opus", effort: "high" },
      reviewer: { modele: "sonnet", effort: "medium" },
    });
  });

  test("ssh ne peut rien demander, et reçoit l'hôte choisi tel quel, après `--`", async (t) => {
    const { ssh, lu } = essai(t, REPOND);

    await installer({ ssh, delaiMs: 60_000, connexionS: 10 }, { ...SAISIE, hote: "chef@autre-box" });

    assert.equal(lu("appels").trim(), `${OPTIONS} -- chef@autre-box ${GESTE}`);
  });

  test("le shell de la box rend chaque valeur au geste en un seul argument, sans rien en exécuter", async (t) => {
    // Le faux ssh fait ce que fait la box : son shell lit la ligne. `sudo` y note ses arguments, un par ligne.
    const { ssh, lu, racine } = essai(t, `for geste; do :; done\nsudo() { printf '%s\\n' "$@" >"$D/recus"; ${dit(INSTALLE)}; }\neval "$geste"`);
    const sauvegardes = `/srv/mes sauvegardes/l'été; touch ${racine}/pirate; $(touch ${racine}/pirate)`;

    const rendu = await installer({ ssh, delaiMs: 60_000, connexionS: 10 }, { ...SAISIE, sauvegardes });

    assert.equal(rendu.etat, "installe");
    assert.deepEqual(lu("recus").trimEnd().split("\n"), ["-n", "/usr/local/bin/brigade-installer", ...argumentsDuGeste({ ...SAISIE, sauvegardes })]);
    assert.equal(existsSync(join(racine, "pirate")), false);
  });
});

describe("ajouter un projet en l'installant sur sa box", () => {
  test("installé, il est déclaré dans l'app avec son hôte, et les ports que la box a attribués sont affichés", async (t) => {
    const { suivi, saisie, ajouter, lu, declares } = essai(t, REPOND);

    const issue = await ajouter();

    assert.equal(issue.etat, "ajoute");
    assert.deepEqual(issue.etat === "ajoute" && issue.ports, { porte: 3129, arbitre: 4100 });
    assert.equal("titre" in issue && issue.titre, "« calculus » est installé sur la box « box », et déclaré dans l'app.");
    assert.match(lignes(issue), /Ports attribués par la box — porte : 3129 · arbitre : 4100\./);
    assert.match(lignes(issue), /Branche d'intégration : `main`, lue par la box/);
    assert.match(lignes(issue), /La box dit : le runtime du projet n'est pas démarré/);
    assert.equal(lu("appels").trim(), `${OPTIONS} -- box ${GESTE}`);
    assert.deepEqual(declares(), [{ nom: "calculus", dossier: saisie.dossier, hote: "box" }]);
    assert.deepEqual(suivi.configuration().projets, [{ nom: "calculus", dossier: saisie.dossier, box: { hote: "box" } }]);
  });

  test("une box sans arbitre le dit à la place de son port, et un port que la box n'a pas rendu n'est pas inventé", async (t) => {
    const { ajouter } = essai(t, dit(JSON.stringify({ ok: true, ports: { porte: "3129", arbitre: null } })));

    const issue = await ajouter();

    assert.deepEqual(issue.etat === "ajoute" && issue.ports, { porte: null, arbitre: null });
    assert.match(lignes(issue), /porte : la box ne l'a pas dit · arbitre : aucun — cette box n'en déclare pas\./);
  });

  test("l'hôte est injoignable (ssh sort en 255) : l'écran dit quoi faire et où, et rien n'est déclaré dans l'app", async (t) => {
    const { ajouter, declares, suivi } = essai(t, `echo 'ssh: connect to host box port 22: Connection refused' >&2\nexit 255`);

    const issue = await ajouter();

    assert.equal(issue.etat, "pas-ajoute");
    assert.equal("titre" in issue && issue.titre, "La box « box » n'a pas été jointe : rien n'est installé, rien n'est déclaré dans l'app.");
    assert.match(("obtenu" in issue && issue.obtenu) || "", /ssh: connect to host box port 22: Connection refused\n\n→ code de sortie 255$/);
    assert.match(lignes(issue), /docs\/installer\.md, « Joindre la box »/);
    assert.match(lignes(issue), /docs\/installer\.md, « Ajouter un humain »/);
    assert.ok(!("declarable" in issue));
    assert.deepEqual(declares(), []);
    assert.deepEqual(suivi.configuration().projets, []);
  });

  test("un ssh qui ne se lance pas n'a joint personne : dit de même, et rien n'est déclaré", async (t) => {
    const { racine, saisie, suivi, declares } = essai(t, "exit 0");

    const issue = await ajouterSurBox(saisie, { boxes: ["box"], refusDAjout: suivi.refusDAjout, ajouter: suivi.ajouter, installer: (lue) => installer({ ssh: join(racine, "pas-de-ssh"), delaiMs: 60_000, connexionS: 10 }, lue) });

    assert.match(lignes(issue), /^La box « box » n'a pas été jointe/);
    assert.deepEqual(declares(), []);
  });

  // Ce que `sudo` répond sur une box préparée avant le geste : sa phrase, et le code 1.
  const ABSENTS: [string, string][] = [
    ["le geste d'installation n'est pas posé sur la box", `echo 'sudo: /usr/local/bin/brigade-installer: command not found' >&2\nexit 1`],
    ["sa règle sudoers ne le donne pas à ce compte", `echo 'sudo: a password is required' >&2\nexit 1`],
    ["`sudo` manque à la box", `echo 'sh: 1: sudo: not found' >&2\nexit 127`],
  ];
  for (const [quoi, corps] of ABSENTS) {
    test(`${quoi} : l'écran dit quoi faire et où — sans le faire —, et rien n'est déclaré dans l'app`, async (t) => {
      const { ajouter, declares, lu } = essai(t, `echo x >>"$D/appels"\n${corps}`);

      const issue = await ajouter();

      assert.equal(issue.etat, "pas-ajoute");
      assert.equal("titre" in issue && issue.titre, "La box « box » a été jointe, et le geste d'installation n'y a pas répondu : rien n'est déclaré dans l'app.");
      // Ce que la box a dit est montré tel quel ; l'app n'y lit rien.
      assert.match(("obtenu" in issue && issue.obtenu) || "", /sudo.*\n\n→ code de sortie (1|127)$/);
      assert.match(lignes(issue), /`brigade-installer` n'y est pas posé — une box préparée avant lui —, ou sa règle sudoers ne le donne pas à ton compte/);
      assert.match(lignes(issue), /L'app ne prépare pas une box\. .* docs\/installer\.md, « Préparer la box » — « Le geste d'installation »\./);
      assert.ok(!("declarable" in issue));
      // Un seul appel : l'app ne retente ni ne répare.
      assert.equal(lu("appels"), "x\n");
      assert.deepEqual(declares(), []);
    });
  }

  test("la box n'est pas prête pour le geste (code 76) : sa phrase est montrée mot pour mot, avec où se pose ce qui manque — et rien n'est déclaré", async (t) => {
    const message = "le réglage du geste (/etc/brigade-installer.conf) n'existe pas : sans lui, aucune destination de sauvegarde n'est acceptée";
    const { ajouter, declares } = essai(t, refus(76, "reglage-absent", message));

    const issue = await ajouter();

    assert.equal("titre" in issue && issue.titre, "La box « box » a refusé d'installer « calculus » (reglage-absent) : rien n'est déclaré dans l'app.");
    assert.match(("obtenu" in issue && issue.obtenu) || "", new RegExp(`\\nbrigade-installer : ${message.replace(/[()./]/g, "\\$&")}\\n\\n→ code de sortie 76$`));
    // L'objet du geste est pour l'app : il n'est pas montré à côté de sa phrase.
    assert.doesNotMatch(("obtenu" in issue && issue.obtenu) || "", /"ok":false/);
    assert.match(lignes(issue), /l'app ne la prépare pas : .* docs\/installer\.md, « Préparer la box »\./);
    assert.deepEqual(declares(), []);
  });

  test("une valeur que la box refuse (code 64) : rien n'y est écrit, rien n'est déclaré, et sa raison est celle de la box", async (t) => {
    const { ajouter, declares } = essai(t, refus(64, "sauvegardes-hors-racine", "--sauvegardes : « /srv/sauvegardes/calculus » n'est pas sous la racine autorisée sur cette box (/mnt/sauvegardes)"));

    const issue = await ajouter();

    assert.match(lignes(issue), /a refusé d'installer « calculus » \(sauvegardes-hors-racine\)/);
    assert.match(("obtenu" in issue && issue.obtenu) || "", /pas sous la racine autorisée sur cette box \(\/mnt\/sauvegardes\)/);
    assert.match(lignes(issue), /La box n'a rien écrit\. Corrige ce qu'elle nomme, et rejoue l'ajout\./);
    assert.deepEqual(declares(), []);
  });

  test("un projet déjà installé sur la box n'est ni écrasé ni déclaré d'office : l'écran propose de le déclarer tel qu'il y est, et c'est un second geste", async (t) => {
    const { ajouter, declares, saisie, suivi, lu } = essai(t, refus(78, "deja-installe", "le projet « calculus » est déjà installé sur cette box : rien n'est écrasé, rien n'a changé"));

    const issue = await ajouter();

    assert.equal(issue.etat, "pas-ajoute");
    assert.equal("declarable" in issue && issue.declarable, true);
    assert.match(lignes(issue), /^« calculus » est déjà installé sur la box « box » : elle n'a rien changé, et rien n'est déclaré dans l'app\./);
    assert.match(lignes(issue), /Ni le calibrage ni la destination des sauvegardes que tu viens de saisir n'y sont posés/);
    assert.deepEqual(declares(), []);

    // Le second geste : il n'écrit que dans l'app, et ne rappelle pas la box.
    const appels = lu("appels");
    assert.equal(declarerTelQuel({ nom: saisie.nom, dossier: saisie.dossier, hote: saisie.hote }, { boxes: boxes(suivi.configuration()), ajouter: suivi.ajouter }), undefined);
    assert.deepEqual(declares(), [{ nom: "calculus", dossier: saisie.dossier, hote: "box" }]);
    assert.equal(lu("appels"), appels);
  });

  test("déclarer tel quel ne laisse pas entrer un nom que la box refuse, ni une box qui n'est pas déclarée", (t) => {
    const { saisie, suivi, declares } = essai(t, "exit 0");
    const par = { boxes: boxes(suivi.configuration()), ajouter: suivi.ajouter };

    assert.match(declarerTelQuel({ ...saisie, nom: "Calculus" }, par) ?? "", /^La box refuse ce nom/);
    assert.equal(declarerTelQuel({ ...saisie, hote: "inconnue" }, par), "« inconnue » n'est pas une box déclarée.");
    assert.match(declarerTelQuel({ ...saisie, dossier: "" }, par) ?? "", /^Choisis le dossier/);
    assert.deepEqual(declares(), []);
  });

  test("ce que le fichier des projets refuserait est dit avant la box : un nom déjà pris n'y installe rien", async (t) => {
    const { racine, saisie, ajouter, lu, declares } = essai(t, REPOND, { hotes: ["box"], projets: [{ nom: "calculus", dossier: "/" }] });

    const pris = await ajouter();
    const sansDossier = await ajouter({ ...saisie, nom: "autre", dossier: join(racine, "absent") });

    assert.deepEqual(pris, { etat: "pas-ajoute", titre: "Pas ajouté — deux projets s'appellent « calculus »", lignes: ["Rien n'est parti vers la box."] });
    assert.match(lignes(sansDossier), /^Pas ajouté — dossier introuvable : /);
    assert.equal(lu("appels"), "");
    assert.deepEqual(declares(), [{ nom: "calculus", dossier: "/" }]);
  });

  test("installé sur la box mais pas écrit dans l'app : c'est dit, avec ses ports, et il reste à le déclarer — rien à refaire sur la box", async (t) => {
    const { saisie, ssh } = essai(t, dit(INSTALLE));

    const issue = await ajouterSurBox(saisie, { boxes: ["box"], refusDAjout: () => undefined, ajouter: () => "ce fichier n'a pas pu être écrit : EACCES", installer: (lue) => installer({ ssh, delaiMs: 60_000, connexionS: 10 }, lue) });

    assert.equal(issue.etat, "pas-ajoute");
    assert.equal("declarable" in issue && issue.declarable, true);
    assert.match(lignes(issue), /^« calculus » est installé sur la box « box », mais n'a pas pu être déclaré dans l'app — ce fichier n'a pas pu être écrit : EACCES/);
    assert.match(lignes(issue), /porte : 3129 · arbitre : 4100/);
  });

  test("une installation qui a échoué en route (code 79) : ce que la box en dit est montré, et rien n'est déclaré", async (t) => {
    const { ajouter, declares } = essai(t, refus(79, "echec", "le dépôt chef/calculus n'a pas pu être cloné — ce qui avait été posé est retiré, la box est comme avant"));

    const issue = await ajouter();

    assert.match(("obtenu" in issue && issue.obtenu) || "", /la box est comme avant\n\n→ code de sortie 79$/);
    assert.match(lignes(issue), /la box dit ci-dessus si elle a tout retiré, ou ce qu'il en reste/);
    assert.deepEqual(declares(), []);
  });

  // Le délai n'est pas une course : arrêté tôt ou tard, un `ssh` qui n'a rien rendu donne le même rendu.
  test("un ssh arrêté au délai n'a pas dit où la box en était : rien n'est déclaré, et rejouer l'ajout le dira", async (t) => {
    const { ajouter, declares } = essai(t, "exec sleep 600", undefined, 200);

    const issue = await ajouter();

    assert.equal(issue.etat, "pas-ajoute");
    assert.match(lignes(issue), /^La box « box » n'a pas fini de répondre : l'app ne sait pas si « calculus » y est installé, et ne l'a pas déclaré\./);
    assert.match(("obtenu" in issue && issue.obtenu) || "", /\n→ aucune réponse en 0,2 s : ssh arrêté$/);
    assert.match(lignes(issue), /elle dira le projet déjà installé, sans rien y changer/);
    assert.deepEqual(declares(), []);
  });
});
