# Sticky Studio - Opportunity Management

A Next.js application for managing opportunities (scholarships, PhD positions, competitions) with PostgreSQL database integration.

## Features

- PostgreSQL database for data persistence
- Simple authentication using environment variables
- Opportunity management (create, view, edit)
- Document support (images, PDFs, text)
- Modern UI with Tailwind CSS

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database and set up your environment variables:

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your database credentials
DATABASE_URL=postgresql://username:password@localhost:5432/sticky_studio
APP_USER_EMAIL=admin@example.com
APP_USER_PASSWORD=your_secure_password
```

### 3. Initialize Database

```bash
npm run setup-db
```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:9002`.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `APP_USER_EMAIL`: Admin email for authentication
- `APP_USER_PASSWORD`: Admin password for authentication
- `NODE_ENV`: Environment (development/production)

## Database Schema

The application uses a single `opportunities` table with the following structure:

- `id`: Primary key (auto-increment)
- `name`: Opportunity name
- `details`: Detailed description
- `deadline`: Application deadline (optional)
- `document_uri`: Document URL or data URI
- `document_type`: Type of document (image, pdf, text, unknown)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp
