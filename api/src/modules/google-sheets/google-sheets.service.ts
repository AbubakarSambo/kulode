import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private client: sheets_v4.Sheets | null = null;
  private credentials: { client_email: string; private_key: string } | null = null;
  // spreadsheetId -> set of tab names already confirmed to exist, so a hot sync loop doesn't
  // re-fetch spreadsheet metadata on every flush tick.
  private readonly knownTabs = new Map<string, Set<string>>();

  constructor(private config: ConfigService) {}

  private getCredentials() {
    if (this.credentials) return this.credentials;

    const credentialsBase64 = this.config.get<string>('googleSheets.credentialsBase64');
    if (!credentialsBase64) {
      throw new InternalServerErrorException('Google Sheets credentials are not configured');
    }

    this.credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf-8'));
    return this.credentials as { client_email: string; private_key: string };
  }

  /** The service account email orgs must share their Sheet with as Editor. */
  getServiceAccountEmail(): string {
    return this.getCredentials().client_email;
  }

  private getClient(): sheets_v4.Sheets {
    if (this.client) return this.client;

    const credentials = this.getCredentials();
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.client = google.sheets({ version: 'v4', auth });
    return this.client;
  }

  /** Appends one or more rows to the end of the given sheet tab (e.g. "Orders", "WalletTransactions"). */
  async appendRows(spreadsheetId: string, sheetName: string, rows: unknown[][]): Promise<void> {
    try {
      await this.getClient().spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
    } catch (error) {
      this.logger.error(`Failed to append to sheet "${sheetName}" (${spreadsheetId}): ${error}`);
      throw error;
    }
  }

  /** Reads a range back — used for connectivity checks and debugging. */
  async readRange(spreadsheetId: string, range: string): Promise<unknown[][]> {
    const response = await this.getClient().spreadsheets.values.get({ spreadsheetId, range });
    return response.data.values ?? [];
  }

  /**
   * Creates the tab (with a header row) if it doesn't already exist in the spreadsheet.
   * `values.append` never auto-creates tabs — it 400s on an unknown sheet name — so this must
   * run before the first append to a given tab. Cached per spreadsheet+tab for the process
   * lifetime since tabs, once created, don't disappear.
   */
  async ensureTabExists(spreadsheetId: string, tabName: string, headerRow: string[]): Promise<void> {
    const known = this.knownTabs.get(spreadsheetId);
    if (known?.has(tabName)) return;

    const client = this.getClient();
    const spreadsheet = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const existingTitles = new Set(
      (spreadsheet.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean),
    );

    if (!existingTitles.has(tabName)) {
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [headerRow] },
      });
      existingTitles.add(tabName);
    }

    this.knownTabs.set(spreadsheetId, existingTitles as Set<string>);
  }
}
