// Le service des humains du projet (#2929, épique #2926) : ce que l'app appelle
// pour lire, ajouter, changer et retirer les humains que
// `.claude/brigade/projet.json` déclare sous `humans` (`humains.ts`, #2759).
//
//   list()          les humains que la branche d'intégration déclare
//   save(humain)    en ajoute un, ou change les rôles de celui qui y est
//   remove(login)   en retire un
//
// Un réglage du projet ne change pas sur la box : il change par une PR sur son
// dépôt, comme le code, et chaque station le relit une fois mergée
// (`reglages-projet/en-vigueur.ts`). Chaque écriture crée donc une branche sur
// la tête de la base, y commite le fichier dont seule l'entrée `humans` a
// changé — le reste est réécrit dans l'ordre de ses clés, deux espaces et une
// fin de ligne, la forme qu'écrit `texteDuFichier` —, et ouvre la PR
// (`GitHub.ouvrirPR`, celle des cooks) ; elle rend son adresse. Tout passe par
// le client GitHub (`github.ts`) : un faux peut tenir sa place.
//
// Avant d'ajouter ou de changer un humain, son compte est vérifié : il doit
// exister sur GitHub, puis avoir accès au dépôt. Un refus — l'un ou l'autre,
// un humain invalide, rien qui change — est une ligne qui dit lequel, et
// n'ouvre rien. Une étape de GitHub qui échoue est une ligne aussi, qui dit
// laquelle et ce qui est resté. Ses messages sont en anglais : c'est l'app qui
// les montre.
import { randomUUID } from "node:crypto";
import type { GitHub } from "../github.ts";
import { FICHIER, reglagesDuTexte } from "../reglages-projet/reglages.ts";
import { HumainsInvalides, humainsDe, type Humain } from "./humains.ts";

export type GitHubDesHumains = Pick<GitHub, "ouvrirPR"> & Required<Pick<GitHub, "compteExiste" | "aAccesAuDepot" | "fichier" | "ecrireSurBranche">>;

export type OptionsDesHumains = {
  github: GitHubDesHumains;
  // `owner/name` : ce que les messages nomment.
  depot: string;
  // La branche d'intégration : celle qu'on lit, d'où part la branche, et que vise la PR.
  base: string;
  // Le nom de la branche d'une écriture. Par défaut, `brigade/humans-<login>-<hasard>`.
  branche?: (login: string) => string;
};

// `ok` : la PR est ouverte, voici son adresse. Sinon, une ligne qui dit pourquoi rien n'est proposé.
export type Ecriture = { ok: true; pr: string } | { ok: false; message: string };

export type ServiceDesHumains = {
  list(): Promise<Humain[]>;
  save(humain: unknown): Promise<Ecriture>;
  remove(login: string): Promise<Ecriture>;
};

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";
const refus = (message: string): Ecriture => ({ ok: false, message });
const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ouvrirHumains(options: OptionsDesHumains): ServiceDesHumains {
  const { github, depot, base } = options;
  const brancheDe = options.branche ?? ((login: string) => `brigade/humans-${login.toLowerCase()}-${randomUUID().slice(0, 8)}`);

  // Le fichier que la base porte, son contenu tel que `JSON.parse` le lit, et
  // ses humains. Absent, la base n'a personne. Illisible ou invalide, lève :
  // rien n'est deviné à sa place.
  type Lus = { sha: string | null; contenu: Record<string, unknown>; humains: Humain[] };
  async function lire(): Promise<Lus> {
    const lu = await github.fichier(FICHIER, base);
    if (lu === null) return { sha: null, contenu: { version: 1, integrationBranch: base }, humains: [] };
    const reglages = reglagesDuTexte(lu.texte);
    return { sha: lu.sha, contenu: JSON.parse(lu.texte) as Record<string, unknown>, humains: reglages.humans ?? [] };
  }

  // Ce que la base porte, ou la ligne qui dit qu'il ne se lit pas.
  async function lireOuRefuser(): Promise<Lus | Ecriture> {
    try {
      return await lire();
    } catch (erreur) {
      return refus(`${FICHIER} on \`${base}\` is not read: ${uneLigne(erreur)}`);
    }
  }

  // Écrit ces humains à la place de ceux que la base porte, sur une branche
  // neuve, et ouvre la PR.
  async function proposer(lus: Lus, login: string, humains: Humain[], titre: string): Promise<Ecriture> {
    const contenu = { ...lus.contenu };
    if (humains.length === 0) delete contenu.humans;
    else contenu.humans = humains.map(({ login, roles }) => ({ login, roles }));
    const texte = `${JSON.stringify(contenu, null, 2)}\n`;
    try {
      reglagesDuTexte(texte);
    } catch (erreur) {
      return refus(uneLigne(erreur));
    }
    const branche = brancheDe(login);
    try {
      await github.ecrireSurBranche({ base, branche, chemin: FICHIER, texte, sha: lus.sha, message: titre });
    } catch (erreur) {
      return refus(`the branch \`${branche}\` with the change of ${FICHIER} could not be written on ${depot}: ${uneLigne(erreur)}`);
    }
    try {
      const corps = `${titre}.\n\nThis pull request changes the \`humans\` entry of \`${FICHIER}\` and nothing else. Once merged, every station reads it the next time it reads the project's settings.`;
      return { ok: true, pr: await github.ouvrirPR({ branche, base, titre, corps }) };
    } catch (erreur) {
      return refus(`the pull request could not be opened on ${depot}: ${uneLigne(erreur)}; the branch \`${branche}\` is pushed, with the change`);
    }
  }

  return {
    async list() {
      return (await lire()).humains;
    },

    async save(humain) {
      let voulu: Humain;
      try {
        [voulu] = humainsDe([humain]) as [Humain];
      } catch (erreur) {
        if (erreur instanceof HumainsInvalides) return refus(erreur.message.replace(/^`humans\.0`(?: \([^)]*\))?: /, ""));
        throw erreur;
      }
      try {
        if (!(await github.compteExiste(voulu.login))) return refus(`${voulu.login} is not a GitHub account: check the login`);
        if (!(await github.aAccesAuDepot(voulu.login))) return refus(`${voulu.login} exists on GitHub but has no access to ${depot}: invite them to the repository first`);
      } catch (erreur) {
        return refus(`the login ${voulu.login} could not be checked on GitHub: ${uneLigne(erreur)}`);
      }
      const lus = await lireOuRefuser();
      if ("ok" in lus) return lus;
      const { humains } = lus;
      const present = humains.find((deja) => meme(deja.login, voulu.login));
      if (present === undefined) return proposer(lus, voulu.login, [...humains, voulu], `Humans: add ${voulu.login} (${voulu.roles.join(", ") || "no role"})`);
      if (present.roles.length === voulu.roles.length && present.roles.every((role) => voulu.roles.includes(role))) return refus(`${present.login} is already declared with these roles: there is nothing to change`);
      // Son login reste tel que le fichier l'écrit : seuls ses rôles changent.
      const changes = humains.map((deja) => (deja === present ? { login: deja.login, roles: voulu.roles } : deja));
      return proposer(lus, present.login, changes, `Humans: ${present.login}'s roles ${present.roles.join(", ") || "none"} → ${voulu.roles.join(", ") || "none"}`);
    },

    async remove(login) {
      const lus = await lireOuRefuser();
      if ("ok" in lus) return lus;
      const { humains } = lus;
      const present = humains.find((deja) => meme(deja.login, login));
      if (present === undefined) return refus(`${login} is not declared in ${FICHIER} on \`${base}\`: there is nothing to remove`);
      return proposer(lus, present.login, humains.filter((deja) => deja !== present), `Humans: remove ${present.login}`);
    },
  };
}
