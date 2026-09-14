# Running the Attendance app on the Windows PC (auto-start on boot)

Run the app on the **same Windows PC where SQL Server runs (192.168.10.10)**.
Then SQL Server is local, and the app can start automatically every time the PC boots.
The app runs as **one process on port 4000** that serves both the API and the website.

---

## One-time setup

### 1. Install Node.js
Download the **LTS** version from https://nodejs.org and install it (accept defaults).
Verify: open Command Prompt and run `node -v` — it should print a version.

### 2. Copy the project to the Windows PC
Copy the whole project folder (the one containing `backend`, `frontend`, `windows-deploy`)
to somewhere simple, e.g. `C:\attendance-report`.

### 3. Check backend\.env
Open `backend\.env` and confirm these (edit if needed):
```
PORT=4000
SQL_SERVER=localhost      # localhost works because SQL is on this same PC
SQL_PORT=1433
SQL_DATABASE=etimetracklite1
SQL_USER=essl
SQL_PASSWORD=Jatin@2026
DATABASE_URL=...          # keep the Neon cloud URL as-is (needs internet)
```

### 4. Build
Double-click **`windows-deploy\build.bat`**.
It installs everything and builds the website. Wait for "BUILD COMPLETE".

### 5. Create the admin login (first time only)
Double-click **`windows-deploy\seed.bat`**.
Login = `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend\.env`.

### 6. Test it
Double-click **`windows-deploy\start.bat`**, then open **http://localhost:4000** in a browser.
If it loads and logs in, close that window (Ctrl+C) and move to auto-start below.

---

## Make it auto-start on boot (Windows Service)

This uses **NSSM**, a tiny tool that runs the app as a Windows Service — it starts on
boot, keeps running without anyone logged in, and restarts if it crashes.

1. Download NSSM from https://nssm.cc/download (get the latest .zip).
2. From the zip, copy **`win64\nssm.exe`** into the `windows-deploy` folder
   (next to `install-service.bat`).
3. **Right-click `install-service.bat` → Run as administrator.**

That's it. It installs the `AttendanceReport` service, starts it, and opens firewall
port 4000. From now on the app runs automatically on every boot.

- On this PC:      **http://localhost:4000**
- From other PCs (like your Mac) on the same network: **http://192.168.10.10:4000**

### Managing the service
- Stop/start/restart: open `services.msc`, find **AttendanceReport**.
- Remove it: right-click `uninstall-service.bat` → Run as administrator.
- Logs: `backend\service.log`.

---

## When you change the code later
1. Copy the updated files over.
2. Run `build.bat` again (rebuilds the website).
3. Restart the service (in `services.msc`, right-click **AttendanceReport → Restart**).

---

## Access from your Mac
Any device on the same network opens **http://192.168.10.10:4000** in a browser —
no install needed on the Mac. (Requires the firewall rule, which `install-service.bat`
adds automatically.)
