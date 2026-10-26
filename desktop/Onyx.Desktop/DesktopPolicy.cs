namespace Onyx.Desktop;

internal static class DesktopPolicy
{
    public const string Home = "https://example.invalid/app/";
    // Set only after a signed desktop release feed has actually been published.
    // Web content updates already arrive from Home without reinstalling the shell.
    public static readonly string? UpdateFeed = null;

    public static bool IsOnyx(string? address) => Uri.TryCreate(address, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps && uri.IdnHost == "example.invalid" && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo);

    public static bool IsExternal(string? address) => Uri.TryCreate(address, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps && string.IsNullOrEmpty(uri.UserInfo);
    public static bool IsPayment(string? address) => Uri.TryCreate(address, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo)
        && uri.IdnHost is "checkout.stripe.com" or "billing.stripe.com";

    public static string StartAddress(string[] args) => args.Length == 1 && IsOnyx(args[0]) && args[0].Length <= 4096 ? args[0] : Home;

    public static bool MayNotify(string? frame, string? document) => IsOnyx(frame) && IsOnyx(document);
}
