using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Onyx.Activity;
static class L {
 static readonly Dictionary<string,Dictionary<string,string>> Strings=Load();
 static Dictionary<string,Dictionary<string,string>> Load(){using var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Onyx.Activity.strings.json");return stream==null?[]:JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string>>>(stream)??[];}
 public static string T(string key){var culture=CultureInfo.CurrentUICulture.Name;var dict=Strings.GetValueOrDefault(culture)??Strings.GetValueOrDefault(culture.Split('-')[0]);return dict?.GetValueOrDefault(key)??key;}
}
static class Program {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string? name,string title);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [STAThread] static void Main(string[] args){
  if(args.Contains("--self-test")){NativeChecks.Run(args);return;}
  using var mutex=new Mutex(true,@"Local\ONYX.Activity",out bool created);if(!created){var window=FindWindow(null,"ONYX · "+L.T("Game activity"));if(window!=IntPtr.Zero){ShowWindow(window,9);SetForegroundWindow(window);}return;}
  ApplicationConfiguration.Initialize();Application.Run(new ActivityWindow());
 }
}
sealed class ActivityWindow:Form {
 [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
 [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
 protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);int dark=1;DwmSetWindowAttribute(Handle,20,ref dark,4);}
 readonly SecureSettings settings;
 readonly HttpClient client=new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(8)};
 readonly NotifyIcon tray=new(){Icon=SystemIcons.Application,Visible=true,Text="ONYX Activity"};
 readonly Label status=new(){AutoSize=true,MaximumSize=new Size(450,70)};
 readonly Label fingerprint=new(){AutoSize=true,Font=new Font("Consolas",18,FontStyle.Bold)};
 readonly Button connect=new OnyxButton{AutoSize=true,Primary=true},pause=new OnyxButton{AutoSize=true},add=new OnyxButton{AutoSize=true};
 readonly ListBox games=new(){Width=430,Height=120,DisplayMember="Name",BackColor=Color.FromArgb(22,31,36),ForeColor=Color.FromArgb(233,238,241),BorderStyle=BorderStyle.None};
 readonly System.Windows.Forms.Timer timer=new(){Interval=20000};
 List<Game> catalog=[];DetectedGame? current;DateTime catalogAt=DateTime.MinValue;DateTime pendingUntil;bool busy,exiting,approved,remoteEnabled=true;
 string? artworkAcceptedKey,artworkPreparedKey,preparedArtwork;
 const string Endpoint="https://your-project.supabase.co/functions/v1/activity/publish";
 public ActivityWindow(SecureSettings? initial=null){
  settings=initial??SecureSettings.Load();
  using(var logo=Assembly.GetExecutingAssembly().GetManifestResourceStream("Onyx.Activity.onyx.png"))if(logo!=null){using var image=new Bitmap(logo);var handle=image.GetHicon();try{using var icon=Icon.FromHandle(handle);Icon=(Icon)icon.Clone();tray.Icon=Icon;}finally{DestroyIcon(handle);}}
  Text="ONYX · "+L.T("Game activity");ClientSize=new Size(500,445);MinimumSize=new Size(460,430);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(14,20,23);ForeColor=Color.FromArgb(233,238,241);Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
  if(CultureInfo.CurrentUICulture.TextInfo.IsRightToLeft){RightToLeft=RightToLeft.Yes;RightToLeftLayout=true;}
  var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(24),FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true};
  panel.Controls.Add(new Label{Text="ONYX",Font=new Font("Segoe UI",23,FontStyle.Bold),AutoSize=true});
  panel.Controls.Add(status);panel.Controls.Add(fingerprint);
  var buttons=new FlowLayoutPanel{AutoSize=true};buttons.Controls.AddRange([connect,pause,add]);panel.Controls.Add(buttons);
  panel.Controls.Add(new Label{Text=L.T("Registered games"),AutoSize=true,Margin=new Padding(0,18,0,5)});panel.Controls.Add(games);
  var remove=new OnyxButton{Text=L.T("Remove"),AutoSize=true};remove.Click+=(_,_)=>{if(games.SelectedItem is Game g){settings.CustomGames.Remove(g);settings.Save();RefreshGames();}};panel.Controls.Add(remove);
  Controls.Add(panel);foreach(var button in new[]{connect,pause,add,remove}){button.FlatStyle=FlatStyle.Flat;button.BackColor=Color.FromArgb(30,41,47);button.ForeColor=ForeColor;button.Padding=new Padding(8,4,8,4);button.Margin=new Padding(0,12,8,0);}
  connect.Click+=async(_,_)=>{if(approved){if(!await Disconnect())return;settings.Token=null;approved=false;settings.Save();UpdateText();}else await Pair();};
  pause.Click+=async(_,_)=>{settings.Enabled=!settings.Enabled;settings.Save();if(!settings.Enabled)await Send(null);UpdateText();};
  add.Text=L.T("Add game");add.Click+=(_,_)=>AddGame();
  var menu=new ContextMenuStrip();menu.Items.Add(L.T("Open ONYX"),null,(_,_)=>Open("https://onyxchat.site/"));menu.Items.Add(L.T("Game activity"),null,(_,_)=>{Show();WindowState=FormWindowState.Normal;Activate();});menu.Items.Add(L.T("Close"),null,async(_,_)=>{exiting=true;timer.Stop();await Send(null);tray.Visible=false;Close();});tray.ContextMenuStrip=menu;tray.DoubleClick+=(_,_)=>{Show();Activate();};
  FormClosing+=(_,e)=>{if(!exiting&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}else{exiting=true;timer.Stop();tray.Visible=false;}};
  timer.Tick+=async(_,_)=>await Tick();Shown+=async(_,_)=>{await Tick();timer.Start();};RefreshGames();UpdateText();
 }
 void UpdateText(){connect.Text=L.T(approved?"Disconnect":"Connect");pause.Text=L.T(settings.Enabled?"Pause":"Resume");pause.Enabled=settings.Token!=null;}
 void RefreshGames(){games.DataSource=null;games.DataSource=settings.CustomGames.ToList();}
 static void Open(string url){try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch{}}
 async Task Pair(){
  if(busy)return;var token="onyx_activity_"+Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();settings.Token=token;settings.Save();approved=false;pendingUntil=DateTime.UtcNow.AddMinutes(5);
  var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();fingerprint.Text=hash[..4].ToUpperInvariant()+"-"+hash[4..8].ToUpperInvariant();status.Text=L.T("Confirm this code in ONYX.");
  Open("https://onyxchat.site/#activity_pair="+hash);timer.Interval=5000;UpdateText();await Tick();
 }
 async Task<bool> Send(DetectedGame? detected){
  if(settings.Token==null)return false;
  var credential=settings.Token;
  using var request=new HttpRequestMessage(HttpMethod.Post,Endpoint);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",settings.Token);
  if(detected!=null&&detected.Game.Key!=artworkPreparedKey){preparedArtwork=await Task.Run(()=>GameArtwork.Read(detected));artworkPreparedKey=detected.Game.Key;}
  if(detected!=null&&(!settings.Enabled||!remoteEnabled))detected=null;
  var artwork=detected!=null&&detected.Game.Key!=artworkAcceptedKey?preparedArtwork:null;
  request.Content=JsonContent.Create(new{title=detected?.Game.Name,key=detected?.Game.Key,started_at=detected?.Started?.ToString("O"),artwork});
  try{using var response=await client.SendAsync(request);if(settings.Token!=credential)return false;if(response.IsSuccessStatusCode){var body=await response.Content.ReadFromJsonAsync<JsonElement>();remoteEnabled=body.GetProperty("enabled").GetBoolean();
    bool hasArtwork=body.TryGetProperty("artwork_hash",out var hash)&&hash.ValueKind==JsonValueKind.String;
    bool noIconAvailable=preparedArtwork==null;
    artworkAcceptedKey=detected!=null&&(hasArtwork||noIconAvailable)?detected.Game.Key:null;
    approved=true;fingerprint.Text="";timer.Interval=20000;return true;}
   if(response.StatusCode==System.Net.HttpStatusCode.Unauthorized&&pendingUntil<DateTime.UtcNow){settings.Token=null;settings.Save();approved=false;}
  }catch{status.Text=L.T("Connection interrupted");}return false;
 }
 async Task<bool> Disconnect(){
  try{using var request=new HttpRequestMessage(HttpMethod.Post,Endpoint.Replace("/publish","/disconnect"));request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",settings.Token);request.Content=JsonContent.Create(new{});using var response=await client.SendAsync(request);if(response.IsSuccessStatusCode||response.StatusCode==System.Net.HttpStatusCode.Unauthorized)return true;}catch{}
  status.Text=L.T("Connection interrupted");return false;
 }
 async Task Tick(){
  if(busy)return;busy=true;
  try{
   if(settings.Token==null){status.Text=L.T("Connect");return;}
   if(!approved){if(await Send(null)){status.Text=L.T("Connected");}else if(pendingUntil>DateTime.UtcNow)status.Text=L.T("Confirm this code in ONYX.");return;}
   if(!settings.Enabled||!remoteEnabled){await Send(null);status.Text=L.T("Activity paused");return;}
   if(DateTime.UtcNow-catalogAt>TimeSpan.FromMinutes(2)){catalog=await Task.Run(WindowsGames.Catalog);catalogAt=DateTime.UtcNow;}
   var detected=await Task.Run(()=>Detection.Find(WindowsGames.Processes(),settings.CustomGames.Select(g=>g with{Preferred=true}).Concat(catalog),WindowsGames.Foreground,current?.Pid));
   current=detected;bool sent=await Send(detected);status.Text=sent?(remoteEnabled?(detected?.Game.Name??L.T("No game detected")):L.T("Activity paused")):L.T("Connection interrupted");tray.Text=("ONYX · "+(detected?.Game.Name??L.T("Game activity")))[..Math.Min(63,("ONYX · "+(detected?.Game.Name??L.T("Game activity"))).Length)];
  }catch{status.Text=L.T("Try again");}finally{busy=false;UpdateText();}
 }
 void AddGame(){using var dialog=new OpenFileDialog{Filter="*.exe|*.exe",CheckFileExists=true};if(dialog.ShowDialog()!=DialogResult.OK)return;
  var title=FileVersionInfo.GetVersionInfo(dialog.FileName).FileDescription??Path.GetFileNameWithoutExtension(dialog.FileName);if(title.Length>128)title=title[..128];
  using var prompt=new Form{Text=L.T("Add game"),ClientSize=new Size(390,145),StartPosition=FormStartPosition.CenterParent,BackColor=BackColor,ForeColor=ForeColor,Font=Font,FormBorderStyle=FormBorderStyle.FixedDialog,MinimizeBox=false,MaximizeBox=false};
  var label=new Label{Text=L.T("Name"),AutoSize=true,Location=new Point(16,16)};var name=new TextBox{Text=title,MaxLength=128,Location=new Point(16,42),Width=358,BackColor=Color.FromArgb(30,41,47),ForeColor=ForeColor};var save=new Button{Text=L.T("Save"),DialogResult=DialogResult.OK,Location=new Point(294,95),Size=new Size(80,32)};prompt.Controls.AddRange([label,name,save]);prompt.AcceptButton=save;
  if(prompt.ShowDialog(this)!=DialogResult.OK||string.IsNullOrWhiteSpace(name.Text))return;title=name.Text.Trim();
  settings.CustomGames.RemoveAll(g=>string.Equals(g.Executable,dialog.FileName,StringComparison.OrdinalIgnoreCase));settings.CustomGames.Add(Detection.Custom(dialog.FileName,title));settings.Save();RefreshGames();}
 protected override void Dispose(bool disposing){if(disposing){tray.Dispose();timer.Dispose();client.Dispose();}base.Dispose(disposing);}
}
