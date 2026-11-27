// Les projets que l'app mettait de côté (#2110) sont servis par cette station comme les autres : les tickets se
// prennent sur GitHub, deux stations d'un même projet ne cuisent jamais le même ticket (#4286). L'app ne met donc
// plus rien de côté ; elle remet seulement, au lancement, les lignes qu'une version d'avant avait mises en
// commentaire (`# held-back (served by <station>): <ligne>`), telles qu'elles étaient.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Le fichier des projets de la station (workstation/kitchen-here.ts, `CONFIGURATION`).
const CONFIGURATION = "projets";
const SET_ASIDE = /^# held-back \(served by (.+?)\): (.*)$/;

// La configuration dont les lignes mises de côté sont remises, et leurs noms.
export function putBack(configuration: string): { texte: string; remises: string[] } {
  const putBackEntries: string[] = [];
  const text = configuration
    .split("\n")
    .map((line) => {
      const linePutBack = SET_ASIDE.exec(line.trim())?.[2];
      if (linePutBack === undefined) return line;
      putBackEntries.push(linePutBack.trim().split(/\s+/)[0] ?? "");
      return linePutBack;
    })
    .join("\n");
  return { texte: text, remises: putBackEntries };
}

export type OptionsProjectsPutBack = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  dire: (line: string) => void;
};

// À jouer avant chaque lancement de la station. Ne lève jamais : un fichier absent ou qu'on ne peut pas
// relire ou réécrire reste comme il était, et le dit.
export function putBackTheProjects(options: OptionsProjectsPutBack): void {
  const file = join(options.racine, CONFIGURATION);
  try {
    let configuration: string;
    try {
      configuration = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const { texte: text, remises: putBackEntries } = putBack(configuration);
    if (putBackEntries.length === 0) return;
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, text);
    renameSync(temporary, file);
    for (const name of putBackEntries) options.dire(`brigade: ${name} was held back for another station: this computer's station serves it again — tickets are claimed on GitHub, so both can cook it`);
  } catch (error) {
    options.dire(`brigade: the projects this computer's station held back could not be put back — ${error instanceof Error ? error.message : String(error)}; its configuration is left as it was`);
  }
}
