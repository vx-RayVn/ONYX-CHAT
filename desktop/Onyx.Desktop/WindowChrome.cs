using System.Runtime.InteropServices;

namespace Onyx.Desktop;

// Native window controls remain available while the web document is loading or offline.
internal class WindowChrome : Form
{
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    readonly Panel caption = new() { Dock = DockStyle.Top, Height = 28 };
    readonly Label context = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, AutoEllipsis = true };
    readonly FlowLayoutPanel left = new() { Dock = DockStyle.Left, Width = 80, WrapContents = false };
    readonly FlowLayoutPanel right = new() { Dock = DockStyle.Right, Width = 168, WrapContents = false };
    readonly ToolTip hints = new();
    readonly Button maximize;
    Rectangle savedBounds;
    FormWindowState savedState;
    bool fullScreen;
    bool changingMode;
    Rectangle fullScreenBounds;
    Rectangle lastVisibleBounds;
    bool repairing;
    protected virtual bool ActivateModeChange => true;
    public int ChromeHeight => caption.Visible ? caption.Height : 0;
    public bool IsOnScreen => Visible && IsWindowVisible(Handle) && Screen.AllScreens.Any(s => Rectangle.Intersect(s.Bounds, Bounds).Width > 100 && Rectangle.Intersect(s.Bounds, Bounds).Height > 100);
    public bool IsFullScreen => fullScreen;
    public bool HasNativeCaption => (GetWindowLong(Handle, -16) & 0x00c00000) != 0;
    public event Action? BackRequested;
    public event Action? ForwardRequested;
    readonly Button back, forward;

    public WindowChrome()
    {
        FormBorderStyle = FormBorderStyle.None;
        ControlBox = false; ShowIcon = false;
        BackColor = Color.FromArgb(15, 20, 23); ForeColor = Color.FromArgb(233, 238, 241);
        caption.BackColor = BackColor; context.ForeColor = ForeColor;
        context.Font = new Font(NativeFonts.Inter, 9, FontStyle.Regular); context.UseCompatibleTextRendering = true;
        back = ControlButton("\uE72B", "Back", () => BackRequested?.Invoke(), 36);
        forward = ControlButton("\uE72A", "Forward", () => ForwardRequested?.Invoke(), 36);
        left.Controls.AddRange([back, forward]);
        right.Controls.Add(ControlButton("\uE740", "Full screen", () => SetFullScreen(!fullScreen)));
        right.Controls.Add(ControlButton("\uE921", "Minimize", () => WindowState = FormWindowState.Minimized));
        maximize = ControlButton("\uE922", "Maximize", ToggleMaximize); right.Controls.Add(maximize);
        var close = ControlButton("\uE8BB", "Close", Close); ((ChromeButton)close).Destructive = true; right.Controls.Add(close);
        caption.Controls.Add(context); caption.Controls.Add(left); caption.Controls.Add(right);
        Controls.Add(caption);
        foreach (var drag in new Control[] { caption, context })
        {
            drag.MouseDown += (_, e) => { if (e.Button == MouseButtons.Left && !fullScreen) { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); } };
            drag.DoubleClick += (_, _) => ToggleMaximize();
        }
        Resize += (_, _) => { maximize.Text = WindowState == FormWindowState.Maximized ? "\uE923" : "\uE922"; };
        LocationChanged += (_, _) => RememberBounds();
        Resize += (_, _) => RememberBounds();
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += DisplaysChanged;
    }
    Button ControlButton(string glyph, string label, Action click, int width = 42)
    {
        var b = new ChromeButton { Text = glyph, AccessibleName = L.T(label), Width = width, Height = 28, Margin = Padding.Empty, TabStop = true, FlatStyle = FlatStyle.Flat, ForeColor = ForeColor, BackColor = BackColor, Font = new Font("Segoe MDL2 Assets", 9) };
        b.FlatAppearance.BorderSize = 0; b.FlatAppearance.MouseOverBackColor = Color.FromArgb(37, 47, 52);
        hints.SetToolTip(b, L.T(label)); b.Click += (_, _) => click(); return b;
    }
    public void MountChrome() { caption.SendToBack(); }
    public void SetContext(string value) { context.Text = value; }
    public void SetAppearance(ChromeAppearance appearance)
    {
        var bg = ColorTranslator.FromHtml(appearance.Background); var fg = ColorTranslator.FromHtml(appearance.Foreground);
        caption.BackColor = BackColor = bg; context.ForeColor = fg; context.Text = appearance.Title;
        foreach (var panel in new[] { left, right }) foreach (Button button in panel.Controls) { button.BackColor = bg; button.ForeColor = fg; }
    }
    public void SetHistory(bool canBack, bool canForward) { back.Enabled = canBack; forward.Enabled = canForward; }
    void ToggleMaximize()
    {
        if (fullScreen) { SetFullScreen(false); return; }
        SetMaximizeArea(Screen.FromHandle(Handle));
        WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
    }
    public void SetFullScreen(bool enabled)
    {
        if (enabled == fullScreen || changingMode) return;
        changingMode = true;
        try
        {
            // Resolve the monitor BEFORE normalising a maximised/minimised window.
            // WinForms may otherwise use a stale off-screen RestoreBounds during the transition.
            if (enabled)
            {
                fullScreenBounds = Screen.FromHandle(Handle).Bounds;
                savedState = WindowState == FormWindowState.Maximized ? FormWindowState.Maximized : FormWindowState.Normal;
                savedBounds = VisibleBounds(WindowState == FormWindowState.Normal ? Bounds : RestoreBounds);
                fullScreen = true; WindowState = FormWindowState.Normal; caption.Visible = false;
                PlaceWindow(fullScreenBounds);
            }
            else
            {
                fullScreen = false; caption.Visible = true; WindowState = FormWindowState.Normal;
                PlaceWindow(VisibleBounds(savedBounds));
                SetMaximizeArea(Screen.FromHandle(Handle)); WindowState = savedState;
            }
            PerformLayout(); Invalidate(true);
            if (ActivateModeChange) { BringToFront(); Activate(); }
        }
        finally { changingMode = false; }
    }
    void PlaceWindow(Rectangle bounds, bool activate = true)
    {
        Bounds = bounds;
        if (!Visible) Show();
        SetWindowPos(Handle, IntPtr.Zero, bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x20 | 0x40 | 0x200 | (activate && ActivateModeChange ? 0u : 0x10u));
    }
    static Rectangle VisibleBounds(Rectangle value)
    {
        return WindowPlacement.Recover(value, Rectangle.Empty, Screen.AllScreens.Select(s => s.WorkingArea).ToArray());
    }
    void SetMaximizeArea(Screen screen) => MaximizedBounds = WindowPlacement.MaximizeArea(screen.Bounds, screen.WorkingArea);
    void RememberBounds()
    {
        if (!changingMode && !repairing && !fullScreen && Visible && WindowState == FormWindowState.Normal && WindowPlacement.Reachable(Bounds, Screen.AllScreens.Select(s => s.WorkingArea).ToArray())) lastVisibleBounds = Bounds;
    }
    void DisplaysChanged(object? sender, EventArgs e)
    {
        if (!IsDisposed && IsHandleCreated) BeginInvoke(() => { if (Visible && WindowState != FormWindowState.Minimized) RestoreVisibleWindow(false); });
    }
    public void RestoreVisibleWindow(bool activate = true)
    {
        if (IsDisposed || Disposing || repairing) return;
        repairing = true;
        try
        {
            if (!Visible) Show();
            if (WindowState == FormWindowState.Minimized) ShowWindow(Handle, 9); // SW_RESTORE preserves the native maximized placement.
            if (fullScreen)
            {
                WindowState = FormWindowState.Normal;
                fullScreenBounds = Screen.FromRectangle(fullScreenBounds).Bounds;
                PlaceWindow(fullScreenBounds, activate);
            }
            else
            {
                var areas = Screen.AllScreens.Select(s => s.WorkingArea).ToArray();
                if (!WindowPlacement.Reachable(Bounds, areas))
                {
                    var state = WindowState; var recovered = WindowPlacement.Recover(RestoreBounds, lastVisibleBounds, areas);
                    WindowState = FormWindowState.Normal; Bounds = recovered;
                    SetMaximizeArea(Screen.FromRectangle(recovered));
                    if (state == FormWindowState.Maximized) WindowState = state;
                }
            }
            PerformLayout(); Invalidate(true);
            if (activate && ActivateModeChange) { BringToFront(); SetForegroundWindow(Handle); Activate(); }
        }
        finally { repairing = false; RememberBounds(); }
    }
    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        if (fullScreen && IsHandleCreated) BeginInvoke(() =>
        {
            if (fullScreen && !IsDisposed && Visible && WindowState != FormWindowState.Minimized) { fullScreenBounds = Screen.FromHandle(Handle).Bounds; PlaceWindow(fullScreenBounds); }
        });
    }
    protected override CreateParams CreateParams { get { var p = base.CreateParams; p.Style = (p.Style & ~0x00c00000) | 0x40000 | 0x20000 | 0x10000 | 0x80000; p.ExStyle &= ~(0x100 | 0x200 | 0x20000); return p; } }
    protected override void WndProc(ref Message m)
    {
        bool restore = m.Msg == 0x112 && (m.WParam.ToInt64() & 0xfff0) == 0xf120;
        bool activated = m.Msg == 0x6 && (m.WParam.ToInt64() & 0xffff) != 0;
        // Keep Windows resizing/snap styles without drawing a second system caption.
        if (m.Msg == 0x83 && m.WParam != IntPtr.Zero) { m.Result = IntPtr.Zero; return; }
        // Classic/non-composited Windows must not paint a second caption over client controls.
        if (m.Msg == 0x85) { m.Result = IntPtr.Zero; return; }
        if (m.Msg == 0x86) { m.Result = (IntPtr)1; return; }
        if (m.Msg == 0x84 && !fullScreen && WindowState == FormWindowState.Normal)
        {
            var bits = m.LParam.ToInt64(); var p = PointToClient(new Point((short)bits, (short)(bits >> 16)));
            int edge = Math.Max(5, (int)(6 * DeviceDpi / 96f)); bool l = p.X < edge, r = p.X >= ClientSize.Width - edge, t = p.Y < edge, b = p.Y >= ClientSize.Height - edge;
            int hit = t ? (l ? 13 : r ? 14 : 12) : b ? (l ? 16 : r ? 17 : 15) : l ? 10 : r ? 11 : 0;
            if (hit != 0) { m.Result = (IntPtr)hit; return; }
        }
        base.WndProc(ref m);
        if ((restore || activated && ActivateModeChange) && IsHandleCreated && !repairing && !changingMode) BeginInvoke(() => { if (!IsDisposed && Visible && WindowState != FormWindowState.Minimized) RestoreVisibleWindow(false); });
    }
    public bool CheckFrame(string? output)
    {
        if (HasNativeCaption) return false;
        using var bitmap = new Bitmap(Width, Height); using var graphics = Graphics.FromImage(bitmap); var dc = graphics.GetHdc();
        bool captured; try { captured = PrintWindow(Handle, dc, 2); } finally { graphics.ReleaseHdc(dc); }
        if (captured && output != null) bitmap.Save(output);
        return captured && !HasNativeCaption;
    }
    protected override void Dispose(bool disposing) { if (disposing) { Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= DisplaysChanged; hints.Dispose(); } base.Dispose(disposing); }
}
