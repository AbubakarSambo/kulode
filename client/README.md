# Chuna Client

React TypeScript frontend for the Chuna invoicing platform.

## Tech Stack

- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v6
- **State Management**: Zustand (auth), TanStack Query (server state)
- **Forms**: React Hook Form + Zod validation
- **UI Components**: Custom shadcn-style components
- **Charts**: Recharts
- **Icons**: Lucide React
- **Toasts**: Sonner

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. The app will be available at http://localhost:5173

## Project Structure

```
src/
├── api/          # API client and endpoint functions
├── components/
│   ├── ui/       # Base UI components (Button, Input, Card, etc.)
│   ├── layout/   # Layout components (Sidebar, Header)
│   ├── forms/    # Form-specific components
│   └── shared/   # Shared components (ProtectedRoute, etc.)
├── hooks/        # Custom React hooks
├── lib/          # Utility functions
├── pages/        # Page components
├── stores/       # Zustand stores
└── types/        # TypeScript type definitions
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Environment

The app proxies API requests to `http://localhost:3000` in development.
Make sure the API server is running before starting the client.

## Pages

| Route | Description |
|-------|-------------|
| `/login` | User login |
| `/register` | Organization registration |
| `/dashboard` | Overview with metrics |
| `/clients` | Client list and management |
| `/invoices` | Invoice list and management |
| `/payments` | Payment history |
| `/expenses` | Expense tracking |
| `/reports` | Financial reports |
| `/settings` | Organization settings |
