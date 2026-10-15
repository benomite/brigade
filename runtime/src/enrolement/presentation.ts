// Ce qu'un serveur dit de lui en s'enrôlant : son nom, ce qu'est sa machine,
// ses capacités, s'il a la cloison de la box. Il le lit de lui-même ; le chef
// n'a rien à recopier, et c'est lui qui reconnaît les capacités à
// l'acceptation.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { hostname, release, type } from "node:os";
import { join } from "node:path";
import type { Presentation } from "../stations-globales/registre.ts";

export type Machine = {
  hostname: string;
  plateforme: NodeJS.Platform;
  // Ce qu'elle est, tel que la home l'affiche (`Debian GNU/Linux 13 (trixie)`).
  description: string;
  // Un projet y tourne dans la cloison de la box (`runtime/deploy/cloison.conf`).
  cloisonnee: boolean;
};

const PLATEFORMES: Partial<Record<NodeJS.Platform, string>> = { linux: "linux", darwin: "macos", win32: "windows" };

// Le nom de station d'un nom d'hôte : sa première étiquette, en minuscules,
// chiffres et tirets.
export function nomDeMachine(hote: string): string {
  const nom = (hote.split(".")[0] ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{Ll}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return nom === "" ? "serveur" : nom;
}

function prettyName(osRelease: string): string | null {
  const ligne = osRelease.split("\n").find((l) => l.startsWith("PRETTY_NAME="));
  const valeur = ligne?.slice("PRETTY_NAME=".length).trim().replace(/^"(.*)"$/, "$1");
  return valeur ? valeur : null;
}

// La machine où ce process tourne. `racine` : où lire `/etc`, pour un test.
export function machineCourante(racine = "/"): Machine {
  const plateforme = process.platform;
  const osRelease = join(racine, "etc/os-release");
  const lue = plateforme === "linux" && existsSync(osRelease) ? prettyName(readFileSync(osRelease, "utf8")) : null;
  const unites = join(racine, "etc/systemd/system");
  const cloisonnee = existsSync(unites) && readdirSync(unites).some((entree) => /^brigade@.+\.service\.d$/.test(entree) && existsSync(join(unites, entree, "cloison.conf")));
  return { hostname: hostname(), plateforme, description: lue ?? `${type()} ${release()}`, cloisonnee };
}

// La présentation de la machine : sa plateforme pour capacité, et celles
// qu'on lui ajoute au lancement (`--capability`).
export function presenterLaMachine(machine: Machine, options: { nom?: string; capacites?: readonly string[] } = {}): Presentation {
  const plateforme = PLATEFORMES[machine.plateforme];
  return {
    nom: options.nom ?? nomDeMachine(machine.hostname),
    machine: machine.description,
    capacites: [...new Set([...(plateforme ? [plateforme] : []), ...(options.capacites ?? [])])],
    cloisonnee: machine.cloisonnee,
  };
}
