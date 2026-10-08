// Les zones de fichiers : ce qu'un ticket possède du dépôt, et ce que deux
// tickets ne possèdent pas ensemble. Une zone est une liste de chemins
// relatifs à la racine ; un chemin possède le fichier qu'il nomme et tout ce
// qui est dessous. Rien n'est demandé à un LLM ni au disque : deux zones se
// recouvrent, ou non, par le seul texte de leurs chemins.

// Ce qui ferait d'un chemin un motif. Un motif ne se compare pas à un autre :
// la fiche le refuse. Les crochets n'en sont pas : `app/[id]/page.tsx` est un
// chemin.
const MOTIF = /[*?]/;

// Pourquoi une chaîne n'est pas un chemin du dépôt, ou null si c'en est un.
export function refus(chemin: string): string | null {
  if (/^[/~]/.test(chemin) || chemin.includes("\\") || chemin.split("/").includes("..")) return "n'est pas un chemin du dépôt";
  if (MOTIF.test(chemin)) return "est un motif, pas un chemin — un dossier possède déjà tout ce qu'il contient";
  return null;
}

const segments = (chemin: string) => chemin.split("/").filter((segment) => segment !== "" && segment !== ".");

// Vrai si le chemin `zone` possède `chemin` : c'est lui, ou un dossier qui le
// contient. Par segments entiers — `runtime/src` ne possède pas `runtime/src2`.
export function possede(zone: string, chemin: string): boolean {
  const dessus = segments(zone);
  const dessous = segments(chemin);
  return dessus.length <= dessous.length && dessus.every((segment, i) => segment === dessous[i]);
}

const possedePar = (chemins: string[], chemin: string) => chemins.some((zone) => possede(zone, chemin));

// Le chemin par lequel deux zones se recouvrent — le plus précis des deux —,
// ou null. `communs` : les chemins du projet qui n'appartiennent à personne ;
// ce qu'une zone en nomme ne compte pas.
export function recouvrement(a: string[], b: string[], communs: string[] = []): string | null {
  for (const chemin of a) {
    if (possedePar(communs, chemin)) continue;
    for (const autre of b) {
      if (possedePar(communs, autre)) continue;
      if (possede(chemin, autre)) return autre;
      if (possede(autre, chemin)) return chemin;
    }
  }
  return null;
}

// Ceux des fichiers qu'une zone ne possède pas, les communs mis à part.
export function horsZone(zone: string[], fichiers: string[], communs: string[] = []): string[] {
  return fichiers.filter((fichier) => !possedePar(zone, fichier) && !possedePar(communs, fichier));
}
