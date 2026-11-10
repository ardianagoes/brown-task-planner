# DueDrop

Turn screenshots into deadlines.

DueDrop is a student deadline manager that combines reviewed screenshot extraction, calendar feeds, and personal task tracking in one workspace.

[Live website](https://due-drop.vercel.app)

## Features

- **Screenshot-based deadline extraction.** Paste, drop, or upload an assignment screenshot, then review and correct the detected title, date, time, and category before saving. Analysis never creates tasks automatically.
- **Canvas and Gradescope imports.** Import compatible private ICS calendar feeds and refresh deadlines while preserving task status and category. A course homepage is not a calendar feed.
- **Tasks and calendars.** Create, edit, complete, and delete tasks; organize them by category and due date; and switch between an agenda and calendar. Completed tasks remain available as a record of your work.

## Stack

Next.js 16, React 19, TypeScript, and Tailwind CSS power the interface. Supabase provides authentication and PostgreSQL task storage with Row Level Security. Optional screenshot analysis uses the OpenAI Responses API. The interface uses locally hosted Geist typography and Lucide icons.

## Local development

Use Node.js 22 or newer. Create a local environment file and install dependencies:

```sh
git clone https://github.com/ardianagoes/due-drop.git
cd due-drop
npm ci
cp .env.example .env.local
```

Fill in your Supabase settings and local app URL. Follow [development setup](docs/DEVELOPMENT.md) for the existing database migration and email configuration, then start the app:

```sh
npm run dev
```

Open `http://127.0.0.1:3000`. Paid analysis is disabled by default until its safeguards are approved and configured; manual tasks and calendar imports work without an OpenAI key. See the [security review](docs/SECURITY.md) before enabling it. Keep credentials out of Git.
