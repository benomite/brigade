// La box d'essai du geste d'installation : une box entière sous un répertoire,
// des doublures de `systemctl` et de `getent`, et des dépôts nus pour
// origines. Ni root, ni systemd, ni GitHub.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import type { Evenement } from "../../src/evenements.ts";
import type { Box } from "../../src/installateur.ts";
import { principal } from "../../src/installateur-cli.ts";
import { cheminJournal, ouvrirJournal } from "../../src/journal.ts";
import { BASE, ENV_GIT, FAUX_BWRAP, git, repertoireDuFichier, repertoireTemporaire } from "../outils.ts";

export const DEPLOIEMENT = join(import.meta.dirname, "../../deploy");
const GABARITS = ["brigade@.service", "brigade-sauvegarde@.service", "brigade-sauvegarde@.timer", "brigade-porte@.service", "brigade-arbitre.service"];
// Le compte du service de la box d'essai. Il porte l'uid de qui joue la suite.
export const COMPTE = "cuisine";
export const CHEF = "alice";
export const PREMIER_PORT = 4100;

// Le dépôt d'un projet tel que son origine le porte, prêt à être servi : ses
// bindings, ses gates, son setup. Fabriqué une fois par fichier, copié ensuite.
let gabarit: string | undefined;
function depotPret(): string {
  if (gabarit !== undefined) return gabarit;
  const racine = repertoireDuFichier("brigade-test-installateur-", () => void (gabarit = undefined));
  const [origine, travail] = [join(racine, "origine.git"), join(racine, "travail")];
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  mkdirSync(join(travail, ".claude/brigade"), { recursive: true });
  writeFileSync(
    join(travail, "CLAUDE.md"),
    ["# Le projet", "", "## Équipe multi-agents (plugin brigade)", "", `- **Branche d'intégration** : \`${BASE}\``, "- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`", ""].join("\n"),
  );
  for (const script of ["gates.sh", "worktree-setup.sh"]) {
    writeFileSync(join(travail, ".claude/brigade", script), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(travail, ".claude/brigade", script), 0o755);
  }
  git(travail, "add", ".");
  git(travail, "commit", "-q", "-m", "installe brigade");
  git(travail, "push", "-q", origine, BASE, `${BASE}:recette`);
  return (gabarit = origine);
}

export type Rendu = { code: number; json: Record<string, unknown>; erreur: string };

export type Boite = {
  racine: string;
  box: Box;
  unites: string;
  etats: string;
  sauvegardes: string;
  versions: string;
  home: string;
  // Pose sur l'origine le dépôt `<propriétaire>/<nom>`.
  pousser: (depot: string) => void;
  // Les arguments d'une installation valide de ce projet — une option valant
  // null n'est pas donnée.
  demande: (projet?: string, plus?: Record<string, string | null>) => string[];
  // Lance le geste, comme `sudo` le lancerait pour `qui`.
  geste: (args: string[], options?: { qui?: string | null; box?: Partial<Box>; signal?: AbortSignal }) => Promise<Rendu>;
  // Les appels reçus par `systemctl`, dans l'ordre.
  appels: () => string[];
  // Les unités que `systemctl enable --now` a laissées en marche.
  actives: () => string[];
  // Met une unité en marche, comme `sudo systemctl enable --now` le ferait.
  demarrer: (unite: string) => void;
  // Dès lors, `systemctl enable --now` échoue pour cette unité.
  refuserDActiver: (unite: string) => void;
  // Tout ce que la box porte, hors du journal du geste : chaque chemin, et
  // l'empreinte de chaque fichier.
  photo: () => Record<string, string>;
  journal: () => Evenement[];
};

// Une box préparée : les unités posées, le compte du service, le réglage du
// geste et la racine des sauvegardes — et aucun projet.
export function boite(t: TestContext): Boite {
  const racine = realpathSync(repertoireTemporaire(t));
  const sous = (...noms: string[]) => join(racine, ...noms);
  const [unites, etats, sauvegardes, versions, home, temoin, github, deploiement, bin] = [sous("unites"), sous("etats"), sous("sauvegardes"), sous("versions"), sous("home"), sous("temoin"), sous("github"), sous("deploy"), sous("bin")];
  for (const repertoire of [unites, sauvegardes, versions, home, temoin, github, deploiement, bin]) mkdirSync(repertoire, { recursive: true });
  // Les unités du dépôt, copiées telles quelles — à ceci près que l'état des
  // projets vit sous la box d'essai.
  for (const nom of GABARITS) writeFileSync(join(unites, nom), readFileSync(join(DEPLOIEMENT, nom), "utf8").replaceAll("/var/lib/brigade", etats));
  writeFileSync(join(deploiement, "cloison.conf"), readFileSync(join(DEPLOIEMENT, "cloison.conf"), "utf8").replace("/usr/bin/bwrap", FAUX_BWRAP).replace("/var/lib/brigade:/etc/brigade", `${etats}:${sous("etc-brigade")}`));
  writeFileSync(sous("installer.conf"), `# le réglage du geste\nsauvegardes=${sauvegardes}\nports=${PREMIER_PORT}-${PREMIER_PORT + 9}\n`);
  writeFileSync(join(temoin, "compte"), `${COMPTE}\n`);

  const executable = (nom: string, lignes: string[]) => {
    writeFileSync(join(bin, nom), ["#!/bin/sh", "PATH=/usr/bin:/bin", ...lignes, ""].join("\n"));
    chmodSync(join(bin, nom), 0o755);
    return join(bin, nom);
  };
  // `show -p User --value <unité>` rend le compte ; `show -p ActiveState -p
  // UnitFileState <unité>`, si elle est en marche ; `show -p … <unité>`, ce que
  // la vérification lit d'une unité ; `cat` connaît toute instance d'un gabarit
  // posé ; `enable --now` et `disable --now` tiennent la liste des unités en
  // marche, que `is-enabled` relit.
  const systemctl = executable("systemctl", [
    `T='${temoin}' U='${unites}'`,
    `echo "$*" >> "$T/appels"`,
    `for derniere; do :; done`,
    `case "$1" in`,
    `  show)`,
    `    if [ "$2 $3 $4" = "-p User --value" ]; then cat "$T/compte"; exit 0; fi`,
    `    if [ "$2 $3 $4 $5" = "-p ActiveState -p UnitFileState" ]; then`,
    `      if grep -qx "$6" "$T/actives" 2>/dev/null; then echo "ActiveState=active"; echo "UnitFileState=enabled"; else echo "ActiveState=inactive"; echo "UnitFileState=disabled"; fi`,
    `      exit 0`,
    `    fi`,
    `    echo "Environment="; echo "PrivateTmp=yes"; echo "ActiveState=inactive"; echo "LoadState=loaded"`,
    `    echo "FragmentPath=$U/brigade@.service"; echo "WorkingDirectory=${join(import.meta.dirname, "../..")}" ;;`,
    `  cat) [ -f "$U/$(echo "$derniere" | sed 's/@[^.]*\\./@./')" ] ;;`,
    `  is-enabled) grep -qx "$2" "$T/actives" 2>/dev/null ;;`,
    `  daemon-reload) : ;;`,
    `  enable)`,
    `    [ "$2" = "--now" ] || exit 1`,
    `    if grep -qx "$3" "$T/refuse" 2>/dev/null; then echo "Failed to enable unit: $3" >&2; exit 1; fi`,
    `    echo "$3" >> "$T/actives" ;;`,
    `  disable)`,
    `    [ "$2" = "--now" ] || exit 1`,
    `    grep -vx "$3" "$T/actives" > "$T/actives.tmp" 2>/dev/null`,
    `    mv "$T/actives.tmp" "$T/actives" ;;`,
    `  *) echo "faux systemctl : $*" >&2; exit 1 ;;`,
    `esac`,
  ]);
  const getent = executable("getent", [`[ "$1 $2" = "passwd ${COMPTE}" ] || exit 2`, `echo "${COMPTE}:x:${process.getuid?.()}:${process.getgid?.()}::${home}:/bin/sh"`]);

  const box: Box = {
    // Root, ici, est celui qui joue la suite.
    racine: process.getuid?.() ?? 0,
    // Au-dessus de la box d'essai, la machine n'est pas la sienne.
    sol: racine,
    unites,
    etats,
    config: sous("installer.conf"),
    journal: sous("journal"),
    deploiement,
    versions,
    systemctl,
    getent,
    git: "git",
    origine: (depot) => join(github, `${depot}.git`),
    environnement: () => ({ ...ENV_GIT, HOME: home }),
    portLibre: async () => true,
  };
  const lire = (fichier: string) => (existsSync(fichier) ? readFileSync(fichier, "utf8").split("\n").filter(Boolean) : []);
  const voir = (vue: Record<string, string>, chemin: string) => {
    const lu = lstatSync(chemin, { throwIfNoEntry: false });
    if (lu === undefined) vue[chemin] = "absent";
    else if (lu.isSymbolicLink()) vue[chemin] = `lien vers ${readlinkSync(chemin)}`;
    else if (lu.isDirectory()) {
      vue[chemin] = "répertoire";
      for (const nom of readdirSync(chemin).sort()) voir(vue, join(chemin, nom));
    } else vue[chemin] = createHash("sha256").update(readFileSync(chemin)).digest("hex");
    return vue;
  };
  return {
    racine,
    box,
    unites,
    etats,
    sauvegardes,
    versions,
    home,
    pousser(depot) {
      mkdirSync(dirname(box.origine(depot)), { recursive: true });
      cpSync(depotPret(), box.origine(depot), { recursive: true });
    },
    demande(projet = "calculus", plus = {}) {
      const options: Record<string, string | null> = {
        "--depot": `acme/${projet}`,
        "--sauvegardes": join(sauvegardes, projet),
        "--manager-modele": "sonnet",
        "--manager-effort": "medium",
        "--reviewer-modele": "haiku",
        "--reviewer-effort": "low",
        ...plus,
      };
      return ["install", projet, ...Object.entries(options).flatMap(([option, valeur]) => (valeur === null ? [] : [option, valeur]))];
    },
    async geste(args, options = {}) {
      const [dit, redit]: [string[], string[]] = [[], []];
      const qui = options.qui === undefined ? CHEF : options.qui;
      let code = 0;
      try {
        await principal({ args, env: qui === null ? {} : { SUDO_USER: qui }, dire: (ligne) => dit.push(ligne), redire: (ligne) => redit.push(ligne) }, { ...box, ...options.box }, options.signal);
      } catch (erreur) {
        if (!(erreur instanceof Sortie)) throw erreur;
        code = erreur.code;
      }
      // Sur la sortie standard : un objet JSON, sur une ligne, et rien d'autre.
      assert.equal(dit.length, 1, `la sortie standard porte ${dit.length} lignes : ${dit.join(" | ")}`);
      assert.ok(!dit[0]?.includes("\n"));
      return { code, json: JSON.parse(dit[0] ?? "") as Record<string, unknown>, erreur: redit.join("\n") };
    },
    appels: () => lire(join(temoin, "appels")),
    actives: () => lire(join(temoin, "actives")),
    demarrer: (unite) => writeFileSync(join(temoin, "actives"), `${unite}\n`, { flag: "a" }),
    refuserDActiver: (unite) => writeFileSync(join(temoin, "refuse"), `${unite}\n`),
    photo: () => [unites, etats, sauvegardes, versions, home, box.config, deploiement, join(temoin, "actives")].reduce(voir, {}),
    journal() {
      if (!existsSync(cheminJournal(box.journal))) return [];
      const journal = ouvrirJournal(box.journal, { lectureSeule: true, projections: [] });
      try {
        return journal.tout();
      } finally {
        journal.fermer();
      }
    },
  };
}
