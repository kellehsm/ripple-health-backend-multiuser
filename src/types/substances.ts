export type SubstanceType = "caffeine" | "alcohol";

export type SubstanceResult = {
  source_food_id: string;
  name: string;
  caffeine_mg?: number | null;
  abv_percent?: number | null;
  source_db: string;
  barcode?: string;
};

export type SubstancePending = {
  name: string;
  substance_type: SubstanceType;
  caffeine_mg: number | null;
  abv_percent: number | null;
  volume_ml: number | null;
  source_food_id?: string;
  source_db?: string;
  barcode?: string;
  original_caffeine_mg?: number | null;
  original_abv_percent?: number | null;
};

export type SubstanceEntry = {
  id: string;
  substance_type: SubstanceType;
  name: string;
  caffeine_mg: number | null;
  abv_percent: number | null;
  volume_ml: number | null;
  logged_at: string;
};

export type SubstanceTotals = {
  caffeine_mg: number;
  standard_drinks: number;
};
