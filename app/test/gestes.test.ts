// Les gestes du chef : chacun envoie dans le second une commande de la doc, mot
// pour mot (`envoyer`) — direct, au clic ; confirmé, seulement avec le « oui » du
// chef. Ce qui part se compare ici à docs/runtime.md, « Piloter » — la forme de
// poste, et la ligne de chaque commande. Qu'un geste confirmé ne parte pas sans son
// « oui » se prouve sur `envoyer`, puis sur le registre et de faux pty ; et
// qu'aucun geste n'expose de shell, de `sudo` ni de commande libre, sur le socle
// lui-même.
import { lireDocRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTIONS } from "../../runtime/src/grant.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS, ecritPar } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { commandeDuGeste, CONFIRMES, DIRECTS, ecrireGeste, GESTES, GRANTS, SANS_OUI } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { ouvrirTerminaux, type Terminal } from "../src/terminaux.ts";
import { type Faux, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const RACINE = join(import.meta.dirname, "../..");
const SOURCE = "docs/runtime.md";
const doc = lireDocRuntime(RACINE);
const PILOTER = doc.slice(doc.indexOf("### Piloter"), doc.indexOf("### Recette du chef"));
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };

// Les deux écritures que « Piloter » tient séparées : sur la box, et depuis le poste.
const DE_BOX = "brigade <projet> <commande>";
const DE_POSTE = "ssh <hote> brigade <nom> <commande>";

// Ce qu'une ligne de « Piloter » cite : entre crochets c'est facultatif, et `|` y sépare les choix.
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

// Toutes les commandes du geste de box que « Piloter » cite, chacune écrite en entier.
const CITEES = new Set(
  [...PILOTER.matchAll(/`([^`\n]+)`/g)]
    .map(([, cite = ""]) => cite.replaceAll("\\|", "|"))
    .filter((cite) => cite.startsWith("brigade <projet> "))
    .flatMap(formes),
);

const SECTIONS = { Piloter: CITEES } as const;

// Chaque geste : le grant qu'il nomme, la commande que la doc cite — et dans quelle section —, et ce qui s'écrit pour « parade » sur « box ».
const GESTES_DE_LA_DOC: readonly [id: string, grant: string | undefined, citee: string, ecrite: string, section: keyof typeof SECTIONS][] = [
  ["manager-allumer", undefined, "brigade <projet> manager on", "ssh box brigade parade manager on", "Piloter"],
  ["manager-eteindre", undefined, "brigade <projet> manager off", "ssh box brigade parade manager off", "Piloter"],
  ["grant-activer", "merge", "brigade <projet> grant enable merge", "ssh box brigade parade grant enable merge", "Piloter"],
  ["grant-revoquer", "merge", "brigade <projet> grant revoke merge", "ssh box brigade parade grant revoke merge", "Piloter"],
  ["reprendre", undefined, "brigade <projet> guardrails resume", "ssh box brigade parade guardrails resume", "Piloter"],
  ["stop", undefined, "brigade <projet> guardrails stop", "ssh box brigade parade guardrails stop", "Piloter"],
  ["installation", undefined, "brigade <projet> installation", "ssh box brigade parade installation", "Piloter"],
];

// La commande écrite : le test échoue net si le geste a refusé d'écrire.
function commande(id: string, projet: Projet, grant?: string): string {
  const ecrit = commandeDuGeste(id, projet, grant);
  assert.ok(ecrit !== undefined && "commande" in ecrit, `rien n'est écrit par « ${id} »`);
  return ecrit.commande;
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
  test("ils sont sept, ceux que le chef répète, et chacun est une commande du runtime : rien de ce qui se joue sur la box à côté", () => {
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
    // Aucun geste du socle ne porte de quoi lancer autre chose : des mots de la doc, sans rien que le shell de la box lirait.
    for (const { id, commande: mots, parGrant } of GESTES) {
      assert.match(mots, /^[a-z]+(-[a-z]+)*( (--)?[a-z]+(-[a-z]+)*)*$/, id);
      assert.doesNotMatch(mots, /\b(sudo|su|sh|bash|zsh|env|exec|eval|ssh|systemctl)\b/, id);
      // Seul un geste de grant prend un mot de plus, et d'une liste fermée (GRANTS).
      assert.equal(parGrant, id.startsWith("grant-") ? true : undefined, id);
    }

    // La vue nomme un geste, jamais une commande : une commande libre, même celle du geste de box, n'écrit rien.
    const { ecrits, terminaux } = temoin();
    for (const libre of ["guardrails stop", "stop; sudo reboot", "stop --couper", "sudo brigade parade guardrails stop", "brigade", "sudo -n -- /usr/local/bin/brigade parade stop", "stop-voir", "STOP", " stop"]) {
      assert.equal(commandeDuGeste(libre, PARADE), undefined, libre);
      assert.equal(ecrireGeste(terminaux, libre, PARADE), undefined, libre);
    }
    // Et ce qui accompagne le nom du geste n'y ajoute rien : ni option, ni suite.
    for (const [id, , , ecrite] of GESTES_DE_LA_DOC.filter(([id]) => !id.startsWith("grant-"))) {
      for (const suite of ["--interrupt", "merge", "; sudo reboot", "$(reboot)", "&& sudo systemctl stop brigade", 3, null, ["--couper"]]) assert.deepEqual(commandeDuGeste(id, PARADE, suite), { commande: ecrite }, `${id} + ${String(suite)}`);
      assert.doesNotMatch(ecrite, /sudo|[;&|$`<>(){}\\]/);
    }
    assert.deepEqual(ecrits, []);

    // Le process principal ne fait que passer le nom du geste au socle ; ni lui, ni le pont, ni la vue, ni ce qui dit l'offre ne lancent rien.
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    assert.ok(principal.includes('ipcMain.handle("geste", (_, nom: unknown, id: unknown, grant: unknown, oui: unknown) => {\n  const vise = connu(nom);\n  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, grant, oui);\n});'), "le canal « geste » du process principal ne passe plus le seul nom du geste au socle");
    assert.doesNotMatch(principal, /sudo/);
    for (const fichier of ["app/src/preload.cjs", "app/src/vue/vue.js", "app/src/confirmation.ts"]) {
      const source = readFileSync(join(RACINE, fichier), "utf8");
      assert.doesNotMatch(source, /child_process|execFile|spawn\(/, fichier);
    }
  });

  test(`${SOURCE}, « Piloter », donne les deux écritures d'un geste : \`${DE_BOX}\` sur la box, \`${DE_POSTE}\` depuis le poste — c'est la seconde que l'app écrit`, () => {
    // La doc se replie où elle veut : seuls ses mots comptent.
    const mots = PILOTER.replace(/\s+/g, " ");
    assert.ok(mots.includes(`Le *geste de box* est \`${DE_BOX}\``), "« Piloter » ne donne plus cette forme sur la box");
    assert.ok(mots.includes(`Le *geste de poste* est \`${DE_POSTE}\``), "« Piloter » ne donne plus cette forme depuis le poste");
  });

  for (const [id, grant, citee, ecrite, section] of GESTES_DE_LA_DOC) {
    test(`« ${id} » écrit \`${ecrite}\` — caractère pour caractère la commande de ${SOURCE}, « ${section} » : \`${citee}\`, dans sa forme de poste`, () => {
      assert.ok(SECTIONS[section].has(citee), `${SOURCE}, « ${section} », ne cite plus \`${citee}\``);
      // La forme de poste de la doc, avec l'hôte et le nom de ce projet : rien d'autre n'y est changé.
      const mots = citee.slice(DE_BOX.indexOf("<commande>"));
      assert.equal(DE_BOX.replace("<commande>", mots), citee);
      const attendu = DE_POSTE.replace("<hote>", "box").replace("<nom>", "parade").replace("<commande>", mots);

      assert.deepEqual(commandeDuGeste(id, PARADE, grant), { commande: attendu });
      assert.equal(attendu, ecrite);
    });
  }

  test("deux gestes sont directs — éteindre le manager, vérifier l'installation : aucun n'engage ni ne détruit ; les cinq autres sont confirmés", () => {
    assert.deepEqual(DIRECTS, ["manager-eteindre", "installation"]);
    assert.deepEqual(CONFIRMES, ["manager-allumer", "grant-activer", "grant-revoquer", "reprendre", "stop"]);
    // Chaque geste a l'une des deux formes, et une seule.
    assert.deepEqual([...DIRECTS, ...CONFIRMES].toSorted(), GESTES.map(({ id }) => id).toSorted());
  });

  test("un geste direct appelle `envoyer`, une fois, avec la commande de la doc préfixée du `!` qui la lance depuis le second — et n'ouvre aucun shell ; rien n'y porte de quoi l'envoyer à la place de l'app", async () => {
    for (const [id, grant, , ecrite] of PARTENT) {
      const { ecrits, envoyes, terminaux } = temoin();

      const second = await ecrireGeste(terminaux, id, PARADE, grant);

      assert.deepEqual([ecrits, envoyes], [[], [["parade", `!${ecrite}`]]], id);
      assert.deepEqual(second, { id: 0, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false });
      assert.doesNotMatch(ecrite, /[\x00-\x1f\x7f]/, id);
    }
  });

  test("un geste confirmé, nommé sans son « oui », ne part pas : rien n'est envoyé ni écrit, et le refus le dit — seul `true` vaut « oui »", () => {
    assert.equal(SANS_OUI, "nothing was sent: this action waits for your “yes”, in front of what it costs — nothing is written into the second");
    for (const [id, grant] of CONFIRMES_DE_LA_DOC) {
      const { ecrits, envoyes, terminaux } = temoin();
      for (const oui of [undefined, false, "true", "oui", 1, {}, [true], null]) assert.deepEqual(ecrireGeste(terminaux, id, PARADE, grant, oui), { refus: SANS_OUI }, `${id} + ${String(oui)}`);
      assert.deepEqual([ecrits, envoyes], [[], []], id);
    }
  });

  test("avec son « oui », un geste confirmé part comme un direct : `envoyer`, une fois, la commande de la doc préfixée du `!` — aucun shell", async () => {
    for (const [id, grant, , ecrite] of CONFIRMES_DE_LA_DOC) {
      const { ecrits, envoyes, terminaux } = temoin();

      const second = await ecrireGeste(terminaux, id, PARADE, grant, true);

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

    for (const [id, grant] of CONFIRMES_DE_LA_DOC) assert.deepEqual(ecrireGeste(terminaux, id, PARADE, grant), { refus: SANS_OUI }, id);
    assert.deepEqual([lances, ecrits], [[], []]);

    // Avec son « oui » : le second ne tournait pas, il est lancé — et la commande n'y est pas écrite tant qu'il démarre.
    const [id, grant] = CONFIRMES_DE_LA_DOC[0] ?? assert.fail();
    const second = await ecrireGeste(terminaux, id, PARADE, grant, true);
    assert.ok(second !== undefined && "note" in second);
    assert.equal(second.genre, "second");
    assert.match(second.note, /the command did not go/);
    assert.deepEqual(lances, ["claude --continue /brigade:po /projets/parade"]);
    assert.deepEqual(ecrits, [[]]);
  });

  test("un geste de grant nomme son grant, parmi ceux du runtime : pour un autre, ou sans lui, rien n'est écrit et le geste dit pourquoi", () => {
    assert.deepEqual(GRANTS, ACTIONS);
    for (const grant of GRANTS) assert.ok(CITEES.has(`brigade <projet> grant enable ${grant}`) && CITEES.has(`brigade <projet> grant revoke ${grant}`), `${SOURCE} ne cite pas le grant « ${grant} »`);

    const refus = { refus: "nothing is written: this action applies to a grant, to be named among those in the docs (merge)" };
    for (const id of ["grant-activer", "grant-revoquer"]) {
      for (const autre of [undefined, "", "identifiants-max", "merge --pour 4h", "merge; reboot", "merge\r", 3, null, ["merge"]]) {
        const { ecrits, terminaux } = temoin();
        assert.deepEqual(commandeDuGeste(id, PARADE, autre), refus);
        assert.deepEqual(ecrireGeste(terminaux, id, PARADE, autre), refus);
        assert.deepEqual(ecrits, []);
      }
    }
    // Un geste qui ne porte sur aucun grant n'en écrit pas.
    assert.equal(commande("stop", PARADE, "merge"), "ssh box brigade parade guardrails stop");
  });

  test("la vue nomme un geste, jamais une commande ; et un projet sans box n'a rien à écrire", () => {
    const { ecrits, envoyes, terminaux } = temoin();

    for (const autre of ["guardrails stop", "manager on", "garde-fous stop", "manager allumer", "sudo systemctl enable --now brigade@parade.service", "rm -rf /", "", undefined, 3, null]) {
      assert.equal(commandeDuGeste(autre, PARADE, "merge"), undefined);
      assert.equal(ecrireGeste(terminaux, autre, PARADE, "merge"), undefined);
    }
    for (const { id } of GESTES) {
      assert.equal(commandeDuGeste(id, { nom: "parade", dossier: "/projets/parade" }, "merge"), undefined);
      assert.equal(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/projets/parade" }, "merge"), undefined);
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("un nom ou un hôte que le shell du Mac découperait s'écrit cité : il arrive entier, et rien n'en est exécuté", () => {
    assert.equal(commande("manager-allumer", { nom: "parade", dossier: "/p", box: { hote: "chef@box.exemple:22" } }), "ssh chef@box.exemple:22 brigade parade manager on");
    assert.equal(commande("manager-allumer", { nom: "parade", dossier: "/p", box: { hote: "box; rm -rf ~" } }), "ssh 'box; rm -rf ~' brigade parade manager on");
    // Le nom passe deux shells — celui du Mac, puis celui de la box : il est cité pour chacun.
    assert.equal(commande("installation", { nom: "mon projet", dossier: "/p", box: { hote: "box" } }), `ssh box brigade ''\\''mon projet'\\''' installation`);
  });

  test("aucun bouton n'écrit dans le second un geste du socle : un même geste n'a qu'une forme, et ne s'écrit pas à côté sans partir", () => {
    assert.deepEqual(BOUTONS.filter(({ id }) => GESTES.some((geste) => geste.id === id)), []);
    // Ce qui reste aux boutons attend une suite que seul le chef tape : une durée, un nombre.
    assert.ok(BOUTONS.every(({ commande }) => commande.endsWith(" ")));
  });

  test("un hôte qui commence par un tiret serait une option de `ssh` dans la forme de la doc : rien n'est écrit, et le geste dit pourquoi", () => {
    const { ecrits, terminaux } = temoin();

    for (const hote of ["-oProxyCommand=sh", "-box", "--"]) {
      for (const [id, grant] of GESTES_DE_LA_DOC) {
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/p", box: { hote } }, grant), {
          refus: `nothing is written: “hote” starts with a dash (${hote}), and \`ssh\` would read it as an option in the command — fix it in the projects file`,
        });
      }
    }
    assert.deepEqual(ecrits, []);
    // Un tiret ailleurs est un nom d'hôte comme un autre.
    assert.equal(commande("stop", { nom: "parade", dossier: "/p", box: { hote: "ma-box" } }), "ssh ma-box brigade parade guardrails stop");
  });

  test("un nom ou un hôte qui porte de quoi envoyer la commande n'est pas écrit : aucun shell n'est ouvert, et le geste dit pourquoi", () => {
    const { ecrits, envoyes, terminaux } = temoin();
    const refus = { refus: "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” and “hote” of this project in the projects file" };

    for (const piege of ["box\rreboot", "bo\nx", "box\x03", "box\x04", "box\x1b[A", "box\x7f", "\tbox"]) {
      for (const [id, grant] of GESTES_DE_LA_DOC) {
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/p", box: { hote: piege } }, grant), refus);
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: piege, dossier: "/p", box: { hote: "box" } }, grant), refus);
      }
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("un projet qui ne s'ouvre pas n'a ni shell où écrire, ni second où envoyer : le geste le dit, et n'écrit ni n'envoie rien", () => {
    const { ecrits, envoyes, terminaux } = temoin();
    const ferme = { ...PARADE, refus: "dossier introuvable : /projets/parade" };

    for (const [id, grant] of GESTES_DE_LA_DOC) {
      assert.deepEqual(ecrireGeste(terminaux, id, ferme, grant), { refus: "nothing is written: “parade” does not open — dossier introuvable : /projets/parade" });
    }
    assert.deepEqual([ecrits, envoyes], [[], []]);
  });

  test("le module ne lance rien : ni `ssh`, ni commande — il n'a qu'`envoyer`, celui du registre, pour toucher au monde", () => {
    const source = readFileSync(join(RACINE, "app/src/gestes.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, de]) => de);

    // Aucun module de Node : pas de `child_process`, donc rien qui s'exécute. De la veille, le seul `cite`.
    assert.deepEqual(imports, ["./box.ts", "./config.ts", "./terminaux.ts"]);
    assert.ok(source.includes('import { cite } from "./box.ts";'));
    assert.doesNotMatch(source, /\bimport\(|require\(|process\.|execFile|spawn/);
  });
});

// La vue, jouée : l'espace de « parade » ouvert, le geste du projet en tête, à côté de son nom.
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "fil repris", arrete: false };
async function ouvrir(geste: NonNullable<Reponses["geste"]>, autres: Reponses = {}) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
const cliquer = async (ou: Faux, libelle: string) => {
  (ou.dessous("button").find((bouton) => bouton.textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`)).click();
  await repos();
};

describe("dans la vue, un geste direct part au clic", () => {
  test("vérifier l'installation est le geste du projet lui-même : en tête de son espace, à côté de son nom — le panneau d'état n'a plus de gestes", async () => {
    const vue = await ouvrir(() => SECOND);

    const projet = vue.element("gestes-projet");
    assert.equal(projet.hidden, false);
    assert.deepEqual(projet.children.map((pose) => [pose.balise, pose.textContent, pose.dataset.geste]), [["button", "check the installation", "direct"]]);
    // Le panneau de droite ne porte plus de geste de la cuisine ni de l'état.
    assert.throws(() => vue.element("gestes-cuisine"));
    assert.throws(() => vue.element("gestes-etat"));
    assert.deepEqual(vue.element("etat").dessous("button").map(({ textContent }) => textContent).filter((texte) => /cuisine|installation|garde-fous/.test(texte)), []);
  });

  test("le clic lance la vérification structurée, jamais une commande : rien n'est écrit dans le second, son verdict se lit dans Paramètres", async () => {
    const vue = await ouvrir(() => assert.fail("rien ne s'écrit dans le second"), { verifier: () => undefined });

    await cliquer(vue.element("gestes-projet"), "check the installation");

    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "verifier").map(({ args }) => args), [["parade"]]);
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "geste" || geste === "confirmer"), []);
  });
});
