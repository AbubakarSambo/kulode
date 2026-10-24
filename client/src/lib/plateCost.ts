// Food cost % = plate cost ÷ selling price. Restaurants typically aim for 25–35%; above ~40% a
// dish is likely underpriced for what goes into it.
export const FOOD_COST_TARGET = 35
export const FOOD_COST_HIGH = 40

export type FoodCostLevel = 'good' | 'watch' | 'high'

export interface PlateMargin {
  plateCost: number
  grossProfit: number
  // Null when the price is 0, so there's no percentage to show
  foodCostPct: number | null
  marginPct: number | null
  level: FoodCostLevel
}

export function plateMargin(price: number, plateCost: number | null): PlateMargin | null {
  if (plateCost == null) return null
  const foodCostPct = price > 0 ? (plateCost / price) * 100 : null
  return {
    plateCost,
    grossProfit: price - plateCost,
    foodCostPct,
    marginPct: foodCostPct == null ? null : 100 - foodCostPct,
    level:
      foodCostPct == null || foodCostPct > FOOD_COST_HIGH ? 'high' : foodCostPct > FOOD_COST_TARGET ? 'watch' : 'good',
  }
}

export const FOOD_COST_BADGE: Record<FoodCostLevel, 'success' | 'warning' | 'destructive'> = {
  good: 'success',
  watch: 'warning',
  high: 'destructive',
}

export const FOOD_COST_TEXT: Record<FoodCostLevel, string> = {
  good: 'text-emerald-600',
  watch: 'text-amber-600',
  high: 'text-destructive',
}
