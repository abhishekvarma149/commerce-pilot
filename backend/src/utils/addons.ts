export const CATEGORY_ACCESSORIES: Record<string, { name: string; price: number }> = {
  Laptop: {
    name: "Wireless Optical Mouse & Sleeve",
    price: 1299,
  },
  Smartphone: {
    name: "45W Fast Charger & Armor Case",
    price: 1499,
  },
  Audio: {
    name: "Hard Shell Protective Travel Case",
    price: 599,
  },
  Accessories: {
    name: "Extended 1-Year Device Protection",
    price: 799,
  },
};

export function getRecommendedAddon(category: string) {
  return (
    CATEGORY_ACCESSORIES[category] || {
      name: "1-Year Extended Warranty",
      price: 999,
    }
  );
}
