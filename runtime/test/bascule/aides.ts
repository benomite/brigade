// Une machine d'essai servie à l'ancienne, posée sous une racine à part :
// une unité par projet (`brigade@<projet>.service`), ses réglages dans des
// drop-ins, la porte de chaque projet (`brigade-porte@<projet>.service`), ses
// gestes liés depuis /usr/local/bin vers le clone de brigade, leurs règles
// sudoers, l'ancien renouvellement — et ce qui n'est pas à elle et doit
// rester : l'arbitre des projets, une règle sans rapport, les liens vers node
// et claude. L'état de chaque projet a son journal, ses
// décisions, et son clone.
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ouvrirJournal } from "../../src/journal.ts";
import { git } from "../outils.ts";

export const UNITE_DE_LA_STATION = join(import.meta.dirname, "../../paquet/systemd/brigade-station.service");

// Les décisions qu'un projet servi a posées à son journal.
export const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

export type AncienProjet = {
  nom: string;
  depot: string;
  base: string;
  // Des affectations de plus, dans un drop-in à elles (`reglages.conf`).
  environnement?: Record<string, string>;
  // Sans journal : une unité déclarée qui n'a jamais servi.
  sansJournal?: boolean;
};

export const TROIS: AncienProjet[] = [
  { nom: "brigade", depot: "acme/brigade", base: "v2", environnement: { BRIGADE_ROADMAP_ISSUE: "1", BRIGADE_PROXY_PORT: "8481" } },
  { nom: "calculus-workspace", depot: "acme/calculus-workspace", base: "main", environnement: { BRIGADE_PROXY_PORT: "8482" } },
  { nom: "espace", depot: "acme/espace", base: "main", environnement: { BRIGADE_PROXY_PORT: "8483", BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env" } },
];

// Les gestes de l'ancienne installation, dans le `deploy/` de son clone. Le
// geste `brigade` reste — pointé sur celui du paquet ; les autres partent.
export const GESTES_ANCIENS = ["brigade-installer", "brigade-ancien-geste"];

function ecrire(fichier: string, texte: string, mode = 0o644): void {
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, texte);
  chmodSync(fichier, mode);
}

export type AncienneMachine = {
  racine: string;
  sous: (...chemin: string[]) => string;
  etat: (nom: string) => string;
  // Ce que la machine porte : chaque fichier (son empreinte) et chaque lien (sa cible).
  photo: () => Record<string, string>;
  // Le journal d'un projet, lu sans rien y écrire.
  faits: (nom: string) => Array<{ seq: number; at: string; type: string; ticket: number | null; payload: unknown }>;
};

// `arbitre` : le port de l'arbitre que chaque projet consulte — `null`, aucun.
// `sansPorte` : les projets servis sans cloison, ni porte ni filtre.
export function ancienneMachine(racine: string, projets: AncienProjet[] = TROIS, options: { renouvellement?: boolean; paquet?: boolean; arbitre?: string | null; sansPorte?: string[] } = {}): AncienneMachine {
  const arbitre = options.arbitre === undefined ? "8470" : options.arbitre;
  const sous = (...chemin: string[]) => join(racine, ...chemin);
  const unites = sous("etc/systemd/system");
  const etat = (nom: string) => sous("var/lib/brigade", nom);
  const clone = sous("opt/brigade");
  const lier = (cible: string, lien: string) => {
    mkdirSync(dirname(lien), { recursive: true });
    symlinkSync(cible, lien);
  };

  // Le clone de brigade d'où l'ancienne installation tirait son code et ses gestes.
  for (const geste of ["brigade", ...GESTES_ANCIENS, "brigade-renouvellement"]) ecrire(join(clone, "runtime/deploy", geste), "#!/bin/sh\nexit 0\n", 0o755);
  ecrire(
    join(unites, "brigade@.service"),
    [
      "# Runtime de brigade, une instance par projet : brigade@<projet>.service",
      "[Unit]",
      "Description=brigade — runtime du projet %i",
      "After=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=brigade",
      `WorkingDirectory=${clone}/runtime`,
      "ExecStart=/usr/bin/env node src/main.ts",
      "StateDirectory=brigade/%i",
      `Environment=BRIGADE_STATE_DIR=${sous("var/lib/brigade")}/%i`,
      "Environment=BRIGADE_PROJECT=%i",
      `Environment=BRIGADE_REPO_DIR=${sous("var/lib/brigade")}/%i/depot`,
      "PrivateTmp=yes",
      "Restart=on-failure",
      "KillMode=process",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "",
    ].join("\n"),
  );
  ecrire(join(unites, "brigade@.service.d/chemin.conf"), "[Service]\nEnvironment=PATH=/usr/local/bin:/usr/bin:/bin\n");
  // La porte de chaque projet, que les portes de la station remplacent ; et
  // l'arbitre des projets, qui n'est pas à l'ancienne unité : il reste.
  ecrire(join(unites, "brigade-porte@.service"), `[Unit]\nDescription=brigade — porte du projet %i\nBefore=brigade@%i.service\n\n[Service]\nWorkingDirectory=${clone}/runtime\nExecStart=/usr/bin/env node src/tenir-porte.ts\n`);
  ecrire(join(unites, "brigade-arbitre.service"), `[Service]\nWorkingDirectory=${clone}/runtime\nExecStart=/usr/bin/env node src/tenir-arbitre.ts\n`);
  ecrire(join(unites, "brigade-arbitre.service.d/reglages.conf"), `[Service]\nEnvironment=BRIGADE_ARBITER_PORT=${arbitre ?? "8470"}\n`);
  lier(join(unites, "brigade-arbitre.service"), join(unites, "multi-user.target.wants/brigade-arbitre.service"));

  for (const projet of projets) {
    const instance = join(unites, `brigade@${projet.nom}.service.d`);
    ecrire(join(instance, "projet.conf"), `[Service]\nEnvironment=BRIGADE_GITHUB_REPO=${projet.depot}\nEnvironment=BRIGADE_BASE_BRANCH=${projet.base}\n`);
    ecrire(join(instance, "code.conf"), `[Service]\nWorkingDirectory=${sous("opt/brigade-versions", projet.nom, "en-service/runtime")}\n`);
    if (arbitre !== null) ecrire(join(instance, "arbitre.conf"), `[Service]\nEnvironment=BRIGADE_ARBITER_PORT=${arbitre}\n`);
    const sansPorte = options.sansPorte?.includes(projet.nom) ?? false;
    if (!sansPorte) {
      ecrire(
        join(instance, "cloison.conf"),
        "[Unit]\nRequires=brigade-porte@%i.service\nAfter=brigade-porte@%i.service\n\n[Service]\nEnvironment=BRIGADE_SANDBOX_BIN=/usr/bin/bwrap\nEnvironment=BRIGADE_SANDBOX_HIDDEN=/var/lib/brigade:/etc/brigade\nPrivateTmp=yes\nIPAddressDeny=any\nIPAddressAllow=localhost\n",
      );
    }
    // Un réglage du chef resté là, vidé quand les décisions sont passées au journal.
    ecrire(join(instance, "chef.conf"), "[Service]\n# Les décisions vivent au journal.\n");
    if (projet.environnement) {
      const lignes = Object.entries(projet.environnement).map(([cle, valeur]) => `Environment="${cle}=${valeur}"`);
      ecrire(join(instance, "reglages.conf"), `[Service]\n${lignes.join("\n")}\n`);
    }
    lier(join(unites, "brigade@.service"), join(unites, `multi-user.target.wants/brigade@${projet.nom}.service`));
    if (!sansPorte) {
      ecrire(join(unites, `brigade-porte@${projet.nom}.service.d/port.conf`), `[Service]\nEnvironment=BRIGADE_PROXY_PORT=${projet.environnement?.BRIGADE_PROXY_PORT ?? "8480"}\n`);
      lier(join(unites, "brigade-porte@.service"), join(unites, `multi-user.target.wants/brigade-porte@${projet.nom}.service`));
    }

    if (projet.sansJournal) continue;
    mkdirSync(join(etat(projet.nom), "runs"), { recursive: true });
    const journal = ouvrirJournal(etat(projet.nom));
    for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: projet.nom, ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
    journal.ajouter({ project: projet.nom, ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
    journal.fermer();
    const depot = join(etat(projet.nom), "depot");
    mkdirSync(depot, { recursive: true });
    git(depot, "init", "-q");
  }
  if (options.renouvellement !== false) {
    ecrire(join(unites, "brigade-renouvellement.service"), `[Service]\nType=oneshot\nExecStart=${clone}/runtime/deploy/brigade-renouvellement\n`);
    ecrire(join(unites, "brigade-renouvellement.timer"), "[Timer]\nOnUnitActiveSec=1min\n");
    lier(join(unites, "brigade-renouvellement.timer"), join(unites, "timers.target.wants/brigade-renouvellement.timer"));
  }

  // Les gestes, liés depuis /usr/local/bin, et ce qui n'est pas à brigade.
  const bin = sous("usr/local/bin");
  for (const geste of ["brigade", ...GESTES_ANCIENS]) lier(join(clone, "runtime/deploy", geste), join(bin, geste));
  lier(sous("opt/node/bin/node"), join(bin, "node"));
  lier(sous("home/brigade/.local/bin/claude"), join(bin, "claude"));
  const sudoers = sous("etc/sudoers.d");
  ecrire(join(sudoers, "brigade"), `# Le geste de la box.\n%brigade-chefs ALL=(brigade) NOPASSWD: ${join(bin, "brigade")}\n`, 0o440);
  ecrire(join(sudoers, "brigade-installer"), `# Le geste d'installation, qui nomme aussi ${join(bin, "brigade")} dans ce commentaire.\n%brigade-chefs ALL=(root) NOPASSWD: ${join(bin, "brigade-installer")}\n`, 0o440);
  ecrire(join(sudoers, "brigade-ancien-geste"), `brigade ALL=(root) NOPASSWD: ${join(bin, "brigade-ancien-geste")}\n`, 0o440);
  ecrire(join(sudoers, "sauvegardes"), "operateur ALL=(root) NOPASSWD: /usr/bin/rsync\n", 0o440);

  // Ce que le paquet de la station a posé, avant que son postinst ne joue.
  if (options.paquet !== false) {
    ecrire(sous("usr/lib/brigade-station/brigade"), "#!/bin/bash\nexit 0\n", 0o755);
    mkdirSync(sous("usr/lib/systemd/system"), { recursive: true });
    copyFileSync(UNITE_DE_LA_STATION, sous("usr/lib/systemd/system/brigade-station.service"));
  }

  const photo = () => {
    const vu: Record<string, string> = {};
    const parcourir = (repertoire: string) => {
      for (const nom of readdirSync(repertoire)) {
        const chemin = join(repertoire, nom);
        const lu = lstatSync(chemin);
        if (lu.isSymbolicLink()) vu[relative(racine, chemin)] = `-> ${readlinkSync(chemin)}`;
        else if (lu.isDirectory()) parcourir(chemin);
        else vu[relative(racine, chemin)] = createHash("sha256").update(readFileSync(chemin)).digest("hex");
      }
    };
    if (existsSync(racine)) parcourir(racine);
    return vu;
  };
  const faits = (nom: string) => {
    const journal = ouvrirJournal(etat(nom), { lectureSeule: true });
    try {
      return journal.tout().map((e) => ({ seq: e.seq, at: e.at, type: e.type, ticket: e.ticket, payload: e.payload }));
    } finally {
      journal.fermer();
    }
  };
  return { racine, sous, etat, photo, faits };
}
