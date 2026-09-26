namespace MyPrivateServer.Core;

/// <summary>
/// Describes an optional external service a module can talk to. The dashboard lists every
/// disclosure so the owner can see what data leaves the machine, why, and where it goes.
/// </summary>
public sealed record ExternalServiceDisclosure(
    string Id, string Name, bool Enabled, string DataTransmitted, string Purpose, string Destination, bool Optional = true);

public interface IExternalServiceSource
{
    IEnumerable<ExternalServiceDisclosure> GetDisclosures();
}
