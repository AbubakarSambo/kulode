; Installer for the Tarione print agent. Built by .github/workflows/print-agent.yml with
; Inno Setup 6:  iscc /DAppVersion=1.1.0 installer\TarionePrintAgent.iss
;
; It installs for the current Windows user only, so it never asks for an administrator
; password. It asks for the pairing code from Settings > Printers, connects the agent to
; that organization, and sets it to start (with no window) every time this user signs in.
;
; Unattended install, used by the automated test:
;   TarionePrintAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /PAIR=ABCD-2345 [/API=https://.../api/v1]

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Tarione Print Agent"
#define AppExe "TarionePrintAgent.exe"

[Setup]
AppId={{6A0E6C0B-6C1B-4E0B-9C59-7B0F4D2C8A11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Tarione
DefaultDirName={localappdata}\Programs\Tarione Print Agent
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
OutputDir=..\dist
OutputBaseFilename=TarionePrintAgentSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
UninstallDisplayName={#AppName}

[Files]
Source: "..\dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; Start with Windows, for this user. No Task Scheduler entry and no administrator rights needed.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TarionePrintAgent"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM {#AppExe}"; Flags: runhidden; RunOnceId: "StopAgent"

[UninstallDelete]
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\agent.log"
Type: files; Name: "{app}\agent.log.1"
Type: files; Name: "{app}\pair-error.txt"

[Messages]
FinishedHeadingLabel=The print agent is running
FinishedLabelNoIcons=Go back to Tarione and open Settings > Printers. It should say "Agent online" within a minute.%n%nThen press "Test print" on a printer to check it prints.%n%nThe agent starts by itself whenever this computer is turned on and signed in. There is nothing to open and no window to keep open.
FinishedLabel=Go back to Tarione and open Settings > Printers. It should say "Agent online" within a minute.%n%nThen press "Test print" on a printer to check it prints.%n%nThe agent starts by itself whenever this computer is turned on and signed in. There is nothing to open and no window to keep open.

[Code]
var
  PairPage: TInputQueryWizardPage;

function AlreadyConnected(): Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\Programs\Tarione Print Agent\.env'));
end;

procedure StopAgent();
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#AppExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure InitializeWizard();
var
  Hint: String;
begin
  Hint := 'In Tarione, open Settings > Printers and click "Connect a computer". Type the code it shows you here.';
  if AlreadyConnected() then
    Hint := Hint + #13#10#13#10 + 'This computer is already connected. Leave the box empty to keep that connection.';
  PairPage := CreateInputQueryPage(wpWelcome, 'Connect to Tarione', 'Enter your pairing code', Hint);
  PairPage.Add('Pairing code:', False);
  PairPage.Values[0] := ExpandConstant('{param:PAIR|}');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PairPage.ID) and (Trim(PairPage.Values[0]) = '') and (not AlreadyConnected()) then
  begin
    MsgBox('Please type the pairing code from Settings > Printers in Tarione.', mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  // An agent from an earlier install would hold the program file open.
  StopAgent();
  Result := '';
end;

function PairErrorMessage(): String;
var
  Contents: AnsiString;
begin
  Result := 'The agent could not connect to Tarione.';
  if LoadStringFromFile(ExpandConstant('{app}\pair-error.txt'), Contents) and (Trim(String(Contents)) <> '') then
    Result := Trim(String(Contents));
end;

// Runs the agent's own pairing step, asking again for as long as the code is rejected.
function Pair(Code: String): Boolean;
var
  ResultCode: Integer;
  Params: String;
begin
  Result := False;
  while True do
  begin
    Params := '--pair "' + Trim(Code) + '"';
    if ExpandConstant('{param:API|}') <> '' then
      Params := Params + ' --api "' + ExpandConstant('{param:API|}') + '"';

    if Exec(ExpandConstant('{app}\{#AppExe}'), Params, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode)
      and (ResultCode = 0) then
    begin
      Result := True;
      Exit;
    end;

    if WizardSilent() then
    begin
      Log('Pairing failed: ' + PairErrorMessage());
      Exit;
    end;

    Code := '';
    if not InputQuery('Could not connect', PairErrorMessage() + #13#10#13#10 + 'Type the pairing code again (or get a new one from Settings > Printers):', Code) then
      Exit;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Connected: Boolean;
begin
  if CurStep <> ssPostInstall then
    Exit;

  Connected := AlreadyConnected();
  if Trim(PairPage.Values[0]) <> '' then
    Connected := Pair(PairPage.Values[0]) or Connected;

  if Connected then
    Exec(ExpandConstant('{app}\{#AppExe}'), '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode)
  else if not WizardSilent() then
    MsgBox('The print agent is installed but not connected to Tarione, so it will not print yet.' + #13#10#13#10 + 'Run this installer again with a pairing code from Settings > Printers.', mbError, MB_OK);
end;
