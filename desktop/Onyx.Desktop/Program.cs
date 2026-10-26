using System.Diagnostics;
using System.Globalization;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Velopack;

namespace Onyx.Desktop;

internal static class L
{
    static readonly Dictionary<string, Dictionary<string, string>> Strings = Load();
    static Dictionary<string, Dictionary<string, string>> Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Onyx.Desktop.strings.json");
        return stream == null ? [] : JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(stream) ?? [];
    }
    public static string T(string key)
    {
        var culture = CultureInfo.CurrentUICulture.Name;
        var dict = Strings.GetValueOrDefault(culture) ?? Strings.GetValueOrDefault(culture.Split('-')[0]);
        return dict?.GetValueOrDefault(key) ?? key;
    }
}

internal static class Program
{
    [DllImport("kernel32.dll")] static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint processId);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint processId);
    public const string PipeName = "ONYX.Desktop.v1";
    [STAThread]
    static void Main(string[] args)
    {
        VelopackApp.Build().Run();
        if (args is ["--policy-check"]) { PolicyChecks.Run(); return; }
        if (args is ["--smoke-test"]) { ApplicationConfiguration.Initialize(); Application.Run(new SmokeChecks()); return; }
        if (args is ["--shell-test"]) { ApplicationConfiguration.Initialize(); Application.Run(new DesktopWindow(DesktopPolicy.Home, true)); return; }
        if (args is ["--production-style-test", var directory]) { ApplicationConfiguration.Initialize(); Application.Run(new DesktopWindow(DesktopPolicy.Home, true, Path.GetFullPath(directory))); return; }
        if (args is ["--wait-for-parent", var parent] && int.TryParse(parent, out var pid))
        {
            try
            {
                using var process = Process.GetProcessById(pid);
                if (process.MainModule?.FileName != Environment.ProcessPath || !process.WaitForExit(10000)) return;
            }
            catch (ArgumentException) { }
            catch (System.ComponentModel.Win32Exception) { return; }
            args = [];
        }
        using var mutex = new Mutex(true, @"Local\ONYX.Desktop.v1", out bool created);
        if (!created)
        {
            try
            {
                using var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.Out, PipeOptions.CurrentUserOnly);
                pipe.Connect(1500);
                // A user-started second instance may pass foreground permission to the existing window.
                if (GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var primaryPid)) AllowSetForegroundWindow(primaryPid);
                using var writer = new StreamWriter(pipe, Encoding.UTF8) { AutoFlush = true };
                writer.WriteLine(args.Length == 0 ? "" : DesktopPolicy.StartAddress(args));
            }
            catch (IOException) { }
            catch (TimeoutException) { }
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new DesktopWindow(DesktopPolicy.StartAddress(args)));
    }
}

internal sealed class DesktopWindow : WindowChrome
{
    protected override bool ActivateModeChange => !synthetic;
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    readonly WebView2 browser = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(15, 20, 23) };
    readonly Panel fallback = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 20, 23) };
    readonly Label status = new() { AutoSize = true, TextAlign = ContentAlignment.MiddleCenter };
    readonly PictureBox logo = new() { Size = new Size(64, 64), SizeMode = PictureBoxSizeMode.Zoom };
    readonly Button retry = new() { AutoSize = true, FlatStyle = FlatStyle.Flat };
    readonly Button openBrowser = new() { AutoSize = true, FlatStyle = FlatStyle.Flat };
    readonly NotifyIcon tray = new();
    readonly CancellationTokenSource lifetime = new();
    readonly string initial;
    readonly bool synthetic;
    readonly string? fixtureDirectory;
    int syntheticStyles;
    int syntheticDocuments;
    bool initialized, loading, quitting, booting, restartRequired;
    bool restoreFullScreenAfterHtml;
    bool webBack, webForward;
    readonly NavigationState navigation = new();
    CancellationTokenSource? retryDelay;
    string? pendingAddress;
    ToolStripMenuItem? updateItem;
    CoreWebView2Notification? notification;

    public DesktopWindow(string address, bool synthetic = false, string? fixtureDirectory = null)
    {
        this.synthetic = synthetic;
        this.fixtureDirectory = synthetic ? fixtureDirectory : null;
        initial = address;
        Text = "ONYX 0.1"; BackColor = Color.FromArgb(15, 20, 23); ForeColor = Color.FromArgb(233, 238, 241);
        Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(760, 560); ClientSize = new Size(1280, 800); StartPosition = FormStartPosition.CenterScreen;
        if (synthetic) { ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-20000, -20000); }
        using var iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Onyx.Desktop.onyx.ico");
        if (iconStream != null) { Icon = new Icon(iconStream); tray.Icon = Icon; logo.Image = Icon.ToBitmap(); }
        tray.Icon ??= SystemIcons.Application; tray.Text = "ONYX 0.1";
        retry.Text = L.T("Try again"); openBrowser.Text = L.T("Open in browser");
        foreach (var button in new[] { retry, openBrowser })
        { button.BackColor = Color.FromArgb(30, 41, 47); button.ForeColor = ForeColor; button.Padding = new Padding(18, 9, 18, 9); button.FlatAppearance.BorderSize = 0; button.Cursor = Cursors.Hand; }
        retry.BackColor = Color.FromArgb(16, 185, 129); retry.ForeColor = Color.FromArgb(7, 16, 12); retry.Font = new Font(Font, FontStyle.Bold);
        status.ForeColor = Color.FromArgb(153, 172, 181); status.Font = new Font(Font, FontStyle.Regular);
        retry.Click += async (_, _) => await ReloadView();
        openBrowser.Click += (_, _) => External(DesktopPolicy.Home);
        fallback.Controls.AddRange([logo, status, retry, openBrowser]); fallback.Resize += (_, _) => LayoutFallback();
        var content = new Panel { Dock = DockStyle.Fill }; content.Controls.Add(browser); content.Controls.Add(fallback); Controls.Add(content); MountChrome(); fallback.BringToFront(); ShowStatus(null);
        SetContext(""); SetHistory(false, false);
        BackRequested += () => NavigateHistory(true);
        ForwardRequested += () => NavigateHistory(false);
        var menu = new ContextMenuStrip();
        menu.Items.Add(L.T("Open ONYX"), null, (_, _) => RestoreWindow());
        menu.Items.Add(L.T("Reload"), null, async (_, _) => await ReloadView());
        menu.Items.Add(L.T("Game activity"), null, (_, _) => OpenActivity());
        if (DesktopPolicy.UpdateFeed != null)
        {
            updateItem = new ToolStripMenuItem(L.T("Check for updates"));
            updateItem.Click += async (_, _) => await CheckUpdates(); menu.Items.Add(updateItem);
        }
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(L.T("Quit ONYX"), null, (_, _) => Quit());
        tray.ContextMenuStrip = menu; tray.DoubleClick += (_, _) => RestoreWindow();
        tray.BalloonTipClicked += (_, _) => { RestoreWindow(); notification?.ReportClicked(); notification = null; };
        tray.BalloonTipClosed += (_, _) => { notification?.ReportClosed(); notification = null; };
        Shown += async (_, _) => { if (!synthetic) { tray.Visible = true; _ = Listen(); } await Initialize(); };
        FormClosing += (_, e) => { if (!quitting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
        FormClosed += (_, _) => { lifetime.Cancel(); tray.Visible = false; tray.Dispose(); browser.Dispose(); lifetime.Dispose(); };
        Resize += (_, _) => QueueBrowserVisibility();
        VisibleChanged += (_, _) => QueueBrowserVisibility();
        Activated += (_, _) => QueueBrowserVisibility();
        KeyPreview = true;
        KeyDown += HandleKeys; browser.KeyDown += HandleKeys;
        browser.PreviewKeyDown += (_, e) => { if (e.KeyCode is Keys.F11 or Keys.Escape) e.IsInputKey = true; };
    }

    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); int dark = 1; DwmSetWindowAttribute(Handle, 20, ref dark, 4); }
    void LayoutFallback()
    {
        int mid = fallback.ClientSize.Width / 2, y = Math.Max(30, fallback.ClientSize.Height / 2 - 80);
        logo.Location = new Point(mid - 32, y); status.Location = new Point(mid - status.Width / 2, y + 88);
        retry.Location = new Point(mid - retry.Width - 6, y + 132); openBrowser.Location = new Point(mid + 6, y + 132);
    }
    void ShowStatus(string? message)
    {
        if (IsDisposed || Disposing) return;
        fallback.Visible = true; fallback.BringToFront(); status.Text = message == null ? "" : L.T(message);
        retry.Visible = openBrowser.Visible = message != null; LayoutFallback();
    }
    async Task Initialize()
    {
        if (booting || IsDisposed) return;
        booting = true; ShowStatus(null);
        try
        {
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ONYX", "Desktop", "WebView2");
            if (synthetic) data = Path.Combine(Path.GetTempPath(), "onyx-shell-" + Guid.NewGuid().ToString("N"));
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: data);
            if (IsDisposed) return;
            await browser.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            var core = browser.CoreWebView2;
            if (synthetic)
            {
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += (_, e) => {
                    bool fail = e.ResourceContext == CoreWebView2WebResourceContext.Document && ++syntheticDocuments <= 2;
                    if (this.fixtureDirectory != null && !fail)
                    {
                        var uri = new Uri(e.Request.Uri); var relative = uri.AbsolutePath.TrimStart('/');
                        if (DesktopPolicy.IsOnyx(e.Request.Uri) && (relative.StartsWith("assets/") || relative.StartsWith("brand/") || relative is "app/" or "app" or "login/"))
                        {
                            var root = Path.GetFullPath(this.fixtureDirectory) + Path.DirectorySeparatorChar;
                            var file = Path.GetFullPath(Path.Combine(root, relative.StartsWith("assets/") || relative.StartsWith("brand/") ? relative : "app.html"));
                            if (file.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(file))
                            {
                                var bytes = File.ReadAllBytes(file); var extension = Path.GetExtension(file);
                                if (extension == ".css" && ++syntheticStyles == 1) bytes = bytes[..Math.Min(218952, bytes.Length)];
                                var mime = extension switch { ".html" => "text/html", ".css" => "text/css", ".js" => "text/javascript", ".woff2" => "font/woff2", ".png" => "image/png", ".webp" => "image/webp", _ => "application/octet-stream" };
                                e.Response = environment.CreateWebResourceResponse(new MemoryStream(bytes), 200, "OK", "Content-Type: " + mime); return;
                            }
                        }
                        e.Response = environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("{\"error\":\"synthetic_style_test\"}")), 403, "Forbidden", "Content-Type: application/json"); return;
                    }
                    e.Response = environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("<!doctype html><html><title>Local window check</title><body style='margin:0;background:#0e1417;color:#e9eef1;font:18px Segoe UI;padding:32px'><h1>Local ONYX window test</h1><p>Synthetic content. No accounts or network.</p></body></html>")), fail ? 503 : 200, fail ? "Unavailable" : "OK", "Content-Type: text/html");
                };
            }
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = true;
            core.Settings.IsBuiltInErrorPageEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = true;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.UserAgent += " ONYXDesktop/0.2.3";
            core.NavigationStarting += (_, e) =>
            {
                if (!DesktopPolicy.IsOnyx(e.Uri)) { e.Cancel = true; if (e.IsUserInitiated || DesktopPolicy.IsOnyx(core.Source) && DesktopPolicy.IsPayment(e.Uri)) External(e.Uri); return; }
                webBack = webForward = false; SetHistory(false, false);
                SetContext("");
                retryDelay?.Cancel(); navigation.Start(e.NavigationId); loading = true;
            };
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (!e.IsUserInitiated) return;
                if (DesktopPolicy.IsOnyx(e.Uri)) Navigate(e.Uri); else External(e.Uri);
            };
            core.PermissionRequested += (_, e) =>
            {
                // Trusted documents still use the native permission prompt; never silently grant devices.
                if (!DesktopPolicy.MayNotify(e.Uri, core.Source)) e.State = CoreWebView2PermissionState.Deny;
                if (synthetic) e.State = CoreWebView2PermissionState.Deny;
            };
            core.ServerCertificateErrorDetected += (_, e) => e.Action = CoreWebView2ServerCertificateErrorAction.Cancel;
            core.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
            core.HistoryChanged += (_, _) => SetHistory(webBack || core.CanGoBack, webForward || core.CanGoForward);
            core.WebMessageReceived += (_, e) => {
                var appearance = ChromeMessage.Read(e.Source, core.Source, e.WebMessageAsJson);
                if (appearance != null) { SetAppearance(appearance); webBack = appearance.CanBack; webForward = appearance.CanForward; SetHistory(webBack || core.CanGoBack, webForward || core.CanGoForward); }
            };
            core.ContainsFullScreenElementChanged += (_, _) => {
                if (core.ContainsFullScreenElement) { restoreFullScreenAfterHtml = IsFullScreen; SetFullScreen(true); }
                else { SetFullScreen(restoreFullScreenAfterHtml); restoreFullScreenAfterHtml = false; }
            };
            core.NavigationCompleted += async (_, e) =>
            {
                if (e.NavigationId != navigation.Current) return;
                loading = false;
                var failed = navigation.Complete(e.NavigationId, e.IsSuccess && e.HttpStatusCode < 400, e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled);
                if (e.IsSuccess && e.HttpStatusCode < 400)
                {
                    fallback.Visible = false;
                    if (synthetic) { await CheckShell(); return; }
                    if (pendingAddress != null) { var next = pendingAddress; pendingAddress = null; Navigate(next); }
                }
                else if (failed) await RecoverNavigation(e.NavigationId);
            };
            core.NotificationReceived += (_, e) =>
            {
                if (!DesktopPolicy.MayNotify(e.SenderOrigin, core.Source)) { e.Handled = true; e.Notification.ReportClosed(); return; }
                e.Handled = true; notification?.ReportClosed(); notification = e.Notification;
                tray.ShowBalloonTip(5000, Short(notification.Title, 63), Short(notification.Body, 255), ToolTipIcon.None);
                notification.ReportShown();
            };
            core.ProcessFailed += (_, e) =>
            {
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited)
                { navigation.ProcessExited(); ShowStatus(null); _ = RecoverNavigation(navigation.Current); }
                else if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
                { navigation.ProcessExited(); initialized = false; restartRequired = true; ShowStatus("Connection interrupted"); }
                // GPU, subframe and utility failures are handled by WebView2; don't reload calls.
            };
            initialized = true; Navigate(initial);
        }
        catch (WebView2RuntimeNotFoundException) { ShowStatus("Install Microsoft Edge WebView2 Runtime to open ONYX."); }
        catch (Exception) { ShowStatus("Connection interrupted"); }
        finally { booting = false; }
    }
    void Navigate(string address)
    {
        if (!initialized || !DesktopPolicy.IsOnyx(address)) return;
        if (!navigation.Ready) ShowStatus(null); browser.CoreWebView2.Navigate(address);
    }
    void HandleKeys(object? sender, KeyEventArgs e)
    {
        if (e.Handled) return;
        if (e.KeyCode == Keys.F11 || e.Alt && e.KeyCode == Keys.Enter)
        {
            e.Handled = e.SuppressKeyPress = true;
            if (initialized && browser.CoreWebView2.ContainsFullScreenElement) { restoreFullScreenAfterHtml = false; _ = browser.CoreWebView2.ExecuteScriptAsync("document.exitFullscreen()"); SetFullScreen(false); }
            else SetFullScreen(!IsFullScreen);
        }
        else if (e.KeyCode == Keys.Escape && IsFullScreen)
        {
            if (initialized && browser.CoreWebView2.ContainsFullScreenElement) return; // Let WebView2 exit the element, then restore the previous window mode.
            e.Handled = e.SuppressKeyPress = true; SetFullScreen(false);
        }
        else if (e.KeyCode == Keys.F5 || e.Control && e.KeyCode == Keys.R) { e.Handled = e.SuppressKeyPress = true; _ = ReloadView(); }
    }
    void NavigateHistory(bool back)
    {
        if (!initialized || !DesktopPolicy.IsOnyx(browser.CoreWebView2.Source)) return;
        var core = browser.CoreWebView2;
        if (back ? webBack : webForward) core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "onyx:navigate", direction = back ? "back" : "forward" }));
        else if (back && core.CanGoBack) core.GoBack();
        else if (!back && core.CanGoForward) core.GoForward();
    }
    async Task CheckShell()
    {
        bool pass = false;
        try
        {
            await Task.Delay(120);
            if (fixtureDirectory != null)
            {
                bool styled = false;
                for (int i = 0; i < 80 && !styled; i++)
                {
                    await Task.Delay(100);
                    styled = await browser.CoreWebView2.ExecuteScriptAsync("(()=>{const card=document.querySelector('.auth-card'),screen=document.querySelector('.auth-screen');return !!card&&!!screen&&getComputedStyle(screen).display==='flex'&&card.getBoundingClientRect().width<=460&&card.getBoundingClientRect().width>=400})()") == "true";
                }
                if (!styled || syntheticStyles < 2) throw new InvalidOperationException("production CSS recovery/layout");
                var capture = Environment.GetEnvironmentVariable("ONYX_SHELL_CHECK_OUTPUT");
                if (capture != null) { await using var stream = File.Create(Path.ChangeExtension(capture, ".webview.png")); await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream); }
            }
            if (syntheticDocuments != 3) throw new InvalidOperationException("bounded navigation recovery");
            if (fallback.Visible || browser.Height != ClientSize.Height - ChromeHeight || browser.Parent?.Top != ChromeHeight || !NativeFonts.Inter.Name.StartsWith("Inter")) throw new InvalidOperationException($"caption layout: fallback={fallback.Visible}, browser={browser.Bounds}, content={browser.Parent?.Bounds}, client={ClientSize}");
            var frameOutput = Environment.GetEnvironmentVariable("ONYX_SHELL_CHECK_OUTPUT");
            if (!CheckFrame(frameOutput == null ? null : Path.ChangeExtension(frameOutput, ".frame.png"))) throw new InvalidOperationException("native caption/frame paint");
            var area = Screen.FromHandle(Handle).WorkingArea;
            Bounds = new Rectangle(area.X + 20, area.Y + 20, Math.Min(1000, area.Width - 40), Math.Min(700, area.Height - 40));
            var before = Bounds;
            HandleKeys(browser, new KeyEventArgs(Keys.F11));
            if (!IsFullScreen || !IsOnScreen || Bounds != Screen.FromHandle(Handle).Bounds || browser.Height != ClientSize.Height) throw new InvalidOperationException("fullscreen visibility/bounds");
            HandleKeys(browser, new KeyEventArgs(Keys.Escape));
            if (IsFullScreen || !IsOnScreen || Bounds != before) throw new InvalidOperationException("fullscreen visible restore");
            for (int i = 0; i < 12; i++)
            {
                WindowState = i % 2 == 0 ? FormWindowState.Maximized : FormWindowState.Normal;
                SetFullScreen(true); if (!IsOnScreen) throw new InvalidOperationException("fullscreen disappeared");
                SetFullScreen(false); if (!IsOnScreen) throw new InvalidOperationException($"restore cycle {i}: {Bounds}, state={WindowState}, visible={Visible}");
            }
            await browser.CoreWebView2.ExecuteScriptAsync("window.__restoreProbe=197;");
            for (int i = 0; i < 8; i++)
            {
                WindowState = FormWindowState.Minimized; await Task.Delay(30); RestoreWindow(); await Task.Delay(30);
                if (!IsOnScreen || !browser.Visible || browser.Width < 200) throw new InvalidOperationException("minimize restore visibility");
                Hide(); RestoreWindow(); await Task.Delay(30);
                if (!IsOnScreen || !browser.Visible) throw new InvalidOperationException("tray restore visibility");
            }
            SetFullScreen(true); WindowState = FormWindowState.Minimized; await Task.Delay(40); RestoreWindow(); await Task.Delay(40);
            if (!IsFullScreen || !IsOnScreen || !browser.Visible || Bounds != Screen.FromHandle(Handle).Bounds) throw new InvalidOperationException("minimized fullscreen restore");
            SetFullScreen(false); Bounds = new Rectangle(-32000, -32000, 900, 650); RestoreWindow(); await Task.Delay(40);
            if (!IsOnScreen || !WindowPlacement.Reachable(Bounds, Screen.AllScreens.Select(s => s.WorkingArea).ToArray())) throw new InvalidOperationException("disconnected monitor recovery");
            if (await browser.CoreWebView2.ExecuteScriptAsync("window.__restoreProbe") != "197") throw new InvalidOperationException("restore reloaded healthy document");
            browser.CoreWebView2.Navigate("https://rejected.synthetic.invalid/");
            await Task.Delay(120);
            if (fallback.Visible) throw new InvalidOperationException("cancelled navigation covered healthy document");
            WindowState = FormWindowState.Maximized;
            HandleKeys(browser, new KeyEventArgs(Keys.F11)); HandleKeys(browser, new KeyEventArgs(Keys.F11));
            if (WindowState != FormWindowState.Maximized) throw new InvalidOperationException("maximized restore");
            if (HasNativeCaption) throw new InvalidOperationException("maximized native caption");
            WindowState = FormWindowState.Normal;
            var output = Environment.GetEnvironmentVariable("ONYX_SHELL_CHECK_OUTPUT");
            if (output != null)
            {
                using var bitmap = new Bitmap(Width, Height); DrawToBitmap(bitmap, new Rectangle(0, 0, Width, Height));
                bitmap.Save(Path.ChangeExtension(output, ".png"));
            }
            pass = true;
        }
        catch (Exception e) { ShellResult(false, e.Message); }
        if (pass) ShellResult(true, "native_chrome_fullscreen_restore");
        quitting = true; Close();
    }
    static void ShellResult(bool pass, string reason)
    {
        var output = Environment.GetEnvironmentVariable("ONYX_SHELL_CHECK_OUTPUT");
        if (output != null) File.WriteAllText(output, JsonSerializer.Serialize(new { pass, reason, networkRequests = 0, userProfileRead = false, accountCreated = false }));
        Environment.ExitCode = pass ? 0 : 1;
    }
    async Task RecoverNavigation(ulong id)
    {
        int delay = navigation.NextRetryDelay();
        if (delay == 0) { ShowStatus("Connection interrupted"); return; }
        if (!navigation.Ready) ShowStatus(null);
        retryDelay?.Cancel(); retryDelay = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); var token = retryDelay.Token;
        try
        {
            await Task.Delay(delay, token);
            if (!token.IsCancellationRequested && initialized && id == navigation.Current)
            { var target = browser.CoreWebView2.Source; Navigate(DesktopPolicy.IsOnyx(target) ? target : DesktopPolicy.Home); }
        }
        catch (OperationCanceledException) { }
        catch (Exception e) when (e is InvalidOperationException or COMException) { restartRequired = true; ShowStatus("Connection interrupted"); }
    }
    async Task ReloadView()
    {
        RestoreWindow();
        if (restartRequired)
        {
            try
            {
                var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
                start.ArgumentList.Add("--wait-for-parent"); start.ArgumentList.Add(Environment.ProcessId.ToString(CultureInfo.InvariantCulture));
                Process.Start(start); quitting = true; Close();
            }
            catch (System.ComponentModel.Win32Exception) { ShowStatus("Connection interrupted"); }
        }
        else if (!initialized) await Initialize();
        else try { browser.CoreWebView2.Reload(); }
        catch (Exception e) when (e is InvalidOperationException or COMException) { restartRequired = true; ShowStatus("Connection interrupted"); }
    }
    void RestoreWindow() { RestoreVisibleWindow(); QueueBrowserVisibility(); }
    bool visibilityQueued;
    void QueueBrowserVisibility()
    {
        if (visibilityQueued || IsDisposed || !IsHandleCreated) return;
        visibilityQueued = true;
        BeginInvoke(() =>
        {
            visibilityQueued = false;
            if (IsDisposed || Disposing) return;
            browser.Visible = Visible && WindowState != FormWindowState.Minimized;
            if (browser.Visible) { browser.PerformLayout(); browser.Invalidate(); browser.Update(); }
        });
    }
    static string Short(string text, int count) => text.Length <= count ? text : text[..(count - 1)] + "…";
    static void External(string address)
    {
        if (!DesktopPolicy.IsExternal(address)) return;
        try { Process.Start(new ProcessStartInfo(address) { UseShellExecute = true }); } catch (System.ComponentModel.Win32Exception) { }
    }
    void OpenActivity()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "Activity", "ONYX-Activity.exe");
        if (!File.Exists(file)) return;
        try { Process.Start(new ProcessStartInfo(file) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(file)! }); }
        catch (System.ComponentModel.Win32Exception) { MessageBox.Show(this, L.T("Try again"), "ONYX"); }
    }
    void Quit()
    {
        RestoreWindow();
        if (MessageBox.Show(this, L.T("Quit ONYX and end any active call?"), "ONYX", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
        quitting = true; Close();
    }
    async Task Listen()
    {
        while (!lifetime.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeServerStream(Program.PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(lifetime.Token);
                using var request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); request.CancelAfter(1500);
                using var reader = new StreamReader(pipe, Encoding.UTF8);
                // Bound data before parsing, including a client that omits its newline.
                var chars = new char[4097]; int used = 0;
                while (used < chars.Length)
                {
                    int count = await reader.ReadAsync(chars.AsMemory(used, 1), request.Token);
                    if (count == 0 || chars[used] == '\n') break; used++;
                }
                var address = new string(chars, 0, used).TrimEnd('\r');
                if (used == 0) { RestoreWindow(); continue; }
                if (used > 4096 || !DesktopPolicy.IsOnyx(address)) continue;
                RestoreWindow(); if (initialized && !loading) Navigate(address); else pendingAddress = address;
            }
            catch (OperationCanceledException) { }
            catch (IOException) { }
        }
    }
    async Task CheckUpdates()
    {
        if (DesktopPolicy.UpdateFeed == null || updateItem == null) return;
        updateItem.Enabled = false;
        try
        {
            var manager = new UpdateManager(DesktopPolicy.UpdateFeed);
            var update = await manager.CheckForUpdatesAsync();
            if (update == null) { MessageBox.Show(this, L.T("No updates available."), "ONYX"); return; }
            if (MessageBox.Show(this, L.T("Download desktop update?"), "ONYX", MessageBoxButtons.OKCancel) != DialogResult.OK) return;
            await manager.DownloadUpdatesAsync(update);
            if (MessageBox.Show(this, L.T("Restart ONYX to install the update and end any active call?"), "ONYX", MessageBoxButtons.OKCancel) == DialogResult.OK)
            { quitting = true; manager.ApplyUpdatesAndRestart(update); }
        }
        catch (Exception) { MessageBox.Show(this, L.T("Connection interrupted"), "ONYX"); }
        finally { if (!IsDisposed && updateItem != null) updateItem.Enabled = true; }
    }
}
