using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Onyx.Desktop;

/** Isolated native runtime check. Never reads an existing profile or signs in. */
internal sealed class SmokeChecks : Form
{
    readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    readonly System.Windows.Forms.Timer timeout = new() { Interval = 30000 };
    readonly string directory = Path.Combine(Path.GetTempPath(), "onyx-smoke-" + Guid.NewGuid().ToString("N"));
    bool done;
    public SmokeChecks()
    {
        Text = "ONYX runtime check"; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
        Location = new Point(-20000, -20000); Size = new Size(1000, 800); Controls.Add(browser);
        timeout.Tick += (_, _) => Finish(false, "timeout");
        Shown += async (_, _) =>
        {
            timeout.Start();
            try
            {
                var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: directory);
                await browser.EnsureCoreWebView2Async(environment);
                var core = browser.CoreWebView2;
                core.Settings.AreHostObjectsAllowed = false; core.Settings.IsWebMessageEnabled = false;
                core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
                // All content is a local synthetic fixture served at the exact trusted origin.
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += (_, e) =>
                {
                    const string html = "<!doctype html><html><body><h1>ONYX native fixture</h1><button id='test'>Test</button><script>document.querySelector('#test').onclick=()=>document.title='fixture-clicked';</script></body></html>";
                    e.Response = environment.CreateWebResourceResponse(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(html)), 200, "OK", "Content-Type: text/html");
                };
                core.NavigationStarting += (_, e) => { if (!DesktopPolicy.IsOnyx(e.Uri)) e.Cancel = true; };
                core.NavigationCompleted += async (_, e) =>
                {
                    if (done) return;
                    try
                    {
                        if (!e.IsSuccess) { Finish(false, "navigation"); return; }
                        var result = await core.ExecuteScriptAsync("document.querySelector('#test').click();document.title");
                        if (result != "\"fixture-clicked\"") { Finish(false, "script"); return; }
                        var output = Environment.GetEnvironmentVariable("ONYX_SMOKE_CHECK_OUTPUT");
                        if (output != null)
                        {
                            await using var screenshot = File.Create(Path.ChangeExtension(output, ".png"));
                            await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
                        }
                        Finish(true, "synthetic_document_rendered");
                    }
                    catch (Exception) { Finish(false, "script_or_capture"); }
                };
                core.Navigate(DesktopPolicy.Home);
            }
            catch (Exception) { Finish(false, "runtime_initialization"); }
        };
        FormClosed += (_, _) => { timeout.Dispose(); browser.Dispose(); };
    }
    void Finish(bool pass, string reason)
    {
        if (done) return; done = true; timeout.Stop();
        var output = Environment.GetEnvironmentVariable("ONYX_SMOKE_CHECK_OUTPUT");
        if (output != null) File.WriteAllText(output, JsonSerializer.Serialize(new { pass, reason, networkRequests = 0, userProfileRead = false, accountCreated = false }));
        Environment.ExitCode = pass ? 0 : 1; Close();
        // WebView shuts down asynchronously; only this new synthetic profile is left in Temp.
    }
}
