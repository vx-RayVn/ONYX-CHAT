using System.Drawing.Text;
using System.Reflection;
using System.Runtime.InteropServices;

namespace Onyx.Desktop;

internal static class NativeFonts
{
    static readonly PrivateFontCollection Collection = new();
    static readonly IntPtr Memory;
    public static readonly FontFamily Inter;
    static NativeFonts()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Onyx.Desktop.Fonts.Inter-SemiBold.ttf") ?? throw new InvalidOperationException("ONYX font missing");
        using var bytes = new MemoryStream(); stream.CopyTo(bytes); var data = bytes.ToArray();
        Memory = Marshal.AllocCoTaskMem(data.Length); Marshal.Copy(data, 0, Memory, data.Length);
        Collection.AddMemoryFont(Memory, data.Length); Inter = Collection.Families[0];
    }
}

// WinForms' standard disabled button renderer ignores ForeColor and becomes black on dark themes.
internal sealed class ChromeButton : Button
{
    bool hovering, pressed;
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool Destructive { get; set; }
    protected override void OnMouseEnter(EventArgs e) { hovering = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovering = pressed = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var bg = hovering && Enabled ? Destructive ? Color.FromArgb(190, 40, 55) : Mix(BackColor, ForeColor, pressed ? .20 : .10) : BackColor;
        e.Graphics.Clear(bg);
        var fg = !Enabled ? Mix(BackColor, ForeColor, .48) : hovering && Destructive ? Color.White : ForeColor;
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, fg, bg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        if (Focused && ShowFocusCues) { using var pen = new Pen(Mix(bg, ForeColor, .55)); e.Graphics.DrawRectangle(pen, 5, 5, Width - 11, Height - 11); }
    }
    static Color Mix(Color a, Color b, double n) => Color.FromArgb((int)(a.R * (1 - n) + b.R * n), (int)(a.G * (1 - n) + b.G * n), (int)(a.B * (1 - n) + b.B * n));
}
