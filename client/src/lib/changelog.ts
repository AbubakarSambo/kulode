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
  '1.3.0': {
    version: '1.3.0',
    date: '2026-07-26',
    title: 'Restaurant POS — Tables, Menu, Orders & Shifts',
    type: 'minor',
    features: [
      {
        title: 'Restaurant Point of Sale',
        description: 'Take dine-in, takeaway, delivery, and third-party orders from a new Restaurant POS section — manage your menu and categories, seat and track tables in real time, and send orders straight to the kitchen.',
        tag: 'New Feature',
      },
      {
        title: 'Flexible Order Payments',
        description: 'Close out an order with cash, bank transfer, card, or a Paystack checkout link, and print or download a receipt the moment it settles.',
        tag: 'New Feature',
      },
      {
        title: 'Works Through Connectivity Drops',
        description: 'Orders taken while your connection is down are saved on the device and sent automatically the moment you\'re back online — no lost orders during a power or network outage.',
        tag: 'New Feature',
      },
      {
        title: 'Shift & Till Reconciliation',
        description: 'Open a shift with a starting cash float and close it by counting the till — Tari1 shows you the expected cash total and flags any variance automatically.',
        tag: 'New Feature',
      },
    ],
  },
  '1.2.2': {
    version: '1.2.2',
    date: '2026-07-03',
    title: 'Modern Segmented Stepper, Interactive Navigation & Clear Session Cache',
    type: 'patch',
    features: [
      {
        title: 'Modern Segmented Stepper',
        description: 'Replaced the circle-and-line stepper with a sleek, minimalist progress pill bar layout (Concept A) at the top of the card. Completed steps show green or warning amber pills with micro-sized check/exclamation indicators, active step is highlighted in primary blue, and upcoming steps are grey.',
        tag: 'New Feature',
      },
      {
        title: 'Interactive Progress Bar',
        description: 'Previously completed or warning onboarding steps are now clickable segments, allowing you to jump back directly to edit details without clicking "Back" multiple times.',
        tag: 'UI Polish',
      },
      {
        title: 'Clear Session Cache on Logout',
        description: 'Fixed session pollution by clearing the global React Query cache on logout. This prevents outstanding balances or onboarding checklist progress from a previous session from displaying when logging in as a new user.',
        tag: 'Stability',
      },
    ],
  },
  '1.2.1': {
    version: '1.2.1',
    date: '2026-07-02',
    title: 'PDF Invoice Footer — Logo Centered, Brand Tagline & URL',
    type: 'patch',
    features: [
      {
        title: 'PDF Logo Properly Centered',
        description: 'Fixed the Tari1 logo alignment in downloaded invoices. It was pinned to the left margin due to a PDFKit bug — now uses the fit+align technique to centre correctly across the full page width.',
        tag: 'Stability',
      },
      {
        title: 'New Footer Tagline',
        description: 'Replaced "Powered by Tari1" with the new brand message: "Built with Tari1: Work smarter, stay organized. · tarione.com" — concise, memorable, and includes the website URL for discoverability.',
        tag: 'UI Polish',
      },
      {
        title: 'Report PDF Footer Updated',
        description: 'Financial report PDFs now also show the updated "Built with Tari1 · tarione.com" attribution, consistent with the invoice footer.',
        tag: 'UI Polish',
      },
    ],
  },
  '1.2.0': {
    version: '1.2.0',
    date: '2026-07-02',
    title: 'PDF Footer Polish, WhatsApp Contact Picker & Billing Card Spacing',
    type: 'minor',
    features: [
      {
        title: 'PDF Footer — Catchy Brand Tagline',
        description: 'Replaced "Powered by Tari1" with a more memorable message: "Invoice beautifully managed by Tari — Built for Nigerian businesses." Logo is now properly centred using PDFKit\'s align option instead of a hardcoded X offset.',
        tag: 'UI Polish',
      },
      {
        title: 'WhatsApp — Contact Picker Fallback',
        description: 'When a client has no phone number saved, WhatsApp now opens with the message pre-filled and lets you choose from your existing contacts. The old approach (api.whatsapp.com/send with no phone) showed a "number not available" error — this is now fixed by using wa.me/?text= which opens the share picker.',
        tag: 'Stability',
      },
      {
        title: 'Billing Items Card Spacing Improved',
        description: 'Increased padding inside each line item card (p-5/p-6), gap between cards (space-y-4), and internal field gap (gap-5) for a more breathable, scannable layout on both mobile and desktop.',
        tag: 'UI Polish',
      },
    ],
  },
  '1.1.9': {
    version: '1.1.9',
    date: '2026-07-02',
    title: 'Onboarding UX Overhaul — Resume, Links & Step Tracking',
    type: 'patch',
    features: [
      {
        title: 'Add Item Auto-Focus & Expand',
        description: 'Adding a new billing line item now automatically collapses advanced settings and opens the new card in focus on mobile.',
        tag: 'UI Polish',
      },
      {
        title: 'Advanced Settings Accordion Exclusivity',
        description: 'Opening the Advanced Settings (VAT, Discount, Terms) now collapses all open line item cards so you can see the section clearly.',
        tag: 'UI Polish',
      },
      {
        title: 'Desktop Billing Items Layout Fixed',
        description: 'Removed duplicate column header row from web view; field labels now always appear above inputs for clean, scannable layout on both mobile and desktop.',
        tag: 'UI Polish',
      },
      {
        title: 'Payment Link Domain Fixed',
        description: 'WhatsApp, Copy Link and PDF now correctly resolve to your current domain (localhost in dev, app.tarione.com in production). The hardcoded pay.tarione.com fallback has been removed.',
        tag: 'Stability',
      },
      {
        title: 'PDF FRONTEND_URL Configuration',
        description: 'Added FRONTEND_URL to api/.env so PDF-generated payment links resolve correctly in local development.',
        tag: 'Stability',
      },
      {
        title: 'Onboarding Resume Now Restores Progress',
        description: 'Resuming setup from the dashboard now returns you to your last active step, not step 1. Your form data (client details, billing items, bank info) is preserved across sessions.',
        tag: 'Stability',
      },
      {
        title: 'Step Progress Colour Coding',
        description: 'The onboarding step tracker now shows green pills for completed steps, blue for the active step, and grey for upcoming steps — making it clear exactly where you are in the setup.',
        tag: 'UI Polish',
      },
    ],
  },
  '1.1.8': {
    version: '1.1.8',
    title: 'Onboarding Celebration Replay Link Removal & Link Auditing',
    date: '2026-07-02',
    type: 'patch',
    features: [
      {
        title: 'Replay Action Removal',
        description: 'Removed the Replay link and separator from the footer of the onboarding milestone completion screen.',
        tag: 'UI Polish',
      },
      {
        title: 'Environment-Aware Public Redirects',
        description: 'Audited and verified public sharing links to resolve correctly to local address in development and production checkout in deployment.',
        tag: 'Stability',
      },
    ],
  },
  '1.1.7': {
    version: '1.1.7',
    title: 'Payout Card Style Alignments & Celebration Screen Action Hierarchy',
    date: '2026-07-02',
    type: 'patch',
    features: [
      {
        title: 'Premium Card Style propagation',
        description: 'Updated Payout Bank and Invoice Preview card shadows, borders, and corner radius to align with DESIGN.md rules.',
        tag: 'UI Polish',
      },
      {
        title: 'Payout Verify Button Wrapping Fix',
        description: 'Added min-w-0 to the account number input field to prevent it from pushing Verify button out of container view on mobile devices.',
        tag: 'Stability',
      },
      {
        title: 'Celebration Navigation Links',
        description: 'Changed Go to Dashboard from a button into a clean text link in the footer to keep WhatsApp sharing as the prominent call-to-action.',
        tag: 'UI Polish',
      },
    ],
  },
  '1.1.6': {
    version: '1.1.6',
    title: 'Onboarding Web Full-Screen Experience & Card Layout Polishing',
    date: '2026-07-02',
    type: 'patch',
    features: [
      {
        title: 'Full-Screen Layout on Web',
        description: 'Migrated onboarding stepper and celebration screens to full-screen page layouts on desktop, removing tight centered modal constraints.',
        tag: 'UI Polish',
      },
      {
        title: 'Desktop Row Layout Alignments',
        description: 'Fixed Step 3 cards crushing on desktop by keeping cards always expanded and hiding inline label headers.',
        tag: 'Stability',
      },
      {
        title: 'Premium Card Shadows & Rounded Corners',
        description: 'Updated Step 3 card borders, rounded corners, and shadows to align with DESIGN.md premium styling rules.',
        tag: 'UI Polish',
      },
      {
        title: 'Onboarding Resume Setup Step Tracking',
        description: 'Corrected the resume setup target step mapping to correctly load the saved active step from local storage instead of forcing step 1.',
        tag: 'Stability',
      },
    ],
  },
  '1.1.5': {
    version: '1.1.5',
    title: 'Mobile Onboarding Header Icons & Celebration Screen Refinement',
    date: '2026-07-01',
    type: 'patch',
    features: [
      {
        title: 'Inline Step Header Icons',
        description: 'Positioned step-specific icons directly to the left of the active heading titles throughout the mobile onboarding flow.',
        tag: 'UI Polish',
      },
      {
        title: 'Line Item Card Accordions',
        description: 'Overhauled Step 3 line items list into collapsible accordion cards to make multi-item entry clean and remove internal scrollbars.',
        tag: 'UI Polish',
      },
      {
        title: 'Bank Dropdown Z-Index Fix',
        description: 'Fixed z-index clipping by adjusting card layout overflow settings on Step 4 bank selection dropdowns.',
        tag: 'Stability',
      },
      {
        title: 'Milestone Celebration Screen Redesign',
        description: 'Updated the completion screen to feature unlocked badge status indicators, a structured invoice card, and a prominent WhatsApp sharing button.',
        tag: 'New Feature',
      },
    ],
  },
  '1.1.4': {
    version: '1.1.4',
    title: 'Mobile Onboarding Redesign & Accordion Preview',
    date: '2026-07-01',
    type: 'patch',
    features: [
      {
        title: 'Full-Screen Mobile Onboarding',
        description: 'Redesigned the onboarding modal to occupy full-screen real estate on mobile devices for a native, immersive mobile onboarding experience.',
        tag: 'UI Polish',
      },
      {
        title: 'Pill-Selector Personalization',
        description: 'Upgraded team size and job role dropdowns into clean, selectable button pills to make initial setup faster and more touch-friendly.',
        tag: 'UI Polish',
      },
      {
        title: 'Quantity Stepper Controls',
        description: 'Added interactive plus and minus buttons to the line item quantity selector to save typing and make quantity adjustments a breeze.',
        tag: 'New Feature',
      },
      {
        title: 'Responsive Preview Accordions',
        description: 'Introduced responsive collapsible panels in the final step to toggle between Payout Bank setup and Live Invoice Preview on mobile devices.',
        tag: 'New Feature',
      },
    ],
  },
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
