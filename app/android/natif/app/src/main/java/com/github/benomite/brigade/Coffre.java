package com.github.benomite.brigade;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// Le coffre du téléphone : ce que l'app ne garde pas en clair — le jeton GitHub qui lit le tableau
// de la cuisine d'un projet (app/android/web/lecture.ts, `jetonDuCoffre`, le ticket 1587). Chaque
// valeur est chiffrée (AES-GCM) par une clé du Keystore d'Android, qui ne sort jamais du téléphone,
// et gardée chiffrée dans les préférences de l'app, sous sa clé. Une valeur que la clé ne déchiffre
// plus — restaurée d'une sauvegarde sur un autre téléphone — est oubliée : le coffre la dit absente.
@CapacitorPlugin(name = "Coffre")
public class Coffre extends Plugin {

    static final String MAGASIN = "AndroidKeyStore";
    static final String ALIAS = "brigade.coffre";
    static final String PREFERENCES = "brigade.coffre";
    static final String CHIFFRE = "AES/GCM/NoPadding";
    static final int ETIQUETTE_BITS = 128;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    // La clé du coffre, créée au premier besoin.
    private static SecretKey cle() throws GeneralSecurityException, IOException {
        KeyStore magasin = KeyStore.getInstance(MAGASIN);
        magasin.load(null);
        KeyStore.Entry entree = magasin.getEntry(ALIAS, null);
        if (entree instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entree).getSecretKey();
        KeyGenerator generateur = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, MAGASIN);
        generateur.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generateur.generateKey();
    }

    // Garde `valeur` sous `cle`, à la place de ce qui y était.
    @PluginMethod
    public void garder(PluginCall call) {
        String nom = call.getString("cle");
        String valeur = call.getString("valeur");
        if (nom == null || nom.isEmpty() || valeur == null) {
            call.reject("the vault needs a key and a value");
            return;
        }
        try {
            Cipher chiffre = Cipher.getInstance(CHIFFRE);
            chiffre.init(Cipher.ENCRYPT_MODE, cle());
            byte[] scelle = chiffre.doFinal(valeur.getBytes(StandardCharsets.UTF_8));
            String garde = Base64.encodeToString(chiffre.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(scelle, Base64.NO_WRAP);
            if (!preferences().edit().putString(nom, garde).commit()) {
                call.reject("the vault could not write to the app's storage");
                return;
            }
            call.resolve();
        } catch (GeneralSecurityException | IOException erreur) {
            call.reject("the phone's keystore refused to encrypt: " + erreur.getMessage(), erreur);
        }
    }

    // Rend `{valeur}` gardée sous `cle`, ou `{}` sans elle.
    @PluginMethod
    public void lire(PluginCall call) {
        String nom = call.getString("cle");
        if (nom == null || nom.isEmpty()) {
            call.reject("the vault needs a key");
            return;
        }
        String garde = preferences().getString(nom, null);
        JSObject rendu = new JSObject();
        if (garde == null) {
            call.resolve(rendu);
            return;
        }
        try {
            String[] parts = garde.split(":", 2);
            if (parts.length != 2) throw new GeneralSecurityException("the stored value has no IV");
            Cipher chiffre = Cipher.getInstance(CHIFFRE);
            chiffre.init(Cipher.DECRYPT_MODE, cle(), new GCMParameterSpec(ETIQUETTE_BITS, Base64.decode(parts[0], Base64.NO_WRAP)));
            rendu.put("valeur", new String(chiffre.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
        } catch (GeneralSecurityException | IOException | IllegalArgumentException erreur) {
            // Ce que la clé de ce téléphone ne déchiffre pas ne se lira jamais : il est oublié.
            preferences().edit().remove(nom).apply();
        }
        call.resolve(rendu);
    }

    // Oublie ce qui est gardé sous `cle`.
    @PluginMethod
    public void oublier(PluginCall call) {
        String nom = call.getString("cle");
        if (nom == null || nom.isEmpty()) {
            call.reject("the vault needs a key");
            return;
        }
        preferences().edit().remove(nom).apply();
        call.resolve();
    }
}
