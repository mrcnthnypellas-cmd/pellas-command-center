using System.Security.Cryptography;

namespace MyPrivateServer.Core;

public static class ServerIdentity
{
    /// <summary>Unique, human-friendly identifier for this installation, e.g. MPS-7F42A9.</summary>
    public static string NewServerId() => "MPS-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(3));

    /// <summary>URL-safe random token.</summary>
    public static string RandomToken(int bytes = 32) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
