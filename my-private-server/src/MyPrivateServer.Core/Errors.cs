namespace MyPrivateServer.Core;

/// <summary>An error whose message is safe to show to the user. Mapped to an HTTP status by the API layer.</summary>
public class UserFacingException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class NotFoundException(string message) : UserFacingException(message, 404);
public sealed class ForbiddenException(string message = "You do not have permission to do that.") : UserFacingException(message, 403);
public sealed class ConflictException(string message) : UserFacingException(message, 409);
