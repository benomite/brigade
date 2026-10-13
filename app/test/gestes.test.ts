// Les gestes du chef : chacun écrit dans un shell de l'espace une commande de
// la doc, mot pour mot, et n'envoie rien. Ce qui s'écrit se compare ici à
// docs/runtime.md, « Piloter » — la forme de poste, et la ligne de chaque
// commande —, et à « Mettre en service » pour les trois gestes de la mise en
// service. Que rien ne parte se prouve sur `ecrit`, puis sur le registre et de
// faux pty ; et qu'aucun geste n'expose de shell, de `sudo` ni de commande
// libre, sur le socle lui-même.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTIONS } from "../../runtime/src/grant.ts";
import { BOUTONS, ecritPar } from "../src/boutons.ts";
import type { Projet } from "../src/config.ts";
import { commandeDuGeste, ecrireGeste, GESTES, GRANTS } from "../src/gestes.ts";
import { ouvrirTerminaux, type Terminal } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const SOURCE = "docs/runtime.md";
const doc = readFileSync(join(RACINE, SOURCE), "utf8");
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

// « Mettre en service » cite les siennes dans un bloc, une par ligne : la commande, puis — après
// deux espaces au moins — ce qu'elle fait.
const METTRE_EN_SERVICE = doc.slice(doc.indexOf("**Mettre en service.**"), doc.indexOf("**Une mise en service qui échoue"));
const CITEES_POUR_METTRE = new Set([...METTRE_EN_SERVICE.matchAll(/^(brigade <projet> mise-en-service(?: \S+)?) {2,}\S/gm)].map(([, citee = ""]) => citee));
const SECTIONS = { Piloter: CITEES, "Mettre en service": CITEES_POUR_METTRE } as const;

// Chaque geste : le grant qu'il nomme, la commande que la doc cite — et dans quelle section —, et ce qui s'écrit pour « parade » sur « box ».
const GESTES_DE_LA_DOC: readonly [id: string, grant: string | undefined, citee: string, ecrite: string, section: keyof typeof SECTIONS][] = [
  ["manager-allumer", undefined, "brigade <projet> manager allumer", "ssh box brigade parade manager allumer", "Piloter"],
  ["manager-eteindre", undefined, "brigade <projet> manager eteindre", "ssh box brigade parade manager eteindre", "Piloter"],
  ["grant-activer", "merge", "brigade <projet> grant activer merge", "ssh box brigade parade grant activer merge", "Piloter"],
  ["grant-revoquer", "merge", "brigade <projet> grant revoquer merge", "ssh box brigade parade grant revoquer merge", "Piloter"],
  ["reprendre", undefined, "brigade <projet> garde-fous reprendre", "ssh box brigade parade garde-fous reprendre", "Piloter"],
  ["stop", undefined, "brigade <projet> garde-fous stop", "ssh box brigade parade garde-fous stop", "Piloter"],
  ["installation", undefined, "brigade <projet> installation", "ssh box brigade parade installation", "Piloter"],
  ["mise-en-service", undefined, "brigade <projet> mise-en-service", "ssh box brigade parade mise-en-service", "Mettre en service"],
  ["mise-en-service-couper", undefined, "brigade <projet> mise-en-service --couper", "ssh box brigade parade mise-en-service --couper", "Mettre en service"],
  ["mise-en-service-annuler", undefined, "brigade <projet> mise-en-service annuler", "ssh box brigade parade mise-en-service annuler", "Mettre en service"],
];

// La commande écrite : le test échoue net si le geste a refusé d'écrire.
function commande(id: string, projet: Projet, grant?: string): string {
  const ecrit = commandeDuGeste(id, projet, grant);
  assert.ok(ecrit !== undefined && "commande" in ecrit, `rien n'est écrit par « ${id} »`);
  return ecrit.commande;
}

// Un `ecrit` qui retient ce qu'on lui donne, à la place de celui du registre.
function temoin() {
  const ecrits: [projet: string, commande: string][] = [];
  const shell = (projet: Projet, ecrit: string): Terminal => {
    ecrits.push([projet.nom, ecrit]);
    return { id: ecrits.length, projet: projet.nom, genre: "shell", titre: `shell ${ecrits.length}`, note: "", arrete: false };
  };
  return { ecrits, terminaux: { shell } };
}

describe("les gestes du chef", () => {
  test("ils sont dix, ceux que le chef répète, et chacun est une commande du runtime : rien de ce qui se joue sur la box à côté", () => {
    assert.deepEqual(
      GESTES.map(({ id }) => id),
      GESTES_DE_LA_DOC.map(([id]) => id),
    );
    assert.equal(new Set(GESTES.map(({ id }) => id)).size, GESTES.length);

    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const { id, commande: mots } of GESTES) {
      assert.ok((mots.split(" ")[0] ?? "") in scripts, `« ${id} » n'est pas un script du runtime`);
      assert.doesNotMatch(mots, /systemctl|brigade-bascule|brigade-mise-en-service|login|sudo/);
    }
  });

  test("la mise en service est trois gestes nommés, et chacun n'écrit que la commande du runtime qui la demande, la coupe ou y renonce : ni shell, ni `sudo`, ni commande libre", () => {
    assert.deepEqual(
      GESTES.filter(({ commande: mots }) => mots.includes("mise-en-service")),
      [
        { id: "mise-en-service", commande: "mise-en-service" },
        { id: "mise-en-service-couper", commande: "mise-en-service --couper" },
        { id: "mise-en-service-annuler", commande: "mise-en-service annuler" },
      ],
    );

    // Ce qui suit la commande est un mot de la liste fermée qu'elle accepte (runtime/src/mettre-en-service-cli.ts) — un seul, ou aucun.
    const cli = readFileSync(join(RACINE, "runtime/src/mettre-en-service-cli.ts"), "utf8");
    const acceptes = [...(/^const GESTES = \[([^\]]*)\];$/m.exec(cli)?.[1] ?? assert.fail("la commande du runtime ne donne plus la liste de ses gestes")).matchAll(/"([^"]+)"/g)].map(([, mot = ""]) => mot);
    assert.deepEqual(acceptes, ["--couper", "annuler", "voir"]);
    for (const { id, commande: mots } of GESTES.filter(({ id }) => id.startsWith("mise-en-service"))) {
      const [script, ...args] = mots.split(" ");
      assert.equal(script, "mise-en-service", id);
      assert.ok(args.length <= 1 && args.every((arg) => acceptes.includes(arg)), `« ${id} » écrit un argument que la commande n'accepte pas`);
    }

    // Aucun geste du socle ne porte de quoi lancer autre chose : des mots de la doc, sans rien que le shell de la box lirait.
    for (const { id, commande: mots, parGrant } of GESTES) {
      assert.match(mots, /^[a-z]+(-[a-z]+)*( (--)?[a-z]+(-[a-z]+)*)*$/, id);
      assert.doesNotMatch(mots, /\b(sudo|su|sh|bash|zsh|env|exec|eval|ssh|systemctl|brigade-bascule|brigade-mise-en-service)\b/, id);
      // Seul un geste de grant prend un mot de plus, et d'une liste fermée (GRANTS).
      assert.equal(parGrant, id.startsWith("grant-") ? true : undefined, id);
    }

    // La vue nomme un geste, jamais une commande : une commande libre, même celle du geste de box, n'écrit rien.
    const { ecrits, terminaux } = temoin();
    for (const libre of ["mise-en-service --couper", "mise-en-service; sudo reboot", "sudo brigade-mise-en-service parade", "brigade-mise-en-service", "sudo -n -- /usr/local/bin/brigade-mise-en-service parade", "mise-en-service-voir", "MISE-EN-SERVICE", " mise-en-service"]) {
      assert.equal(commandeDuGeste(libre, PARADE), undefined, libre);
      assert.equal(ecrireGeste(terminaux, libre, PARADE), undefined, libre);
    }
    // Et ce qui accompagne le nom du geste n'y ajoute rien : ni option, ni suite.
    for (const [id, , , ecrite] of GESTES_DE_LA_DOC.filter(([id]) => id.startsWith("mise-en-service"))) {
      for (const suite of ["--couper", "merge", "; sudo reboot", "$(reboot)", "&& sudo brigade-bascule parade", 3, null, ["--couper"]]) assert.deepEqual(commandeDuGeste(id, PARADE, suite), { commande: ecrite }, `${id} + ${String(suite)}`);
      assert.doesNotMatch(ecrite, /sudo|[;&|$`<>(){}\\]/);
    }
    assert.deepEqual(ecrits, []);

    // Le process principal ne fait que passer le nom du geste au socle ; ni lui, ni le pont, ni la vue, ni ce qui dit l'offre ne lancent rien.
    const principal = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    assert.ok(principal.includes('ipcMain.handle("geste", (_, nom: unknown, id: unknown, grant: unknown) => {\n  const vise = connu(nom);\n  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, grant);\n});'), "le canal « geste » du process principal ne passe plus le seul nom du geste au socle");
    assert.doesNotMatch(principal, /mise-en-service|sudo/);
    for (const fichier of ["app/src/preload.cjs", "app/src/vue/vue.js", "app/src/version.ts"]) {
      const source = readFileSync(join(RACINE, fichier), "utf8");
      assert.doesNotMatch(source, /child_process|execFile|spawn\(/, fichier);
    }
    // version.ts, qui dit ce qui s'offre, n'importe que des types : il ne peut rien lancer.
    const version = readFileSync(join(RACINE, "app/src/version.ts"), "utf8");
    assert.deepEqual([...version.matchAll(/^import (.*) from "[^"]+";$/gm)].map(([, quoi = ""]) => quoi.startsWith("type ")), [true]);
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

  test("chaque geste appelle `ecrit`, une fois, avec sa commande — qui ne porte ni retour à la ligne, ni aucun caractère qui l'enverrait", () => {
    for (const [id, grant, , ecrite] of GESTES_DE_LA_DOC) {
      const { ecrits, terminaux } = temoin();

      const shell = ecrireGeste(terminaux, id, PARADE, grant);

      assert.deepEqual(ecrits, [["parade", ecrite]], id);
      assert.deepEqual(shell, { id: 1, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false });
      const [[, ecrit = ""] = []] = ecrits;
      assert.doesNotMatch(ecrit, /[\r\n]/, id);
      assert.doesNotMatch(ecrit, /[\x00-\x1f\x7f]/, id);
    }
  });

  test("dans le registre, un geste ouvre un shell de l'espace et n'y écrit que sa commande : rien ne l'envoie, et le second ne reçoit rien", () => {
    const ecrits: string[][] = [];
    const lances: string[] = [];
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
    terminaux.espace(PARADE);

    const notes = GESTES_DE_LA_DOC.map(([id, grant]) => {
      const shell = ecrireGeste(terminaux, id, PARADE, grant);
      assert.ok(shell !== undefined && "note" in shell, `rien n'est écrit par « ${id} »`);
      return shell.note;
    });

    // Le second d'abord, puis un shell par geste — et dans chacun, la commande seule.
    assert.deepEqual(lances, ["claude --continue /brigade:po /projets/parade", ...GESTES_DE_LA_DOC.map(() => "/bin/zsh -l /projets/parade")]);
    assert.deepEqual(ecrits, [[], ...GESTES_DE_LA_DOC.map(([, , , ecrite]) => [ecrite])]);
    for (const [rang, [, , , ecrite]] of GESTES_DE_LA_DOC.entries()) assert.ok(notes[rang]?.startsWith(`écrit dans ce shell, sans Entrée : \`${ecrite}\` — c'est la tienne qui l'envoie.`));
  });

  test("un geste de grant nomme son grant, parmi ceux du runtime : pour un autre, ou sans lui, rien n'est écrit et le geste dit pourquoi", () => {
    assert.deepEqual(GRANTS, ACTIONS);
    for (const grant of GRANTS) assert.ok(CITEES.has(`brigade <projet> grant activer ${grant}`) && CITEES.has(`brigade <projet> grant revoquer ${grant}`), `${SOURCE} ne cite pas le grant « ${grant} »`);

    const refus = { refus: "rien n'est écrit : ce geste porte sur un grant, à nommer parmi ceux de la doc (merge)" };
    for (const id of ["grant-activer", "grant-revoquer"]) {
      for (const autre of [undefined, "", "identifiants-max", "merge --pour 4h", "merge; reboot", "merge\r", 3, null, ["merge"]]) {
        const { ecrits, terminaux } = temoin();
        assert.deepEqual(commandeDuGeste(id, PARADE, autre), refus);
        assert.deepEqual(ecrireGeste(terminaux, id, PARADE, autre), refus);
        assert.deepEqual(ecrits, []);
      }
    }
    // Un geste qui ne porte sur aucun grant n'en écrit pas.
    assert.equal(commande("stop", PARADE, "merge"), "ssh box brigade parade garde-fous stop");
  });

  test("la vue nomme un geste, jamais une commande ; et un projet sans box n'a rien à écrire", () => {
    const { ecrits, terminaux } = temoin();

    for (const autre of ["garde-fous stop", "manager allumer", "sudo systemctl enable --now brigade@parade.service", "rm -rf /", "", undefined, 3, null]) {
      assert.equal(commandeDuGeste(autre, PARADE, "merge"), undefined);
      assert.equal(ecrireGeste(terminaux, autre, PARADE, "merge"), undefined);
    }
    for (const { id } of GESTES) {
      assert.equal(commandeDuGeste(id, { nom: "parade", dossier: "/projets/parade" }, "merge"), undefined);
      assert.equal(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/projets/parade" }, "merge"), undefined);
    }
    assert.deepEqual(ecrits, []);
  });

  test("un nom ou un hôte que le shell du Mac découperait s'écrit cité : il arrive entier, et rien n'en est exécuté", () => {
    assert.equal(commande("manager-allumer", { nom: "parade", dossier: "/p", box: { hote: "chef@box.exemple:22" } }), "ssh chef@box.exemple:22 brigade parade manager allumer");
    assert.equal(commande("manager-allumer", { nom: "parade", dossier: "/p", box: { hote: "box; rm -rf ~" } }), "ssh 'box; rm -rf ~' brigade parade manager allumer");
    // Le nom passe deux shells — celui du Mac, puis celui de la box : il est cité pour chacun.
    assert.equal(commande("installation", { nom: "mon projet", dossier: "/p", box: { hote: "box" } }), `ssh box brigade ''\\''mon projet'\\''' installation`);
  });

  test("un geste qu'un bouton écrit déjà dans le second s'écrit pareil dans un shell, au `!` près : une seule commande pour un même geste", () => {
    const communs = BOUTONS.filter(({ id }) => GESTES.some((geste) => geste.id === id));
    assert.deepEqual(communs.map(({ id }) => id), ["stop", "reprendre", "grant-activer", "grant-revoquer"]);

    const projets: Projet[] = [PARADE, { nom: "mon projet", dossier: "/p", box: { hote: "box; rm -rf ~" } }, { nom: "l'autre", dossier: "/p", box: { hote: "chef@10.0.0.2" } }, { nom: "parade", dossier: "/p", box: { hote: "-box" } }];
    for (const projet of projets) {
      for (const { id } of communs) {
        const geste = commandeDuGeste(id, projet, "merge");
        assert.ok(geste !== undefined);
        assert.deepEqual("commande" in geste ? { commande: `!${geste.commande}` } : geste, ecritPar(id, projet));
      }
    }
  });

  test("un hôte qui commence par un tiret serait une option de `ssh` dans la forme de la doc : rien n'est écrit, et le geste dit pourquoi", () => {
    const { ecrits, terminaux } = temoin();

    for (const hote of ["-oProxyCommand=sh", "-box", "--"]) {
      for (const [id, grant] of GESTES_DE_LA_DOC) {
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/p", box: { hote } }, grant), {
          refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets`,
        });
      }
    }
    assert.deepEqual(ecrits, []);
    // Un tiret ailleurs est un nom d'hôte comme un autre.
    assert.equal(commande("stop", { nom: "parade", dossier: "/p", box: { hote: "ma-box" } }), "ssh ma-box brigade parade garde-fous stop");
  });

  test("un nom ou un hôte qui porte de quoi envoyer la commande n'est pas écrit : aucun shell n'est ouvert, et le geste dit pourquoi", () => {
    const { ecrits, terminaux } = temoin();
    const refus = { refus: "rien n'est écrit : la commande porte un caractère de contrôle, et un retour à la ligne l'aurait envoyée — vérifie « nom » et « hote » de ce projet dans le fichier des projets" };

    for (const piege of ["box\rreboot", "bo\nx", "box\x03", "box\x04", "box\x1b[A", "box\x7f", "\tbox"]) {
      for (const [id, grant] of GESTES_DE_LA_DOC) {
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: "parade", dossier: "/p", box: { hote: piege } }, grant), refus);
        assert.deepEqual(ecrireGeste(terminaux, id, { nom: piege, dossier: "/p", box: { hote: "box" } }, grant), refus);
      }
    }
    assert.deepEqual(ecrits, []);
  });

  test("un projet qui ne s'ouvre pas n'a pas de shell où écrire : le geste le dit, et n'écrit rien", () => {
    const { ecrits, terminaux } = temoin();
    const ferme = { ...PARADE, refus: "dossier introuvable : /projets/parade" };

    for (const [id, grant] of GESTES_DE_LA_DOC) {
      assert.deepEqual(ecrireGeste(terminaux, id, ferme, grant), { refus: "rien n'est écrit : « parade » ne s'ouvre pas — dossier introuvable : /projets/parade" });
    }
    assert.deepEqual(ecrits, []);
  });

  test("le module ne lance rien : ni `ssh`, ni commande — il n'a que `ecrit` pour toucher au monde", () => {
    const source = readFileSync(join(RACINE, "app/src/gestes.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, de]) => de);

    // Aucun module de Node : pas de `child_process`, donc rien qui s'exécute. De la veille, le seul `cite`.
    assert.deepEqual(imports, ["./box.ts", "./config.ts", "./terminaux.ts"]);
    assert.ok(source.includes('import { cite } from "./box.ts";'));
    assert.doesNotMatch(source, /\bimport\(|require\(|process\.|execFile|spawn/);
  });
});
