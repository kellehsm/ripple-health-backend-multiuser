import { FastifyInstance } from "fastify";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransactionsSyncRequest,
} from "plaid";
import { query } from "../db.js";

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
    });
    return tokenRes.data;
  });

  // Exchange the one-time public_token for a persistent access_token and store it
  app.post("/exchange-token", async (req, res) => {
    const user_id = req.user_id;
    const { public_token, institution_id, institution_name } = req.body as any;

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    await query(
      `INSERT INTO plaid_items
         (user_id, access_token, item_id, institution_id, institution_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         institution_id = EXCLUDED.institution_id,
         institution_name = EXCLUDED.institution_name`,
      [user_id, access_token, item_id, institution_id ?? null, institution_name ?? null]
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
        const balRes = await plaidClient.accountsBalanceGet({ access_token: item.access_token });
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
        item.access_token,
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
    await plaidClient.itemRemove({ access_token: rows[0].access_token }).catch(() => {});

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

    // Upsert new and modified transactions into spending_entries
    for (const tx of [...added, ...modified]) {
      // Skip transfers/income — these aren't expenses
      const primaryCategory = tx.personal_finance_category?.primary ?? "";
      if (primaryCategory.toLowerCase().includes("transfer") || primaryCategory.toLowerCase().includes("income")) {
        continue;
      }
      // Plaid: positive amount = money leaving the account (expense)
      if (tx.amount <= 0) continue;

      await query(
        `INSERT INTO spending_entries
           (user_id, amount, category, merchant_name, notes, source, plaid_transaction_id, logged_at)
         VALUES ($1, $2, $3, $4, $5, 'plaid', $6, $7)
         ON CONFLICT (plaid_transaction_id) DO UPDATE SET
           amount        = EXCLUDED.amount,
           category      = EXCLUDED.category,
           merchant_name = EXCLUDED.merchant_name,
           notes         = EXCLUDED.notes`,
        [
          user_id,
          tx.amount,
          mapPlaidCategory(tx.personal_finance_category, tx.name),
          tx.merchant_name ?? tx.name,
          tx.name,
          tx.transaction_id,
          tx.date + "T00:00:00Z",
        ]
      );
      totalAdded++;
    }

    // Remove transactions Plaid says were deleted/reversed
    for (const tx of removed) {
      await query(
        `DELETE FROM spending_entries WHERE plaid_transaction_id = $1 AND user_id = $2`,
        [tx.transaction_id, user_id]
      );
      totalRemoved++;
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
