export interface ChangelogFeature {
  title: string
  description: string
  tag: string
}

export interface ChangelogEntry {
  version: string
  title: string
  date: string
  type: 'major' | 'minor' | 'patch'
  features: ChangelogFeature[]
}

export const changelogData: Record<string, ChangelogEntry> = {
  '1.1.0': {
    version: '1.1.0',
    title: 'The Automation & Performance Release',
    date: '2026-06-29',
    type: 'minor',
    features: [
      {
        title: 'Automated Reminders',
        description: 'Tari now automatically sends friendly payment reminders to clients before invoices expire, helping you get paid up to 5 days faster.',
        tag: 'New Feature',
      },
      {
        title: 'High-Speed Ledgers',
        description: 'We optimized backend indexes. Invoice lists now load up to 3x faster, even for organizations with high transaction volumes.',
        tag: 'Performance',
      },
      {
        title: 'Smarter Validation Checks',
        description: 'Real-time fields validation now guards invoice creation pages, catching formatting mistakes before they leave your dashboard.',
        tag: 'Security',
      },
    ],
  },
}
