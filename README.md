# Deadline Desk

**Your homework, applications, and everything due next, in one place.**

[**Live app**](https://brown-task-planner.vercel.app) · [**GitHub repository**](https://github.com/ardianagoes/brown-task-planner)

Deadline Desk is a full-stack task planner built to make managing college deadlines less fragmented. It brings assignments from calendar feeds, manually entered tasks, and screenshot-based deadline extraction into a single workspace with a calendar and prioritized task list.

## Features

- **Unified deadline dashboard:** Track active, upcoming, overdue, and completed tasks in one place.
- **Calendar and list views:** Browse deadlines by day, filter by category, and sort by due date.
- **Canvas and Gradescope imports:** Import assignments from compatible private ICS calendar feeds and refresh existing tasks without resetting their completion status.
- **AI screenshot extraction:** Paste, drag, or upload a screenshot of an assignment or schedule to extract potential tasks with OpenAI. Review and edit detected details before saving.
- **Manual task management:** Create, edit, complete, and delete tasks, including all-day deadlines, exact times, categories, and useful links.
- **Private accounts:** Sign up, sign in, and manage tasks across devices with Supabase authentication and PostgreSQL storage.
- **Responsive interface:** A dark-themed workspace designed for desktop and mobile.

Screenshot extraction is optional and requires a server-side OpenAI API key. Manual entry, calendar imports, and task management do not require an OpenAI key.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API route handlers |
| Authentication and database | Supabase Auth, PostgreSQL, Row Level Security |
| AI | OpenAI Responses API for image-based task extraction |
| Calendar processing | ICS parsing with `node-ical` |
| Deployment | Vercel |
| Testing | Node.js test runner, TypeScript checks, and smoke tests |

## Getting started

### Prerequisites

- Node.js 22+ and npm
- A Supabase project

### 1. Install dependencies

```bash
git clone https://github.com/ardianagoes/brown-task-planner.git
cd brown-task-planner
npm ci
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
AUTH_RECOVERY_SECRET=YOUR_RANDOM_SERVER_ONLY_SECRET
APP_TIMEZONE=America/New_York

# Optional: enable screenshot analysis
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-5.4-mini
```

Generate a recovery secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep real keys and secrets in `.env.local` or your hosting provider's environment settings, never in Git.

### 3. Set up the database and authentication

Apply [the production database migration](supabase/migrations/20261006000000_production_tasks.sql) to your Supabase project. It creates task storage, user-scoped policies, import functions, and rate limiting.

Configure Supabase authentication and redirect URLs using the [email authentication setup guide](docs/EMAIL_AUTH_SETUP.md). Email confirmation, magic links, and password recovery also depend on settings in the hosted Supabase project.

### 4. Run locally

```bash
npm run dev
```

Open **http://127.0.0.1:3000**.

## How it works

1. **Add tasks** manually, from a compatible Canvas/Gradescope ICS feed, or by submitting a screenshot for analysis.
2. **Review deadlines** before saving AI-extracted tasks. Uncertain details are flagged for confirmation.
3. **Stay organized** using deadline summaries, category filters, a calendar, and active/completed task views.
4. **Sync across devices** through your authenticated Supabase account.

Calendar imports require an actual ICS feed URL, not a course homepage or Gradescope assignment page.

## Security and privacy

- Task reads and writes require an authenticated user; PostgreSQL Row Level Security policies restrict access by user ID.
- Calendar-feed requests are restricted to approved HTTPS hosts, with DNS and response-size checks.
- Screenshot uploads are validated and rate-limited. Images are processed for extraction rather than saved as tasks or stored by Deadline Desk.
- AI analysis sends screenshots to OpenAI, so external provider data-handling policies apply. Users must explicitly confirm extracted tasks before saving.
- OpenAI credentials and password-recovery signing secrets are configured server-side.

## Development and verification

```bash
npm run typecheck   # Check TypeScript
npm test            # Run automated tests
npm run build       # Build for production
npm run test:smoke  # Check key application routes with a running dev server
```

See [VERIFICATION.md](VERIFICATION.md) for recorded test results and remaining live-deployment checks. Automated tests do not, by themselves, verify hosted email delivery or production authentication configuration.

## Deployment

The app is configured for deployment on Vercel. Set the same environment variables in the deployment settings, use the canonical HTTPS production URL for `NEXT_PUBLIC_APP_URL`, and complete the Supabase email/redirect configuration in the [setup guide](docs/EMAIL_AUTH_SETUP.md).

---

Built as an independent project by [Ardian Agoes](https://github.com/ardianagoes).
