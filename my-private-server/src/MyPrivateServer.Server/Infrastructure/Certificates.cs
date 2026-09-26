using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using MyPrivateServer.Core;

namespace MyPrivateServer.Server.Infrastructure;

/// <summary>
/// Creates a self-signed certificate for local HTTPS on first run (browsers will ask to trust it once).
/// Remote providers add their own trusted HTTPS (Cloudflare) or WireGuard encryption.
/// </summary>
public static class LocalCertificate
{
    public static X509Certificate2 LoadOrCreate(ServerPaths paths, ISecretProtector secrets)
    {
        var pfx = Path.Combine(paths.KeysDirectory, "local-https.pfx");
        var pwFile = Path.Combine(paths.KeysDirectory, "local-https.key");
        if (File.Exists(pfx) && File.Exists(pwFile))
        {
            try
            {
                var cert = X509CertificateLoader.LoadPkcs12FromFile(pfx, secrets.Unprotect(File.ReadAllText(pwFile)));
                if (cert.NotAfter > DateTime.Now.AddDays(30)) return cert;
            }
            catch (CryptographicException) { }
        }
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest($"CN={Environment.MachineName} (My Private Server)", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("localhost"); san.AddDnsName(Environment.MachineName); san.AddDnsName(Environment.MachineName.ToLowerInvariant() + ".local");
        san.AddIpAddress(IPAddress.Loopback);
        foreach (var ip in MyPrivateServer.RemoteAccess.StunClient.LocalIPv4()) if (IPAddress.TryParse(ip, out var a)) san.AddIpAddress(a);
        req.CertificateExtensions.Add(san.Build());
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.1")], false));
        using var created = req.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddYears(2));
        var password = ServerIdentity.RandomToken(24);
        File.WriteAllBytes(pfx, created.Export(X509ContentType.Pfx, password));
        File.WriteAllText(pwFile, secrets.Protect(password));
        return X509CertificateLoader.LoadPkcs12FromFile(pfx, password);
    }
}
