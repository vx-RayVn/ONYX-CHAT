using Onyx.Activity;
if(args.Contains("--fixture")){Thread.Sleep(60000);return;}
int count=0;void Check(bool ok,string name){if(!ok)throw new Exception(name);Console.WriteLine("PASS "+name);count++;}
var manifest="\"appid\" \"730\" \"name\" \"Counter-Strike 2\" \"installdir\" \"Counter-Strike Global Offensive\"";
var steam=Detection.SteamManifest(manifest,@"C:\Steam\steamapps")!;
Check(steam.Key=="steam:730"&&steam.Name=="Counter-Strike 2","Steam canonical title/id");
Check(Detection.SteamManifest(manifest.Replace("Counter-Strike Global Offensive","..\\other"),@"C:\Steam\steamapps")==null,"reject manifest path traversal");
var game=new Game("steam:730","Counter-Strike 2",@"C:\Games\CS2");
var apps=new[]{new RunningApp(1,@"C:\Games\CS2\game\cs2.exe"),new RunningApp(2,@"C:\Games\CS2\CrashReportClient.exe"),new RunningApp(3,@"C:\Games\CS2-other\bad.exe")};
Check(Detection.Find(apps,[game],2)?.Pid==1,"ignore crash helper and path prefix collision");
Check(Detection.Find([apps[2]],[game],3)==null,"folder boundary");
var custom=Detection.Custom(@"C:\Other\mygame.exe","My game");
Check(Detection.Find([new(4,@"C:\Other\mygame.exe")],[custom],4)?.Game.Name=="My game","custom exact executable, any launcher");
Check(Detection.Find([new(4,@"C:\Other\editor.exe")],[custom],4)==null,"custom registration does not classify sibling apps");
var second=new Game("custom:test","Second",@"C:\Second");var multiple=apps.Append(new(5,@"C:\Second\game.exe"));
Check(Detection.Find(multiple,[game,second],5)?.Pid==5,"foreground game priority");
Check(Detection.Find(multiple,[game,second],99,5)?.Pid==5,"keep background game when focus leaves");
Check(Detection.EpicManifest("{\"AppName\":\"abc\",\"DisplayName\":\"Epic Game\",\"InstallLocation\":\"C:\\\\Games\\\\Epic\",\"LaunchExecutable\":\"game.exe\"}")?.Name=="Epic Game","Epic installed manifest");
Check(Detection.IsHelper(@"C:\Game\EasyAntiCheat_EOS.exe"),"anti-cheat never a game");
Check(Detection.Find([], [game],0)==null,"game exit clears detection");
var epicBase="{\"AppName\":\"Fortnite\",\"DisplayName\":\"Fortnite\",\"InstallLocation\":\"C:\\\\Games\\\\Fortnite\",\"LaunchExecutable\":\"FortniteGame/Binaries/Win64/FortniteBootstrapper.exe\"}";
Check(Detection.EpicManifest(epicBase.Replace("FortniteGame/Binaries/Win64/FortniteBootstrapper.exe",""))==null,"DLC without launch executable is not a separate game");
Check(Detection.EpicManifest(epicBase.Replace("\"AppName\"","\"IsApplication\":false,\"AppName\""))==null,"Epic add-on is excluded even when sharing the main directory");
Check(Detection.Find([new(10,@"C:\Games\Fortnite\FortniteClient-Win64-Shipping.exe")],[Detection.EpicManifest(epicBase)!],10)?.Game.Name=="Fortnite","Fortnite keeps its base game name");
Check(Detection.IsHelper(@"C:\Game\FortniteBootstrapper.exe")&&Detection.IsHelper(@"C:\Game\FortniteLauncher.exe"),"Fortnite bootstrap and launcher are excluded");
Check(Detection.IsHelper(@"C:\Game\FortniteClient-Win64-Shipping_EAC_EOS.exe")&&Detection.IsHelper(@"C:\Game\FortniteClient-Win64-Shipping_BE.exe"),"anti-cheat wrappers cannot supply the game icon");
Check(Detection.Find([new(11,@"C:\Games\CS2\game\cs2.exe")],[game,Detection.Custom(@"C:\Games\CS2\game\cs2.exe","My chosen name")],11)?.Game.Name=="My chosen name","explicit executable registration wins over a folder match");
Check(Detection.Find([new(11,@"C:\Games\CS2\game\cs2.exe")],[game,Detection.Custom(@"C:\Games\CS2\game\cs2.exe","Windows file description",false)],11)?.Game.Key=="steam:730","Windows discovery keeps the canonical Steam identity and artwork");
Console.WriteLine($"{count}/{count} native detection checks passed");
