import { FastifyInstance } from "fastify";
import { pool, query } from "../db.js";

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;

// ── USDA nutrient field names ─────────────────────────────────────────────────
const CAFFEINE_NUTRIENT = "Caffeine";
const ALCOHOL_NUTRIENT  = "Alcohol, ethyl"; // g per 100g

type SubstanceType = "caffeine" | "alcohol";

interface SearchResult {
  source_food_id: string;
  name: string;
  caffeine_mg?: number | null;
  abv_percent?: number | null;
  source_db: string;
}

// ── USDA FDC search ───────────────────────────────────────────────────────────

async function usdaSearch(q: string, type: SubstanceType): Promise<SearchResult[]> {
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) return [];

  const nutrientName = type === "caffeine" ? CAFFEINE_NUTRIENT : ALCOHOL_NUTRIENT;
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}` +
    `&query=${encodeURIComponent(q)}&pageSize=14&dataType=Branded,Foundation,SR%20Legacy`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const results: SearchResult[] = [];
    for (const food of (data.foods ?? [])) {
      const nutrient = food.foodNutrients?.find((n: any) => n.nutrientName === nutrientName);
      if (!nutrient?.value) continue;

      if (type === "caffeine") {
        results.push({
          source_food_id: String(food.fdcId),
          name: food.description,
          caffeine_mg: nutrient.value, // mg per 100g
          source_db: "usda",
        });
      } else {
        // Alcohol, ethyl is g per 100g; ABV% ≈ g / 0.789
        results.push({
          source_food_id: String(food.fdcId),
          name: food.description,
          abv_percent: Math.round((nutrient.value / 0.789) * 10) / 10,
          source_db: "usda",
        });
      }
    }
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

// ── Open Food Facts fallback ──────────────────────────────────────────────────

async function offSearch(q: string, type: SubstanceType): Promise<SearchResult[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=10` +
    `&fields=product_name,generic_name,nutriments,code`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const results: SearchResult[] = [];
    for (const product of (data.products ?? [])) {
      const n = product.nutriments ?? {};
      const name = (product.product_name || product.generic_name)?.trim();
      if (!name) continue;

      if (type === "caffeine") {
        // OFF stores caffeine in mg per 100g or per serving
        const mg = n["caffeine_serving"] ?? n["caffeine_100g"] ?? null;
        if (!mg) continue;
        results.push({
          source_food_id: product.code || `off-${results.length}`,
          name,
          caffeine_mg: mg,
          source_db: "openfoodfacts",
        });
      } else {
        // OFF stores alcohol in g per 100g — for aqueous beverages this ≈ ABV%
        const abv = n["alcohol_100g"] ?? null;
        if (!abv) continue;
        results.push({
          source_food_id: product.code || `off-${results.length}`,
          name,
          abv_percent: abv,
          source_db: "openfoodfacts",
        });
      }
    }
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

// ── Standard drinks helper (used in summary queries) ─────────────────────────
// 1 US standard drink = 14g pure ethanol
// ethanol_g = (abv_percent / 100) × volume_ml × 0.789
const STD_DRINK_SQL = `
  ROUND(
    CAST(
      SUM(CASE WHEN substance_type = 'alcohol' AND abv_percent IS NOT NULL AND volume_ml IS NOT NULL
            THEN (abv_percent / 100.0) * volume_ml * 0.789 / 14.0
            ELSE 0 END
      ) AS numeric
    ), 1
  )`;

// ── Routes ────────────────────────────────────────────────────────────────────

export default async function substancesRoutes(app: FastifyInstance) {
  // GET /api/substances/search?query=X&type=caffeine|alcohol
  app.get("/search", async (req) => {
    const { query: q, type } = req.query as { query?: string; type?: string };
    if (!q?.trim()) return { error: "missing query param" };
    if (type !== "caffeine" && type !== "alcohol") return { error: "type must be 'caffeine' or 'alcohol'" };

    const usda = await usdaSearch(q, type);
    if (usda.length > 0) return usda;
    return offSearch(q, type);
  });

  // POST /api/substances — log an entry
  app.post<{ Body: any }>("/", async (req) => {
    const {
      user_id = DEFAULT_USER_ID,
      substance_type,
      name,
      caffeine_mg = null,
      abv_percent = null,
      volume_ml = null,
      source_db = "manual",
      logged_at = null,
    } = req.body;

    if (!user_id) return { error: "user_id required" };
    if (!substance_type) return { error: "substance_type required" };

    const [row] = await query<any>(
      `INSERT INTO substance_logs
         (user_id, substance_type, name, caffeine_mg, abv_percent, volume_ml, source_db, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
       RETURNING *`,
      [user_id, substance_type, name, caffeine_mg, abv_percent, volume_ml, source_db, logged_at]
    );
    return row;
  });

  // GET /api/substances?user_id=X&date=YYYY-MM-DD
  app.get<{ Querystring: any }>("/", async (req) => {
    const { user_id = DEFAULT_USER_ID, date } = req.query;
    if (!user_id) return { error: "user_id required" };

    const rows = date
      ? await query<any>(
          `SELECT * FROM substance_logs
           WHERE user_id = $1 AND logged_at::date = $2::date
           ORDER BY logged_at ASC`,
          [user_id, date]
        )
      : await query<any>(
          `SELECT * FROM substance_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`,
          [user_id]
        );

    const caffeineMg = rows
      .filter(r => r.substance_type === "caffeine" && r.caffeine_mg != null)
      .reduce((s: number, r: any) => s + Number(r.caffeine_mg), 0);

    const standardDrinks = rows
      .filter(r => r.substance_type === "alcohol" && r.abv_percent != null && r.volume_ml != null)
      .reduce((s: number, r: any) =>
        s + ((Number(r.abv_percent) / 100) * Number(r.volume_ml) * 0.789) / 14, 0);

    return {
      entries: rows,
      totals: {
        caffeine_mg: Math.round(caffeineMg),
        standard_drinks: Math.round(standardDrinks * 10) / 10,
      },
    };
  });

  // GET /api/substances/summary?user_id=X&start=D1&end=D2
  app.get<{ Querystring: any }>("/summary", async (req) => {
    const { user_id = DEFAULT_USER_ID, start, end } = req.query;
    if (!user_id) return { error: "user_id required" };

    const rows = await query<any>(
      `SELECT
         logged_at::date AS date,
         ROUND(SUM(CASE WHEN substance_type = 'caffeine' THEN caffeine_mg ELSE 0 END)) AS caffeine_mg,
         ${STD_DRINK_SQL} AS standard_drinks
       FROM substance_logs
       WHERE user_id = $1
         AND ($2::date IS NULL OR logged_at::date >= $2::date)
         AND ($3::date IS NULL OR logged_at::date <= $3::date)
       GROUP BY logged_at::date
       ORDER BY date`,
      [user_id, start ?? null, end ?? null]
    );

    return rows.map((r: any) => ({
      date: r.date,
      caffeine_mg: Number(r.caffeine_mg),
      standard_drinks: Number(r.standard_drinks),
    }));
  });

  // DELETE /api/substances/:id
  app.delete<{ Params: { id: string } }>("/:id", async (req) => {
    await pool.query(`DELETE FROM substance_logs WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });
}
