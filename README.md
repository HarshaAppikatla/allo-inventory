# Allo Inventory — Multi-Warehouse Reservation & Operations Platform

Allo Inventory is a concurrency-safe multi-warehouse reservation and stock management platform designed for multi-warehouse e-commerce operations. Built using Next.js 14, Prisma, PostgreSQL (Supabase/Neon), and Tailwind CSS, it implements a SaaS-style three-layer portal architecture optimized for operational throughput and analytical telemetry.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Prisma ORM · PostgreSQL · Tailwind CSS · Zod

---

## 1. System Architecture: The Three-Layer Portals

The application partitions business responsibilities into three distinct operational interfaces:

```mermaid
graph TD
    subgraph Client Portals
        A[Customer Portal: / & /reservations] -->|Reserve / Extend / Schedule| API[Next.js API Routes]
        B[Operations Portal: /operations] -->|Fulfill / Replenish / Relocate| API
        C[Admin Dashboard: /admin] -->|Telemetry / Funnels / Config| API
    end

    subgraph Service & Concurrency Layer
        API -->|Transaction Context| IS[Inventory Service]
        API -->|Transaction Context| RS[Reservation Service]
    end

    subgraph Database Layer
        IS -->|ACID Transactions| DB[(PostgreSQL Supabase)]
        RS -->|Transactional Reservation Locks| DB
    end
```

### A. Customer Portal (`/` & `/reservations/[id]`)
* **Live Catalog Browsing:** Browse products with real-time stock levels aggregated across all warehouse nodes.
* **Temporary Stock Locking:** When checking out, a temporary hold is placed on inventory units (default: 10 minutes) to allow payment processing.
* **SVG Countdown Timer & Extension:** Displays a circular animated countdown ring. Allows users a one-time hold extension (+5 minutes) before expiration.
* **Delivery Scheduling:** Integrates a calendar delivery slot picker for scheduled shipments.
* **Fulfillment Timeline:** Tracks order progress through states: `Created` ➔ `Scheduled` ➔ `Confirmed/Paid` ➔ `Packed` ➔ `Dispatched` ➔ `Delivered`.
  > [!NOTE]
  > For scope simplicity and to focus on database correctness, logistics/fulfillment states (Packed, Dispatched, Delivered) are stored inside the `Reservation.metadata` payload rather than expanding the database-level `ReservationStatus` enum (which tracks the core inventory hold lifecycle: `PENDING`, `CONFIRMED`, `RELEASED`, `EXPIRED`).

### B. Operations Portal (`/operations`)
* **Fulfillment Queue:** Real-time queue for confirmed orders. Operators advance shipments through the logistics lifecycle (`Mark Packed`, `Mark Dispatched`, `Mark Delivered`).
* **Stock Adjustments Ledger:** Interface to restock inventory (RESTOCK), log damaged items (DAMAGE), or correct counts (CORRECTION).
* **Multi-Warehouse Relocations:** Safely transfer physical stock between warehouse nodes.

### C. Admin Dashboard (`/admin`)
* **SRE & Database Telemetry:** Live monitoring of API route latency and database query execution times to trace bottlenecks.
* **Operational Analytics & Funnels:** Visualizes sales conversion rates, reservation expiration ratios, and average confirmation times.
* **Financial Reporting:** Real-time metrics showing Total Revenue, Daily Revenue, and per-warehouse financial performance.
* **Audit Trails:** Immutable inventory adjustment histories and global reservation logs.
* **Catalog Management:** Create new product SKUs, assign initial stock layouts, and archive/deactivate existing catalog items.

---

## 2. Quick Start (Local Development)

### Prerequisites
* **Node.js** 18+
* **PostgreSQL** database instance (Supabase, Neon, or local Docker instance)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Define the configuration variables:
```env
# PostgreSQL connection strings (Neon / Supabase / Local)
# Note: For pooling proxies (e.g., PgBouncer), use DATABASE_URL for queries and DIRECT_URL for migrations.
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
DIRECT_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Authorization secret for cron execution
CRON_SECRET="your-secure-base64-secret"

# Public application base URL (required for headers & CORS)
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Hold duration in minutes
RESERVATION_TTL_MINUTES="10"
```

### 3. Database Schema Provisioning
Apply schema migrations to your database:
```bash
npx prisma migrate dev
```
*Note: In production environments, apply migrations using `npx prisma migrate deploy`.*

### 4. Seeding Sample Data
Generate warehouses, products, and default stock configurations:
```bash
npm run db:seed
```
This initializes:
* **3 Warehouses:** Mumbai Central (`wh_mumbai`), Delhi NCR (`wh_delhi`), Bangalore South (`wh_bangalore`).
* **5 Products:** Adaptive Mattress, Cloud Pillow, Gel Topper, Wood Bed Frame, Silk Blanket.
* **15 Stock Layouts:** With low-stock profiles (e.g., Delhi NCR Bed Frame contains exactly **1 unit**) to easily simulate and test concurrency behavior.

### 5. Launch Local Dev Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## 3. Concurrency Safety & Deadlock Prevention

The core backend engineering focus of the platform is ensuring absolute transactional consistency.

### A. Row-Level Locks (`SELECT FOR UPDATE`)
To prevent race conditions where two customers attempt to reserve the same last available unit simultaneously, the reservation creation logic executes under `ReadCommitted` transaction isolation with explicit row locks:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Acquire an exclusive row-level lock on the specific stock record
  const stock = await tx.$queryRaw<InventoryStockRow[]>`
    SELECT id, total_quantity, reserved_quantity
    FROM inventory_stocks
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `;

  // 2. Validate availability based on post-commit values
  const available = stock.total_quantity - stock.reserved_quantity;
  if (available < requestedQuantity) {
    throw new InsufficientStockError("Insufficient stock available");
  }

  // 3. Atomically update the reserved quantity
  await tx.$executeRaw`
    UPDATE inventory_stocks
    SET reserved_quantity = reserved_quantity + ${requestedQuantity}
    WHERE id = ${stock.id}
  `;

  // 4. Record the reservation details
  return await tx.reservation.create({ ... });
});
```

* **Outcome:** When Transaction A acquires the lock, Transaction B queues. Once Transaction A commits, Transaction B reads the updated `reserved_quantity`, identifies that available stock is `0`, and rolls back safely, returning an HTTP `409 Conflict` error to the client instead of overselling. Expired reservations return HTTP `410 Gone` and cannot be confirmed.

### B. Deadlock Avoidance in Transfers
Stock transfers modify records across multiple warehouses. If Transaction 1 locks Warehouse A then B, while Transaction 2 locks Warehouse B then A, a deadlock occurs.
* **Solution:** The platform orders row locking deterministically using string sorting on the inventory record IDs (`CUID`s). The application always locks the lexically smaller ID first, guaranteeing that concurrent transfers lock resources in the exact same sequence, preventing cyclical lock acquisition patterns that commonly produce deadlocks.

---

## 4. Performance Engineering & SRE Optimizations

The Admin telemetry dashboard was optimized to reduce response latency from 8+ seconds to sub-2-second operational latency using database-level aggregations, parallelized executions, and caching.

### A. Offloading Aggregations to PostgreSQL
Rather than querying thousands of raw rows and computing conversions or revenues in Node.js memory, metrics are computed directly in the database using native SQL execution plans:
* **Checkout Conversion Time:** `SELECT AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) FROM reservations`
* **Revenue Calculation:** Computes financial metrics in the database layer, dynamically multiplying quantity by snapped historical unit prices:
  ```sql
  SELECT SUM(r.quantity * COALESCE(NULLIF(r.unit_price, 0), p.price)) as total_revenue
  FROM reservations r
  JOIN products p ON r.product_id = p.id
  WHERE r.status = 'CONFIRMED'
  ```

### B. Waterfall Elimination (Parallel execution)
Independent dashboard queries (14 distinct data streams including revenue metrics, telemetry, stock levels, and audit logs) are grouped and executed concurrently inside a single `Promise.all` block. This reduces network latency down to the duration of the single slowest query rather than the cumulative sum of 14 sequential database trips.

### C. Edge & CDN Cache-Control Headers
The Admin stats route serves data using a Stale-While-Revalidate caching pattern:
```typescript
export const revalidate = 30; // Next.js route revalidation

// HTTP response header returns public edge instructions
headers: {
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=59'
}
```
* **Performance Impact:** Admin page updates bypass database hits entirely when cached, allowing warm-cache dashboard refreshes to resolve near-instantly.

### D. Targeted Database Indexes
To maintain fast execution plans as data tables scale:
* `@@unique([productId, warehouseId])` and `@@index([productId, warehouseId])` for highly optimized indexed inventory lookups.
* `@@index([status, expiresAt])` on reservations to optimize cron-based expirations.
* `@@index([status, confirmedAt])` and `@@index([warehouseId, status])` on reservations to speed up analytics aggregation.

---

## 5. Expiration & Idempotency Engines

### A. Dual Expiry Model
* **Background Worker (Active):** A scheduled Vercel Cron checks `GET /api/cron/cleanup` every 5 minutes to expire stale holds and return stock back to the available pool.
* **Lazy Expiration (Passive):** At confirmation (payment) time, the reservation service performs an inline check on `expiresAt`. If the reservation has expired, the checkout is rejected, marked `EXPIRED`, stock is freed, and an HTTP `410 Gone` status is returned immediately. Expired reservations return HTTP `410 Gone` and cannot be confirmed.

### B. Middleware-Based Idempotency Layer
To guard against network retries causing double-charging or duplicate reservations, the creation and confirmation API routes check client-submitted `Idempotency-Key` headers:
1. Replays previously processed responses (body and status code) from the `IdempotencyRecord` table.
2. Returns an `Idempotency-Replayed: true` header to indicate a cached response, short-circuiting double execution.

---

## 6. API Endpoint Registry

### Customer Endpoints
* `GET /api/products` - Returns all active products with aggregated stock counts and `isHot` contention flags.
* `GET /api/warehouses` - Lists all warehouse locations.
* `POST /api/reservations` - Places a temporary hold on stock. Supports `Idempotency-Key` headers.
* `GET /api/reservations/:id` - Retrieves reservation state, schedules, and historical timeline logs.
* `POST /api/reservations/:id/confirm` - Confirms purchase and permanently decrements stock. Supports `Idempotency-Key`.
* `POST /api/reservations/:id/release` - Relinquishes hold early, returning stock to the available pool.
* `POST /api/reservations/:id/extend` - Extends the hold window by +5 minutes (limited to 1 request).
* `POST /api/reservations/:id/schedule` - Schedules delivery date and window slots.

### Operations Endpoints
* `POST /api/operations/reservations/:id/fulfill` - Progresses the order fulfillment timeline (`PACKED`, `DISPATCHED`, `DELIVERED`).
* `PATCH /api/admin/inventory/:stockId` - Adjusts warehouse stock records (`RESTOCK`, `DAMAGE`, `CORRECTION`).
* `POST /api/admin/inventory/transfer` - Relocates inventory between nodes in a deadlock-free manner.

### Admin & Cron Endpoints
* `GET /api/admin/stats` - Retrieves telemetry, revenues, and conversion logs. Cached with SWR headers.
* `GET /api/cron/cleanup` - Background cleanup endpoint called by scheduling engines. Requires `Authorization: Bearer <CRON_SECRET>`.

---

## 7. Project Directory Structure

```
├── app/
│   ├── admin/                         # Admin Telemetry & Catalog Portal
│   ├── operations/                    # Logistics Queue & Stock Management Portal
│   ├── reservations/[id]/             # Checkout, Schedule, and Hold Status Portal
│   ├── api/
│   │   ├── admin/
│   │   │   ├── stats/route.ts         # Performance metrics & reports
│   │   │   ├── inventory/             # Stock adjustments and relocation transfers
│   │   │   └── products/route.ts      # Catalog management API
│   │   ├── cron/cleanup/route.ts      # Background reservation cleanup trigger
│   │   ├── operations/                # Order fulfillment pipeline triggers
│   │   ├── products/route.ts          # Customer catalog browsing API
│   │   └── reservations/              # Checkout, Confirm, Release, and Extend flows
│   ├── page.tsx                       # Customer Portal landing page
│   └── globals.css                    # Design system style definitions
├── components/                        # Shared UI component registry
├── lib/
│   ├── prisma.ts                      # Singleton Prisma Client configuration
│   ├── errors.ts                      # Custom application-level typed errors
│   ├── idempotency.ts                 # Idempotent middleware utilities
│   └── utils.ts                       # Currency, Date, and Visual formatters
├── schemas/
│   └── reservation.schema.ts          # Zod payload validation definitions
├── services/
│   ├── reservation.service.ts         # Core hold, confirmation, and release logic
│   └── inventory.service.ts           # Product catalog queries
├── prisma/
│   ├── schema.prisma                  # Database relations, keys, and indexes
│   └── seed.ts                        # Seed file containing test items
└── vercel.json                        # Cron configuration details
```

---

## 8. Deployment

### Deploying to Vercel

1. Push your repository to GitHub.
2. Import the repository into the Vercel dashboard.
3. Configure the following Environment Variables in Vercel:
   * `DATABASE_URL` (Use pooled connection URL for PgBouncer/Supabase transaction mode)
   * `DIRECT_URL` (Use direct connection URL for Prisma migrations)
   * `CRON_SECRET` (Secure random string to authenticate Cron triggers)
   * `NEXT_PUBLIC_APP_URL` (Your Vercel deployment URL, e.g., `https://your-app.vercel.app`)
4. Run Prisma database migrations:
   ```bash
   npx prisma migrate deploy
   ```
5. Seed the production database:
   ```bash
   npm run db:seed
   ```
6. Configure the Vercel Cron:
   Vercel automatically provisions cron execution for the path `/api/cron/cleanup` every 5 minutes based on the root [vercel.json](file:///e:/Allo%20Health/vercel.json) file.

---

## 9. Testing Concurrency

### Simulating Concurrent Reservations

The seeded inventory intentionally includes low-stock SKUs (for example, the Delhi NCR Bed Frame contains exactly **1 unit**) to demonstrate concurrency safety under load.

To test:
1. Open two browser windows simultaneously.
2. Attempt to reserve the final remaining unit from the same warehouse in both windows.
3. Observe the results:
   * One request succeeds with a `201 Created` status code.
   * The second request fails with a `409 Conflict` status code.

This validates the correctness of the PostgreSQL row-level locking (`SELECT FOR UPDATE`) strategy.

---

## 10. Architectural Tradeoffs & Future Roadmap

### Engineering Tradeoffs

To keep the implementation focused on transactional correctness and inventory lifecycle management, several production concerns were intentionally simplified:

* **No Authentication or RBAC:** User and role-based permissions were excluded from the core implementation scope to focus on transactional correctness.
* **Metadata-Based Shipment Tracking:** Shipment lifecycle states (`PACKED`, `DISPATCHED`, `DELIVERED`) are stored inside the `Reservation.metadata` json field rather than introducing normalized relational tables.
* **Telemetry Caching and Consistency:** Dashboard telemetry prioritizes eventual consistency and operational responsiveness over real-time synchronization guarantees by using stale-while-revalidate headers.

### Future Improvements

With additional engineering time, the platform could evolve toward:

* **Redis-Backed Distributed Caching:** For high-volume catalog reads to decrease database read loads.
* **Queue-Driven Expiration Workers:** Precisely targeted expiration using a worker queue model like BullMQ or RabbitMQ instead of periodic polling.
* **Realtime Synchronization:** WebSocket or Supabase Realtime synchronization to stream catalog and inventory updates instantly.
* **Audit & User Tracking:** Incorporating full RBAC authorization and user audit trails.
* **Observability:** Centralized logs aggregation and OpenTelemetry tracing integration.

---

## 11. Core Architectural Q&A

### Q: Why didn't you use Redis distributed locking?

For this workload, PostgreSQL row-level locking was sufficient because inventory consistency is fundamentally relational and transactional.

Using `SELECT FOR UPDATE` inside ACID transactions guarantees correctness directly at the database layer without introducing distributed coordination complexity, eventual consistency edge cases, or external lock invalidation concerns.

Since the assignment primarily focused on preventing overselling under concurrent reservations, keeping locking colocated with the source-of-truth database provided the simplest and most reliable correctness model.
