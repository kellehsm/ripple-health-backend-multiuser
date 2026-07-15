import { FastifyInstance } from "fastify";

export default async function foodRoutes(app: FastifyInstance) {
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
      };
    });

    return results;
  });

  app.get("/barcode/:code", async (req) => {
    const { code } = req.params as any;
    const { type } = req.query as any; // "caffeine" | "alcohol" | undefined
    const isSubstance = type === "caffeine" || type === "alcohol";
    const apiKey = process.env.USDA_FDC_API_KEY;

    // Try USDA Branded Foods first — label data with reliable serving sizes
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
          const match = (searchData.foods ?? []).find(
            (f: any) => f.gtinUpc === code
          );
          if (match) {
            const detailRes = await fetch(
              `https://api.nal.usda.gov/fdc/v1/food/${match.fdcId}?api_key=${apiKey}`
            );
            if (detailRes.ok) {
              const detail = await detailRes.json();

              if (isSubstance) {
                // Individual food endpoint uses n.nutrient.name + n.amount (not n.nutrientName + n.value)
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
                // Product exists but has no caffeine/alcohol data — fall through to OFF
              } else {
                const lbl = detail.labelNutrients ?? {};
                const servingSize =
                  detail.servingSize != null && detail.servingSizeUnit
                    ? `${detail.servingSize}${detail.servingSizeUnit}`
                    : null;
                return {
                  source_food_id: String(detail.fdcId),
                  name: detail.description,
                  calories: lbl.calories?.value ?? null,
                  carbs_g: lbl.carbohydrates?.value ?? null,
                  sugar_g: lbl.sugars?.value ?? null,
                  serving_size: servingSize,
                  basis: "per_serving",
                  image_url: null,
                  source_db: "usda_branded",
                };
              }
            }
          }
        }
      } catch {
        // fall through to Open Food Facts
      }
    }

    // Fall back to Open Food Facts
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
    const res = await fetch(url);
    if (!res.ok) return { error: `Open Food Facts API error ${res.status}` };
    const data = await res.json();

    if (data.status !== 1) return { error: "product not found" };

    const p = data.product;
    const n = p.nutriments ?? {};

    if (isSubstance) {
      if (type === "caffeine") {
        const mg = n["caffeine_serving"] ?? n["caffeine_100g"] ?? null;
        if (mg == null) return { error: "product not found" };
        return {
          source_food_id: code,
          name: p.product_name || p.generic_name || "Unknown product",
          caffeine_mg: mg,
          source_db: "openfoodfacts",
        };
      } else {
        const abv = n["alcohol_serving"] ?? n["alcohol_100g"] ?? null;
        if (abv == null) return { error: "product not found" };
        return {
          source_food_id: code,
          name: p.product_name || p.generic_name || "Unknown product",
          abv_percent: abv,
          source_db: "openfoodfacts",
        };
      }
    }

    const hasServing =
      n["energy-kcal_serving"] != null ||
      n["carbohydrates_serving"] != null ||
      n["sugars_serving"] != null;

    const basis = hasServing ? "per_serving" : "per_100g";

    return {
      source_food_id: code,
      name: p.product_name || p.generic_name || "Unknown product",
      calories: n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? null,
      carbs_g: n["carbohydrates_serving"] ?? n["carbohydrates_100g"] ?? null,
      sugar_g: n["sugars_serving"] ?? n["sugars_100g"] ?? null,
      serving_size: p.serving_size ?? null,
      basis,
      image_url: p.image_front_small_url ?? null,
      source_db: "openfoodfacts",
    };
  });
}
