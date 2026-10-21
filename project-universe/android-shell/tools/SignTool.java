import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Signs an APK (signature scheme v2) with a PKCS12 key using Google's apksig library, then verifies it. */
public class SignTool {
    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            System.err.println("usage: SignTool <keystore.p12> <password> <alias> <in.apk> <out.apk>");
            System.exit(2);
        }
        char[] pass = args[1].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(args[0])) { ks.load(in, pass); }
        PrivateKey key = (PrivateKey) ks.getKey(args[2], pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(args[2]);

        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("CERT", key, Collections.singletonList(cert)).build();
        File out = new File(args[4]);
        new ApkSigner.Builder(Collections.singletonList(signer))
                .setInputApk(new File(args[3]))
                .setOutputApk(out)
                // minSdk 24 verifies APK Signature Scheme v2, so the legacy JAR (v1) signature is not needed.
                .setV1SigningEnabled(false)
                .setV2SigningEnabled(true)
                .build()
                .sign();

        ApkVerifier.Result result = new ApkVerifier.Builder(out).build().verify();
        for (ApkVerifier.IssueWithParams e : result.getErrors()) System.err.println("ERROR: " + e);
        for (ApkVerifier.IssueWithParams w : result.getWarnings()) System.err.println("WARNING: " + w);
        System.out.println("verified=" + result.isVerified()
                + " v1=" + result.isVerifiedUsingV1Scheme()
                + " v2=" + result.isVerifiedUsingV2Scheme());
        if (!result.isVerified()) System.exit(1);
    }
}
