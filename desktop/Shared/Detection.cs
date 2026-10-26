using System.Text.Json;
using System.Text.RegularExpressions;
namespace Onyx.Activity;
public record Game(string Key,string Name,string Location,string? Executable=null,bool Preferred=false);
public record RunningApp(int Pid,string Path,DateTimeOffset? Started=null);
public record DetectedGame(Game Game,int Pid,DateTimeOffset? Started,string? Executable=null);
public static partial class Detection {
 static readonly HashSet<string> Helpers=new(StringComparer.OrdinalIgnoreCase){"steam.exe","steamwebhelper.exe","EpicGamesLauncher.exe","EpicWebHelper.exe","GalaxyClient.exe","Battle.net.exe","Agent.exe","RiotClientServices.exe","RiotClientUx.exe","RiotClientUxRender.exe","EADesktop.exe","EAUpdater.exe","Origin.exe","UbisoftConnect.exe","UbisoftGameLauncher.exe","UnityCrashHandler64.exe","UnityCrashHandler32.exe","CrashReportClient.exe","Crashpad_Handler.exe","unins000.exe","setup.exe","GameOverlayUI.exe","FortniteBootstrapper.exe","FortniteLauncher.exe","EasyAntiCheat.exe","EasyAntiCheat_EOS.exe","BEService.exe","vc_redist.x64.exe","dotnet.exe","Onyx-Activity.exe"};
 static readonly HashSet<string> NonGames=new(StringComparer.OrdinalIgnoreCase){"chrome.exe","msedge.exe","firefox.exe","opera.exe","brave.exe","vivaldi.exe","explorer.exe","Code.exe","devenv.exe","WINWORD.EXE","EXCEL.EXE","POWERPNT.EXE","OUTLOOK.EXE","Slack.exe","Discord.exe","Spotify.exe","vlc.exe","obs64.exe","powershell.exe","pwsh.exe","cmd.exe","WindowsTerminal.exe","Taskmgr.exe","vrserver.exe","vrcompositor.exe"};
 public static bool IsHelper(string path){var name=System.IO.Path.GetFileName(path);return Helpers.Contains(name)||NonGames.Contains(name)||name.EndsWith("_EAC_EOS.exe",StringComparison.OrdinalIgnoreCase)||name.EndsWith("_EAC.exe",StringComparison.OrdinalIgnoreCase)||name.EndsWith("_BE.exe",StringComparison.OrdinalIgnoreCase)||name.Contains("crash",StringComparison.OrdinalIgnoreCase)||name.Contains("uninstall",StringComparison.OrdinalIgnoreCase)||name.Contains("anticheat",StringComparison.OrdinalIgnoreCase)||name.StartsWith("vcredist",StringComparison.OrdinalIgnoreCase);}
 public static DetectedGame? Find(IEnumerable<RunningApp> apps,IEnumerable<Game> games,int foregroundPid,int? previousPid=null){
  var installed=games.OrderByDescending(g=>g.Preferred).ThenByDescending(g=>!g.Key.StartsWith("custom:")).ThenByDescending(g=>g.Location.Length).ToArray();
  var found=new List<DetectedGame>();
  foreach(var app in apps){
   if(IsHelper(app.Path))continue;
   foreach(var g in installed){
    bool match=g.Executable!=null?string.Equals(System.IO.Path.GetFullPath(g.Executable),app.Path,StringComparison.OrdinalIgnoreCase):app.Path.StartsWith(g.Location.TrimEnd('\\','/')+System.IO.Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);
    if(match){found.Add(new(g,app.Pid,app.Started,app.Path));break;}
   }
  }
  return found.FirstOrDefault(g=>g.Pid==foregroundPid)??found.FirstOrDefault(g=>g.Pid==previousPid)??found.FirstOrDefault();
 }
 public static Game? SteamManifest(string text,string steamApps){
  string Read(string key)=>Regex.Match(text,"\""+key+"\"\\s*\"([^\"]*)\"",RegexOptions.IgnoreCase).Groups[1].Value;
  var id=Read("appid");var name=Read("name");var dir=Read("installdir");
  if(!Regex.IsMatch(id,"^[0-9]{1,10}$")||name.Length is 0 or >128||string.IsNullOrWhiteSpace(dir)||dir.IndexOfAny(['\\','/',':'])>=0||dir=="..")return null;
  return new("steam:"+id,name,System.IO.Path.GetFullPath(System.IO.Path.Combine(steamApps,"common",dir)));
 }
 public static Game? EpicManifest(string text){
  try{using var json=JsonDocument.Parse(text);var root=json.RootElement;var id=root.GetProperty("AppName").GetString()!;var name=root.GetProperty("DisplayName").GetString()!;var dir=root.GetProperty("InstallLocation").GetString()!;
   // Epic installs DLC beside the main game. Only runnable applications own a game identity.
   var launch=root.TryGetProperty("LaunchExecutable",out var launchValue)?launchValue.GetString():null;
   if(string.IsNullOrWhiteSpace(launch)||launch.Contains("://")||root.TryGetProperty("IsApplication",out var application)&&application.ValueKind==JsonValueKind.False||root.TryGetProperty("IsExecutable",out var executable)&&executable.ValueKind==JsonValueKind.False)return null;
   if(name.Length is 0 or >128||!Regex.IsMatch(id,"^[a-zA-Z0-9_.:-]{1,120}$")||!System.IO.Path.IsPathRooted(dir))return null;
   return new("epic:"+id,name,System.IO.Path.GetFullPath(dir));
  }catch{return null;}
 }
 public static Game Custom(string exe,string name,bool preferred=true)=>new("custom:"+Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(exe.ToLowerInvariant())))[..24].ToLowerInvariant(),name,System.IO.Path.GetDirectoryName(exe)!,System.IO.Path.GetFullPath(exe),preferred);
}
