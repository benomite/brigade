package com.github.benomite.brigade;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

// Le `window.brigade` de la vue, que preload.cjs pose sur le desktop : ici, le pont d'attente
// (app/android/web/pont.js), posé par la construction dans les fichiers de l'app. Il est injecté
// au début de chaque document de l'app, avant ses scripts — `load` est joué avant que la WebView
// ne charge sa première page. Le pont y appelle aussi le navigateur du téléphone, pour un lien d'un
// message du second (le ticket 1426) ou la page de GitHub où taper le code de connexion (le ticket 2500) :
// `ouvrir`. L'appairage à une station — son lecteur de QR, son lien `brigade://pair` — n'est plus (le ticket 2500).
@CapacitorPlugin(name = "Pont")
public class Pont extends Plugin {

    static final String SCRIPT = "public/android/pont.js";

    // La carte que le chef a touchée dans une notification, tant que la vue ne l'a pas prise.
    private String projetEnAttente;
    private int ticketEnAttente;

    private void prendre(Intent intent) {
        if (intent == null) return;
        String projet = intent.getStringExtra(Notifications.EXTRA_PROJET);
        int ticket = intent.getIntExtra(Notifications.EXTRA_TICKET, 0);
        if (projet == null || ticket <= 0) return;
        projetEnAttente = projet;
        ticketEnAttente = ticket;
        intent.removeExtra(Notifications.EXTRA_PROJET);
        intent.removeExtra(Notifications.EXTRA_TICKET);
    }

    // Une notification touchée alors que l'app tourne : la vue est prévenue qu'une carte l'attend.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        prendre(intent);
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('brigade-carte'))", null));
    }

    @Override
    public void load() {
        prendre(getActivity().getIntent());
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Logger.error("Brigade", "this WebView cannot inject a script at document start: the app's view has no bridge", null);
            return;
        }
        String script;
        try (InputStream lu = getContext().getAssets().open(SCRIPT)) {
            ByteArrayOutputStream contenu = new ByteArrayOutputStream();
            byte[] morceau = new byte[8192];
            for (int n = lu.read(morceau); n != -1; n = lu.read(morceau)) contenu.write(morceau, 0, n);
            script = contenu.toString(StandardCharsets.UTF_8.name());
        } catch (IOException erreur) {
            Logger.error("Brigade", SCRIPT + " is missing from the APK: build it with app/packaging/android.ts", erreur);
            return;
        }
        WebViewCompat.addDocumentStartJavaScript(getBridge().getWebView(), script, Collections.singleton(getBridge().getLocalUrl()));
    }

    // Un lien d'un message du second, ou la page de GitHub où taper le code de connexion, ouvert dans le
    // navigateur du téléphone : une adresse web, rien d'autre. Rend rien ; impossible, la raison.
    @PluginMethod
    public void ouvrir(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("only a web address opens in the browser");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            call.resolve();
        } catch (ActivityNotFoundException erreur) {
            call.reject("no app on this phone opens web addresses");
        }
    }

    // Rend `{projet, ticket}` de la carte touchée dans une notification, une seule fois ; `{}` sans elle.
    @PluginMethod
    public void carteDemandee(PluginCall call) {
        JSObject rendu = new JSObject();
        if (projetEnAttente != null) {
            rendu.put("projet", projetEnAttente);
            rendu.put("ticket", ticketEnAttente);
            projetEnAttente = null;
        }
        call.resolve(rendu);
    }

    // La mémoire des cartes notifiées (Notifications.java), que le pont lit et écrit en JSON.
    @PluginMethod
    public void gardees(PluginCall call) {
        JSObject rendu = new JSObject();
        rendu.put("valeur", Notifications.gardees(getContext()));
        call.resolve(rendu);
    }

    @PluginMethod
    public void garder(PluginCall call) {
        String valeur = call.getString("valeur");
        if (valeur == null) {
            call.reject("nothing to keep");
            return;
        }
        Notifications.garder(getContext(), valeur);
        call.resolve();
    }

    @PluginMethod
    public void retirer(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null) {
            call.reject("a notification to take down needs its id");
            return;
        }
        Notifications.retirer(getContext(), id);
        call.resolve();
    }
}
