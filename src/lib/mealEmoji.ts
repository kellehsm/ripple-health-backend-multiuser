// Static lookup for prettying up meal cards with a food-appropriate emoji.
// Purely visual — the meal name text is still the source of truth. If nothing
// matches, we fall back to a neutral utensils glyph.
//
// Keys are matched as case-insensitive whole-word substrings, so "iced coffee"
// and "coffee, black" both resolve to ☕. Order matters — more specific
// entries (e.g. "ice cream") appear before the generic ones ("cream").

const MAP: Array<[RegExp, string]> = [
  // Drinks
  [/\b(coffee|espresso|latte|cappuccino|mocha)\b/i, "☕"],
  [/\b(tea|matcha|chai)\b/i, "🍵"],
  [/\b(beer|ale|lager|ipa)\b/i, "🍺"],
  [/\b(wine|merlot|cabernet|chardonnay)\b/i, "🍷"],
  [/\b(cocktail|margarita|martini|whisk(e)?y|vodka|gin)\b/i, "🍸"],
  [/\b(smoothie|shake|kombucha)\b/i, "🥤"],
  [/\b(juice|orange juice|lemonade)\b/i, "🧃"],
  [/\b(milk|oat milk|almond milk)\b/i, "🥛"],
  [/\b(water|sparkling water|seltzer)\b/i, "💧"],
  // Mains
  [/\b(pizza|slice)\b/i, "🍕"],
  [/\b(burger|cheeseburger|hamburger)\b/i, "🍔"],
  [/\b(taco|burrito|quesadilla|nachos|enchilada)\b/i, "🌮"],
  [/\b(pasta|spaghetti|noodle|ramen|udon|lasagna|linguine)\b/i, "🍜"],
  [/\b(sushi|sashimi|nigiri|maki|poke)\b/i, "🍣"],
  [/\b(salad|kale|arugula|caesar|cobb)\b/i, "🥗"],
  [/\b(steak|beef|ribeye|filet)\b/i, "🥩"],
  [/\b(chicken|wings|nuggets)\b/i, "🍗"],
  [/\b(sandwich|sub|panini|club|wrap)\b/i, "🥪"],
  [/\b(soup|chowder|bisque|broth|pho)\b/i, "🍲"],
  [/\b(rice|risotto|paella)\b/i, "🍚"],
  [/\b(egg|omelet|omelette|frittata|scramble)\b/i, "🍳"],
  [/\b(bacon|sausage|pork)\b/i, "🥓"],
  [/\b(fish|salmon|tuna|tilapia|cod)\b/i, "🐟"],
  [/\b(shrimp|prawn|lobster|crab)\b/i, "🦐"],
  // Breakfast + baked
  [/\b(pancake|waffle|french toast)\b/i, "🥞"],
  [/\b(bagel|toast|bread|croissant|muffin)\b/i, "🥯"],
  [/\b(cereal|oatmeal|granola|porridge)\b/i, "🥣"],
  [/\b(yogurt|parfait)\b/i, "🥛"],
  // Sweets
  [/\b(ice cream|gelato)\b/i, "🍦"],
  [/\b(cake|cupcake|brownie|cheesecake)\b/i, "🍰"],
  [/\b(cookie|biscotti)\b/i, "🍪"],
  [/\b(donut|doughnut)\b/i, "🍩"],
  [/\b(chocolate)\b/i, "🍫"],
  [/\b(candy|gummy)\b/i, "🍬"],
  // Fruit
  [/\b(apple)\b/i, "🍎"],
  [/\b(banana)\b/i, "🍌"],
  [/\b(strawberr|berry|blueberr|raspberr)/i, "🍓"],
  [/\b(orange|clementine|tangerine)\b/i, "🍊"],
  [/\b(grape|grapes)\b/i, "🍇"],
  [/\b(watermelon|melon)\b/i, "🍉"],
  [/\b(peach|nectarine)\b/i, "🍑"],
  [/\b(pear)\b/i, "🍐"],
  [/\b(pineapple)\b/i, "🍍"],
  [/\b(mango)\b/i, "🥭"],
  [/\b(avocado)\b/i, "🥑"],
  // Snacks
  [/\b(chips|crisps|pretzel|popcorn)\b/i, "🍟"],
  [/\b(nuts|almond|cashew|walnut|pistachio)\b/i, "🥜"],
  [/\b(cheese)\b/i, "🧀"],
];

const FALLBACK = "🍽️";

export function emojiForMealName(name: string | null | undefined): string {
  if (!name) return FALLBACK;
  for (const [re, emoji] of MAP) {
    if (re.test(name)) return emoji;
  }
  return FALLBACK;
}

// Rotating water glass — the water-log button icon gets more visually
// distinct as the count climbs, giving a tiny sense of "the tally is
// growing". Cycles every 4 glasses so it never feels random.
const WATER_CYCLE = ["💧", "🥛", "🌊", "🚰"];

export function emojiForWaterCount(count: number): string {
  const i = Math.max(0, Math.floor(count)) % WATER_CYCLE.length;
  return WATER_CYCLE[i];
}
