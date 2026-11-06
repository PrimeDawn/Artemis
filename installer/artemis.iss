; Artemis Windows 安装包（逐用户、免提权）。依据 writer/plan.html §3.1 / §3.4。
; 编译：ISCC.exe /DMyAppVersion=0.1.0 installer\artemis.iss

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#define MyAppName "Artemis"
#define MyAppPublisher "Artemis"
#define MyAppUrl "https://github.com/PrimeDawn/Artemis"
#define MyAppExeName "Artemis.exe"
#define FilterClsid "{7E1F3A10-2C4B-4D8E-9A55-3F0C1B7D9E21}"

[Setup]
AppId={{9E1B2C44-7F3A-4C21-9B77-2A5D6C8E1F30}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}
AppUpdatesURL={#MyAppUrl}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; 过滤器只注册到 HKCU，整个安装不需要管理员权限。
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename={#MyAppName}-Setup-{#MyAppVersion}
SetupIconFile=..\native\tray\Artemis.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
LicenseFile=..\LICENSE
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; 注册 DirectShow 过滤器（逐用户 HKCU，无需提权）。
Filename: "{sys}\regsvr32.exe"; Parameters: "/s ""{app}\app\native\ArtemisCamera.dll"""; StatusMsg: "正在注册 Artemis Camera..."; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
// TC-09 暴露的缺陷：卸载器先删文件、后跑 [UninstallRun]，正在运行的 Artemis.exe 与它
// 加载的 FFmpeg DLL 被占用，删除失败后残留在安装目录。改为在 usUninstall 阶段
// （文件删除之前）显式停进程、反注册、留出句柄释放时间。
procedure StopArtemisProcesses();
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // 子进程在同一个 Job 里，随托盘一起退出；给系统一点时间释放文件句柄。
  Sleep(1500);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    StopArtemisProcesses();
    Exec(ExpandConstant('{sys}\regsvr32.exe'),
         '/s /u "' + ExpandConstant('{app}\app\native\ArtemisCamera.dll') + '"', '',
         SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[UninstallDelete]
; 程序目录整体删除；用户数据目录（%LOCALAPPDATA%\Artemis\data）刻意保留。
Type: filesandordirs; Name: "{app}"
