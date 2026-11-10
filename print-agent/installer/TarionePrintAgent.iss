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
  PairedCode: String;

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

// Checks the code with Tarione before anything is installed, by running the agent's own
// pairing step from a temporary copy. On success the connection details are left in
// {tmp}\.env for the install step to put in place. Returns '' or the reason it failed.
function Pair(Code: String): String;
var
  ResultCode: Integer;
  Params: String;
  Reason: AnsiString;
begin
  Result := '';
  Code := Trim(Code);
  if Code = PairedCode then
    Exit;

  ExtractTemporaryFile('{#AppExe}');
  DeleteFile(ExpandConstant('{tmp}\pair-error.txt'));
  Params := '--pair "' + Code + '"';
  if ExpandConstant('{param:API|}') <> '' then
    Params := Params + ' --api "' + ExpandConstant('{param:API|}') + '"';

  if Exec(ExpandConstant('{tmp}\{#AppExe}'), Params, ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode)
    and (ResultCode = 0) and FileExists(ExpandConstant('{tmp}\.env')) then
  begin
    PairedCode := Code;
    Exit;
  end;

  Result := 'The agent could not connect to Tarione.';
  if LoadStringFromFile(ExpandConstant('{tmp}\pair-error.txt'), Reason) and (Trim(String(Reason)) <> '') then
    Result := Trim(String(Reason));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Problem: String;
begin
  Result := True;
  if (CurPageID <> PairPage.ID) or WizardSilent() then
    Exit;

  if Trim(PairPage.Values[0]) = '' then
  begin
    if not AlreadyConnected() then
    begin
      MsgBox('Please type the pairing code from Settings > Printers in Tarione.', mbError, MB_OK);
      Result := False;
    end;
    Exit;
  end;

  Problem := Pair(PairPage.Values[0]);
  if Problem <> '' then
  begin
    MsgBox(Problem + #13#10#13#10 + 'Check the code and try again, or get a new one from Settings > Printers.', mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  // Unattended installs skip the wizard pages, so the code is checked here instead. A
  // returned message stops the install before anything is copied.
  if Trim(PairPage.Values[0]) <> '' then
    Result := Pair(PairPage.Values[0])
  else if not AlreadyConnected() then
    Result := 'A pairing code is required. Get one from Settings > Printers in Tarione.';

  // An agent from an earlier install would hold the program file open.
  if Result = '' then
    StopAgent();
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep <> ssPostInstall then
    Exit;

  if PairedCode <> '' then
    FileCopy(ExpandConstant('{tmp}\.env'), ExpandConstant('{app}\.env'), False);

  Exec(ExpandConstant('{app}\{#AppExe}'), '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
end;
