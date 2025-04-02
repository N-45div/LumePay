# Database Setup Guide

This document outlines the database setup and migration process for both local development and production environments.

## 🛠️ Local Development Setup

### Prerequisites
- Docker and Docker Compose installed
- Node.js 14+ and npm

### Setup Steps

1. **Start the local database**:
   ```bash
   npm run db:start
   ```
   This starts a PostgreSQL database in a Docker container with the following credentials:
   - Host: localhost
   - Port: 5432
   - Username: postgres
   - Password: postgres
   - Database: solanahack

2. **Create a .env file from the example**:
   ```bash
   cp .env.example .env
   ```

3. **Run the initial migration**:
   ```bash
   npm run db:migrate
   ```

4. **Stop the database when not needed**:
   ```bash
   npm run db:stop
   ```

## 🌐 Production Database Setup

### AWS RDS Setup (Recommended)

1. **Create an RDS PostgreSQL instance**:
   - Go to AWS Console → RDS → Create database
   - Choose PostgreSQL (version 13+)
   - Set up a production-ready instance:
     - Multi-AZ deployment for high availability
     - Enable encryption
     - Configure automated backups
     - Use a parameter group with appropriate settings

2. **Set up networking**:
   - Place the database in a private subnet
   - Configure security groups to only allow connections from your application servers
   - Set up a bastion host for administrative access if needed

3. **Configure environment variables**:
   Update your production environment with the appropriate connection information:
   ```
   DB_HOST=your-production-db.region.rds.amazonaws.com
   DB_PORT=5432
   DB_USERNAME=your_production_username
   DB_PASSWORD=your_strong_password
   DB_DATABASE=solanahack_prod
   DB_SCHEMA=public
   DB_SYNCHRONIZE=false
   DB_SSL=true
   ```

4. **Run migrations on deployment**:
   Include the migration step in your CI/CD pipeline:
   ```bash
   npm run db:migrate
   ```

### Azure Database for PostgreSQL Setup (Alternative)

1. **Create an Azure Database for PostgreSQL**:
   - Go to Azure Portal → Create a resource → Azure Database for PostgreSQL
   - Choose the Flexible Server option for better performance and control
   - Configure high availability and automated backups

2. **Configure environment variables** similar to AWS setup, but with Azure-specific connection string

### Self-Hosted Option

If you're running your own PostgreSQL server:

1. **Install PostgreSQL** on your server following best practices
2. **Configure for high availability** using replication
3. **Set up regular backups**
4. **Configure environment variables** to point to your self-hosted database

## 📊 Database Migration Management

### Creating a New Migration

When you need to make database schema changes:

1. **Create a migration file**:
   ```bash
   npm run db:migrate:create -- CreateNewTable
   ```

2. **Edit the generated migration file** to add your schema changes

3. **Generate a migration from entity changes**:
   ```bash
   npm run db:migrate:generate -- AddNewColumn
   ```

### Running Migrations

```bash
npm run db:migrate
```

### Reverting Migrations

If you need to roll back the last migration:
```bash
npm run db:migrate:revert
```

### Viewing Migration Status

```bash
npm run db:migrate:show
```

## 🔒 Security Best Practices

1. **Never commit database credentials** to source control
2. **Rotate database passwords** regularly
3. **Use SSL** for all database connections in production
4. **Implement IP restrictions** to limit database access
5. **Use least privilege principles** for database users
6. **Regularly audit database access logs**

## 💾 Backup and Recovery

1. **Automated backups** should be configured for production databases
2. **Test recovery procedures** regularly
3. **Consider point-in-time recovery** needs based on your RPO (Recovery Point Objective)
4. **Document recovery procedures** for emergency situations
