// Ce que cet ordinateur a des trois outils requis (#4059, outils-requis.ts), et pour chacun qui manque le chemin qui
// l'installe. La présence d'un outil est celle que le second lit déjà (`voirLOutil`, second/outils.ts) : un dossier du
// PATH le porte. Deux choses de plus :
//   - sur un Mac, `/usr/bin/git` est là même sans les outils de développement d'Apple — lancé, il ne fait qu'ouvrir
//     leur installeur. `git` n'y est présent que si ces outils le sont (`xcode-select -p` réussit), ou s'il vient
//     d'ailleurs ;
//   - un outil installé là où son installeur le pose, mais hors du PATH de l'app (le `gh` que winget vient de poser
//     dans `Program Files`), est rendu dans `horsDuPath` avec son dossier : l'app l'ajoute à son PATH et le relit,
//     sans redémarrer.
// Ne lève pas : une commande qui ne se lance pas compte pour absente.
import { spawnSync } from "node:child_process";
import { posix, win32 } from "node:path";
import { dansLePath, voirLOutil, type OptionsDesOutils } from "../second/outils.ts";
import { choisirInstallation, OUTILS_REQUIS, type Installation, type Machine, type OutilRequis } from "./outils-requis.ts";

export type OptionsDeLaMachine = OptionsDesOutils & {
  // La commande a-t-elle réussi ? Par défaut, lancée pour de bon.
  reussit?: (programme: string, args: string[]) => boolean;
};

export type MachineLue = Machine & { horsDuPath: Partial<Record<OutilRequis, string>> };
export type OutilManquant = { outil: OutilRequis; installation: Installation };

const lancer = (programme: string, args: string[]) => {
  try {
    return spawnSync(programme, args, { stdio: "ignore", windowsHide: true, timeout: 10_000 }).status === 0;
  } catch {
    return false;
  }
};

export function lireLaMachine(options: OptionsDeLaMachine = {}): MachineLue {
  const plateforme = options.plateforme ?? process.platform;
  const reussit = options.reussit ?? lancer;
  const presents: string[] = [];
  const horsDuPath: Partial<Record<OutilRequis, string>> = {};
  const outilsDeveloppeur = plateforme === "darwin" && reussit("xcode-select", ["-p"]);
  if (outilsDeveloppeur) presents.push("outils-developpeur");
  if (plateforme === "win32" && dansLePath("winget", { ...options, plateforme }) !== null) presents.push("winget");
  for (const outil of OUTILS_REQUIS) {
    const vu = voirLOutil(outil, { ...options, plateforme });
    if (vu.present) {
      // Le `git` de macOS sans ses outils n'est qu'un lanceur de leur installeur.
      if (outil === "git" && plateforme === "darwin" && !outilsDeveloppeur && vu.path === "/usr/bin/git") continue;
      presents.push(outil);
    } else if (vu.found !== undefined) horsDuPath[outil] = (plateforme === "win32" ? win32 : posix).dirname(vu.found);
  }
  return { plateforme, presents, horsDuPath };
}

// Les outils de `outils` qui manquent à cette machine, dans l'ordre où les installer — `git` d'abord : sous Windows,
// Claude Code lance ses commandes dans le Git Bash qu'il apporte —, chacun avec son chemin.
export function outilsManquants(machine: Machine, outils: readonly OutilRequis[] = OUTILS_REQUIS): OutilManquant[] {
  return OUTILS_REQUIS.filter((outil) => outils.includes(outil) && !machine.presents.includes(outil)).map((outil) => ({ outil, installation: choisirInstallation(outil, machine) }));
}
