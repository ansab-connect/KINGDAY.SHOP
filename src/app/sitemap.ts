import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getAllCategories, getAllProducts } from "@/features/catalog/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const staticPages = [
    "",
    "/shop",
    "/categories",
    "/offers",
    "/book-service",
    "/bicycle-finder",
    "/about",
    "/contact",
    "/policies/shipping",
    "/policies/returns",
    "/policies/warranty",
    "/policies/privacy",
    "/policies/terms",
  ].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
  const categories = (await getAllCategories()).map((c) => ({
    url: `${base}/categories/${c.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  const products = (await getAllProducts()).map((p) => ({
    url: `${base}/products/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));
  return [...staticPages, ...categories, ...products];
}
