# ChocoManualART Sales CRM — MVP

A responsive full-stack sales CRM designed around ChocoManualART's daily corporate gifting lead workflow.

## What is included

- Admin and Sales login roles
- Create sales users
- Activate/deactivate users
- Excel/CSV lead import
- Duplicate checking using phone/email
- Manual lead creation
- Lead assignment and bulk assignment
- Sales users only see leads assigned to them
- Admin can see every lead
- Today / Overdue / Upcoming follow-up queues
- Exact next follow-up date and time
- Mobile `tel:` Call button
- WhatsApp button
- Follow-up notes and chronological history
- Lead statuses and opportunity value
- Dashboard with today schedule
- Local SQLite database; no MySQL/PostgreSQL required for local use
- Responsive layout for desktop and mobile

## Technology

### Frontend
- React 18
- Vite
- React Router
- Lucide icons
- Plain responsive CSS

### Backend
- Node.js + Express
- SQLite using better-sqlite3
- JWT authentication
- bcrypt password hashing
- multer + xlsx for Excel/CSV upload

## Database location

The database is automatically created here on the first API start:

`server/data/cma-sales.db`

You do not need to install a separate database server for local development.

## Windows quick start

Requirements:
- Node.js 20 LTS recommended
- npm

1. Extract the project.
2. Double-click `setup.bat` once. This installs dependencies.
3. Copy `server/.env.example` to `server/.env` and preferably change `JWT_SECRET`.
4. Double-click `start.bat`.
5. Open `http://localhost:5173`.

You can also run manually in two terminals:

### Terminal 1
```bash
cd server
npm install
npm run dev
```

### Terminal 2
```bash
cd client
npm install
npm run dev
```

## Demo login

### Admin
- Email: `admin@chocomanualart.com`
- Password: `Admin@123`

### Sales
- Email: `sales@chocomanualart.com`
- Password: `Sales@123`

**Change these passwords before production deployment.**

## Excel import columns

Supported column names are flexible, but the recommended template is:

| Column | Required |
|---|---|
| Company Name | No |
| Contact Name | Yes |
| Phone | Phone or Email required |
| Email | Phone or Email required |
| City | No |
| Source | No |
| Requirement | No |
| Estimated Value | No |
| Status | No |
| Next Follow Up | No |
| Notes | No |

A sample CSV is available from the Import Leads screen.

## Roles

### ADMIN
Can:
- see all leads
- add/import leads
- assign or unassign leads
- bulk assign leads
- create sales users
- deactivate users
- view all follow-ups
- see unassigned leads and complete dashboard

### SALES
Can:
- see only assigned leads
- call/WhatsApp assigned leads
- add follow-up result
- schedule next follow-up date/time
- change lead status while logging activity
- see today/overdue/upcoming tasks for their leads

## Daily workflow

1. Admin imports new leads from Excel.
2. Admin selects leads and assigns them to salespeople.
3. Salesperson logs in.
4. Dashboard shows today's calls in scheduled time order.
5. User taps Call on mobile to open the phone dialer.
6. After the call, user opens the lead and records outcome + notes.
7. If customer says “call today at 4 PM”, user sets the next follow-up to 4 PM.
8. That lead appears in today's schedule at that time.
9. Missed follow-ups automatically appear in Overdue.
10. Admin can see the same activity and ownership centrally.

## Data model

### users
Authentication and role data.

### leads
Current lead snapshot, assigned salesperson, status and next follow-up.

### followups
Immutable activity history. Each call/WhatsApp/email/meeting entry records who did it, when it happened, what happened, and the next follow-up.

This separation matters: `leads` tells you the current state, while `followups` preserves history.

## Call functionality

The Call button uses:

`tel:<customer-phone>`

On a mobile browser, tapping it opens the phone dialer. A normal website cannot silently place or record a cellular call without telecom/VoIP integration and user permission.

For automatic call recording, call duration, click-to-call from desktop, virtual numbers, etc., integrate a telephony provider later (for example Exotel/Airtel IQ/Twilio depending on business requirements).

## Before production

This MVP is deliberately easy to run locally. Before exposing it publicly:

1. Change demo passwords.
2. Put a strong random `JWT_SECRET` in `server/.env`.
3. Serve everything over HTTPS.
4. Restrict CORS to your production domain.
5. Add database backups.
6. For larger concurrent usage, migrate SQLite to PostgreSQL/MySQL.
7. Prefer HttpOnly secure auth cookies instead of browser localStorage for a hardened production authentication model.
8. Add password reset, audit logs and rate limiting.
9. Add server-side pagination when lead volume becomes large.
10. Add a backup/restore and export module.

## Recommended phase 2

- Lead source analytics (Meta, Google, website, referral, old clients)
- Salesperson conversion report
- Won revenue dashboard
- Lead aging
- Reminder notifications
- WhatsApp template integration
- Email templates
- Quote generation / PDF
- Corporate client and order module
- Sales target vs achievement
- Call integration
- Admin audit trail
- Notes attachments/catalogue sharing
- Cloud deployment and automated database backup
