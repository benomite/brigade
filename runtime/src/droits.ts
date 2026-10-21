// Un fichier de secrets — une clé d'App, le jeton de la connexion Max, les
// secrets d'un projet — que d'autres comptes que celui du service liraient.
//
// Sous macOS et Linux, ses bits de mode le disent : il n'en faut aucun pour le
// groupe ni pour les autres (`chmod 600`). Sous Windows, ces bits ne disent
// rien : Node y rend toujours 0o666 (ou 0o444 en lecture seule), et `chmod` n'y
// change que la lecture seule. Ce sont les droits du dossier du compte qui y
// gardent le fichier : il n'est pas refusé sur ses bits.
export function lisibleParDAutres(mode: number, plateforme: NodeJS.Platform = process.platform): boolean {
  return plateforme !== "win32" && (mode & 0o077) !== 0;
}
