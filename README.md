# IEEE Mobile App - Backend API

Backend REST API for the IEEE Mobile Application, built with NestJS, TypeScript, and PostgreSQL.

## 📋 Description

A robust and scalable backend API that powers the IEEE Mobile Application, providing authentication, event management, user management, and event registration features for IEEE chapters and members.

## ✨ Features

- **Authentication & Authorization**
  - JWT-based authentication
  - User registration and login
  - Admin role-based access control
  - Password encryption with bcrypt

- **Event Management**
  - Create, read, update, and delete events
  - Event categorization by IEEE chapters (CS, RAS, PES/PELS, IAS, SIGHT, WIE)
  - Featured events support
  - Event registration system
  - Speaker information management

- **User Management**
  - User profile management
  - Admin privileges
  - Secure password handling with automatic exclusion from API responses

- **API Documentation**
  - Interactive Swagger/OpenAPI documentation
  - Available at `/api/docs` endpoint

## 🛠️ Tech Stack

- **Framework:** NestJS 11.x
- **Language:** TypeScript
- **Database:** PostgreSQL (with SQLite support for development)
- **ORM:** TypeORM
- **Authentication:** Passport.js with JWT
- **Validation:** class-validator & class-transformer
- **API Documentation:** Swagger/OpenAPI
- **Security:** bcryptjs for password hashing

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/ieee_app

# JWT
JWT_SECRET=replace_with_a_strong_secret_at_least_32_characters
JWT_EXPIRES_IN=7d

# CORS (comma-separated allowlist)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Application
PORT=5000
```

Notes:

- `JWT_SECRET`, `DATABASE_URL`, and `CORS_ORIGINS` are required at startup.
- The app will fail fast on boot if these values are missing or invalid.

## 🚀 Running the Application

```bash
# Development mode with auto-reload
npm run start:dev

# Production mode
npm run start:prod

# Debug mode
npm run start:debug
```

The API will be available at `http://localhost:5000`

## 📚 API Documentation

Once the application is running, access the interactive API documentation at:

```
http://localhost:5000/api/docs
```

## 🏗️ Project Structure

```
src/
├── auth/              # Authentication module (login, register, JWT)
├── events/            # Events module (CRUD, registrations)
├── users/             # Users module (profile management)
├── guards/            # Custom guards (admin authorization)
├── app.module.ts      # Root application module
└── main.ts            # Application entry point
```

## 🔐 API Endpoints Overview

### Authentication

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and receive JWT token

### Events

- `GET /events` - Get all events
- `GET /events/:id` - Get event by ID
- `POST /events` - Create new event (Admin only)
- `PATCH /events/:id` - Update event (Admin only)
- `DELETE /events/:id` - Delete event (Admin only)
- `POST /events/:id/register` - Register for an event

### Users

- `GET /users` - Get all users (Admin only)
- `GET /users/:id` - Get user by ID
- `PATCH /users/:id` - Update user profile

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🎯 Key Features Implementation

### Global Validation Pipe

Automatically validates all incoming requests against DTO definitions using class-validator decorators.

### Class Serializer Interceptor

Automatically excludes sensitive data (like passwords) from API responses using class-transformer decorators.

### CORS Enabled

Cross-Origin Resource Sharing is enabled for mobile app integration.

### TypeORM Integration

Entity relationships, hooks, and migrations for database management.

## 📄 License

This project is licensed under the UNLICENSED license.
