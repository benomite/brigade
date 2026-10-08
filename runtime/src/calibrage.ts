// Le calibrage d'un ticket : le modèle et l'effort avec lesquels son cook sera
// lancé. Il se pose sur l'issue, par deux labels — par le manager ou à la main
// —, et aucun cook ne
// part sans lui — il n'y a pas de valeur par défaut.
export const MODELES = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Calibrage = { model: string; effort: string };
// Ce que le ticket porte : une dimension vaut null tant qu'elle n'est pas
// tranchée.
export type CalibragePose = { model: string | null; effort: string | null };

// Une dimension est calibrée par un label, et un seul, dont la valeur est dans
// la liste. Deux labels `model:` : le chef n'a pas tranché, donc rien.
function lire(labels: string[], prefixe: string, admis: readonly string[]): string | null {
  const poses = labels.filter((label) => label.startsWith(prefixe)).map((label) => label.slice(prefixe.length));
  const [valeur] = poses;
  return poses.length === 1 && valeur !== undefined && admis.includes(valeur) ? valeur : null;
}

export function calibrage(labels: string[]): CalibragePose {
  return { model: lire(labels, "model:", MODELES), effort: lire(labels, "effort:", EFFORTS) };
}

export function complet(pose: CalibragePose): pose is Calibrage {
  return pose.model !== null && pose.effort !== null;
}

// Les labels qu'il reste à poser, ou null si le ticket est calibré.
export function manquant(pose: CalibragePose): string | null {
  const labels = [
    pose.model === null ? `model:<${MODELES.join("|")}>` : null,
    pose.effort === null ? `effort:<${EFFORTS.join("|")}>` : null,
  ].filter((label) => label !== null);
  return labels.length === 0 ? null : labels.join(" et ");
}
