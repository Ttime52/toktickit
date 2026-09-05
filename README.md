# TokTickIT

CPE334 Software Engineering Project

A full-stack IT request management application built with React (Vite) and Express, using PostgreSQL for data persistence.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Installation](#installation)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Environment Configuration](#3-environment-configuration)
  - [4. Database Setup](#4-database-setup)
- [Running the Application](#running-the-application)
  - [Development Mode](#development-mode)
  - [Production Build](#production-build)
- [Running Tests](#running-tests)
- [API Documentation](#api-documentation)
- [Available Scripts](#available-scripts)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** or **yarn** (comes with Node.js)
- **PostgreSQL** (v12 or higher) - [Download](https://www.postgresql.org/download/)
- **Git** (for cloning the repository) - [Download](https://git-scm.com/)

Verify your installations by running:

```bash
node --version
npm --version
psql --version
```

## Project Structure

```
toktickit/
├── README.md                 # This file
├── client/                   # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx          # Main React component
│   │   ├── api.ts           # API client utilities
│   │   ├── main.tsx         # Entry point
│   │   └── vite-env.d.ts    # Vite type definitions
│   ├── tests/               # Client tests
│   ├── package.json         # Client dependencies
│   ├── tsconfig.json        # TypeScript configuration
│   ├── vite.config.ts       # Vite configuration
│   └── index.html           # HTML template
├── server/                   # Express backend
│   ├── src/
│   │   ├── app.ts           # Express app configuration
│   │   ├── index.ts         # Server entry point
│   │   └── prisma.ts        # Prisma client instance
│   ├── prisma/
│   │   ├── schema.prisma    # Prisma data model
│   │   ├── seed.ts          # Database seed script
│   │   └── migrations/      # Database migrations
│   ├── tests/               # Server tests
│   ├── package.json         # Server dependencies
│   ├── tsconfig.json        # TypeScript configuration
│   └── vitest.config.ts     # Vitest configuration
└── docs/                     # Documentation
    └── lab-01/              # Lab 1 resources
```

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd toktickit
```

### 2. Install Dependencies

Install the root Playwright runner and the dependencies for both client and
server:

```bash
# From the project root: Playwright E2E runner
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Go back to project root
cd ..
```

Install the Chromium browser used by the desktop, tablet, and mobile E2E
projects:

```bash
npx playwright install chromium
```

On PowerShell, use `npm.cmd`/`npx.cmd` if the shell blocks the npm PowerShell
shims.

### 3. Environment Configuration

Create a `.env` file in the `server/` directory with your database configuration:

```bash
# macOS/Linux
cp server/.env.example server/.env

# PowerShell
Copy-Item server\.env.example server\.env
```

Edit `server/.env` if your PostgreSQL credentials differ from the example:

```
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public"
PORT=3000
```

The example expects a PostgreSQL role named `toktickit` with password
`toktickit` and a database named `toktickit`. You may use another local role
and database by updating `DATABASE_URL`.

If the database does not exist, create it before running Prisma:

```bash
# Connect to PostgreSQL
psql -U postgres

# Inside the psql shell, create the role/database as needed
CREATE USER toktickit WITH PASSWORD 'toktickit';
CREATE DATABASE toktickit;

# Exit psql
\q
```

### 4. Database Setup

Once your `.env` file is configured, run Prisma migrations to set up the database schema:

```bash
cd server

# Run database migrations
npm run prisma:migrate

# Seed required Categories, Related Systems, and Requesters
npm run prisma:seed

cd ..
```

This will:
- Create all tables defined in `prisma/schema.prisma`
- Generate the Prisma client
- Populate the database with idempotent seed data; rerunning the seed does not
  duplicate records

## Running the Application

### Development Mode

Run both the server and client development servers simultaneously:

**Terminal 1 - Start the Backend Server:**

```bash
cd server
npm run dev
```

The server will start on `http://localhost:3000` (or the configured port)

**Terminal 2 - Start the Frontend Dev Server:**

```bash
cd client
npm run dev
```

The client will typically start on `http://localhost:5173` (check terminal output for exact URL)

Open your browser and navigate to the client URL to see the application.

### Production Build

Build the client and server for production:

```bash
# Build server (TypeScript → JavaScript)
cd server
npm run build

# Build client (Vite bundle)
cd ../client
npm run build
```

**Running the Production Build:**

```bash
# Terminal 1 - Start the server
cd server
npm start

# Terminal 2 - Preview the client build (optional)
cd client
npm run preview
```

## Running Tests

### Client Tests

```bash
cd client
npm test
```

Tests will run using Vitest with jsdom. Test files are located in `client/tests/`.

### Server Tests

```bash
cd server
npm test
```

Tests will run using Vitest. Test files are located in `server/tests/`.

### Build Checks

```bash
# Server
cd server
npm run build

# Client
cd ../client
npm run build

cd ..
```

### Playwright E2E, Responsive, and Visual QA

The checked-in Playwright config can start the server and client
automatically. From the project root, run:

```bash
npm run test:e2e
```

To run against services started manually, use two terminals:

```bash
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev
```

Then, from the project root, set the external-server flag and run Playwright.
PowerShell:

```powershell
$env:PLAYWRIGHT_EXTERNAL_SERVERS = "1"
npm run test:e2e
```

macOS/Linux:

```bash
PLAYWRIGHT_EXTERNAL_SERVERS=1 npm run test:e2e
```

Useful E2E commands:

```bash
# Run one viewport project
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=tablet
npm run test:e2e -- --project=mobile

# Run with a visible browser
npm run test:e2e:headed

# Open the generated Playwright HTML report
npm run test:e2e:report
```

The E2E suite covers the requester-to-ticket-to-attachment flow at desktop
(`1440x900`), tablet (`1024x768`), and mobile (`390x844`) sizes. Responsive
checks also exercise a `900px` tablet layout and a `320px` narrow viewport.
Screenshots are stored in `artifacts/lab-02/screenshots/`.

## API Documentation

The server exposes REST API endpoints. Key features include:

- **Health Check**: `GET /api/health` - Verify server is running
- **Categories**: CRUD operations for IT request categories
  - `GET /api/categories` - Fetch all categories
  - `POST /api/categories` - Create a new category
  - etc.

Check the server source files in `server/src/` for the complete API specification.

## Available Scripts

### Root Scripts

| Script | Description |
|--------|-------------|
| `npm run test:e2e` | Run all Playwright E2E, responsive, and visual tests |
| `npm run test:e2e:headed` | Run Playwright with a visible browser |
| `npm run test:e2e:report` | Open the generated Playwright HTML report |

### Client Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build TypeScript and create optimized client bundle |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run tests with Vitest |

### Server Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled server in production |
| `npm run prisma:migrate` | Run pending database migrations |
| `npm run prisma:seed` | Seed database with initial data |
| `npm test` | Run tests with Vitest |

## Troubleshooting

### Database Connection Error

If you get a connection error:

1. Verify PostgreSQL is running:
   ```bash
   # On Windows
   pg_isready -h localhost -p 5432
   ```

2. Check your `DATABASE_URL` in `server/.env`

3. Ensure the database exists:
   ```bash
   psql -U postgres -c "CREATE DATABASE toktickit;"
   ```

### Port Already in Use

If the default ports are already in use:

- Server: Change the port in `server/src/index.ts`
- Client: Vite will automatically use the next available port

### Module Not Found Errors

Make sure you've installed all dependencies:

```bash
npm install
cd server && npm install
cd ../client && npm install
```

## License

This project is part of CPE334 Software Engineering course.
