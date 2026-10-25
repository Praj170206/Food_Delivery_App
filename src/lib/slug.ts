import { Restaurant } from "@/models/Restaurant";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
}

export async function uniqueRestaurantSlug(name: string) {
  const base = slugify(name) || "restaurant";
  let slug = base;
  for (let i = 2; await Restaurant.exists({ slug }); i++) slug = `${base}-${i}`;
  return slug;
}
