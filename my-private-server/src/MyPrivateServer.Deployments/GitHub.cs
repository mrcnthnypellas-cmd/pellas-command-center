using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MyPrivateServer.Core;

namespace MyPrivateServer.Deployments;

public sealed record CommitInfo(string Sha, string Message, string Author, DateTimeOffset Date);
public sealed record RepoInfo(string FullName, string DefaultBranch, bool Private, string? Description, IReadOnlyList<string> Branches);

/// <summary>Minimal GitHub REST client. Tokens are sent only to api.github.com and never logged.</summary>
public sealed class GitHubClient(IHttpClientFactory factory)
{
    HttpClient Client(string? token)
    {
        var c = factory.CreateClient("github");
        c.BaseAddress = new Uri("https://api.github.com/");
        c.DefaultRequestHeaders.UserAgent.ParseAdd("MyPrivateServer/0.2");
        c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        c.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
        if (!string.IsNullOrEmpty(token)) c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }

    async Task<JsonElement> Get(string path, string? token, CancellationToken ct)
    {
        using var resp = await Client(token).GetAsync(path, ct);
        if (resp.StatusCode == HttpStatusCode.NotFound) throw new UserFacingException("Repository or branch not found. For private repositories add a token with read access.", 404);
        if (resp.StatusCode is HttpStatusCode.Unauthorized) throw new UserFacingException("GitHub rejected the token.", 400);
        if (resp.StatusCode == HttpStatusCode.Forbidden) throw new UserFacingException("GitHub rate limit reached or access denied. Try again later or add a token.", 429);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
    }

    public async Task<RepoInfo> RepositoryAsync(string owner, string repo, string? token, CancellationToken ct)
    {
        var r = await Get($"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repo)}", token, ct);
        var branches = await Get($"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repo)}/branches?per_page=100", token, ct);
        return new RepoInfo(r.GetProperty("full_name").GetString()!, r.GetProperty("default_branch").GetString()!, r.GetProperty("private").GetBoolean(),
            r.TryGetProperty("description", out var d) ? d.GetString() : null, branches.EnumerateArray().Select(b => b.GetProperty("name").GetString()!).ToList());
    }

    public async Task<CommitInfo> LatestCommitAsync(string owner, string repo, string branch, string? token, CancellationToken ct)
    {
        var c = await Get($"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repo)}/commits/{Uri.EscapeDataString(branch)}", token, ct);
        var commit = c.GetProperty("commit");
        return new CommitInfo(c.GetProperty("sha").GetString()!, commit.GetProperty("message").GetString()!.Split('\n')[0],
            commit.GetProperty("author").GetProperty("name").GetString() ?? "", commit.GetProperty("author").GetProperty("date").GetDateTimeOffset());
    }

    /// <summary>Verifies a GitHub webhook X-Hub-Signature-256 header in constant time.</summary>
    public static bool VerifySignature(string secret, byte[] body, string? header)
    {
        if (string.IsNullOrEmpty(header) || !header.StartsWith("sha256=")) return false;
        byte[] given;
        try { given = Convert.FromHexString(header[7..]); } catch (FormatException) { return false; }
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), body);
        return CryptographicOperations.FixedTimeEquals(expected, given);
    }
}
