using System.Runtime.InteropServices;
using System.Text.Json;
namespace Onyx.Activity;
sealed class SecureSettings {
 public string? Token{get;set;} public bool Enabled{get;set;}=true; public List<Game> CustomGames{get;set;}=[];
 static readonly string FilePath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ONYX","activity.dat");
 [StructLayout(LayoutKind.Sequential)] struct Blob {public int Length;public IntPtr Data;}
 [DllImport("crypt32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CryptProtectData(ref Blob input,string? description,IntPtr entropy,IntPtr reserved,IntPtr prompt,int flags,out Blob output);
 [DllImport("crypt32.dll",SetLastError=true)] static extern bool CryptUnprotectData(ref Blob input,IntPtr description,IntPtr entropy,IntPtr reserved,IntPtr prompt,int flags,out Blob output);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
 internal static byte[] Protect(byte[] data,bool encrypt){
  var input=new Blob{Length=data.Length,Data=Marshal.AllocHGlobal(data.Length)};Marshal.Copy(data,0,input.Data,data.Length);
  try{Blob output;bool ok=encrypt?CryptProtectData(ref input,"ONYX Activity",IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,1,out output):CryptUnprotectData(ref input,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,1,out output);if(!ok)throw new InvalidOperationException("Windows data protection failed");
   try{var result=new byte[output.Length];Marshal.Copy(output.Data,result,0,result.Length);return result;}finally{LocalFree(output.Data);}
  }finally{Marshal.FreeHGlobal(input.Data);}
 }
 public static SecureSettings Load(){try{return JsonSerializer.Deserialize<SecureSettings>(Protect(File.ReadAllBytes(FilePath),false))??new();}catch{return new();}}
 public void Save(){Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);var bytes=Protect(JsonSerializer.SerializeToUtf8Bytes(this),true);File.WriteAllBytes(FilePath+".tmp",bytes);File.Move(FilePath+".tmp",FilePath,true);}
}
