using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;
namespace Onyx.Activity;
static class WindowsGames {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr handle,int flags,StringBuilder name,ref int size);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out int pid);
 public static int Foreground {get{GetWindowThreadProcessId(GetForegroundWindow(),out var id);return id;}}
 public static List<RunningApp> Processes(){
  var list=new List<RunningApp>();int session=Process.GetCurrentProcess().SessionId;
  foreach(var process in Process.GetProcesses())using(process)try{
   if(process.SessionId!=session)continue;
   var handle=OpenProcess(0x1000,false,process.Id);if(handle==IntPtr.Zero)continue;
   try{var path=new StringBuilder(32768);int size=path.Capacity;if(!QueryFullProcessImageName(handle,0,path,ref size))continue;
    var file=path.ToString();if(Detection.IsHelper(file))continue;
    DateTimeOffset? start=null;try{start=new DateTimeOffset(process.StartTime.ToUniversalTime());}catch{}
    list.Add(new(process.Id,file,start));
   }finally{CloseHandle(handle);}
  }catch{}
  return list;
 }
 public static List<Game> Catalog(){
  var games=new List<Game>();var libraries=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  var steam=Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam","SteamPath",null) as string;
  if(steam!=null){libraries.Add(Path.Combine(steam,"steamapps"));try{foreach(Match m in Regex.Matches(File.ReadAllText(Path.Combine(steam,"steamapps","libraryfolders.vdf")),"\"path\"\\s*\"([^\"]+)\""))libraries.Add(Path.Combine(m.Groups[1].Value.Replace("\\\\","\\"),"steamapps"));}catch{}}
  foreach(var library in libraries)try{foreach(var file in Directory.EnumerateFiles(library,"appmanifest_*.acf")){try{var g=Detection.SteamManifest(File.ReadAllText(file),library);if(g!=null)games.Add(g);}catch{}}}catch{}
  var manifests=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"Epic","EpicGamesLauncher","Data","Manifests");
  try{foreach(var file in Directory.EnumerateFiles(manifests,"*.item")){try{var g=Detection.EpicManifest(File.ReadAllText(file));if(g!=null)games.Add(g);}catch{}}}catch{}
  // Windows registers games known to Game Bar; exact executable matches work across launchers.
  using var bar=Registry.CurrentUser.OpenSubKey(@"System\GameConfigStore\Children");
  if(bar!=null)foreach(var child in bar.GetSubKeyNames())try{using var entry=bar.OpenSubKey(child);var exe=entry?.GetValue("MatchedExeFullPath") as string;if(exe==null||!File.Exists(exe)||Detection.IsHelper(exe))continue;var title=FileVersionInfo.GetVersionInfo(exe).FileDescription??Path.GetFileNameWithoutExtension(exe);games.Add(Detection.Custom(exe,title,false));}catch{}
  // GOG installations include their canonical title and launch executable in the registry.
  foreach(var hive in new[]{RegistryHive.LocalMachine,RegistryHive.CurrentUser})foreach(var view in new[]{RegistryView.Registry32,RegistryView.Registry64})try{
   using var root=RegistryKey.OpenBaseKey(hive,view);using var gog=root.OpenSubKey(@"SOFTWARE\GOG.com\Games");if(gog==null)continue;
   foreach(var id in gog.GetSubKeyNames())try{using var entry=gog.OpenSubKey(id);var dir=entry?.GetValue("path") as string;var title=entry?.GetValue("gameName") as string;var exe=entry?.GetValue("exe") as string;if(dir!=null&&title!=null)games.Add(new("gog:"+id,title,Path.GetFullPath(dir),exe!=null&&File.Exists(exe)?exe:null));}catch{}
  }catch{}
  return games.DistinctBy(g=>g.Key).ToList();
 }
}
