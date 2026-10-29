import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('splits plain rows on commas', () => {
    expect(parseCsv('name,price\nRice,9000\n')).toEqual([
      ['name', 'price'],
      ['Rice', '9000'],
    ]);
  });

  it('keeps commas, escaped quotes and newlines inside quoted fields', () => {
    expect(parseCsv('name,price\n"Indomie Chicken, 70g",250\n"12"" Pizza",4000\n"Two\nLines",1')).toEqual([
      ['name', 'price'],
      ['Indomie Chicken, 70g', '250'],
      ['12" Pizza', '4000'],
      ['Two\nLines', '1'],
    ]);
  });

  it('handles CRLF line endings and skips blank lines', () => {
    expect(parseCsv('name,price\r\n\r\nRice,9000\r\n')).toEqual([
      ['name', 'price'],
      ['Rice', '9000'],
    ]);
  });

  it('strips a leading UTF-8 byte-order mark from Excel exports', () => {
    expect(parseCsv('﻿name,price\nRice,9000')[0]).toEqual(['name', 'price']);
  });
});
