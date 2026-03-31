# CPG Product Review Analyzer

An AI-powered competitive intelligence platform for Consumer Packaged Goods (CPG) brands. Aggregate, analyze, and compare product reviews across Amazon, Walmart, Target, and other retailers — all from a single dashboard.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6.7-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.3-06B6D4?logo=tailwindcss)

---

## What It Does

CPG brands need to understand how consumers talk about their products — and their competitors' products — across every major retailer. This tool automates the entire pipeline:

1. **Import products** by pasting any retailer URL (Amazon, Walmart, Target, etc.)
2. **Scrape reviews** automatically, with multi-strategy fallbacks for anti-bot protection
3. **AI sentiment analysis** on every review (positive/negative/neutral + confidence score)
4. **Cross-store search** to find the same product on competing retailers and pull in those reviews too
5. **Product matching** via AI to identify variants, duplicates, and competitors across your catalog
6. **Analytics dashboard** with sentiment trends, brand comparisons, and source breakdowns
7. **Auto-translate** non-English reviews to English while preserving the original text

---

## Architecture & Technology Choices

### Why Next.js 14 (App Router)?

Next.js was chosen for its ability to handle both the frontend dashboard and backend API routes in a single codebase. The App Router provides:

- **Server-Sent Events (SSE)** for real-time progress streaming during long operations like AI analysis, cross-store search, and product matching
- **Server Components** where appropriate to reduce client-side JavaScript
- **API Routes** (`app/api/`) that act as a lightweight backend without needing a separate server

### Why Prisma + PostgreSQL?

Prisma provides type-safe database access with auto-generated TypeScript types from the schema. PostgreSQL was chosen for:

- **JSONB support** for flexible AI analysis storage
- **Full-text search** via `ILIKE` for product catalog search
- **Relational integrity** for the complex product → review → match → triage data model
- **Indexing** on high-query columns (brand, source, sentiment, productId, variantGroupId)

### Why LLM-Powered Extraction?

Traditional CSS-selector scraping is fragile — retailers constantly change their HTML. This app uses a **dual-strategy approach**:

1. **Cheerio (fast path):** Parse HTML with known CSS selectors for major retailers
2. **LLM fallback (robust path):** When selectors fail, send the raw HTML to an LLM (GPT-4.1 Mini via Abacus.AI) and ask it to extract structured data. This works on virtually any website without writing site-specific scrapers.

The same LLM powers sentiment analysis, product matching, review translation, and search query generation.

### Why ScraperAPI?

Direct HTTP requests to major retailers get blocked quickly. ScraperAPI handles:

- **IP rotation** and residential proxies
- **CAPTCHA solving**
- **Structured data endpoints** for Amazon and Walmart (returns JSON instead of HTML)
- **Google search** as a fallback discovery mechanism

### Cross-Store Search: The 3-Layer Strategy

Finding the same product across retailers is surprisingly hard. A search for "ZEVO Flying Bug Trap Value Pack 2 Devices 4 Refill Cartridges" returns zero results on Walmart's search API. The solution is a 3-layer approach:

| Layer | Strategy | Example |
|-------|----------|---------|
| **1. Query Variations** | LLM generates 3–5 progressively simpler queries | `"ZEVO Bug Trap"` → `"ZEVO insect trap"` → `"ZEVO pest control"` |
| **2. Store API** | Try each query against the retailer's native search | ScraperAPI structured Amazon/Walmart endpoints |
| **3. Google Fallback** | Search Google with `site:walmart.com "ZEVO bug trap"` | Google's fuzzy matching finds products store search misses |

Each layer emits real-time diagnostic events so you can see exactly what's happening.

---

## Data Model

```
Product ──┬── Review[]           (1:many, cascading delete)
          ├── ProductMatch[]     (self-referential many:many via A/B)
          ├── TriageItem[]       (low-confidence matches for human review)
          └── ScrapeLog[]       (audit trail of scraping attempts)

Setting                          (key-value config store)
```

**Key design decisions:**

- **Reviews** store both `reviewText` (English) and `originalText` + `originalLanguage` for translated reviews
- **ProductMatch** uses a self-referential pattern with `productAId` / `productBId` and a unique constraint to prevent duplicates
- **TriageItem** captures AI matches below the confidence threshold for human approval/rejection
- **Product.variantGroupId** groups size/flavor variants (e.g., 12oz vs 24oz of the same product)
- **ScrapeLog** provides a full audit trail of every scraping attempt with status and error details

---

## Pages & Features

### Products (`/`)
The main dashboard. Add products by pasting a URL (Amazon, Walmart, Target, shortened `a.co` links — all auto-resolved). View, search, filter, and sort your product catalog. Trigger AI-powered product matching to find duplicates, variants, and competitors.

### Product Detail (`/products/[id]`)
Deep-dive into a single product with tabbed sections:

- **Overview** — Product metadata, image, description, edit capabilities
- **Reviews** — All scraped reviews with sentiment badges, manual review entry, batch translation
- **AI Analysis** — Per-review sentiment + holistic product insights (themes, actionable recommendations)
- **Cross-Store** — Find this product on other retailers, pull in their reviews, real-time diagnostics panel

### Analytics (`/analytics`)
Aggregated dashboard with:
- Sentiment distribution (pie chart)
- Products by brand (bar chart)
- Reviews by source (bar chart)
- Sentiment trends over time (line chart)
- Date-range filtering

### Triage (`/triage`)
Human-in-the-loop review queue for low-confidence AI product matches. Approve or reject suggested matches, with status filtering.

### Settings (`/settings`)
Configure ScraperAPI key, AI confidence thresholds, default review sources, and test the LLM API connection.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React with SSR + API routes |
| **Language** | TypeScript 5.2 | End-to-end type safety |
| **Database** | PostgreSQL + Prisma ORM | Relational data with type-safe queries |
| **Styling** | Tailwind CSS + Radix UI | Utility-first CSS with accessible primitives |
| **Charts** | Recharts | Analytics visualizations |
| **Animations** | Framer Motion | Smooth UI transitions |
| **Scraping** | Cheerio + ScraperAPI | HTML parsing + anti-bot proxy |
| **AI/LLM** | Abacus.AI (GPT-4.1 Mini) | Sentiment analysis, extraction, translation, matching |
| **Notifications** | react-hot-toast | In-app toast notifications |
| **Icons** | Lucide React | Consistent icon library |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Yarn package manager
- [Abacus.AI API key](https://apps.abacus.ai/) for LLM features
- [ScraperAPI key](https://www.scraperapi.com/) (optional, for enhanced scraping reliability)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/cpg-review-analyzer.git
cd cpg-review-analyzer

# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and ABACUSAI_API_KEY

# Set up the database
yarn prisma generate
yarn prisma db push

# Start the development server
yarn dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ABACUSAI_API_KEY` | Yes | Abacus.AI API key for LLM features |

> **Note:** The ScraperAPI key is stored in the database Settings table (not `.env`) so it can be configured through the UI.

---

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List all products (with filtering/sorting) |
| `POST` | `/api/products` | Create a new product (URL or manual) |
| `GET` | `/api/products/search?q=` | Full-text product search |
| `GET` | `/api/products/[id]` | Get product with reviews, matches, logs |
| `PUT` | `/api/products/[id]` | Update product details |
| `DELETE` | `/api/products/[id]` | Delete product and all related data |
| `POST` | `/api/products/[id]/scrape` | Trigger review scraping |
| `POST` | `/api/products/[id]/analyze` | Run AI sentiment analysis (SSE stream) |
| `POST` | `/api/products/[id]/cross-search` | Cross-store product search (SSE stream) |
| `POST` | `/api/products/[id]/translate` | Auto-translate non-English reviews |
| `GET/POST` | `/api/products/[id]/reviews` | Get or add reviews |
| `POST/PUT` | `/api/products/match` | AI product matching / manual linking |
| `PUT` | `/api/products/match/[id]` | Approve/reject a match |
| `GET` | `/api/triage` | List triage items |
| `PUT` | `/api/triage/[id]` | Approve/reject triage item |
| `GET/POST` | `/api/settings` | Read/update app settings |
| `POST` | `/api/settings/test` | Test LLM API connection |
| `GET` | `/api/analytics` | Aggregated analytics data |

---

## How the AI Pipeline Works

```
┌─────────────────────────────────────────────────────────┐
│  1. IMPORT                                              │
│  Paste URL → Resolve redirects → Scrape product details │
│  Cheerio selectors → LLM fallback extraction            │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│  2. SCRAPE REVIEWS                                      │
│  Fetch review pages → Cheerio extraction                │
│  ScraperAPI proxy → CAPTCHA bypass → LLM fallback       │
│  Auto-detect language → Translate to English             │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│  3. ANALYZE                                             │
│  Per-review: sentiment + confidence + AI summary        │
│  Product-level: themes, trends, actionable insights     │
│  All streamed via SSE with real-time progress            │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│  4. CROSS-STORE SEARCH                                  │
│  LLM generates query variations (specific → generic)    │
│  Try each against store API (Amazon, Walmart, Target)   │
│  Google fallback with site: operator                    │
│  Scrape found products → Import reviews                 │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│  5. MATCH & TRIAGE                                      │
│  AI identifies exact matches, variants, competitors     │
│  High-confidence: auto-suggested                        │
│  Low-confidence: routed to human triage queue           │
│  Manual linking available for edge cases                │
└─────────────────────────────────────────────────────────┘
```

---

## Extending with a Python Scraper

For advanced scraping use cases (Selenium, Scrapy, custom parsers), you can spin up a separate **Python scraper microservice** that shares the same PostgreSQL database. This allows you to:

- Write custom Python scrapers for niche retailers
- Use browser automation (Playwright/Selenium) for JS-heavy sites
- Run batch scraping jobs independently
- Insert products and reviews directly into the shared database

The Python service connects to the same `DATABASE_URL` and reads/writes the same `Product` and `Review` tables.

---

## Project Structure

```
nextjs_space/
├── app/
│   ├── api/                    # Backend API routes
│   │   ├── products/           # CRUD + scrape + analyze + cross-search
│   │   ├── analytics/          # Aggregated analytics endpoint
│   │   ├── settings/           # App configuration
│   │   └── triage/             # Human review queue
│   ├── (main)/                 # Frontend pages (with sidebar layout)
│   │   ├── products/[id]/      # Product detail (tabs: overview, reviews, AI, cross-store)
│   │   ├── analytics/          # Charts and metrics dashboard
│   │   ├── triage/             # Match review queue
│   │   └── settings/           # Configuration page
│   └── components/             # Shared UI components
│       ├── sidebar.tsx
│       ├── layout-wrapper.tsx
│       ├── product-modal.tsx
│       └── reviews-panel.tsx
├── lib/
│   ├── prisma.ts               # Singleton Prisma client
│   ├── scraper.ts              # Multi-strategy web scraper
│   ├── llm-extractor.ts        # LLM-based HTML extraction
│   └── translate.ts            # Auto-detection + translation
├── prisma/
│   └── schema.prisma           # Database schema
└── tailwind.config.ts
```

---

## License

MIT
