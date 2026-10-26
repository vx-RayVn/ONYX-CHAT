namespace Onyx.Desktop;

internal static class PolicyChecks
{
    public static void Run()
    {
        int count = 0;
        void Check(bool pass) { count++; if (!pass) throw new InvalidOperationException("Desktop policy check " + count); }
        foreach (var url in new[] { DesktopPolicy.Home, "https://onyxchat.site/login/", "https://onyxchat.site/invite/test?x=1", "https://onyxchat.site:443/app/" }) Check(DesktopPolicy.IsOnyx(url));
        foreach (var url in new[] { "http://onyxchat.site/app", "https://onyxchat.site.evil.test/", "https://evil.test/?onyxchat.site", "https://onyxchat.site:8443/", "https://user@onyxchat.site/", "file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,test", "onyx://test", "https://www.onyxchat.site/", "https://onyxchat.site./", "https://оnyxchat.site/" }) Check(!DesktopPolicy.IsOnyx(url));
        Check(DesktopPolicy.IsExternal("https://example.com/"));
        Check(!DesktopPolicy.IsExternal("ms-settings:privacy"));
        Check(!DesktopPolicy.MayNotify("https://evil.test/", DesktopPolicy.Home));
        Check(!DesktopPolicy.MayNotify(DesktopPolicy.Home, "https://evil.test/"));
        Check(DesktopPolicy.MayNotify(DesktopPolicy.Home, DesktopPolicy.Home));
        Check(DesktopPolicy.StartAddress(["https://evil.test/"]) == DesktopPolicy.Home);
        Check(DesktopPolicy.StartAddress(["https://onyxchat.site/invite/test"]) == "https://onyxchat.site/invite/test");
        Check(DesktopPolicy.StartAddress([DesktopPolicy.Home, "--unsafe"]) == DesktopPolicy.Home);
        var nav = new NavigationState(); nav.Start(1); Check(!nav.Complete(1, true, false)); Check(nav.Ready);
        nav.Start(2); Check(!nav.Complete(1, false, false)); Check(!nav.Complete(2, false, true)); Check(nav.Ready);
        Check(nav.Complete(2, false, false)); Check(nav.NextRetryDelay() == 1000); Check(nav.NextRetryDelay() == 2000); Check(nav.NextRetryDelay() == 4000); Check(nav.NextRetryDelay() == 0);
        nav.Start(3); nav.Complete(3, true, false); Check(nav.NextRetryDelay() == 1000); nav.ProcessExited(); Check(!nav.Ready);
        const string theme = "{\"type\":\"onyx:chrome\",\"background\":\"#0f1417\",\"foreground\":\"#e9eef1\",\"title\":\"Friends\"}";
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, theme)?.Title == "Friends");
        Check(ChromeMessage.Read("https://evil.invalid/", DesktopPolicy.Home, theme) == null);
        Check(ChromeMessage.Read(DesktopPolicy.Home, "https://evil.invalid/", theme) == null);
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, "{}") == null);
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, theme.Replace("#0f1417", "url(https://evil.invalid/)")) == null);
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, new string('a', 2049)) == null);
        Check(DesktopPolicy.IsPayment("https://checkout.stripe.com/c/pay/synthetic"));
        Check(DesktopPolicy.IsPayment("https://billing.stripe.com/p/session/synthetic"));
        foreach (var url in new[] { "http://checkout.stripe.com/", "https://checkout.stripe.com.evil.invalid/", "https://checkout.stripe.com:8443/", "https://user@checkout.stripe.com/", "https://evil.invalid/" }) Check(!DesktopPolicy.IsPayment(url));
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, theme.Replace("\"title\"", "\"canBack\":true,\"canForward\":true,\"title\"")) is { CanBack: true, CanForward: true });
        Check(ChromeMessage.Read(DesktopPolicy.Home, DesktopPolicy.Home, theme.Replace("\"title\"", "\"canBack\":\"true\",\"title\"")) is { CanBack: false });
        var monitors = new[] { new Rectangle(0, 0, 1920, 1040), new Rectangle(-1920, 0, 1920, 1040) };
        Check(WindowPlacement.MaximizeArea(new Rectangle(-1920, 0, 1920, 1080), monitors[1]) == new Rectangle(0, 0, 1920, 1040));
        Check(WindowPlacement.MaximizeArea(new Rectangle(1920, -1080, 2560, 1440), new Rectangle(1960, -1080, 2520, 1400)) == new Rectangle(40, 0, 2520, 1400));
        var secondary = new Rectangle(-1800, 40, 1100, 700);
        Check(WindowPlacement.Reachable(secondary, monitors));
        Check(WindowPlacement.Recover(secondary, Rectangle.Empty, monitors) == secondary);
        var primary = new Rectangle(100, 60, 1100, 700);
        Check(WindowPlacement.Recover(new Rectangle(-32000, -32000, 900, 650), primary, monitors) == primary);
        Check(WindowPlacement.Recover(new Rectangle(9000, 9000, 900, 650), secondary, monitors) == secondary);
        var disconnected = WindowPlacement.Recover(secondary, secondary, [monitors[0]]);
        Check(monitors[0].Contains(disconnected));
        Check(WindowPlacement.Reachable(disconnected, [monitors[0]]));
        var small = WindowPlacement.Recover(new Rectangle(9000, 9000, 1100, 800), Rectangle.Empty, [new Rectangle(0, 0, 640, 480)]);
        Check(new Rectangle(0, 0, 640, 480).Contains(small));
        Check(!WindowPlacement.Reachable(new Rectangle(-32000, -32000, 160, 28), monitors));
        Check(WindowPlacement.Reachable(new Rectangle(100, -1000, 1000, 700), [new Rectangle(0, -1080, 1920, 1080)]));
        var output = Environment.GetEnvironmentVariable("ONYX_POLICY_CHECK_OUTPUT");
        if (!string.IsNullOrEmpty(output)) File.WriteAllText(output, System.Text.Json.JsonSerializer.Serialize(new { passed = count, credentialsRead = false, networkRequests = 0 }));
    }
}
