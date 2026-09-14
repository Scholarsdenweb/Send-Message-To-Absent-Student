# Scholars Den — Batch-wise Attendance & SMS (MERN)

Local web app that reads attendance from the **eTimeTrackLite (eSSL)** SQL Server,
groups students by **batch (= Department)**, and lets staff send an **absent SMS**
to a whole batch. App users/roles and SMS logs are stored in **Neon Postgres (via Prisma)**.

## Architecture
```
React (Vite, :5173)  ──►  Express API (:4000)  ──►  Neon Postgres (Prisma: app users, roles, SMS logs)
                                              └──►  SQL Server etimetracklite1 (192.168.10.10)
                                                    READ punches/employees;
                                                    WRITE only Departments + batch assignment (admin)
```

- **Batch = eTimeTrackLite Department.** A student's batch is `Employees.DepartmentId`.
- **Present** = at least one punch on the date (first punch = in, last = out). **Absent** = no punch.
- The SQL database is treated as read-only **except** creating departments and assigning
  students to departments — both **admin-only**.

## Roles
- **admin** — create batches, assign batches via CSV/Excel, manage users, view attendance, send SMS.
- **member** — view the full student list with punch details + attendance status, and send batch SMS.

## Prerequisites
- Node 18+ (uses global `fetch`)
- A Neon Postgres database (connection string in `backend/.env` as `DATABASE_URL`)
- Network access to the SQL Server at `192.168.10.10:1433`

## Setup

### 1. Backend
```bash
cd backend
npm install            # also runs `prisma generate`
# review backend/.env (DATABASE_URL + SQL + HSPSMS + admin seed)
npm run db:push        # creates the app tables in Neon Postgres
npm run seed           # creates the first admin from .env
npm run dev            # or: npm start   -> http://localhost:4000
```
Check health: `curl http://localhost:4000/api/health` → `{ status, postgres, sqlServer }`.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Login with the seeded admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend/.env`,
default `admin@scholarsden.local` / `Admin@2026`).

## Assigning batches by CSV/Excel
Upload a file with columns (case/space-insensitive):

| EmployeeCode | BatchCode |
|--------------|-----------|
| 2500019      | C11-SCI-M |
| 2300146      | C09-M     |

- `EmployeeCode` also accepts `Code`, `RollNo`, `UserId`, `EmpCode`.
- Use `BatchCode` (matches the batch code) **or** `BatchName` (matches the batch name).
- The batch/department must already exist (create it under **Batches** first).

A sample file is in `sample-assign.csv`.

## Notes
- Punches live in monthly tables `DeviceLogs_<month>_<year>`; the API picks the right one per date.
- `LogDate` is stored as IST wall-clock; times are shown exactly as recorded.
- SMS uses HSPSMS (same provider as the existing punch notifier). Keep `SMS_ABSENT_TEMPLATE`
  matched to your DLT-approved template under sender id `schden`.
