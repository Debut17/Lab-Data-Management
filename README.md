# Lab Data Management

A project by **TripleT** for Individual Software Development Process (2026).
The system centralises laboratory resources, bookings, issue reports, role-based access, and change history.

## Group members

| Name | GitHub username |
| --- | --- |
| Archan Norsiri | nicetsu |
| Pensiri Yakongko | IAteUranium235 |
| Tanisorn Pisittanaphat | lnwphoomza |
| Tanawat Rungwallapa | Anuwry |
| Panuwitch Sowkasem | Debut17 |

## Current project status

All 17 user stories from the SRS (US-1 to US-17) are implemented in one React application:

- **Lab Member:** view, search, filter, and sort lab resources, view resource details, submit booking requests, track their own bookings, and cancel a pending or approved booking before it starts.
- **Lab Staff:** report a resource problem and follow its outcome.
- **System Administrator:** create resources (manually or with AI-assisted PDF suggestions), edit, archive, and set availability of resources, review booking requests, resolve issue reports, manage user roles, and view change history and administrative records.
- **Everyone:** sign in with a verified `@ku.th` Google account.

The stack is React 19 + Vite (served by Nginx), a Node.js / Express API, and MySQL 8.4, all run with Docker Compose.

## Build and run

### Prerequisites

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose), running before you start
- Port `3000` free on your machine (the web app runs there)

No `.env` file or API key is needed. The AI features use the team's shared Worker, and the Google client ID is already set in `docker-compose.yml`.

### 1. Get the code

```bash
git clone https://github.com/Debut17/Lab-Data-Management.git
cd Lab-Data-Management/source
```

### 2. Build and start the application

```bash
docker compose up --build
```

The first build downloads images and installs dependencies, so it takes a few minutes. Compose builds the frontend and backend images, starts MySQL, runs the database migrations, and seeds sample data. The app is ready when the log shows `Backend listening on port 3001` (the API's internal port; you still open port 3000).

### 3. Open the app and sign in

Open <http://localhost:3000>.

- **Sign in with Google** works for `@ku.th` accounts. A first sign-in creates a Lab Member account.
- For local review, use the buttons under the Google button to sign in as a seeded user without Google:

| Button | Account | Role |
| --- | --- | --- |
| Sign in as System Administrator | `admin@local.test` | System Administrator |
| Sign in as Lab Member | `member@local.test` | Lab Member |
| Sign in as Lab Staff | `staff@local.test` | Lab Staff |

### 4. Stop or reset

```bash
docker compose down            # stop the app and keep the data
docker compose down --volumes  # stop and delete the local database (fresh seed data on next start)
```

### Run the tests (optional)

Unit and component tests need Node.js 22 or newer:

```bash
cd backend && npm ci && npm run test:coverage
cd ../frontend && npm ci && npm run test:coverage
```

The end-to-end tests run in a browser against a separate Docker stack on port 3100:

```bash
cd e2e && npm ci && npx playwright install chromium && npm test
```

See [`source/README.md`](source/README.md) for every feature, the API, the architecture, and AI Worker maintenance.

## Documents and diagrams

The documents are stored in the repository root:

- [Software Requirements Specification](ISP-SKE-26%203.pdf): project goals, user stories, requirements, architecture, technology choices, and traceability matrix.
  - Sections 3–4: KAOS goal refinement and use case diagram.
  - Section 7: activity diagrams (AD-1–AD-6).
  - Section 9: software architecture.
  - Section 12: sequence diagrams (SQD-1–SQD-14).
- [Iteration 1 Report](ISP-SKE26%20Iteration%20Report_Pre-Mid%20Term.pdf): project and iteration Gantt charts, critical paths, sprint status, scope changes, retrospective, testing notes, risks, and individual contributions.

- [Gantt chart](Gant%20Chart.png): standalone project schedule image.
- [Diagram JSON exports](diagram.json/): structured diagram data, organised as follows:
  - [Activity diagrams by section](diagram.json/by-section/section-07-activity-diagrams.export.json) and [individual activity diagrams](diagram.json/individual/section-07/) (AD-1–AD-6).
  - [Sequence diagrams by section](diagram.json/by-section/section-12-sequence-diagrams.export.json) and [individual sequence diagrams](diagram.json/individual/section-12/) (SQD-1–SQD-14).

View the rendered diagrams in the requirements PDF; use the JSON exports to inspect their structured data.

## Shared booking integration contract

Before implementing US-5, US-6, or changing any booking schema/API, review the [Shared Booking Contract](source/docs/BOOKING_CONTRACT.md). US-4 and US-12 now implement the booking-creation and administrator-review sides of that contract.
