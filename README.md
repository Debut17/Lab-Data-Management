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

The `source/` directory contains the Docker-based application. US-8 lets an authorised System Administrator create a laboratory resource manually or upload a PDF for AI-assisted suggestions. The administrator must review or edit those suggestions before the normal create action writes the resource and its audit event to MySQL.

To run it locally:

```bash
cd source
docker compose up --build
```

Open <http://localhost:3000>. Manual creation works even if the shared AI Worker is temporarily unavailable. See [`source/README.md`](source/README.md) for local review accounts, Worker maintenance, architecture, and automated checks.

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
