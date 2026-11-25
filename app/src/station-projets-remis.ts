// Les projets que l'app mettait de côté (#2110) sont servis par cette station comme les autres : les tickets se
// prennent sur GitHub, deux stations d'un même projet ne cuisent jamais le même ticket (#4286). L'app ne met donc
// plus rien de côté ; elle remet seulement, au lancement, les lignes qu'une version d'avant avait mises en
// commentaire (`# held-back (served by <station>): <ligne>`), telles qu'elles étaient.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Le fichier des projets de la station (poste/cuisine-ici.ts, `CONFIGURATION`).
const CONFIGURATION = "projets";
const MISE_DE_COTE = /^# held-back \(served by (.+?)\): (.*)$/;

// La configuration dont les lignes mises de côté sont remises, et leurs noms.
export function remettre(configuration: string): { texte: string; remises: string[] } {
  const remises: string[] = [];
  const texte = configuration
    .split("\n")
    .map((ligne) => {
      const ligneRemise = MISE_DE_COTE.exec(ligne.trim())?.[2];
      if (ligneRemise === undefined) return ligne;
      remises.push(ligneRemise.trim().split(/\s+/)[0] ?? "");
      return ligneRemise;
    })
    .join("\n");
  return { texte, remises };
}

export type OptionsProjetsRemis = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  dire: (ligne: string) => void;
};

// À jouer avant chaque lancement de la station. Ne lève jamais : un fichier absent ou qu'on ne peut pas
// relire ou réécrire reste comme il était, et le dit.
export function remettreLesProjets(options: OptionsProjetsRemis): void {
  const fichier = join(options.racine, CONFIGURATION);
  try {
    let configuration: string;
    try {
      configuration = readFileSync(fichier, "utf8");
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return;
      throw erreur;
    }
    const { texte, remises } = remettre(configuration);
    if (remises.length === 0) return;
    const provisoire = `${fichier}.${process.pid}.tmp`;
    writeFileSync(provisoire, texte);
    renameSync(provisoire, fichier);
    for (const nom of remises) options.dire(`brigade: ${nom} was held back for another station: this computer's station serves it again — tickets are claimed on GitHub, so both can cook it`);
  } catch (erreur) {
    options.dire(`brigade: the projects this computer's station held back could not be put back — ${erreur instanceof Error ? erreur.message : String(erreur)}; its configuration is left as it was`);
  }
}
