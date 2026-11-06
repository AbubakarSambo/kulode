// "Save as PDF" in the browser's print dialog suggests document.title as the filename, which is
// just "Tari1" for the whole app. Swap in a descriptive title for the duration of the print.

const UNSAFE_IN_FILENAMES = /[\\/:*?"<>|]/g

export function printWithTitle(title: string) {
  const previous = document.title
  document.title = title.replace(UNSAFE_IN_FILENAMES, '-')
  window.addEventListener('afterprint', () => (document.title = previous), { once: true })
  window.print()
}

/** "Living Room - Sales Report - 2026-11-05" or "... - 2026-11-01 to 2026-11-05" for a range. */
export function reportFileTitle(orgName: string | undefined, report: string, from: string, to: string) {
  return [orgName, report, from === to ? from : `${from} to ${to}`].filter(Boolean).join(' - ')
}
