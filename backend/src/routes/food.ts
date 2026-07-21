import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function foodRoutes(app: FastifyInstance) {
  // ── Text search (USDA Foundation + SR Legacy) ──────────────────────────────

  app.get("/search", async (req) => {
    const { q } = req.query as any;
    const apiKey = process.env.USDA_FDC_API_KEY;
    if (!apiKey) return { error: "USDA_FDC_API_KEY not set in .env" };
    if (!q) return { error: "missing query param 'q'" };

    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(
      q
    )}&pageSize=8&dataType=Foundation,SR%20Legacy`;

    const res = await fetch(url);
    if (!res.ok) return { error: `USDA API error ${res.status}` };
    const data = await res.json();

    const results = (data.foods ?? []).map((food: any) => {
      const getNutrient = (name: string) =>
        food.foodNutrients?.find((n: any) => n.nutrientName === name)?.value ?? null;

      return {
        source_food_id: String(food.fdcId),
        name: food.description,
        calories: getNutrient("Energy"),
        carbs_g: getNutrient("Carbohydrate, by difference"),
        sugar_g: getNutrient("Sugars, total including NLEA"),
        sodium_mg: getNutrient("Sodium, Na"),
        caffeine_mg: getNutrient("Caffeine"),
      };
    });

    return results;
  });

  // ── Barcode lookup ─────────────────────────────────────────────────────────

  app.get("/barcode/:code", async (req) => {
    const { code } = req.params as any;
    const { type } = req.query as any; // "caffeine" | "alcohol" | undefined
    const isSubstance = type === "caffeine" || type === "alcohol";
    const user_id: string | undefined = (req as any).user_id;
    const apiKey = process.env.USDA_FDC_API_KEY;

    // 1. User correction takes priority — skip external lookup entirely if found
    if (user_id) {
      const corrRow = (await query(
        `SELECT * FROM barcode_corrections WHERE user_id = $1 AND barcode = $2`,
        [user_id, code]
      ))[0] ?? null;

      if (corrRow) {
        if (type === "caffeine" && corrRow.corrected_caffeine_mg != null) {
          return {
            source_food_id: code,
            name: corrRow.corrected_name ?? "Saved product",
            caffeine_mg: Number(corrRow.corrected_caffeine_mg),
            source_db: "user_correction",
          };
        }
        if (type === "alcohol" && corrRow.corrected_abv_percent != null) {
          return {
            source_food_id: code,
            name: corrRow.corrected_name ?? "Saved product",
            abv_percent: Number(corrRow.corrected_abv_percent),
            source_db: "user_correction",
          };
        }
        if (!isSubstance && (corrRow.corrected_name != null || corrRow.corrected_carbs_g != null || corrRow.corrected_calories != null)) {
          return {
            source_food_id: code,
            name: corrRow.corrected_name ?? "Saved product",
            calories: corrRow.corrected_calories != null ? Number(corrRow.corrected_calories) : null,
            carbs_g: corrRow.corrected_carbs_g != null ? Number(corrRow.corrected_carbs_g) : null,
            sugar_g: corrRow.corrected_sugar_g != null ? Number(corrRow.corrected_sugar_g) : null,
            serving_size: corrRow.corrected_serving_size ?? null,
            basis: "per_serving",
            image_url: null,
            source_db: "user_correction",
          };
        }
      }
    }

    // 2. Try USDA Branded Foods
    let usdaResult: Record<string, any> | null = null;

    if (apiKey) {
      try {
        const searchRes = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: code, dataType: ["Branded"] }),
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const match = (searchData.foods ?? []).find((f: any) => f.gtinUpc === code);
          if (match) {
            const detailRes = await fetch(
              `https://api.nal.usda.gov/fdc/v1/food/${match.fdcId}?api_key=${apiKey}`
            );
            if (detailRes.ok) {
              const detail = await detailRes.json();

              if (isSubstance) {
                const nutrientName = type === "caffeine" ? "Caffeine" : "Alcohol, ethyl";
                const hit = (detail.foodNutrients ?? []).find(
                  (n: any) => (n.nutrient?.name ?? n.nutrientName) === nutrientName
                );
                const rawValue = hit?.amount ?? hit?.value ?? null;
                if (rawValue != null) {
                  return {
                    source_food_id: String(detail.fdcId),
                    name: detail.description,
                    caffeine_mg: type === "caffeine" ? rawValue : undefined,
                    abv_percent: type === "alcohol"
                      ? Math.round((rawValue / 0.789) * 10) / 10
                      : undefined,
                    source_db: "usda_branded",
                  };
                }
                // Product found but lacks substance data — capture name for merge with OFF
                usdaResult = {
                  source_food_id: String(detail.fdcId),
                  name: detail.description,
                };
              } else {
                const lbl = detail.labelNutrients ?? {};
                const servingSize =
                  detail.servingSize != null && detail.servingSizeUnit
                    ? `${detail.servingSize}${detail.servingSizeUnit}`
                    : null;
                const usdaCalories = lbl.calories?.value ?? null;
                const usdaCarbs = lbl.carbohydrates?.value ?? null;
                const usdaSugar = lbl.sugars?.value ?? null;
                const usdaSodium = lbl.sodium?.value ?? null;
                const caffNutrient = (detail.foodNutrients ?? []).find(
                  (n: any) => (n.nutrient?.name ?? n.nutrientName) === "Caffeine"
                );
                const usdaCaffeine = caffNutrient?.amount ?? caffNutrient?.value ?? null;

                usdaResult = {
                  source_food_id: String(detail.fdcId),
                  name: detail.description,
                  calories: usdaCalories,
                  carbs_g: usdaCarbs,
                  sugar_g: usdaSugar,
                  sodium_mg: usdaSodium,
                  caffeine_mg: usdaCaffeine,
                  serving_size: servingSize,
                  basis: "per_serving",
                  image_url: null,
                  source_db: "usda_branded",
                };

                // Return immediately if USDA has the key fields — skip OFF entirely
                if (usdaCalories != null && usdaCarbs != null) {
                  return usdaResult;
                }
              }
            }
          }
        }
      } catch {
        // fall through to Open Food Facts
      }
    }

    // 3. Open Food Facts — primary if USDA missed, or gap-filler for food merging
    try {
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
      const offRes = await fetch(offUrl);

      if (!offRes.ok) {
        if (usdaResult) return usdaResult;
        return { error: `Open Food Facts API error ${offRes.status}` };
      }

      const data = await offRes.json();
      if (data.status !== 1) {
        if (usdaResult) return usdaResult;
        return { error: "product not found" };
      }

      const p = data.product;
      const n = p.nutriments ?? {};

      if (isSubstance) {
        if (type === "caffeine") {
          const mg = n["caffeine_serving"] ?? n["caffeine_100g"] ?? null;
          if (mg == null) {
            if (usdaResult) return { ...usdaResult, caffeine_mg: null, source_db: "usda_branded" };
            return { error: "product not found" };
          }
          return {
            source_food_id: usdaResult?.source_food_id ?? code,
            name: usdaResult?.name ?? p.product_name ?? p.generic_name ?? "Unknown product",
            caffeine_mg: mg,
            source_db: "openfoodfacts",
          };
        } else {
          const abv = n["alcohol_serving"] ?? n["alcohol_100g"] ?? null;
          if (abv == null) {
            if (usdaResult) return { ...usdaResult, abv_percent: null, source_db: "usda_branded" };
            return { error: "product not found" };
          }
          return {
            source_food_id: usdaResult?.source_food_id ?? code,
            name: usdaResult?.name ?? p.product_name ?? p.generic_name ?? "Unknown product",
            abv_percent: abv,
            source_db: "openfoodfacts",
          };
        }
      }

      // Food: merge USDA (primary) + OFF (gap-filler)
      const hasServing =
        n["energy-kcal_serving"] != null ||
        n["carbohydrates_serving"] != null ||
        n["sugars_serving"] != null;
      const basis = hasServing ? "per_serving" : "per_100g";
      const offCalories = n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? null;
      const offCarbs = n["carbohydrates_serving"] ?? n["carbohydrates_100g"] ?? null;
      const offSugar = n["sugars_serving"] ?? n["sugars_100g"] ?? null;
      const offSodiumG = n["sodium_serving"] ?? n["sodium_100g"] ?? null;
      const offSodiumMg = offSodiumG != null ? Math.round(offSodiumG * 1000) : null;
      const offCaffeine = n["caffeine_serving"] ?? n["caffeine_100g"] ?? null;

      if (usdaResult) {
        return {
          source_food_id: usdaResult.source_food_id,
          name: usdaResult.name,
          calories: usdaResult.calories ?? offCalories,
          carbs_g: usdaResult.carbs_g ?? offCarbs,
          sugar_g: usdaResult.sugar_g ?? offSugar,
          sodium_mg: usdaResult.sodium_mg ?? offSodiumMg,
          caffeine_mg: usdaResult.caffeine_mg ?? offCaffeine,
          serving_size: usdaResult.serving_size ?? p.serving_size ?? null,
          basis: usdaResult.serving_size ? "per_serving" : basis,
          image_url: p.image_front_small_url ?? null,
          source_db: "usda_branded",
        };
      }

      return {
        source_food_id: code,
        name: p.product_name ?? p.generic_name ?? "Unknown product",
        calories: offCalories,
        carbs_g: offCarbs,
        sugar_g: offSugar,
        sodium_mg: offSodiumMg,
        caffeine_mg: offCaffeine,
        serving_size: p.serving_size ?? null,
        basis,
        image_url: p.image_front_small_url ?? null,
        source_db: "openfoodfacts",
      };
    } catch {
      if (usdaResult) return usdaResult;
      return { error: "product not found" };
    }
  });

  // ── Upsert a manual correction for a barcode ───────────────────────────────

  app.post("/barcode/:code/correction", async (req) => {
    const { code } = req.params as any;
    const user_id: string = (req as any).user_id;
    const { name, carbs_g, calories, sugar_g, caffeine_mg, abv_percent, serving_size } = req.body as any;

    await query(
      `INSERT INTO barcode_corrections
         (user_id, barcode, corrected_name, corrected_carbs_g, corrected_calories,
          corrected_sugar_g, corrected_caffeine_mg, corrected_abv_percent, corrected_serving_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, barcode) DO UPDATE SET
         corrected_name          = EXCLUDED.corrected_name,
         corrected_carbs_g       = EXCLUDED.corrected_carbs_g,
         corrected_calories      = EXCLUDED.corrected_calories,
         corrected_sugar_g       = EXCLUDED.corrected_sugar_g,
         corrected_caffeine_mg   = EXCLUDED.corrected_caffeine_mg,
         corrected_abv_percent   = EXCLUDED.corrected_abv_percent,
         corrected_serving_size  = EXCLUDED.corrected_serving_size,
         created_at              = now()`,
      [user_id, code,
       name ?? null, carbs_g ?? null, calories ?? null,
       sugar_g ?? null, caffeine_mg ?? null, abv_percent ?? null, serving_size ?? null]
    );

    return { ok: true };
  });
}
