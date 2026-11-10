// La raison d'une carte de TODO (épique #3129, ticket #3137). Une carte
// n'atteint le chef que pour l'une de quatre raisons : un choix de produit, un
// choix de design, une relecture que lui seul peut faire, ou un geste qui
// demande vraiment le chef (son compte, sa machine, un secret). Une carte sans
// raison, ou d'une autre, n'est pas une carte : elle est refusée en nommant les
// quatre. Une carte admise dit sa raison en tête de son texte, pour que le chef
// lise laquelle des quatre c'est.
export const RAISONS = ["product-choice", "design-choice", "chef-review", "chef-gesture"] as const;
export type Raison = (typeof RAISONS)[number];

// Ce qu'un geste demande au chef : son compte, sa machine, ou un secret.
export const BESOINS = ["account", "machine", "secret"] as const;
export type Besoin = (typeof BESOINS)[number];

const DIT_LA_RAISON: Record<Raison, string> = {
  "product-choice": "Product choice",
  "design-choice": "Design choice",
  "chef-review": "Review only the chef can make",
  "chef-gesture": "Gesture that needs the chef",
};

const DIT_LE_BESOIN: Record<Besoin, string> = {
  account: "needs the chef's account",
  machine: "needs the chef's machine",
  secret: "needs a secret only the chef holds",
};

export type DemandeDeCarte = { raison?: string | null; besoin?: string | null };
export type CarteQualifiee = { raison: Raison; besoin: Besoin | null };
export type Qualification = { admise: true; carte: CarteQualifiee } | { admise: false; erreur: string };

export const estRaison = (mot: string): mot is Raison => (RAISONS as readonly string[]).includes(mot);
export const estBesoin = (mot: string): mot is Besoin => (BESOINS as readonly string[]).includes(mot);

// Qualifie la demande : admise, la carte porte sa raison (et, pour un geste, ce
// qu'il demande au chef) ; refusée, l'erreur en clair, en anglais comme les
// refus de la porte, avec les quatre raisons permises.
export function qualifierCarte({ raison, besoin }: DemandeDeCarte): Qualification {
  const permises = `the only reasons a card reaches the chef are ${RAISONS.join(", ")}`;
  const mot = raison?.trim().toLowerCase() ?? "";
  if (mot === "") return { admise: false, erreur: `no reason: ${permises}` };
  if (!estRaison(mot)) return { admise: false, erreur: `“${raison?.trim()}” is not a reason for a card: ${permises}` };
  if (mot !== "chef-gesture") return { admise: true, carte: { raison: mot, besoin: null } };
  const need = besoin?.trim().toLowerCase() ?? "";
  if (!estBesoin(need)) return { admise: false, erreur: `a gesture that needs the chef states what it needs: ${BESOINS.join(", ")}` };
  return { admise: true, carte: { raison: mot, besoin: need } };
}

// La raison, comme le chef la lit en tête du texte de sa carte.
export const direLaRaison = (raison: Raison, besoin: Besoin | null) => (raison === "chef-gesture" && besoin !== null ? `${DIT_LA_RAISON[raison]}: it ${DIT_LE_BESOIN[besoin]}` : DIT_LA_RAISON[raison]);
