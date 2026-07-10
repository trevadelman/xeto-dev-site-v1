import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// rev-1 registry data lives as JSON files in the repo; becomes the read
// model for the Supabase-backed registry later
const libs = defineCollection({
  loader: glob({
    pattern: "*.json",
    base: "./src/content/libs",
    // keep dotted lib names (ph.points) intact — default slugging strips dots
    generateId: ({ entry }) => entry.replace(/\.json$/, ""),
  }),
  schema: z.object({
    name: z.string(),
    version: z.string(),
    summary: z.string(),
    description: z.string().optional(),
    domains: z.array(z.string()).default([]),
    github: z.string().url().optional(),
    media: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

const domains = defineCollection({
  loader: glob({ pattern: "*.json", base: "./src/content/domains" }),
  schema: z.object({
    slug: z.string(),
    name: z.string(),
    blurb: z.string(),
  }),
});

export const collections = { libs, domains };
