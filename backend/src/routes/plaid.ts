import { FastifyInstance } from "fastify";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransactionsSyncRequest,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
} from "plaid";
import { query } from "../db.js";
import { encryptCredential, decryptCredential } from "../lib/credCrypto.js";
import crypto from "crypto";

const env = process.env.PLAID_ENV ?? "production";
const secret =
  env === "sandbox"
    ? process.env.PLAID_SANDBOX_SECRET
    : process.env.PLAID_PRODUCTION_SECRET;

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14",
      },
    },
  })
);

// Map Plaid's primary category to our spending_entries category values
function mapPlaidCategory(personal_finance_category: any, name: string): string {
  if (!personal_finance_category) return "Other";
  const primary = (personal_finance_category.primary ?? "").toLowerCase();
  const detailed = (personal_finance_category.detailed ?? "").toLowerCase();

  if (primary.includes("food") || primary.includes("restaurant") || detailed.includes("groceries")) return "Food & Dining";
  if (primary.includes("transport") || primary.includes("travel")) return "Transport";
  if (primary.includes("entertainment") || primary.includes("recreation")) return "Entertainment";
  if (primary.includes("health") || primary.includes("medical")) return "Health";
  if (primary.includes("shop") || primary.includes("merchandise")) return "Shopping";
  if (primary.includes("personal_care")) return "Personal Care";
  if (primary.includes("home") || primary.includes("utilities")) return "Home";
  if (primary.includes("income") || primary.includes("transfer")) return "Income / Transfer";
  if (primary.includes("subscription") || primary.includes("service")) return "Subscriptions";
  return "Other";
}

export default async function plaidRoutes(app: FastifyInstance) {
  const WEBHOOK_URL = `${process.env.API_BASE_URL ?? "https://app.kels.gg/api"}/plaid/webhook`;

  // Create a Link token for this user — called before opening Plaid Link on the device
  app.post("/create-link-token", async (req, res) => {
    const user_id = req.user_id;
    const tokenRes = await plaidClient.linkTokenCreate({
      user: { client_user_id: user_id },
      client_name: "Ripple Wellness",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      android_package_name: process.env.PLAID_ANDROID_PACKAGE_NAME,
      webhook: WEBHOOK_URL,
    });
    return tokenRes.data;
  });

  // Exchange the one-time public_token for a persistent access_token and store it
  app.post("/exchange-token", async (req, res) => {
    const user_id = req.user_id;
    const { public_token, institution_id, institution_name } = req.body as any;

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    // Encrypt the Plaid access_token at rest — same AES-256-GCM helper used
    // for Dexcom Share and Hardcover credentials. Every read below runs the
    // token through decryptCredential(), which passes plaintext through
    // unchanged so a rolling deploy is safe before the boot-time sweep runs.
    await query(
      `INSERT INTO plaid_items
         (user_id, access_token, item_id, institution_id, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         institution_id = EXCLUDED.institution_id,
         institution_name = EXCLUDED.institution_name`,
      [user_id, encryptCredential(access_token), item_id, institution_id ?? null, institution_name ?? null]
    );

    // Kick off initial transaction sync right away
    await syncTransactionsForItem(user_id, item_id, access_token, null);

    return { ok: true, institution_name };
  });

  // Get all linked accounts + balances for this user
  app.get("/accounts", async (req) => {
    const user_id = req.user_id;
    const items = await query<{ item_id: string; access_token: string; institution_name: string; last_synced_at: string }>(
      `SELECT item_id, access_token, institution_name, last_synced_at FROM plaid_items WHERE user_id = $1`,
      [user_id]
    );

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const balRes = await plaidClient.accountsBalanceGet({ access_token: decryptCredential(item.access_token) });
        return {
          item_id: item.item_id,
          institution_name: item.institution_name,
          last_synced_at: item.last_synced_at,
          accounts: balRes.data.accounts.map((a) => ({
            account_id: a.account_id,
            name: a.name,
            official_name: a.official_name,
            type: a.type,
            subtype: a.subtype,
            balance_current: a.balances.current,
            balance_available: a.balances.available,
            iso_currency_code: a.balances.iso_currency_code,
          })),
        };
      })
    );

    return results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<any>).value);
  });

  // Sync new/updated/removed transactions for all linked items
  app.post("/sync", async (req) => {
    const user_id = req.user_id;
    const items = await query<{ item_id: string; access_token: string; cursor: string | null }>(
      `SELECT item_id, access_token, cursor FROM plaid_items WHERE user_id = $1`,
      [user_id]
    );

    let total_added = 0;
    let total_removed = 0;

    for (const item of items) {
      const { added, removed } = await syncTransactionsForItem(
        user_id,
        item.item_id,
        decryptCredential(item.access_token),
        item.cursor
      );
      total_added += added;
      total_removed += removed;
    }

    return { ok: true, total_added, total_removed };
  });

  // Disconnect (remove) a linked bank account
  app.delete("/items/:itemId", async (req) => {
    const user_id = req.user_id;
    const { itemId } = req.params as any;

    const rows = await query<{ access_token: string }>(
      `SELECT access_token FROM plaid_items WHERE item_id = $1 AND user_id = $2`,
      [itemId, user_id]
    );
    if (!rows[0]) return { ok: false, error: "Not found" };

    // Remove from Plaid
    await plaidClient.itemRemove({ access_token: decryptCredential(rows[0].access_token) }).catch(() => {});

    // Delete local record and all Plaid-sourced transactions for this item
    await query(`DELETE FROM plaid_items WHERE item_id = $1 AND user_id = $2`, [itemId, user_id]);

    return { ok: true };
  });

  // List linked institutions for this user (for settings/management UI)
  app.get("/items", async (req) => {
    const user_id = req.user_id;
    return query(
      `SELECT item_id, institution_id, institution_name, last_synced_at, connected_at
       FROM plaid_items WHERE user_id = $1 ORDER BY connected_at DESC`,
      [user_id]
    );
  });

  // Verify the Plaid-Verification JWT on incoming webhooks (ES256, key fetched
  // via /webhook_verification_key/get). See https://plaid.com/docs/api/webhooks/webhook-verification/
  async function verifyPlaidWebhook(req: any): Promise<boolean> {
    try {
      const token = req.headers["plaid-verification"] as string | undefined;
      if (!token) return false;
      const parts = token.split(".");
      if (parts.length !== 3) return false;

      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

      const keyRes = await plaidClient.webhookVerificationKeyGet({ key_id: header.kid });
      const jwk: any = keyRes.data.key;
      if (jwk.expired_at != null) return false;
      const publicKey = crypto.createPublicKey({
        key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
        format: "jwk",
      });

      // JWT ES256 signatures are raw r||s (IEEE P1363), not DER
      const valid = crypto.verify(
        "sha256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(parts[2], "base64url")
      );
      if (!valid) return false;

      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      // Reject tokens older than 5 minutes (replay protection, per Plaid docs)
      if (typeof payload.iat !== "number" || Date.now() / 1000 - payload.iat > 5 * 60) return false;

      // Body integrity: the JWT covers the sha256 of the exact raw request body
      const rawBody = (req as any).rawBody;
      if (typeof rawBody !== "string") return false;
      const bodyHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
      return crypto.timingSafeEqual(Buffer.from(bodyHash), Buffer.from(String(payload.request_body_sha256 ?? "")));
    } catch {
      return false;
    }
  }

  // Public webhook receiver — Plaid calls this when transactions are ready
  // Registered as public in server.ts PUBLIC_PREFIXES
  app.post("/webhook", { config: { public: true } } as any, async (req, reply) => {
    if (!(await verifyPlaidWebhook(req))) {
      req.log.warn("Plaid webhook rejected: signature verification failed");
      return reply.code(401).send({ ok: false });
    }

    const body = req.body as any;
    const { webhook_type, webhook_code, item_id } = body ?? {};

    if (webhook_type !== "TRANSACTIONS") {
      return reply.send({ ok: true });
    }

    // SYNC_UPDATES_AVAILABLE, INITIAL_UPDATE, HISTORICAL_UPDATE all mean: sync now
    const syncCodes = ["SYNC_UPDATES_AVAILABLE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "DEFAULT_UPDATE"];
    if (!syncCodes.includes(webhook_code)) {
      return reply.send({ ok: true });
    }

    const rows = await query<{ user_id: string; access_token: string; cursor: string | null }>(
      `SELECT user_id, access_token, cursor FROM plaid_items WHERE item_id = $1`,
      [item_id]
    );
    if (!rows[0]) return reply.send({ ok: true });

    const { user_id, access_token, cursor } = rows[0];
    await syncTransactionsForItem(user_id, item_id, decryptCredential(access_token), cursor).catch(() => {});

    return reply.send({ ok: true });
  });

  // Sandbox-only: fire a TRANSACTIONS webhook on demand for testing
  app.post("/sandbox/fire-webhook", async (req) => {
    if (env !== "sandbox") return { ok: false, error: "Only available in sandbox mode" };
    const user_id = req.user_id;
    const rows = await query<{ item_id: string; access_token: string }>(
      `SELECT item_id, access_token FROM plaid_items WHERE user_id = $1 ORDER BY connected_at DESC LIMIT 1`,
      [user_id]
    );
    if (!rows[0]) return { ok: false, error: "No linked item found" };

    await plaidClient.sandboxItemFireWebhook({
      access_token: decryptCredential(rows[0].access_token),
      webhook_code: SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
    });

    return { ok: true, item_id: rows[0].item_id };
  });

  // Sandbox-only: create a custom test transaction and sync it in
  app.post("/sandbox/create-transaction", async (req) => {
    if (env !== "sandbox") return { ok: false, error: "Only available in sandbox mode" };
    const user_id = req.user_id;
    const { amount, description, category_override } = req.body as any;

    const rows = await query<{ item_id: string; access_token: string; cursor: string | null }>(
      `SELECT item_id, access_token, cursor FROM plaid_items WHERE user_id = $1 ORDER BY connected_at DESC LIMIT 1`,
      [user_id]
    );
    if (!rows[0]) return { ok: false, error: "No linked item found" };

    // Plaid sandbox creates transactions organically via user_transactions_dynamic.
    // We fire the webhook so the backend pulls whatever Plaid has generated.
    const plainToken = decryptCredential(rows[0].access_token);
    await plaidClient.sandboxItemFireWebhook({
      access_token: plainToken,
      webhook_code: SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
    });

    // Sync immediately so the caller sees the result right away
    const { added } = await syncTransactionsForItem(
      user_id, rows[0].item_id, plainToken, rows[0].cursor
    );

    return { ok: true, synced: added };
  });
}

// Cursor-based transaction sync — updates spending_entries via upsert
async function syncTransactionsForItem(
  user_id: string,
  item_id: string,
  access_token: string,
  cursor: string | null
): Promise<{ added: number; removed: number }> {
  let nextCursor = cursor ?? undefined;
  let hasMore = true;
  let totalAdded = 0;
  let totalRemoved = 0;

  while (hasMore) {
    const req: TransactionsSyncRequest = { access_token };
    if (nextCursor) req.cursor = nextCursor;

    const res = await plaidClient.transactionsSync(req);
    const { added, modified, removed, next_cursor, has_more } = res.data;

    // Collect eligible upserts, then bulk-insert in chunks of 500
    type TxRow = [string, number, string, string, string, string, string];
    const toUpsert: TxRow[] = [];
    for (const tx of [...added, ...modified]) {
      // Skip transfers/income — these aren't expenses
      const primaryCategory = tx.personal_finance_category?.primary ?? "";
      if (primaryCategory.toLowerCase().includes("transfer") || primaryCategory.toLowerCase().includes("income")) {
        continue;
      }
      // Plaid: positive amount = money leaving the account (expense)
      if (tx.amount <= 0) continue;
      toUpsert.push([
        user_id,
        tx.amount,
        mapPlaidCategory(tx.personal_finance_category, tx.name),
        tx.merchant_name ?? tx.name,
        tx.name,
        tx.transaction_id,
        tx.date + "T00:00:00Z",
      ]);
    }

    const CHUNK = 500;
    for (let i = 0; i < toUpsert.length; i += CHUNK) {
      const chunk = toUpsert.slice(i, i + CHUNK);
      const params: any[] = [];
      const valueClauses = chunk.map((row) => {
        const base = params.length + 1;
        params.push(...row);
        return `($${base},$${base+1},$${base+2},$${base+3},$${base+4},'plaid',$${base+5},$${base+6})`;
      });
      await query(
        `INSERT INTO spending_entries
           (user_id, amount, category, merchant_name, notes, source, plaid_transaction_id, logged_at)
         VALUES ${valueClauses.join(",")}
         ON CONFLICT (plaid_transaction_id) DO UPDATE SET
           amount        = EXCLUDED.amount,
           category      = EXCLUDED.category,
           merchant_name = EXCLUDED.merchant_name,
           notes         = EXCLUDED.notes`,
        params
      );
    }
    totalAdded += toUpsert.length;

    // Remove transactions Plaid says were deleted/reversed (single batched DELETE)
    if (removed.length > 0) {
      const removedIds = removed.map((tx) => tx.transaction_id);
      await query(
        `DELETE FROM spending_entries WHERE plaid_transaction_id = ANY($1) AND user_id = $2`,
        [removedIds, user_id]
      );
      totalRemoved += removed.length;
    }

    nextCursor = next_cursor;
    hasMore = has_more;
  }

  // Save the latest cursor so the next sync starts where this one left off
  await query(
    `UPDATE plaid_items SET cursor = $1, last_synced_at = NOW() WHERE item_id = $2`,
    [nextCursor ?? null, item_id]
  );

  return { added: totalAdded, removed: totalRemoved };
}
