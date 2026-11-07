// À qui revient une carte de TODO (#2760) : à l'humain du projet dont le rôle
// répond à sa question. Un choix produit va à un humain `product`, un choix
// design à un humain `design`, une livraison à relire à un humain `review`.
// Plusieurs humains du rôle : le premier déclaré. Aucun : le chef, comme avant.
//
// Les humains viennent des réglages du projet (`humans`, une liste de
// `{ login, roles }`, rôles parmi `product`, `design`, `review`,
// `client-contact`) ; un autre ticket en écrit le lecteur. Ce module lit ce que
// l'objet de configuration porte, et ignore une entrée qu'il ne comprend pas.
//
// Sans humains déclarés, rien ne change : la carte mentionne le chef et n'est
// assignée à personne. Avec eux, chaque carte est assignée : à son humain, ou au
// chef quand aucun rôle ne répond à sa question.

export const ROLES = ["product", "design", "review", "client-contact"] as const;
export type Role = (typeof ROLES)[number];

export type Humain = { login: string; roles: Role[] };

const estRole = (mot: unknown): mot is Role => typeof mot === "string" && (ROLES as readonly string[]).includes(mot);

// Les humains que la configuration du projet déclare (`humans`), dans leur
// ordre ; aucun si elle n'en déclare pas. Une entrée sans login ou sans rôle
// connu est écartée.
export function humainsDuProjet(config: unknown): Humain[] {
  const humans = typeof config === "object" && config !== null ? (config as { humans?: unknown }).humans : undefined;
  if (!Array.isArray(humans)) return [];
  return humans.flatMap((entree: unknown) => {
    if (typeof entree !== "object" || entree === null) return [];
    const { login, roles } = entree as { login?: unknown; roles?: unknown };
    if (typeof login !== "string" || login.trim() === "" || !Array.isArray(roles)) return [];
    const connus = roles.filter(estRole);
    return connus.length === 0 ? [] : [{ login: login.trim().replace(/^@/, ""), roles: connus }];
  });
}

// Le rôle qui répond à la question d'une carte, d'après sa sorte : celle de la
// porte de TODO (`product`, `design`), celle d'une attente (`merge`, une
// livraison verte à relire), ou celle d'une carte de GitHub
// (`product-question`, `merge-by-hand`). Nul pour toute autre : elle va au chef.
export function roleDeLaQuestion(sorte: string): Role | null {
  switch (sorte) {
    case "product":
    case "product-question":
      return "product";
    case "design":
      return "design";
    case "merge":
    case "merge-by-hand":
      return "review";
    default:
      return null;
  }
}

// Où va la carte : `humain`, le login de celui dont le rôle répond ; `chef`,
// quand aucun ne répond ; `assigner`, vrai dès que le projet déclare des
// humains — sans eux, rien n'est assigné, comme avant.
export type Aiguillage = { vers: "humain"; login: string; role: Role } | { vers: "chef"; assigner: boolean };

export function aiguiller(humains: readonly Humain[], sorte: string): Aiguillage {
  const role = roleDeLaQuestion(sorte);
  const humain = role === null ? undefined : humains.find(({ roles }) => roles.includes(role));
  if (role !== null && humain !== undefined) return { vers: "humain", login: humain.login, role };
  return { vers: "chef", assigner: humains.length > 0 };
}
