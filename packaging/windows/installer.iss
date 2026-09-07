; Inno Setup script for Research Workbench.
;
; Installs for the current user only, so students without administrator rights
; on an institutional machine can install it themselves.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\ResearchWorkbench"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif

#define AppName "Research Workbench"
#define AppId "{{8F4C2E17-9B3A-4D62-BE5F-6C1A0D7E4A92}"
#define Publisher "TheAliAhmadi"
#define AppUrl "https://github.com/TheAliAhmadi/News_Workshop"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#Publisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/issues
AppUpdatesURL={#AppUrl}/releases
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\ResearchWorkbench
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
OutputDir={#OutputDir}
OutputBaseFilename=ResearchWorkbench-{#AppVersion}-Windows-x64-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\ResearchWorkbench.exe
SetupIconFile=..\icons\workbench.ico
CloseApplications=yes
RestartApplications=no
LicenseFile=..\..\LICENSE

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\docs\student-guide.md"; DestDir: "{app}"; DestName: "Student guide.md"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\ResearchWorkbench.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ResearchWorkbench.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ResearchWorkbench.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Only application files are removed. Research data, settings, jobs, and
; downloaded models stay in the user's own directories.
Type: filesandordirs; Name: "{app}\_internal\__pycache__"

[Messages]
; Students are told plainly that uninstalling keeps their work.
ConfirmUninstall=Remove %1 from this computer?%n%nYour research files, settings, saved jobs, and downloaded models are kept.
