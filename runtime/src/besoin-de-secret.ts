// Le besoin d'un secret ou d'un compte sur la station (#4041) : une clé d'API,
// l'URL d'une base de données, un mot de passe, un compte où se connecter. Seul
// le chef les pose (le fichier d'environnement local de la station, un compte
// ouvert à son nom) : c'est une vraie carte du chef, jamais un geste git, même
// quand les mots du cook nomment aussi sa branche. BOBL-tech/mirrorlab #894 a été
// pris 10 fois : son blocage, lu comme un geste git, n'avait pas de carte, puis
// sa carte était retirée comme « un geste git sur sa branche ».

// Ce que la station ne crée pas elle-même : un secret, ou un compte.
const SECRET = /\b(?:api[ _-]?keys?|(?:access|api|auth|bearer)[ _-]?tokens?|secrets?|credentials?|passwords?|passphrases?|(?:private|ssh)[ _-]keys?|(?:database|db)[ _-]?urls?|database_url|connection[ _-]strings?)\b/i;
// Un compte ou un login qui manque : « an account on Sentry », « a login for the back office ». « Under the station's
// account » se sert d'un compte qui existe ; « take into account » n'en est pas un.
const COMPTE = /\b(?:an?|new)\s+(?:[\w-]+\s+){0,2}(?:accounts?|logins?)\b/i;

// Vrai quand ce texte demande un secret ou un compte sur la station.
export function besoinDeSecret(texte: string): boolean {
  return SECRET.test(texte) || COMPTE.test(texte);
}
