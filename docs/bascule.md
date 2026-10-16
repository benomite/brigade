# La bascule : la box passe à la station, une fois

La box servait ses trois projets (`brigade`, `espace`, `calculus-workspace`) chacun par son unité
`brigade@<projet>.service` et sa porte `brigade-porte@<projet>.service`, avec leurs drop-ins, ses
gestes et leurs règles sudoers. **Installer le paquet de la station les reprend** : journal,
décisions et tickets en cours restent où ils sont, la porte de chaque projet est reprise par celles
de la station — même port, même liste blanche —, la cuisine s'arrête quelques minutes, et ce que
l'ancienne installation avait posé dans le système part. C'est un geste du chef, une fois, après le merge — jamais rejoué par un cook sur la box.

## Le geste du chef : la commande, le code

1. **La commande**, sur la box — celle de [`installation-station.md`](installation-station.md),
   « 1. La commande » :

   ```sh
   curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
   ```

   Le paquet joue la bascule avant de démarrer la station (`runtime/paquet/debian/postinst`,
   `runtime/src/bascule/`). Le compte `brigade` et sa connexion Max sont gardés : la commande ne
   redemande pas de login.
2. **Le code** : la station démarrée l'affiche dans son journal de service
   (`journalctl -u brigade-station`) — `brigade : station à appairer — tape ce code dans l'app :
   7KQ2-M9XD …` —, et tu le tapes dans l'app, sur « Tous les projets » ([`runtime.md`](runtime.md),
   « Une station par machine »).

Ce que la commande dit pendant la bascule :

```
bascule : arrêt des anciennes unités — brigade@brigade.service, … ; leurs cooks en vol continuent, la station les reprendra
bascule : arrêt des anciennes portes — brigade-porte@brigade.service, … ; celles de la station reprennent leurs ports
bascule : brigade — repris par la station (benomite/brigade, branche v2), son état laissé dans …
bascule : brigade — sa porte reprise par la station : même port (127.0.0.1:…), même liste blanche, lue à son journal
bascule : retiré — /etc/systemd/system/brigade@.service
…
bascule : /usr/local/bin/brigade pointe sur le geste du paquet (/usr/lib/brigade-station/brigade) : l'app lit ses projets comme avant
bascule : cuisine reprise par la station — brigade, calculus-workspace, espace ; arrêtée 1 min 12 s, de 08:00:03 à 08:01:15
```

**La dernière ligne mesure l'interruption**, et `/var/lib/brigade-station/bascule.json` la garde
(`arretee`, `reprise`). Si la station ne sert pas tous les projets repris au bout de trois minutes,
la ligne dit lesquels et renvoie à `journalctl -u brigade-station` ; l'installation, elle, est faite.

**Bascule refusée** (`bascule refusée — rien n'a changé : …`) : un projet que la station ne saurait
pas reprendre — la ligne dit lequel et pourquoi. Les anciennes unités servent toujours ; une fois
réglé, relance la même commande. **En échec** en cours de route (`bascule en échec — …`) : relancer
la même commande la reprend où elle s'est arrêtée.

## Ce qui est vérifié ensuite

- **Plus rien de l'ancienne installation** : aucune unité `brigade@<projet>` ni
  `brigade-porte@<projet>`, aucun drop-in, aucun ancien geste ni sa règle sudoers —
  `systemctl list-unit-files 'brigade@*' 'brigade-porte@*'` ne rend rien.
- **Chaque projet sort par sa porte, et elle seule** : au démarrage de la station, chaque projet dit
  `réseau — liste blanche, par la porte 127.0.0.1:<port> — un envoi direct est refusé par le noyau :
  l'unité filtre` (`journalctl -u brigade-station`), chacun avec le port que
  `/var/lib/brigade/portes.json` lui donne — celui de son ancienne porte. Un hôte hors de sa liste
  reçoit un `403`, et son refus est au journal du projet ([`runtime/paquet/README.md`](../runtime/paquet/README.md),
  « La porte réseau »).
- **Trois versions de suite passent seules**, dont une qui change une unité de service, sans aucun
  geste du chef : la file de chaque projet le dit, une ligne par version — `passée en version … à …`
  ([`installation-station.md`](installation-station.md), « 6. La mise à jour, seule »).
- **Un quatrième projet s'ajoute en moins de 10 minutes**, depuis l'app, sans terminal
  ([`runtime.md`](runtime.md), « Ajouter un projet à une station depuis l'app, sans terminal »).

La reprise s'éprouve, avant le merge, sur une installation de test — jamais sur la box : trois
projets servis à l'ancienne, un cook en vol, le vrai paquet installé, journal, décisions et tickets
comparés avant et après (`runtime/test/bascule/machine.test.ts`).

## Le geste brigade

`/usr/local/bin/brigade` reste : c'est par lui que l'app lit et pilote les projets de la box, par
`ssh` — `brigade <projet> <commande> [arguments…]`, comme avant. La bascule le fait pointer sur le
geste du paquet, `/usr/lib/brigade-station/brigade`, et garde la règle sudoers qui le donne aux
humains ([`installer.md`](installer.md), « Ajouter un humain »). Il lance la commande sous le compte
et dans l'environnement de `brigade-station.service`, avec ce que la station donne au projet.

| Code | Ce qu'il dit | Le geste |
|---|---|---|
| 64 | il manque le projet ou la commande | `brigade <projet> help` |
| 65 | projet inconnu sur cette station | le projet n'a pas de ligne dans `/var/lib/brigade/projets` |
| 66 | la commande n'est pas une commande du runtime | le refus nomme celles de la station |
| 67 | systemd n'a pas répondu pour l'unité de la station | `systemctl status brigade-station` |
| 68 | celui qui lance n'a pas le droit du geste | sa règle sudoers — « Ajouter un humain » |
| 69 | `sudo` manque sur la machine | `apt install sudo` |
| 70 | le `node` ou le runtime du paquet manque, ou ne démarre pas | ce que la ligne dit : `sudo apt install libatomic1`, ou `sudo apt install --reinstall brigade-station` |

Tout autre code est celui de la commande.
