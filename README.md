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

Install dependencies for both client and server:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Go back to project root
cd ..
```

### 3. Environment Configuration

Create a `.env` file in the `server/` directory with your database configuration:

```bash
cd server
cp .env.example .env  # if .env.example exists
# or create .env manually
```

Edit `server/.env` and add your PostgreSQL connection string:

```
DATABASE_URL="postgresql://[username]:[password]@localhost:5432/toktickit"
```

**Example with default PostgreSQL credentials:**

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit"
```

**Steps to create the database:**

```bash
# Connect to PostgreSQL
psql -U postgres

# Inside psql shell, create the database
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

# (Optional) Seed the database with initial data
npm run prisma:seed
```

This will:
- Create all tables defined in `prisma/schema.prisma`
- Generate the Prisma client
- Populate the database with seed data (if seed.ts is configured)

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

### Run All Tests

```bash
# From project root
cd server && npm test && cd ../client && npm test
```

## API Documentation

The server exposes REST API endpoints. Key features include:

- **Health Check**: `GET /health` - Verify server is running
- **Categories**: CRUD operations for IT request categories
  - `GET /api/categories` - Fetch all categories
  - `POST /api/categories` - Create a new category
  - etc.

Check the server source files in `server/src/` for the complete API specification.

## Available Scripts

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
cd server && npm install && cd ../client && npm install
```

## License

This project is part of CPE334 Software Engineering course.
