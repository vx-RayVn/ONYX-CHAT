using System.Text.Json;
using System.Text.RegularExpressions;

namespace Onyx.Desktop;

internal sealed record ChromeAppearance(string Background, string Foreground, string Title, bool CanBack = false, bool CanForward = false);
internal static class ChromeMessage
{
    public static ChromeAppearance? Read(string source, string document, string json)
    {
        if (!DesktopPolicy.MayNotify(source, document) || json.Length > 2048) return null;
        try
        {
            using var value = JsonDocument.Parse(json); var root = value.RootElement;
            if (root.ValueKind != JsonValueKind.Object || root.GetProperty("type").GetString() != "onyx:chrome") return null;
            var bg = root.GetProperty("background").GetString(); var fg = root.GetProperty("foreground").GetString(); var title = root.GetProperty("title").GetString();
            if (bg == null || fg == null || title == null || title.Length > 100 || title.Any(char.IsControl) || !Regex.IsMatch(bg, "^#[0-9a-fA-F]{6}$") || !Regex.IsMatch(fg, "^#[0-9a-fA-F]{6}$")) return null;
            var back = root.TryGetProperty("canBack", out var b) && b.ValueKind == JsonValueKind.True;
            var forward = root.TryGetProperty("canForward", out var f) && f.ValueKind == JsonValueKind.True;
            return new(bg, fg, title, back, forward);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException) { return null; }
    }
}
