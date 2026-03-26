# Beauty Ingredient Scanner

A Next.js app that helps users scan or search beauty products, review ingredient risk, and compare products side by side.

## Stack

- Next.js 16
- React 19
- Prisma 7
- PostgreSQL
- NextAuth 5
- OpenAI API

## Required Environment Variables

Copy [`.env.example`](/Users/taylorpoe/Projects/Beauty_Ingreditent_Scanner/.env.example) to `.env.local` for local development and set the same values in Vercel:

- `DATABASE_URL`
- `AUTH_SECRET`
- `OPENAI_API_KEY`

## Local Development

```bash
npm install
npm run db:generate
npm run dev
```

## Database Commands

```bash
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
```

## Production Build

```bash
npm run build
npm run start
```

## Vercel Deployment

1. Import the repository into Vercel.
2. Set `DATABASE_URL`, `AUTH_SECRET`, and `OPENAI_API_KEY` in the Vercel project settings.
3. Use the default build command: `npm run build`.
4. If you are using Prisma migrations in production, run `npm run db:migrate:deploy` against the production database before or during deployment.

## Current Notes

- `/api` is a simple health check endpoint.
- `/api/scans` currently returns mock OCR output until a production OCR provider is wired in.
- Product detail pages now fetch data directly from Prisma instead of relying on a localhost-only API call.

```mermaid
erDiagram
    User ||--o| UserProfile : has
    User ||--o{ Scan : creates
    User ||--o| Subscription : has

    Product ||--o{ ProductIngredient : contains
    Ingredient ||--o{ ProductIngredient : appears_in
    Ingredient ||--o{ IngredientAlias : has

    Product ||--o{ Scan : scanned_in

    User {
      string id PK
      string email UK
      string password
      datetime createdAt
    }

    UserProfile {
      string id PK
      string userId FK
      string skinType
      string[] preferences
      string[] allergies
    }

    Product {
      string id PK
      string name
      string brand
      string category
      string barcode UK
      int baseScore
      string scoreColor
    }

    Ingredient {
      string id PK
      string name UK
      string riskLevel
      int riskScore
      string description
      string reviewBucket
    }

    IngredientAlias {
      string id PK
      string alias UK
      string ingredientId FK
      datetime createdAt
    }

    ProductIngredient {
      string productId FK
      string ingredientId FK
    }

    Scan {
      string id PK
      string userId FK
      string productId FK
      int score
      string color
      datetime createdAt
    }

    Subscription {
      string id PK
      string userId FK
      string plan
    }
```


```mermaid
    flowchart TD
    U[User]
    UP[UserProfile]
    S[Scan]
    SUB[Subscription]

    P[Product]
    PI[ProductIngredient]
    I[Ingredient]
    IA[IngredientAlias]

    U -->|1 to 1| UP
    U -->|1 to many| S
    U -->|1 to 1| SUB

    P -->|1 to many| PI
    I -->|1 to many| PI
    I -->|1 to many| IA

    S -->|many to 1| U
    S -->|many to 1| P

    PI -->|belongs to| P
    PI -->|belongs to| I
    IA -->|belongs to| I
```
