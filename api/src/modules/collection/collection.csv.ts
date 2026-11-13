// Payroll opens this in Excel, so a staff name starting with = + - or @ must not become a formula.
export function csvCell(value: string | number): string {
  let text = String(value);
  // A bare phone number ("+2348031234569") starts with + but is only digits, so it cannot be a formula.
  const isPhone = typeof value === 'string' && /^\+\d{6,15}$/.test(text);
  if (typeof value === 'string' && !isPhone && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  // BOM so Excel reads the naira figures and any accented names as UTF-8.
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
