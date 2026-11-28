// Ce que les modules de la cuisine, des portes et du bac à sable partagent pour
// refuser une configuration : l'erreur qui empêche de démarrer, le nom de
// projet qu'elle exige, et la lecture d'une variable d'environnement. Aucun
// import : rien ici ne tire le journal de l'ancienne station.

// Le nom de projet s'écrit dans le nom de l'unité systemd et dans le chemin
// d'état : un identifiant court, sans rien à échapper.
export const NOM_DE_PROJET = /^[a-z0-9][a-z0-9-]*$/;

export class ConfigInvalide extends Error {
  // La cause du refus pour le chef (`sandbox-unusable`…), quand elle est connue.
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = "ConfigInvalide";
  }
}

// Une valeur illisible est un refus de démarrer, jamais un repli silencieux
// sur le défaut : un garde-fou ne se désarme pas par une faute de frappe.
export function lire(env: NodeJS.ProcessEnv, variable: string, defaut: number, attendu: string, valide: (valeur: number) => boolean): number {
  const brut = env[variable];
  if (brut === undefined || brut === "") return defaut;
  const valeur = Number(brut);
  if (!valide(valeur)) throw new ConfigInvalide(`invalid ${variable}: “${brut}” — expected ${attendu}`);
  return valeur;
}
