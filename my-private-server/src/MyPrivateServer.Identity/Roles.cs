namespace MyPrivateServer.Identity;

public enum Role { Administrator, Developer, User, ReadOnly }

/// <summary>Fine-grained capabilities. API endpoints require capabilities, never raw roles.</summary>
public enum Capability
{
    UseFiles, WriteFiles, ManageShares,
    ManageUsers, ManageSettings, ManageStorage,
    ViewMonitoring, ViewAuditLogs,
    ManageDatabases, UseApps,
    ManageWebsites, ManageDeployments,
    ManageContainers, RemoveContainers,
    ManageRemoteAccess, ManageBackups,
}

public static class RoleCapabilities
{
    static readonly Dictionary<Role, HashSet<Capability>> Map = new()
    {
        [Role.Administrator] = Enum.GetValues<Capability>().ToHashSet(),
        [Role.Developer] = [Capability.UseFiles, Capability.WriteFiles, Capability.ViewMonitoring, Capability.UseApps,
                            Capability.ManageWebsites, Capability.ManageDeployments, Capability.ManageContainers],
        [Role.User] = [Capability.UseFiles, Capability.WriteFiles],
        [Role.ReadOnly] = [Capability.UseFiles],
    };

    public static bool Has(Role role, Capability c) => Map[role].Contains(c);
    public static IReadOnlyCollection<Capability> For(Role role) => Map[role];
}
