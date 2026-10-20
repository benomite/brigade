# L'enveloppe Android

Le projet [Capacitor](https://capacitorjs.com) qui fait de l'app de brigade un APK, autour de la même
vue que l'app desktop (`app/src/vue/`, jamais recopiée ici). Il se construit par une seule commande,
`node app/packaging/android.ts` : ses prérequis, ce qu'elle épingle, ce que porte ce dossier et le
pont d'attente sont dans [`app/packaging/README.md`](../packaging/README.md#lapk-android).
