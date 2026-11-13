import { csvCell, toCsv } from './collection.csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Ada, O')).toBe('"Ada, O"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
  });
  it('leaves a bare phone number readable but still defuses anything else starting with +', () => {
    expect(csvCell('+2348031234569')).toBe('+2348031234569');
    expect(csvCell('+1 (650) 253-0000')).toBe("'+1 (650) 253-0000");
    expect(csvCell('+2348031234569+A1')).toBe("'+2348031234569+A1");
    expect(csvCell('+CMD|calc')).toBe("'+CMD|calc");
  });
  it('writes a BOM and CRLF rows', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('\ufeffa,b\r\n1,2\r\n');
  });
});
