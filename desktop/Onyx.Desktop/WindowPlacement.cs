namespace Onyx.Desktop;

// Pure geometry: negative coordinates on a real secondary monitor are valid.
internal static class WindowPlacement
{
    public static Rectangle MaximizeArea(Rectangle monitor, Rectangle work) => new(work.X - monitor.X, work.Y - monitor.Y, work.Width, work.Height);
    public static bool Reachable(Rectangle value, IReadOnlyList<Rectangle> areas)
    {
        if (value.Width < 100 || value.Height < 100) return false;
        var title = new Rectangle(value.X, value.Y, value.Width, Math.Min(32, value.Height));
        return areas.Any(area => { var overlap = Rectangle.Intersect(title, area); return overlap.Width >= Math.Min(160, value.Width) && overlap.Height >= 20; });
    }
    public static Rectangle Recover(Rectangle value, Rectangle previous, IReadOnlyList<Rectangle> areas)
    {
        if (Reachable(value, areas)) return value;
        if (Reachable(previous, areas)) return previous;
        var area = areas.OrderByDescending(a => (long)Rectangle.Intersect(a, value).Width * Rectangle.Intersect(a, value).Height)
            .ThenBy(a => Math.Abs((long)a.X + a.Width / 2 - value.X) + Math.Abs((long)a.Y + a.Height / 2 - value.Y)).FirstOrDefault();
        if (area.Width < 100 || area.Height < 100) area = new Rectangle(0, 0, 1280, 800);
        var width = Math.Min(Math.Max(value.Width, 760), Math.Max(100, area.Width - 32));
        var height = Math.Min(Math.Max(value.Height, 560), Math.Max(100, area.Height - 32));
        return new Rectangle(area.X + (area.Width - width) / 2, area.Y + (area.Height - height) / 2, width, height);
    }
}
