# Sticky Studio - Opportunity Management

An application for managing scholarships, PhD positions, competitions. Its a single user app.

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
