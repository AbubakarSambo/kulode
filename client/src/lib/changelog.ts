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
  '1.1.1': {
    version: '1.1.1',
    title: 'The AI Chat Polish Update',
    date: '2026-06-30',
    type: 'patch',
    features: [
      {
        title: 'Bulletproof Layouts',
        description: 'Enhanced the AI chat interface with a new responsive design that ensures charts and metrics look perfect on any screen size without overlapping.',
        tag: 'UI Polish',
      },
      {
        title: 'Accidental Deletion Protection',
        description: 'Added a safety confirmation dialog when deleting chat threads to prevent accidental loss of your important data insights.',
        tag: 'Stability',
      },
      {
        title: 'Streamlined Navigation',
        description: 'Reorganized the sidebar menu to group reporting tools together logically and removed clutter to keep your workspace focused.',
        tag: 'UI Polish',
      },
      {
        title: 'Reliable AI Responses',
        description: 'Upgraded the backend AI processor to guarantee flawless data formatting, ensuring reports always load perfectly without technical glitches.',
        tag: 'Stability',
      },
    ],
  },
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
