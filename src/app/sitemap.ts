import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getAllProducts, getCategories } from "@/features/catalog/queries";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const staticPages = ["", "/shop", "/categories", "/offers", "/about", "/contact"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
  const categories = getCategories().map((c) => ({
    url: `${base}/categories/${c.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
  const products = getAllProducts().map((p) => ({
    url: `${base}/products/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));
  return [...staticPages, ...categories, ...products];
}
