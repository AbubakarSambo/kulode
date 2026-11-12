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
  it('writes a BOM and CRLF rows', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('\ufeffa,b\r\n1,2\r\n');
  });
});
