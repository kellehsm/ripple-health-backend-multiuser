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

    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
    const res = await fetch(url);
    if (!res.ok) return { error: `Open Food Facts API error ${res.status}` };
    const data = await res.json();

    if (data.status !== 1) return { error: "product not found" };

    const p = data.product;
    const n = p.nutriments ?? {};

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
    };
  });
}
