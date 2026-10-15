# Integration, Security & Automation Maintenance Platform

A production-grade platform for managing third-party integrations, security assessments, automation monitoring, incident notifications, backup operations, and operational documentation.

## 🏗️ Architecture

This is a **modular monolith** with independently deployable workers:

- **Backend API** (`packages/backend`): Express + TypeScript + PostgreSQL + Prisma
- **Worker Service** (`packages/worker`): BullMQ background job processing
- **Frontend** (`packages/frontend`): React + Vite + Bootstrap 5 + TanStack Query

### Technology Stack

#### Backend
- Node.js 20+ with TypeScript
- Express.js for REST APIs
- PostgreSQL 16 for persistence
- Prisma ORM for type-safe database access
- Redis for caching, queuing, and distributed coordination
- BullMQ for background job processing
- JWT for authentication
- bcrypt for password hashing
- Winston for structured logging

#### Frontend
- React 18 with TypeScript
- Vite for fast builds
- Bootstrap 5 for UI components
- React Router for navigation
- TanStack Query for server state management
- React Hook Form + Zod for form validation
- Chart.js for metrics visualization

#### Infrastructure
- Docker & Docker Compose
- PostgreSQL 16
- Redis 7
- NGINX for reverse proxy
- GitHub Actions for CI/CD

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ and npm 10+
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```powershell
   git clone <repository-url>
   cd "Integration, Security & Automation Maintenance"
   ```

2. **Install dependencies**
   ```powershell
   npm install
   ```

3. **Set up environment variables**
   ```powershell
   Copy-Item .env.example .env
   ```
   
   Edit `.env` and configure:
   - Database credentials
   - Redis connection
   - JWT secrets (use secure random strings)
   - Encryption key (32-byte hex string)
   - SMTP settings for email
   - Integration credentials

4. **Start infrastructure (PostgreSQL + Redis)**
   ```powershell
   docker-compose up -d postgres redis
   ```

5. **Run database migrations**
   ```powershell
   npm run db:migrate
   ```

6. **Seed the database**
   ```powershell
   npm run db:seed
   ```

7. **Start development servers**
   ```powershell
   npm run dev
   ```

   This starts:
   - Backend API: http://localhost:3001
   - Frontend: http://localhost:3000
   - Worker: Background process

### Quick Start with Docker

```powershell
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## 📁 Project Structure

```
├── packages/
│   ├── backend/              # Backend API server
│   │   ├── src/
│   │   │   ├── config/       # Configuration and database setup
│   │   │   ├── middleware/   # Express middleware
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── services/     # Business logic
│   │   │   ├── utils/        # Utilities
│   │   │   └── index.ts      # Application entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Database schema
│   │   │   └── seed.ts       # Database seeding
│   │   └── test/             # Tests
│   │
│   ├── worker/               # Background worker service
│   │   └── src/
│   │       └── index.ts      # Worker entry point
│   │
│   └── frontend/             # React frontend
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── pages/        # Page components
│       │   ├── services/     # API clients
│       │   ├── hooks/        # Custom React hooks
│       │   ├── types/        # TypeScript types
│       │   └── main.tsx      # Application entry point
│       └── public/           # Static assets
│
├── .env.example              # Environment template
├── docker-compose.yml        # Docker orchestration
└── package.json              # Workspace configuration
```

## 🔐 Security

### Authentication & Authorization

- JWT-based authentication with secure session management
- Multi-tenant RBAC with organization-scoped permissions
- Role hierarchy: Owner → Admin → Operator → Security Auditor → Viewer
- Password hashing with bcrypt (12 rounds)
- Session revocation and refresh tokens
- Audit logging for all privileged operations

### Data Protection

- Encryption at rest for integration credentials (AES-256-GCM)
- Secure password reset flows
- HTTPS enforcement (configured at deployment)
- Secure cookies with httpOnly and sameSite flags
- CORS protection
- Helmet.js security headers
- SQL injection prevention via parameterized queries
- Input validation with Zod schemas

### Secrets Management

- Never commit secrets to version control
- Use `.env` files (excluded from Git)
- Store production secrets in a secret manager
- Rotate credentials regularly
- Use environment-specific encryption keys

## 🔧 Development

### Available Scripts

```powershell
# Development
npm run dev              # Start all services in development mode
npm run dev:backend      # Start backend only
npm run dev:frontend     # Start frontend only
npm run dev:worker       # Start worker only

# Building
npm run build            # Build all packages
npm run build:backend    # Build backend
npm run build:frontend   # Build frontend

# Testing
npm test                 # Run all tests
npm run test:unit        # Run unit tests
npm run test:integration # Run integration tests
npm run test:e2e         # Run end-to-end tests

# Code Quality
npm run lint             # Lint all packages
npm run format           # Format code with Prettier
npm run typecheck        # TypeScript type checking

# Database
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database
npm run db:reset         # Reset database (CAUTION!)

# Docker
npm run docker:up        # Start Docker services
npm run docker:down      # Stop Docker services
npm run docker:logs      # View Docker logs
```

### Database Migrations

```powershell
# Create a new migration
cd packages/backend
npx prisma migrate dev --name migration_name

# Apply migrations in production
npm run db:migrate:deploy
```

### Adding a New API Endpoint

1. Define route in `packages/backend/src/routes/`
2. Add validation schema
3. Implement service logic in `packages/backend/src/services/`
4. Add authorization checks
5. Include audit logging
6. Write tests

## 🧪 Testing

### Test Structure

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test database interactions and external services
- **E2E Tests**: Test complete user workflows

### Running Tests

```powershell
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Database

Integration and E2E tests use a separate test database. Configure `DATABASE_URL` in test environment or use:

```
DATABASE_URL=postgresql://platform_user:platform_password@localhost:5432/platform_test_db
```

## 📊 Monitoring & Observability

### Health Checks

- **Liveness**: `GET /health` - Overall service health
- **Readiness**: `GET /ready` - Service readiness for traffic

### Logging

- Structured JSON logs in production
- Human-readable logs in development
- Log levels: debug, info, warn, error
- Request logging with duration and user context

### Metrics

Metrics collection points (to be implemented in Phase 4):
- Request rate and latency
- Error rates by endpoint
- Database query performance
- Queue depth and processing time
- Integration success/failure rates

## 🚢 Deployment

### Environment Variables

Production deployments require:

- Secure random strings for JWT_SECRET and SESSION_SECRET (64+ characters)
- 32-byte hex encryption key for ENCRYPTION_KEY
- Valid database and Redis connection strings
- SMTP configuration for email notifications
- Integration API credentials

### Docker Production Build

```powershell
# Build images
docker-compose build

# Start production stack
docker-compose up -d

# View logs
docker-compose logs -f backend worker frontend
```

### Database Migrations

Run migrations before deploying new code:

```powershell
npm run db:migrate:deploy --workspace=@platform/backend
```

### Backup & Recovery

- Configure automated database backups (Phase 5)
- Store backups in secure offsite location
- Test restore procedures regularly
- Document recovery time objectives (RTO)

## 📈 Performance

### Optimization Guidelines

- Use database indexes for frequently queried fields
- Implement caching with Redis where appropriate
- Paginate large result sets
- Use database connection pooling
- Compress API responses
- Optimize frontend bundle size
- Use CDN for static assets

### Scalability

- Horizontal scaling of API servers behind load balancer
- Separate read replicas for database if needed
- Multiple worker instances for job processing
- Redis cluster for high availability
- Rate limiting to prevent abuse

## 🔒 Compliance & Audit

### Audit Logging

All privileged operations are logged with:
- User identifier
- Organization context
- Action performed
- Resource affected
- Timestamp
- IP address and user agent
- Result (success/failure/denied)
- Changes made

### Data Retention

- Audit logs: Configurable retention (default: 2 years)
- Execution logs: Configurable retention (default: 90 days)
- Backup retention: Defined per policy (default: 30 days)

### Access Control

- Principle of least privilege
- Organization-level tenant isolation
- Resource-level authorization checks
- Regular access reviews
- Session timeout and revocation

## 📝 API Documentation

### API Versioning

APIs are versioned using URL prefix: `/api/v1`

### Authentication

Include JWT token in Authorization header:

```
Authorization: Bearer <access_token>
```

### Organization Context

Include organization ID in header:

```
X-Organization-ID: <organization_uuid>
```

### Error Responses

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

### Common Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## 🛠️ Troubleshooting

### Database Connection Issues

```powershell
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Test connection
npm run db:studio
```

### Redis Connection Issues

```powershell
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker exec -it platform-redis redis-cli ping
```

### Build Errors

```powershell
# Clean install
Remove-Item -Recurse -Force node_modules
npm install

# Regenerate Prisma client
npm run db:generate --workspace=@platform/backend
```

## 📖 Phase Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)
- [x] Project structure with monorepo
- [x] Database schema with Prisma
- [x] Authentication system
- [x] Multi-tenant RBAC
- [x] Audit logging
- [x] Docker configuration
- [x] Basic frontend scaffold

### ⏳ Phase 2: Identity & Access (IN PROGRESS)
- [ ] Organization management UI
- [ ] User profile management
- [ ] Role and permission management UI
- [ ] Email verification
- [ ] MFA support

### 📋 Phase 3: Integrations & Automation (PLANNED)
- [ ] Integration provider adapters
- [ ] Credential management
- [ ] Automation scheduling
- [ ] Execution tracking
- [ ] Job queue processing

### 📋 Phase 4: Monitoring & Incidents (PLANNED)
- [ ] Real-time monitoring dashboard
- [ ] Incident detection rules
- [ ] Notification channels
- [ ] Alert management
- [ ] Metrics collection

### 📋 Phase 5: Backups & Security (PLANNED)
- [ ] Backup policy management
- [ ] Automated backups
- [ ] Restore workflows
- [ ] Security assessments
- [ ] Vulnerability tracking

### 📋 Phase 6: Documentation & Performance (PLANNED)
- [ ] Document management
- [ ] Runbook editor
- [ ] Performance reviews
- [ ] Improvement tracking
- [ ] Handover workflows

### 📋 Phase 7: Production Readiness (PLANNED)
- [ ] Comprehensive test coverage
- [ ] CI/CD pipeline
- [ ] Production deployment guide
- [ ] Performance benchmarks
- [ ] Security audit

## 🤝 Contributing

1. Create feature branch from `main`
2. Follow TypeScript and ESLint guidelines
3. Write tests for new features
4. Update documentation
5. Submit pull request with clear description

## 📄 License

Proprietary - All rights reserved

## 📞 Support

For questions or issues:
- Create an issue in the repository
- Contact the development team
- Review documentation in `/docs`

---

**Built with ❤️ for production operations teams**
