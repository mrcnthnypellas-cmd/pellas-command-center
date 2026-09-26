using Microsoft.AspNetCore.DataProtection;

namespace MyPrivateServer.Core;

/// <summary>
/// Encrypts secrets at rest (database passwords, GitHub tokens, tunnel credentials).
/// Keys are stored under the data directory and, on Windows, wrapped with machine DPAPI.
/// Secrets are never sent to the dashboard after they are saved.
/// </summary>
public interface ISecretProtector
{
    string Protect(string plaintext);
    string Unprotect(string protectedValue);
}

public sealed class DataProtectionSecretProtector(IDataProtectionProvider provider) : ISecretProtector
{
    readonly IDataProtector _p = provider.CreateProtector("MyPrivateServer.Secrets.v1");
    public string Protect(string plaintext) => _p.Protect(plaintext);
    public string Unprotect(string protectedValue) => _p.Unprotect(protectedValue);
}
