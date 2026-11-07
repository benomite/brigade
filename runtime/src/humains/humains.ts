// Les humains d'un projet (#2759, épique #2748) : brigade sert des équipes, et
// chaque projet déclare dans ses réglages versionnés
// (`.claude/brigade/projet.json`) qui y travaille. La clé `humans` est une
// liste d'entrées `{login, roles}` : `login` est un compte GitHub, `roles` une
// liste parmi `product`, `design`, `review` et `client-contact`. Les rôles sont
// ceux du projet : le même compte peut en porter d'autres dans un autre projet.
//
// Ce module valide cette liste et la lit depuis le clone d'un projet ; il dit
// qui porte un rôle. Un projet sans `humans` — ou sans fichier — n'a personne :
// une liste vide, comme avant. Une entrée refusée (rôle inconnu, compte vide
// ou déclaré deux fois) est un refus qui la nomme, jamais une liste devinée.
//
// Ses messages sont en anglais : c'est l'app qui les montre.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FICHIER, LOGIN, reglagesDuTexte } from "../reglages-projet/reglages.ts";

export const ROLES_HUMAINS = ["product", "design", "review", "client-contact"] as const;
export type RoleHumain = (typeof ROLES_HUMAINS)[number];
export type Humain = { login: string; roles: RoleHumain[] };

export class HumainsInvalides extends Error {
  // Où dans les réglages : `humans.1.roles`.
  readonly cle: string;
  constructor(cle: string, message: string) {
    super(message);
    this.name = "HumainsInvalides";
    this.cle = cle;
  }
}

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const liste = (noms: readonly string[]) => noms.map((nom) => `\`${nom}\``).join(", ");

// Les humains que porte la valeur de `humans`, ou un refus qui nomme l'entrée
// fautive. Absente, la liste est vide.
export function humainsDe(valeur: unknown): Humain[] {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur)) throw new HumainsInvalides("humans", "`humans` must be a list of `{login, roles}` entries");
  const vus = new Map<string, number>();
  return valeur.map((entree, i) => {
    const cle = `humans.${i}`;
    if (!estObjet(entree)) throw new HumainsInvalides(cle, `\`${cle}\` must be an object \`{login, roles}\``);
    const nom = typeof entree.login === "string" ? `\`${cle}\` (${JSON.stringify(entree.login)})` : `\`${cle}\``;
    const inconnue = Object.keys(entree).find((k) => k !== "login" && k !== "roles");
    if (inconnue !== undefined) throw new HumainsInvalides(`${cle}.${inconnue}`, `${nom}: \`${inconnue}\` is not part of a human: expected \`login\` and \`roles\``);
    const { login, roles } = entree;
    if (typeof login !== "string" || login.trim() === "") throw new HumainsInvalides(`${cle}.login`, `${nom}: the login is empty: each human needs a GitHub login`);
    if (!LOGIN.test(login)) throw new HumainsInvalides(`${cle}.login`, `${nom}: ${JSON.stringify(login)} is not a GitHub login`);
    // GitHub ne distingue pas la casse des comptes.
    const premier = vus.get(login.toLowerCase());
    if (premier !== undefined) throw new HumainsInvalides(`${cle}.login`, `${nom}: the login ${JSON.stringify(login)} is already declared by \`humans.${premier}\`: declare each human once, with all their roles`);
    vus.set(login.toLowerCase(), i);
    if (!Array.isArray(roles)) throw new HumainsInvalides(`${cle}.roles`, `${nom}: \`roles\` must be a list among ${liste(ROLES_HUMAINS)}`);
    const inconnu = roles.find((role) => typeof role !== "string" || !(ROLES_HUMAINS as readonly string[]).includes(role));
    if (inconnu !== undefined) throw new HumainsInvalides(`${cle}.roles`, `${nom}: ${JSON.stringify(inconnu)} is not a role: expected ${liste(ROLES_HUMAINS)}`);
    return { login, roles: [...new Set(roles as RoleHumain[])] };
  });
}

// Les humains déclarés dans le texte de `projet.json`.
export function humainsDuTexte(texte: string): Humain[] {
  return reglagesDuTexte(texte).humans ?? [];
}

// Les humains du projet dont `clone` est le clone : vide sans fichier.
export function lireHumains(clone: string): Humain[] {
  const fichier = join(clone, FICHIER);
  return existsSync(fichier) ? humainsDuTexte(readFileSync(fichier, "utf8")) : [];
}

// Qui porte un rôle, dans l'ordre de la déclaration.
export function humainsDuRole(humains: readonly Humain[], role: RoleHumain): Humain[] {
  return humains.filter((humain) => humain.roles.includes(role));
}

// Les comptes de chaque rôle : tous les rôles y sont, vides s'il le faut.
export function humainsParRole(humains: readonly Humain[]): Record<RoleHumain, string[]> {
  return Object.fromEntries(ROLES_HUMAINS.map((role) => [role, humainsDuRole(humains, role).map(({ login }) => login)])) as Record<RoleHumain, string[]>;
}
