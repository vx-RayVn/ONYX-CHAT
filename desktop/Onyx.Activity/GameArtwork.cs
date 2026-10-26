using System.Drawing.Imaging;
using System.Runtime.InteropServices;
namespace Onyx.Activity;
static class GameArtwork {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHDefExtractIcon(string file,int index,uint flags,out IntPtr large,out IntPtr small,uint size);
 [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
 static readonly Dictionary<string,string?> Cache=new(StringComparer.OrdinalIgnoreCase);
 public static string? Read(DetectedGame game){
  if(game.Game.Key.StartsWith("steam:")||game.Executable==null)return null;
  var path=game.Executable;if(Cache.TryGetValue(path,out var cached))return cached;
  string? result=null;IntPtr large=IntPtr.Zero,small=IntPtr.Zero;
  try{
   // Reads embedded artwork without starting the executable or sending its path.
   if(!path.StartsWith(@"\\")&&SHDefExtractIcon(path,0,0,out large,out small,96)==0&&large!=IntPtr.Zero){
    using var icon=Icon.FromHandle(large);using var bitmap=new Bitmap(96,96,PixelFormat.Format32bppArgb);
    using(var graphics=Graphics.FromImage(bitmap)){graphics.Clear(Color.Transparent);graphics.DrawIcon(icon,new Rectangle(0,0,96,96));}
    using var stream=new MemoryStream();bitmap.Save(stream,ImageFormat.Png);if(stream.Length<=32768)result=Convert.ToBase64String(stream.ToArray());
   }
  }catch{}finally{if(large!=IntPtr.Zero)DestroyIcon(large);if(small!=IntPtr.Zero)DestroyIcon(small);}
  if(Cache.Count>=64)Cache.Clear();Cache[path]=result;return result;
 }
}
