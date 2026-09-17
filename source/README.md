# Lab Data Management - Resource Creation (US-8)

An authenticated System Administrator can create a laboratory resource manually or ask the system to extract suggestions from a PDF. PDF processing first reads an embedded text layer locally. If usable text is not present, the backend sends the document to the narrow Typhoon OCR route. Typhoon 30B then converts the extracted text to the supported resource fields.

AI output never creates a record. Suggested fields are visibly marked, remain editable, do not overwrite fields already edited by the administrator, and are saved only after the administrator selects **Create Resource**. The regular create API performs server validation, writes to MySQL, and records the audit event in the same transaction.

## Run locally with Docker

Requirements: Docker Desktop with Docker Compose.

```bash
cd source
docker compose up --build
```

Open <http://localhost:3000>, choose **Sign in as System Administrator**, complete the form, and select **Create Resource**.

Manual creation is available even when AI assistance is not configured. If the PDF route is unavailable, the UI reports the failure and keeps the form usable.

The Compose setup enables a local-review login endpoint and seeds these identities:

- `admin@local.test` - System Administrator; can create resources.
- `member@local.test` - Lab Member; receives an access-restricted page.

Local review authentication is enabled only through `ALLOW_DEV_LOGIN=true` in Compose. Disable it outside local development and connect the project's production identity provider. Browser sessions are stored in signed, HTTP-only, SameSite cookies; no access token is stored in browser JavaScript.

The default database password is for isolated local development only. Runtime `.env` files and Worker `.dev.vars` files are deliberately ignored and are not distributed to reviewers.

AI requests use the shared Worker at <https://lab-data-management-ai-gateway.triple-t-lab-data.workers.dev>. The Typhoon key remains in Cloudflare Worker Secrets and is never sent to the browser, backend container, clone, or Git repository.

## Deploy the shared review Worker

A shared Worker lets reviewers clone the repository and use AI without receiving the Typhoon key or any environment template. Deployment is a one-time maintainer action and requires access to the team's Cloudflare account:

```bash
cd source/ai-gateway
npm ci
npx wrangler login
npx wrangler secret put TYPHOON_API_KEY
npx wrangler deploy
```

Do not configure `AI_GATEWAY_TOKEN` on the public review Worker. It accepts only the two fixed routes, validates and limits inputs, fixes the Typhoon models server-side, removes provider error details, and uses the Cloudflare `AI_RATE_LIMITER` binding at 20 requests per 60 seconds for each route and connecting address.

The deployed HTTPS URL is the default `AI_GATEWAY_URL` in `docker-compose.yml`. Reviewers need only `docker compose up --build`; no Typhoon key or local AI configuration is required.

Never commit `.env`, `.dev.vars`, an environment example, or a provider key. Rotate any API key that has been exposed outside the intended Cloudflare secret store before production use.

Stop the application with:

```bash
docker compose down
```

To also remove local MySQL data, run `docker compose down --volumes` only when that data is no longer needed.

## Run automated checks

Node.js 22 or newer is required.

```bash
cd backend
npm ci
npm run test:coverage

cd ../frontend
npm ci
npm run test:coverage
npm run build

cd ../ai-gateway
npm ci
npm run test:coverage
npm run check
```

The CI workflow runs backend, frontend, and AI gateway coverage checks, then builds the frontend and performs a Worker deployment dry-run.

## US-8 architecture

```text
Admin uploads PDF
        |
        v
Backend extracts embedded PDF text
        | no usable text
        v
Typhoon OCR through the AI Worker
        |
        v
Typhoon 30B structured suggestions
        |
        v
Editable form with AI-suggested markers
        |
        v
Admin reviews and selects Create Resource
        |
        v
POST /api/resources -> authorization -> validation
        -> MySQL transaction (resource + audit log)
```

Required resource fields are `name`, `category`, and `location`, matching SRS-10. Description, responsible person, availability, operational status, and specifications are also supported.
