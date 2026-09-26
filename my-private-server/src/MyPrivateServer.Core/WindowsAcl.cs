using System.Security.AccessControl;
using System.Security.Principal;

namespace MyPrivateServer.Core;

/// <summary>
/// On Windows, limits a folder to SYSTEM and Administrators (inherited by everything inside). Used for the
/// server's data folder (keys, settings, system database) and the storage folder, so other local accounts on
/// the PC cannot read them directly. Remote users always go through the server's own permissions.
/// </summary>
public static class WindowsAcl
{
    public static bool TryRestrict(string directory, out string? error)
    {
        error = null;
        if (!OperatingSystem.IsWindows()) return false;
        try
        {
            var di = new DirectoryInfo(directory);
            var sec = new DirectorySecurity();
            sec.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            const InheritanceFlags inherit = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            foreach (var sid in new[] { WellKnownSidType.LocalSystemSid, WellKnownSidType.BuiltinAdministratorsSid })
                sec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid, null), FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
            di.SetAccessControl(sec);
            return true;
        }
        catch (Exception ex) { error = ex.Message; return false; }
    }

    /// <summary>True when running as the LocalSystem service account (the installed service).</summary>
    public static bool IsLocalSystem() => OperatingSystem.IsWindows() && WindowsIdentity.GetCurrent().IsSystem;
}
