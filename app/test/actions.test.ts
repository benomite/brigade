// Les gestes du chef : chacun envoie dans le second une commande de la doc, mot
// pour mot (`envoyer`) — direct, au clic ; confirmé, seulement avec le « oui » du
// chef. Ce qui part se compare ici à docs/runtime/ — la forme de
// poste, et la ligne de chaque commande. Qu'un geste confirmé ne parte pas sans son
// « oui » se prouve sur `envoyer`, puis sur le registre et de faux pty ; et
// qu'aucun geste n'expose de shell, de `sudo` ni de commande libre, sur le socle
// lui-même.
import { docRuntime, SOURCE_DOC } from "./helpers/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { ACTION, type Kitchen } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER } from "../src/facts.ts";
import { commandOfAction, CONFIRMED, DIRECT, writeAction, ACTIONS, WITHOUT_YES } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { ROLE_OF_SECOND } from "../src/second/launch.ts";
import { openTerminals, WITHOUT_WRITE, type Terminal } from "../src/terminals.ts";
import { playTheVue, openRead, type Answers, repos } from "./helpers/false-vue.ts";

const ROOT = join(import.meta.dirname, "../..");
const SOURCE = SOURCE_DOC;
const doc = docRuntime(ROOT);
const PARADE = { nom: "parade", dossier: "/projets/parade" };

// La forme que la doc donne d'une commande du runtime.
const OF_BOX = "brigade <projet> <commande>";

// La cuisine de cet ordinateur, et ce que le geste de sa station écrit pour « parade » : la forme de poste, citée mot à mot.
const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const written = (suite: string, name = "parade") => `(cd '/runtime' && BRIGADE_STATION_DIR='/station' node ${ACTION} ${name} ${suite})`;

// Ce qu'une commande citée par la doc écrit : entre crochets c'est facultatif, et `|` y sépare les choix.
function shapes(usage: string): string[] {
  let or = 0;
  // Une suite, jusqu'au `|` ou au `]` qui la ferme : chacune de ses écritures.
  const suite = (): string[] => {
    let writtenEntries = [""];
    while (or < usage.length && usage[or] !== "|" && usage[or] !== "]") {
      const readOne = usage[or++] as string;
      if (readOne !== "[") {
        writtenEntries = writtenEntries.map((start) => start + readOne);
        continue;
      }
      const choice = [""];
      do choice.push(...suite());
      while (usage[or++] === "|");
      assert.equal(usage[or - 1], "]", `un crochet ne se ferme pas dans \`${usage}\``);
      writtenEntries = writtenEntries.flatMap((start) => choice.map((taken) => start + taken));
    }
    return writtenEntries;
  };
  const allEntries = suite();
  assert.equal(or, usage.length, `\`${usage}\` ne se lit pas jusqu'au bout`);
  return allEntries.map((shape) => shape.replace(/\s+/g, " ").trim());
}

// Toutes les commandes du runtime que la doc cite, chacune écrite en entier.
const CITED = new Set(
  [...doc.matchAll(/`([^`\n]+)`/g)]
    .map(([, cite = ""]) => cite)
    // Un `|` nu sépare des alternatives hors d'un tableau (`yes|no`), et ne se développe pas : seules les écritures de tableau (`\|`) sont des formes.
    .filter((cite) => !/(^|[^\\])\|/.test(cite))
    .map((cite) => cite.replaceAll("\\|", "|"))
    .filter((cite) => cite.startsWith("brigade <projet> "))
    .flatMap(shapes),
);

// Chaque geste : la commande que la doc cite, et ce qui s'écrit pour « parade » sur cet ordinateur.
const ACTIONS_OF_THE_DOC: readonly [id: string, citee: string, ecrite: string][] = [
  ["projet-allumer", "brigade <projet> switch on", written("switch on")],
  ["projet-eteindre", "brigade <projet> switch off", written("switch off")],
  ["reprendre", "brigade <projet> guardrails resume", written("guardrails resume")],
  ["stop", "brigade <projet> guardrails stop", written("guardrails stop")],
  ["installation", "brigade <projet> installation", written("installation")],
];

// La commande écrite : le test échoue net si le geste a refusé d'écrire.
function command(id: string, project: Project): string {
  const writtenOne = commandOfAction(id, project, KITCHEN);
  assert.ok(writtenOne !== undefined && "commande" in writtenOne, `rien n'est écrit par « ${id} »`);
  return writtenOne.commande;
}

// Un `envoyer` qui retient ce qu'on lui donne, à la place de celui du registre — et un `shell`, de
// même, pour prouver qu'aucun geste n'en ouvre.
function witness() {
  const writtenOnes: [projet: string, commande: string][] = [];
  const sent: [projet: string, commande: string][] = [];
  const shell = (project: Project, written: string): Terminal => {
    writtenOnes.push([project.nom, written]);
    return { id: writtenOnes.length, projet: project.nom, genre: "shell", titre: `shell ${writtenOnes.length}`, note: "", arrete: false };
  };
  const send = (project: Project, command: string): Promise<Terminal | { refus: string }> => {
    sent.push([project.nom, command]);
    return Promise.resolve({ id: 0, projet: project.nom, genre: "second", titre: "Second", note: "", arrete: false });
  };
  return { ecrits: writtenOnes, envoyes: sent, terminaux: { shell, envoyer: send } };
}

// Les gestes qui partent au clic, et ceux qui attendent le « oui » du chef.
const PARTENT = ACTIONS_OF_THE_DOC.filter(([id]) => DIRECT.includes(id));
const CONFIRMED_OF_THE_DOC = ACTIONS_OF_THE_DOC.filter(([id]) => CONFIRMED.includes(id));

describe("les gestes du chef", () => {
  test("ils sont cinq, ceux que le chef répète, et chacun est une commande du runtime : rien de ce qui se joue sur la machine à côté", () => {
    assert.deepEqual(
      ACTIONS.map(({ id }) => id),
      ACTIONS_OF_THE_DOC.map(([id]) => id),
    );
    assert.equal(new Set(ACTIONS.map(({ id }) => id)).size, ACTIONS.length);

    const { scripts } = JSON.parse(readFileSync(join(ROOT, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const { id, commande: words } of ACTIONS) {
      assert.ok((words.split(" ")[0] ?? "") in scripts, `« ${id} » n'est pas un script du runtime`);
      assert.doesNotMatch(words, /systemctl|login|sudo/);
    }
  });

  test("aucun geste n'écrit autre chose que la commande du runtime qu'il nomme : ni shell, ni `sudo`, ni commande libre", () => {
    // Aucun geste du socle ne porte de quoi lancer autre chose : des mots de la doc, sans rien que le shell lirait.
    for (const { id, commande: words } of ACTIONS) {
      assert.match(words, /^[a-z]+(-[a-z]+)*( (--)?[a-z]+(-[a-z]+)*)*$/, id);
      assert.doesNotMatch(words, /\b(sudo|su|sh|bash|zsh|env|exec|eval|systemctl)\b/, id);
    }

    // La vue nomme un geste, jamais une commande : une commande libre, même celle du geste de la station, n'écrit rien.
    const { ecrits: writtenOnes, terminaux: terminals } = witness();
    for (const free of ["guardrails stop", "stop; sudo reboot", "stop --couper", "sudo brigade parade guardrails stop", "brigade", "sudo -n -- /usr/local/bin/brigade parade stop", "stop-voir", "STOP", " stop"]) {
      assert.equal(commandOfAction(free, PARADE, KITCHEN), undefined, free);
      assert.equal(writeAction(terminals, free, PARADE, undefined, KITCHEN), undefined, free);
    }
    // Et la commande écrite n'est faite que du geste : ni option, ni suite.
    for (const [id, , writtenOne] of ACTIONS_OF_THE_DOC) {
      assert.deepEqual(commandOfAction(id, PARADE, KITCHEN), { commande: writtenOne }, id);
      // Ce qui suit le geste de la station, sous la parenthèse fermante du sous-shell, n'est que des mots.
      assert.doesNotMatch((writtenOne.split(`${ACTION} `)[1] ?? "").slice(0, -1), /sudo|[;&|$`<>(){}\\]/);
    }
    assert.deepEqual(writtenOnes, []);

    // Le process principal ne fait que passer le nom du geste au socle — avec là où la cuisine du projet tourne ; ni lui, ni le pont, ni la vue, ni ce qui dit l'offre ne lancent rien.
    const principal = readFileSync(join(ROOT, "app/src/main.ts"), "utf8");
    assert.ok(principal.includes('ipcMain.handle("geste", (_, nom: unknown, id: unknown, oui: unknown) => {\n  const vise = connu(nom);\n  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, oui, cuisines.cuisineDe(vise));\n});'), "le canal « geste » du process principal ne passe plus le seul nom du geste au socle");
    assert.doesNotMatch(principal, /sudo/);
    for (const file of ["app/src/preload.cjs", "app/src/vue/vue.js", "app/src/confirmation.ts"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      assert.doesNotMatch(source, /child_process|execFile|spawn\(/, file);
    }
  });

  test(`${SOURCE} donne la forme \`${OF_BOX}\` : c'est elle que le geste de la station de cet ordinateur lance`, () => {
    assert.ok(doc.includes(`\`${OF_BOX}\``), `${SOURCE} ne donne plus la forme \`${OF_BOX}\``);
  });

  for (const [id, citee, writtenOne] of ACTIONS_OF_THE_DOC) {
    test(`« ${id} » écrit \`${writtenOne}\` — la commande de ${SOURCE} : \`${citee}\`, lancée par le geste de la station de cet ordinateur`, () => {
      assert.ok(CITED.has(citee), `${SOURCE} ne cite plus \`${citee}\``);
      // La commande de la doc, avec le nom de ce projet : rien d'autre n'y est changé.
      const words = citee.slice(OF_BOX.indexOf("<commande>"));
      assert.equal(OF_BOX.replace("<commande>", words), citee);

      assert.deepEqual(commandOfAction(id, PARADE, KITCHEN), { commande: writtenOne });
      assert.equal(writtenOne, written(words));
    });
  }

  test("deux gestes sont directs — éteindre le projet, vérifier l'installation : aucun n'engage ni ne détruit ; les trois autres sont confirmés", () => {
    assert.deepEqual(DIRECT, ["projet-eteindre", "installation"]);
    assert.deepEqual(CONFIRMED, ["projet-allumer", "reprendre", "stop"]);
    // Chaque geste a l'une des deux formes, et une seule.
    assert.deepEqual([...DIRECT, ...CONFIRMED].toSorted(), ACTIONS.map(({ id }) => id).toSorted());
  });

  test("un geste direct appelle `envoyer`, une fois, avec la commande de la doc préfixée du `!` qui la lance depuis le second — et n'ouvre aucun shell ; rien n'y porte de quoi l'envoyer à la place de l'app", async () => {
    for (const [id, , writtenOne] of PARTENT) {
      const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();

      const second = await writeAction(terminals, id, PARADE, undefined, KITCHEN);

      assert.deepEqual([writtenOnes, sent], [[], [["parade", `!${writtenOne}`]]], id);
      assert.deepEqual(second, { id: 0, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false });
      assert.doesNotMatch(writtenOne, /[\x00-\x1f\x7f]/, id);
    }
  });

  test("un geste confirmé, nommé sans son « oui », ne part pas : rien n'est envoyé ni écrit, et le refus le dit — seul `true` vaut « oui »", () => {
    assert.equal(WITHOUT_YES, "nothing was sent: this action waits for your “yes”, in front of what it costs — nothing is written into the second");
    for (const [id] of CONFIRMED_OF_THE_DOC) {
      const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();
      for (const yes of [undefined, false, "true", "oui", 1, {}, [true], null]) assert.deepEqual(writeAction(terminals, id, PARADE, yes, KITCHEN), { refus: WITHOUT_YES }, `${id} + ${String(yes)}`);
      assert.deepEqual([writtenOnes, sent], [[], []], id);
    }
  });

  test("avec son « oui », un geste confirmé part comme un direct : `envoyer`, une fois, la commande de la doc préfixée du `!` — aucun shell", async () => {
    for (const [id, , writtenOne] of CONFIRMED_OF_THE_DOC) {
      const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();

      const second = await writeAction(terminals, id, PARADE, true, KITCHEN);

      assert.deepEqual([writtenOnes, sent], [[], [["parade", `!${writtenOne}`]]], id);
      assert.deepEqual(second, { id: 0, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false });
    }
  });

  test("dans le registre, un geste confirmé sans « oui » ne touche à rien — aucun second lancé, rien d'écrit ; avec, il passe par le second, et n'ouvre jamais de shell", async () => {
    const launched: string[] = [];
    const writtenOnes: string[][] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty({ commande: launchedOne, args, dossier: folder }) {
        const receivedOnes: string[] = [];
        writtenOnes.push(receivedOnes);
        launched.push([launchedOne, ...args, folder].join(" "));
        return { ecrire: (data) => void receivedOnes.push(data), redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });

    for (const [id] of CONFIRMED_OF_THE_DOC) assert.deepEqual(writeAction(terminals, id, PARADE, undefined, KITCHEN), { refus: WITHOUT_YES }, id);
    assert.deepEqual([launched, writtenOnes], [[], []]);

    // Avec son « oui » : le second ne tournait pas, il est lancé — et la commande n'y est pas écrite tant qu'il démarre.
    const [id] = CONFIRMED_OF_THE_DOC[0] ?? assert.fail();
    const second = await writeAction(terminals, id, PARADE, true, KITCHEN);
    assert.ok(second !== undefined && "note" in second);
    assert.equal(second.genre, "second");
    assert.match(second.note, /the command did not go/);
    assert.deepEqual(launched, [`claude --continue --append-system-prompt-file ${ROLE_OF_SECOND} --settings {} /projets/parade`]);
    assert.deepEqual(writtenOnes, [[]]);
  });

  test("la vue nomme un geste, jamais une commande ; et un projet dont la cuisine ne tourne nulle part n'a rien à écrire", () => {
    const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();

    for (const other of ["guardrails stop", "manager on", "garde-fous stop", "manager allumer", "sudo systemctl enable --now brigade@parade.service", "rm -rf /", "", undefined, 3, null]) {
      assert.equal(commandOfAction(other, PARADE, KITCHEN), undefined);
      assert.equal(writeAction(terminals, other, PARADE, undefined, KITCHEN), undefined);
    }
    for (const { id } of ACTIONS) {
      assert.equal(commandOfAction(id, PARADE, undefined), undefined);
      assert.equal(writeAction(terminals, id, PARADE, true, undefined), undefined);
    }
    assert.deepEqual([writtenOnes, sent], [[], []]);
  });

  test("un nom que le shell du Mac découperait s'écrit cité : il arrive entier, et rien n'en est exécuté", () => {
    assert.equal(command("installation", { nom: "mon projet", dossier: "/p" }), written("installation", `'mon projet'`));
    assert.equal(command("projet-allumer", { nom: "box; rm -rf ~", dossier: "/p" }), written("switch on", `'box; rm -rf ~'`));
  });

  test("un nom qui porte de quoi envoyer la commande n'est pas écrit : aucun shell n'est ouvert, et le geste dit pourquoi", () => {
    const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();

    for (const trap of ["box\rreboot", "bo\nx", "box\x03", "box\x04", "box\x1b[A", "box\x7f", "\tbox"]) {
      for (const [id] of ACTIONS_OF_THE_DOC) {
        assert.deepEqual(writeAction(terminals, id, { nom: trap, dossier: "/p" }, true, KITCHEN), { refus: WITHOUT_WRITE });
      }
    }
    assert.deepEqual([writtenOnes, sent], [[], []]);
  });

  test("un projet qui ne s'ouvre pas n'a ni shell où écrire, ni second où envoyer : le geste le dit, et n'écrit ni n'envoie rien", () => {
    const { ecrits: writtenOnes, envoyes: sent, terminaux: terminals } = witness();
    const closes = { ...PARADE, refus: "dossier introuvable : /projets/parade" };

    for (const [id] of ACTIONS_OF_THE_DOC) {
      assert.deepEqual(writeAction(terminals, id, closes, true, KITCHEN), { refus: "nothing is written: “parade” does not open — dossier introuvable : /projets/parade" });
    }
    assert.deepEqual([writtenOnes, sent], [[], []]);
  });

  test("le module ne lance rien : aucune commande — il n'a qu'`envoyer`, celui du registre, pour toucher au monde", () => {
    const source = readFileSync(join(ROOT, "app/src/actions.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, of]) => of);

    // Aucun module de Node : pas de `child_process`, donc rien qui s'exécute. De la veille, `cite`, et
    // de quoi écrire le geste de la station de cet ordinateur (`GESTE`, `mots`) — rien qui lance.
    assert.deepEqual(imports, ["./box.ts", "./config.ts", "./terminals.ts"]);
    assert.ok(source.includes('import { GESTE, mots, type Cuisine, type Locale } from ' + '"./box.ts";'));
    assert.doesNotMatch(source, /\bimport\(|require\(|process\.|execFile|spawn/);
  });
});

// La vue, jouée : l'espace de « parade » ouvert, le geste du projet en tête, à côté de son nom.
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "fil repris", arrete: false };
async function open(action: NonNullable<Answers["geste"]>, others: Answers = {}) {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS, rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [SECOND],
    geste: action,
    ...others,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

describe("vérifier l'installation n'est plus dans l'app (#1700)", () => {
  test("ni en tête de l'espace ni dans Settings : aucun bouton « check the installation », et rien ne lance la vérification", async () => {
    const vue = await open(() => SECOND, { verifier: () => undefined });
    assert.throws(() => vue.element("gestes-projet"));
    await openRead(vue, "Settings");
    for (const or of ["etat", "onglets-du-projet", "interrupteur-projet"]) assert.deepEqual(vue.element(or).dessous("button").map(({ textContent }) => textContent).filter((text) => /installation/.test(text)), [], or);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "verifier"), []);
  });
});
