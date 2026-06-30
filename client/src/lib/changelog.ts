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
  '1.1.3': {
    version: '1.1.3',
    title: 'Mobile Navigation Polish & Icon Alignment',
    date: '2026-06-30',
    type: 'minor',
    features: [
      {
        title: 'Hugeicons Mobile Consistency',
        description: 'Replaced all mobile navigation Lucide icons with custom Hugeicons, aligning them perfectly with the desktop experience.',
        tag: 'UI Polish',
      },
      {
        title: 'AI Chat and Platform Admin Routes on Mobile',
        description: 'Added missing AI Chat route to mobile Operations grid, creating a balanced 3x3 layout, and added Platform Admin entry at the bottom drawer if authorized.',
        tag: 'New Feature',
      },
      {
        title: 'Safe-Area Layout & iOS Viewport Fixes',
        description: 'Updated container heights to use dynamic viewport units (dvh) and fixed broken Tailwind CSS safe-area-inset calculations that caused elements to overlap on Safari.',
        tag: 'Stability',
      },
    ],
  },
  '1.1.2': {
    version: '1.1.2',
    title: 'Advanced AI Data Viz & Chat Organization',
    date: '2026-06-30',
    type: 'minor',
    features: [
      {
        title: 'Temporal Grouping for Chat History',
        description: 'Tired of endless scrolling? Chat threads are now intelligently grouped by date (Today, Yesterday, Previous 7 Days, etc.), making it effortless to find your past analyses.',
        tag: 'UI Polish',
      },
      {
        title: 'Multi-Series Charts',
        description: 'The AI can now generate advanced Stacked Bar Charts and Multi-Line Charts, giving you deep comparative insights into month-over-month product sales and more.',
        tag: 'New Feature',
      },
      {
        title: 'Expansive Chat Layout',
        description: 'We dramatically widened the AI Chat interface to take full advantage of desktop screens, giving your data visualizations the breathing room they deserve.',
        tag: 'UI Polish',
      },
    ],
  },
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
