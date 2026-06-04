# Nexa AI - Chatbot App

Nexa AI is a feature-rich, conversational AI chatbot application designed to run locally or in production. This document outlines how to configure the database backend, run locally with SQLite, or deploy using a production-grade PostgreSQL database.

---

## 🗄️ Database Setup & Configuration

The application is built using SQLAlchemy and supports both SQLite (for local development and testing) and PostgreSQL (for production).

### 1. Running Locally with SQLite (Default)
By default, the application will fallback to a local SQLite database in development mode if no `DATABASE_URL` environment variable is defined.
- **SQLite Database Path:** `chatbot-simple/instance/chatbot.sqlite3`
- To run with SQLite, simply launch the app without setting `DATABASE_URL` (or leave it blank in your `.env` file). The application will automatically create the database file and tables on startup.

### 2. Creating a PostgreSQL Database
To use PostgreSQL (locally or in production), you must first create a PostgreSQL database instance:
- **Using Render / Supabase / Neon:**
  1. Create a new PostgreSQL database service on your provider (e.g., Render Blueprints, Supabase Database, Neon Serverless).
  2. Copy the external/internal database connection URL provided by the platform.
- **Using Local PostgreSQL:**
  1. Open a terminal or PostgreSQL client (e.g., pgAdmin, psql).
  2. Run the command:
     ```sql
     CREATE DATABASE chatbot_db;
     ```

### 3. Setting `DATABASE_URL`
Configure the `DATABASE_URL` environment variable in your `.env` file or environment settings:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/chatbot_db
```
> [!NOTE]
> The application automatically handles connection string normalization. SQLAlchemy 2.0 requires the `postgresql+psycopg2://` driver prefix. If you supply a URL starting with `postgres://` or `postgresql://` (e.g. from Render or Supabase), Nexa AI will automatically normalize it to use `psycopg2`.

---

## 🚀 Deployment Instructions

### Production Environment Rules
- **Production Mode:** Enforce by setting `APP_ENV=production`.
- **Database Backend:** Production mode **strictly requires** PostgreSQL. If `APP_ENV=production` is set but `DATABASE_URL` is missing or is not a PostgreSQL URL, the application will fail to start with a clear validation error.

### Deploying on Render
1. **Create PostgreSQL Database on Render:**
   - In your Render dashboard, click **New** -> **PostgreSQL**.
   - Note down the **External Database URL**.
2. **Deploy the Web Service:**
   - Click **New** -> **Web Service** and connect your repository.
   - Set the runtime environment to Python (e.g., using `requirements.txt`).
3. **Configure Environment Variables:**
   - Go to the **Environment** tab of your web service on Render.
   - Add the following variables:
     - `APP_ENV` = `production`
     - `DATABASE_URL` = *(Your Render PostgreSQL connection string)*
     - `SECRET_KEY` = *(A secure, random, long secret string)*
     - `FIREBASE_CREDENTIALS` = *(The complete Firebase service account JSON object)*
     - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
       `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and
       `VITE_FIREBASE_APP_ID` = *(Your Firebase web app configuration values)*

   Firebase Admin reads `FIREBASE_CREDENTIALS` on Render. When that variable is not set,
   local development falls back to `chatbot-45f57-firebase-adminsdk-fbsvc-dc0dcdd2d1.json`
   in the repository root.
4. **Build and Start Commands:**
   - **Build Command:** `pip install -r requirements.txt` (and any other frontend build steps if applicable).
   - **Start Command:** `gunicorn app:app` or `python app.py` (depending on your setup).
