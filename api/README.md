# Tari1 API

Multi-tenant invoicing and financial management API built with NestJS.

## Features

- **Multi-tenancy**: Each organization has isolated data
- **Authentication**: JWT-based authentication with role-based access control
- **Invoicing**: Create, manage, and track invoices with line items
- **Payments**: Record manual payments and integrate with Paystack
- **Expenses**: Track business expenses with categories
- **Reports**: Financial summaries, income/expense breakdowns, cashflow analysis
- **Paystack Integration**: Payment links, webhooks, and subaccount settlements

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: Passport + JWT
- **Documentation**: Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment file and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and Paystack keys
   ```

3. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

4. Run database migrations:
   ```bash
   npm run prisma:migrate
   ```

5. Start the development server:
   ```bash
   npm run start:dev
   ```

### API Documentation

Once running, visit `http://localhost:3000/api/docs` for Swagger documentation.

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new organization + super admin
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user profile

### Users
- `GET /api/v1/users` - List users
- `POST /api/v1/users` - Create user
- `GET /api/v1/users/:id` - Get user
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Deactivate user

### Clients
- `GET /api/v1/clients` - List clients
- `POST /api/v1/clients` - Create client
- `GET /api/v1/clients/:id` - Get client with invoices
- `PATCH /api/v1/clients/:id` - Update client
- `DELETE /api/v1/clients/:id` - Delete/deactivate client

### Invoices
- `GET /api/v1/invoices` - List invoices (filterable)
- `POST /api/v1/invoices` - Create invoice
- `GET /api/v1/invoices/:id` - Get invoice with items and payments
- `PATCH /api/v1/invoices/:id` - Update invoice (draft only)
- `POST /api/v1/invoices/:id/send` - Mark as sent
- `POST /api/v1/invoices/:id/cancel` - Cancel invoice
- `DELETE /api/v1/invoices/:id` - Delete invoice (draft only)

### Payments
- `GET /api/v1/payments` - List payments
- `POST /api/v1/invoices/:invoiceId/payments` - Record payment
- `GET /api/v1/payments/:id` - Get payment
- `DELETE /api/v1/payments/:id` - Delete payment

### Expenses
- `GET /api/v1/expenses` - List expenses
- `POST /api/v1/expenses` - Create expense
- `GET /api/v1/expenses/:id` - Get expense
- `PATCH /api/v1/expenses/:id` - Update expense
- `DELETE /api/v1/expenses/:id` - Delete expense
- `GET /api/v1/expense-categories` - List categories
- `POST /api/v1/expense-categories` - Create category

### Paystack
- `GET /api/v1/paystack/banks` - Get Nigerian banks
- `POST /api/v1/paystack/verify-account` - Verify bank account
- `POST /api/v1/organizations/setup-paystack` - Setup Paystack subaccount
- `POST /api/v1/invoices/:id/generate-payment-link` - Generate payment link
- `POST /api/v1/webhooks/paystack` - Webhook endpoint

### Reports
- `GET /api/v1/reports/summary` - Financial summary
- `GET /api/v1/reports/income` - Income breakdown
- `GET /api/v1/reports/expenses` - Expense breakdown
- `GET /api/v1/reports/outstanding` - Outstanding invoices
- `GET /api/v1/reports/cashflow` - Monthly cashflow

## User Roles

| Role | Permissions |
|------|-------------|
| SUPER_ADMIN | Full access, manage organization settings |
| ADMIN | Full access except organization settings |
| ACCOUNTANT | Manage invoices, payments, expenses, view reports |
| STAFF | Create invoices (own only) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | Token expiration (e.g., "7d") |
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `PORT` | Server port (default: 3000) |
| `PLATFORM_FEE_PERCENT` | Default platform fee percentage |

## License

ISC
