using System.Diagnostics;
using System.Text;
using System.Text.Json;
namespace Onyx.Activity;
static class NativeChecks {
 public static void Run(string[] args){
  var plain=Encoding.UTF8.GetBytes("synthetic-device-credential");var encrypted=SecureSettings.Protect(plain,true);
  if(encrypted.SequenceEqual(plain)||!SecureSettings.Protect(encrypted,false).SequenceEqual(plain))throw new Exception("DPAPI failed");
  var watch=Stopwatch.StartNew();var processes=WindowsGames.Processes();watch.Stop();
  bool detected=true;
  var fixture=args.SkipWhile(v=>v!="--fixture-path").Skip(1).FirstOrDefault();
  if(fixture!=null)detected=Detection.Find(processes,[Detection.Custom(Path.GetFullPath(fixture),"Synthetic game")],0)!=null;
  if(!detected)throw new Exception("Real process detection failed");
  object? runningGame=null;
  var requested=args.SkipWhile(v=>v!="--check-running-game").Skip(1).FirstOrDefault();
  if(requested!=null){
   var found=Detection.Find(processes,WindowsGames.Catalog().Where(g=>g.Name.Equals(requested,StringComparison.OrdinalIgnoreCase)),0);
   if(found==null)throw new Exception("Requested real game not detected");
   var artwork=GameArtwork.Read(found);if(artwork==null)throw new Exception("Real game icon missing");
   var iconPath=args.SkipWhile(v=>v!="--icon-output").Skip(1).FirstOrDefault();if(iconPath!=null)File.WriteAllBytes(iconPath,Convert.FromBase64String(artwork));
   runningGame=new{name=found.Game.Name,key=found.Game.Key,executable=Path.GetFileName(found.Executable),artworkBytes=Convert.FromBase64String(artwork).Length};
  }
  // No network or real account data: only render a fresh settings instance.
  ApplicationConfiguration.Initialize();using var form=new ActivityWindow(new SecureSettings());form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-32000,-32000);form.Opacity=0;form.Show();Application.DoEvents();form.PerformLayout();
  var png=args.SkipWhile(v=>v!="--render").Skip(1).FirstOrDefault();
  if(png!=null){using var bitmap=new Bitmap(form.Width,form.Height);form.DrawToBitmap(bitmap,new Rectangle(0,0,form.Width,form.Height));bitmap.Save(png);}
  var report=new{dpapi=true,processDetection=detected,runningGame,scanMilliseconds=watch.Elapsed.TotalMilliseconds,visibleProcessCount=processes.Count,peakWorkingSetMiB=Process.GetCurrentProcess().PeakWorkingSet64/1048576,networkRequests=0};
  var output=args.SkipWhile(v=>v!="--report").Skip(1).FirstOrDefault();if(output!=null)File.WriteAllText(output,JsonSerializer.Serialize(report));
 }
}
