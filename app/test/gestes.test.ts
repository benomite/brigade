// Les gestes du chef : chacun envoie dans le second une commande de la doc, mot
// pour mot (`envoyer`) — direct, au clic ; confirmé, seulement avec le « oui » du
// chef. Ce qui part se compare ici à docs/runtime/ — la forme de
// poste, et la ligne de chaque commande. Qu'un geste confirmé ne parte pas sans son
// « oui » se prouve sur `envoyer`, puis sur le registre et de faux pty ; et
// qu'aucun geste n'expose de shell, de `sudo` ni de commande libre, sur le socle
// lui-même.
import { docRuntime, SOURCE_DOC } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTIONS } from "../../runtime/src/grant.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { GESTE, type Cuisine } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { commandeDuGeste, CONFIRMES, DIRECTS, ecrireGeste, GESTES, GRANTS, SANS_OUI } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { ROLE_DU_SECOND } from "../src/second/lancement.ts";
import { ouvrirTerminaux, SANS_ECRIRE, type Terminal } from "../src/terminaux.ts";
import { jouerLaVue, ouvrirLecture, type Reponses, repos } from "./aides/fausse-vue.ts";

const RACINE = join(import.meta.dirname, "../..");
const SOURCE = SOURCE_DOC;
const doc = docRuntime(RACINE);
const PARADE = { nom: "parade", dossier: "/projets/parade" };

// La forme que la doc donne d'une commande du runtime.
const DE_BOX = "brigade <projet> <commande>";

// La cuisine de cet ordinateur, et ce que le geste de sa station écrit pour « parade » : la forme de poste, citée mot à mot.
const CUISINE: Cuisine = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const ecrit = (suite: string, nom = "parade") => `(cd '/runtime' && BRIGADE_STATION_DIR='/station' node ${GESTE} ${nom} ${suite})`;

// Ce qu'une commande citée par la doc écrit : entre crochets c'est facultatif, et `|` y sépare les choix.
function formes(usage: string): string[] {
  let ou = 0;
  // Une suite, jusqu'au `|` ou au `]` qui la ferme : chacune de ses écritures.
  const suite = (): string[] => {
    let ecrites = [""];
    while (ou < usage.length && usage[ou] !== "|" && usage[ou] !== "]") {
      const lu = usage[ou++] as string;
      if (lu !== "[") {
        ecrites = ecrites.map((debut) => debut + lu);
        continue;
      }
      const choix = [""];
      do choix.push(...suite());
      while (usage[ou++] === "|");
      assert.equal(usage[ou - 1], "]", `un crochet ne se ferme pas dans \`${usage}\``);
      ecrites = ecrites.flatMap((debut) => choix.map((pris) => debut + pris));
    }
    return ecrites;
  };
  const toutes = suite();
  assert.equal(ou, usage.length, `\`${usage}\` ne se lit pas jusqu'au bout`);
  return toutes.map((forme) => forme.replace(/\s+/g, " ").trim());
}

// Toutes les commandes du runtime que la doc cite, chacune écrite en entier.
const CITEES = new Set(
  [...doc.matchAll(/`([^`\n]+)`/g)]
    .map(([, cite = ""]) => cite)
    // Un `|` nu sépare des alternatives hors d'un tableau (`yes|no`), et ne se développe pas : seules les écritures de tableau (`\|`) sont des formes.
    .filter((cite) => !/(^|[^\\])\|/.test(cite))
    .map((cite) => cite.replaceAll("\\|", "|"))
    .filter((cite) => cite.startsWith("brigade <projet> "))
    .flatMap(formes),
);

// Chaque geste : le grant qu'il nomme, la commande que la doc cite, et ce qui s'écrit pour « parade » sur cet ordinateur.
const GESTES_DE_LA_DOC: readonly [id: string, grant: string | undefined, citee: string, ecrite: string][] = [
  ["projet-allumer", undefined, "brigade <projet> switch on", ecrit("switch on")],
  ["projet-eteindre", undefined, "brigade <projet> switch off", ecrit("switch off")],
  ["grant-activer", "merge", "brigade <projet> grant enable merge", ecrit("grant enable merge")],
  ["grant-revoquer", "merge", "brigade <projet> grant revoke merge", ecrit("grant revoke merge")],
  ["reprendre", undefined, "brigade <projet> guardrails resume", ecrit("guardrails resume")],
  ["stop", undefined, "brigade <projet> guardrails stop", ecrit("guardrails stop")],
  ["installation", undefined, "brigade <projet> installation", ecrit("installation")],
];

// La commande écrite : le test échoue net si le geste a refusé d'écrire.
function commande(id: string, projet: Projet, grant?: string): string {
  const ecrite = commandeDuGeste(id, projet, grant, CUISINE);
  assert.ok(ecrite !== undefined && "commande" in ecrite, `rien n'est écrit par « ${id} »`);
  return ecrite.commande;
}

// Un `envoyer` qui retient ce qu'on lui donne, à la place de celui du registre — et un `shell`, de
// même, pour prouver qu'aucun geste n'en ouvre.
function temoin() {
  const ecrits: [projet: string, commande: string][] = [];
  const envoyes: [projet: string, commande: string][] = [];
  const shell = (projet: Projet, ecrit: string): Terminal => {
    ecrits.push([projet.nom, ecrit]);
    return { id: ecrits.length, projet: projet.nom, genre: "shell", titre: `shell ${ecrits.length}`, note: "", arrete: false };
  };
  const envoyer = (projet: Projet, commande: string): Promise<Terminal | { refus: string }> => {
    envoyes.push([projet.nom, commande]);
    return Promise.resolve({ id: 0, projet: projet.nom, genre: "second", titre: "Second", note: "", arrete: false });
  };
  return { ecrits, envoyes, terminaux: { shell, envoyer } };
}

// Les gestes qui partent au clic, et ceux qui attendent le « oui » du chef.
const PARTENT = GESTES_DE_LA_DOC.filter(([id]) => DIRECTS.includes(id));
const CONFIRMES_DE_LA_DOC = GESTES_DE_LA_DOC.filter(([id]) => CONFIRMES.includes(id));

describe("les gestes du chef", () => {
  test("ils sont sept, ceux que le chef répète, et chacun est une commande du runtime : rien de ce qui se joue sur la machine à côté", () => {
    assert.deepEqual(
      GESTES.map(({ id }) => id),
      GESTES_DE_LA_DOC.map(([id]) => id),
    );
    assert.equal(new Set(GESTES.map(({ id }) => id)).size, GESTES.length);

    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const { id, commande: mots } of GESTES) {
      assert.ok((mots.split(" ")[0] ?? "") in scripts, `« ${id} » n'est pas un script du runtime`);
      assert.doesNotMatch(mots, /systemctl|login|sudo/);
    }
  });

  test("aucun geste n'écrit autre chose que la commande du runtime qu'il nomme : ni shell, ni `sudo`, ni commande libre", () => {
    // Aucun geste du socle ne porte de quoi lancer autre chose : des mots de la doc, sans rien que le shell lirait.
    for (const { id, commande: mots, parGrant } of GESTES) {
      assert.match(mots, /^[a-z]+(-[a-z]+)*( (--)?[a-z]+(-[a-z]+)*)*$/, id);
      assert.doesNotMatch(mots, /\b(sudo|su|sh|bash|zsh|env|exec|eval|systemctl)\b/, id);
      // Seul un geste de grant prend un mot de plus, et d'une liste fermée (GRANTS).
      assert.equal(parGrant, id.startsWith("grant-") ? true : undefined, id);
    }

    // La vue nomme un geste, jamais une commande : une commande libre, même celle du geste de la station, n'écrit rien.
    const { ecrits, terminaux } = temoin();
    for (const libre of ["guardrails stop", "stop; sudo reboot", "stop --couper", "sudo brigade parade guardrails stop", "brigade", "sudo -n -- /usr/local/bin/brigade parade stop", "stop-voir", "STOP", " stop"]) {
      assert.equal(commandeDuGeste(libre, PARADE, undefined, CUISINE), undefined, libre);
      assert.equal(ecrireGeste(terminaux, libre, PARADE, undefined, undefined, CUISINE), undefined, libre);
    }
    // Et ce qui accompagne le nom du geste n'y ajoute rien : ni option, ni suite.
    for (const [id, , , ecrite] of GESTES_DE_LA_DOC.filter(([id]) => !id.startsWith("grant-"))) {
      for (const suite of ["--interrupt", "merge", "; sudo reboot", "$(reboot)", "&& sudo systemctl stop brigade", 3, null, ["--couper"]]) assert.deepEqual(commandeDuGeste(id, PARADE, suite, CUISINE), { commande: ecrite }, `${id} + ${String(suite)}`);
      // Ce qui suit le geste de la station, sous la parenthèse fermante du sous-shell, n'est que des mots.
      assert.doesNotMatch((ecrite.split(`${GESTE} `)[1] ?? "").slice(0, -1), /sudo|[;&|$`<>(){}\\]/);
    }
    assert.deepEqual(ecrits, []);

    // Le process principal ne fait que passer le nom du geste au socle — avec là où la cuisine du projet tourne ; ni lui, ni le pont, ni la vue, ni ce qui dit l'offre ne lancent rien.
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    assert.ok(principal.includes('ipcMain.handle("geste", (_, nom: unknown, id: unknown, grant: unknown, oui: unknown) => {\n  const vise = connu(nom);\n  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, grant, oui, cuisines.cuisineDe(vise));\n});'), "le canal « geste » du process principal ne passe plus le seul nom du geste au socle");
    assert.doesNotMatch(principal, /sudo/);
    for (const fichier of ["app/src/preload.cjs", "app/src/vue/vue.js", "app/src/confirmation.ts"]) {
      const source = readFileSync(join(RACINE, fichier), "utf8");
      assert.doesNotMatch(source, /child_process|execFile|spawn\(/, fichier);
    }
  });

  test(`${SOURCE} donne la forme \`${DE_BOX}\` : c'est elle que le geste de la station de cet ordinateur lance`, () => {
    assert.ok(doc.includes(`\`${DE_BOX}\``), `${SOURCE} ne donne plus la forme \`${DE_BOX}\``);
  });

  for (const [id, grant, citee, ecrite] of GESTES_DE_LA_DOC) {
    test(`« ${id} » écrit \`${ecrite}\` — la commande de ${SOURCE} : \`${citee}\`, lancée par le geste de la station de cet ordinateur`, () => {
      assert.ok(CITEES.has(citee), `${SOURCE} ne cite plus \`${citee}\``);
      // La commande de la doc, avec le nom de ce projet : rien d'autre n'y est changé.
      const mots = citee.slice(DE_BOX.indexOf("<commande>"));
      assert.equal(DE_BOX.replace("<commande>", mots), citee);

      assert.deepEqual(commandeDuGeste(id, PARADE, grant, CUISINE), { commande: ecrite });
      assert.equal(ecrite, ecrit(mots));
    });
  }

  test("deux gestes sont directs — éteindre le projet, vérifier l'installation : aucun n'engage ni ne détruit ; les cinq autres sont confirmés", () => {
    assert.deepEqual(DIRECTS, ["projet-eteindre", "installation"]);
    assert.deepEqual(CONFIRMES, ["projet-allumer", "grant-activer", "grant-revoquer", "reprendre", "stop"]);
    // Chaque geste a l'une des deux formes, et une seule.
    assert.deepEqual([...DIRECTS, ...CONFIRMES].toSorted(), GESTES.map(({ id }) => id).toSorted());
  });

  test("un geste direct appelle `envoyer`, une fois, avec la commande de la doc préfixée du `!` qui la lance depuis le second — et n'ouvre aucun shell ; rien n'y porte de quoi l'envoyer à la place de l'app", async () => {
    for (const [id, grant, , ecrite] of PARTENT) {
      const { ecrits, envoyes, terminaux } = temoin();

      const second = await ecrireGeste(terminaux, id, PARADE, grant, undefined, CUISINE);

      assert.deepEqual([ecrits, envoyes], [[], [["parade", `!${ecrite}`]]], id);
      assert.deepEqual(second, { id: 0, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false });
      assert.doesNotMatch(ecrite, /[\x00-\x1f\x7f]/, id);
    }
  });

  test("un geste confirmé, nommé sans son « oui », ne part pas : rien n'est envoyé ni écrit, et le refus le dit — seul `true` vaut « oui »", () => {
    assert.equal(SANS_OUI, "nothing was sent: this action waits for your “yes”, in front of what it costs — nothing is written into the second");
    for (const [id, grant] of CONFIRMES_DE_LA_DOC) {
      const { ecrits, envoyes, terminaux } = temoin();
      for (const oui of [undefined, false, "true", "oui", 1, {}, [true], null]) assert.deepEqual(ecrireGeste(terminaux, id, PARADE, grant, oui, CUISINE), { refus: SANS_OUI }, `${id} + ${String(oui)}`);
      assert.deepEqual([ecrits, envoyes], [[], []], id);
    }
  });

  test("avec son « oui », un geste confirmé part comme un direct : `envoyer`, une fois, la commande de la doc préfixée du `!` — aucun shell", async () => {
    for (const [id, grant, , ecrite] of CONFIRMES_DE_LA_DOC) {
      const { ecrits, envoyes, terminaux } = temoin();

      const second = await ecrireGeste(terminaux, id, PARADE, grant, true, CUISINE);

      assert.deepEqual([ecrits, envoyes], [[], [["parade", `!${ecrite}`]]], id);
      assert.deepEqual(second, { id: 0, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false });
    }
  });

  test("dans le registre, un geste confirmé sans « oui » ne touche à rien — aucun second lancé, rien d'écrit ; avec, il passe par le second, et n'ouvre jamais de shell", async () => {
    const lances: string[] = [];
    const ecrits: string[][] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty({ commande: lancee, args, dossier }) {
        const recus: string[] = [];
        ecrits.push(recus);
        lances.push([lancee, ...args, dossier].join(" "));
        return { ecrire: (donnees) => void recus.push(donnees), redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });

    for (const [id, grant] of CONFIRMES_DE_LA_DOC) assert.deepEqual(ecrireGeste(terminaux, id, PARADE, grant, undefined, CUISINE), { refus: SANS_OUI }, id);
    assert.deepEqual([lances, ecrits], [[], []]);

    // Avec son « oui » : le second ne tournait pas, il est lancé — et la commande n'y est pas écrite tant qu'il démarre.
    const [id, grant] = CONFIRMES_DE_LA_DOC[0] ?? assert.fail();
    const second = await ecrireGeste(terminaux, id, PARADE, grant, true, CUISINE);
    assert.ok(second !== undefined && "note" in second);
    assert.equal(second.genre, "second");
    assert.match(second.note, /the command did not go/);
    assert.deepEqual(lances, [`claude --continue --append-system-prompt-file ${ROLE_DU_SECOND} --settings {} /projets/parade`]);
    assert.deepEqual(ecrits, [[]]);
  });

  test("un geste de grant nomme son grant, parmi ceux du runtime : pour un autre, ou sans lui, rien n'est écrit et le geste dit pourquoi", () => {
    assert.deepEqual(GRANTS, ACTIONS);
    for (const grant of GRANTS) assert.ok(CITEES.has(`brigade <projet> grant enable ${grant}`) && CITEES.has(`brigade <projet> grant revoke ${grant}`), `${SOURCE} ne cite pas le grant « ${grant} »`);

    const refus = { refus: "nothing is written: this action applies to a grant, to be named among those in the docs (merge)" };
    for (const id of ["grant-activer", "grant-revoquer"]) {
      for (const autre of [undefined, "", "identifiants-max", "merge --pour 4h", "merge; reboot", "merge\r", 3, null, ["merge"]]) {
        const { ecrits, terminaux } = temoin();
        assert.deepEqual(commandeDuGeste(id, PARADE, autre, CUISINE), refus);
        assert.deepEqual(ecrireGeste(terminaux, id, PARADE, autre, undefined, CUISINE), refus);
        assert.deepEqual(ecrits, []);
      }
    }
    // Un geste qui ne porte sur aucun grant n'en écrit pas.
    assert.equal(commande("stop", PARADE, "merge"), ecrit("guardrails stop"));
  });

  test("la vue nomme un geste, jamais une commande ; et un projet dont la cuisine ne tourne nulle part n'a rien à écrire", () => {
    const { ecrits, envoyes, terminaux } = temoin();

    for (const autre of ["guardrails stop", "manager on", "garde-fous stop", "manager allumer", "sudo systemctl enable --now brigade@parade.service", "rm -rf /", "", undefined, 3, null]) {
      assert.equal(commandeDuGeste(autre, PARADE, "merge", CUISINE), undefined);
      assert.equal(ecrireGeste(terminaux, autre, PARADE, "merge", undefined, CUISINE), undefined);
    }
    for (const { id } of GESTES) {
      assert.equal(commandeDuGeste(id, PARADE, "merge", undefined), undefined);
      assert.equal(ecrireGeste(terminaux, id, PARADE, "merge", true, undefined), undefined);
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("un nom que le shell du Mac découperait s'écrit cité : il arrive entier, et rien n'en est exécuté", () => {
    assert.equal(commande("installation", { nom: "mon projet", dossier: "/p" }), ecrit("installation", `'mon projet'`));
    assert.equal(commande("projet-allumer", { nom: "box; rm -rf ~", dossier: "/p" }), ecrit("switch on", `'box; rm -rf ~'`));
  });

  test("un nom qui porte de quoi envoyer la commande n'est pas écrit : aucun shell n'est ouvert, et le geste dit pourquoi", () => {
    const { ecrits, envoyes, terminaux } = temoin();

    for (const piege of ["box\rreboot", "bo\nx", "box\x03", "box\x04", "box\x1b[A", "box\x7f", "\tbox"]) {
      for (const [id, grant] of GESTES_DE_LA_DOC) {
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: piege, dossier: "/p" }, grant, true, CUISINE), { refus: SANS_ECRIRE });
      }
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("un projet qui ne s'ouvre pas n'a ni shell où écrire, ni second où envoyer : le geste le dit, et n'écrit ni n'envoie rien", () => {
    const { ecrits, envoyes, terminaux } = temoin();
    const ferme = { ...PARADE, refus: "dossier introuvable : /projets/parade" };

    for (const [id, grant] of GESTES_DE_LA_DOC) {
      assert.deepEqual(ecrireGeste(terminaux, id, ferme, grant, true, CUISINE), { refus: "nothing is written: “parade” does not open — dossier introuvable : /projets/parade" });
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("le module ne lance rien : aucune commande — il n'a qu'`envoyer`, celui du registre, pour toucher au monde", () => {
    const source = readFileSync(join(RACINE, "app/src/gestes.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, de]) => de);

    // Aucun module de Node : pas de `child_process`, donc rien qui s'exécute. De la veille, `cite`, et
    // de quoi écrire le geste de la station de cet ordinateur (`GESTE`, `mots`) — rien qui lance.
    assert.deepEqual(imports, ["./box.ts", "./config.ts", "./terminaux.ts"]);
    assert.ok(source.includes('import { GESTE, mots, type Cuisine, type Locale } from "./box.ts";'));
    assert.doesNotMatch(source, /\bimport\(|require\(|process\.|execFile|spawn/);
  });
});

// La vue, jouée : l'espace de « parade » ouvert, le geste du projet en tête, à côté de son nom.
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "fil repris", arrete: false };
async function ouvrir(geste: NonNullable<Reponses["geste"]>, autres: Reponses = {}) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [SECOND],
    geste,
    ...autres,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

describe("vérifier l'installation n'est plus dans l'app (#1700)", () => {
  test("ni en tête de l'espace ni dans Settings : aucun bouton « check the installation », et rien ne lance la vérification", async () => {
    const vue = await ouvrir(() => SECOND, { verifier: () => undefined });
    assert.throws(() => vue.element("gestes-projet"));
    await ouvrirLecture(vue, "Settings");
    for (const ou of ["etat", "onglets", "interrupteur-projet"]) assert.deepEqual(vue.element(ou).dessous("button").map(({ textContent }) => textContent).filter((texte) => /installation/.test(texte)), [], ou);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "verifier"), []);
  });
});
