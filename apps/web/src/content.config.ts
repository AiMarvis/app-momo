import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

export const SUPPORTED_LANGS = ["en", "ko", "ja"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Keep the `.<lang>` segment in the entry id. The default stem-based id would
// collapse `foo.en.mdx` and `foo.ko.mdx` into the same id and drop variants.
const stripMdxExtension = ({ entry }: { entry: string }): string => entry.replace(/\.mdx$/, "");

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/blog",
    generateId: stripMdxExtension,
  }),
  schema: z.object({
    slug: z.string(),
    lang: z.enum(SUPPORTED_LANGS),
    date: z.string(),
    title: z.string(),
    excerpt: z.string(),
    author: z.string(),
    image: z.string(),
    imageAlt: z.string(),
  }),
});

const changelog = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/changelog",
    generateId: stripMdxExtension,
  }),
  schema: z.object({
    date: z.string(),
    label: z.string(),
    lang: z.enum(SUPPORTED_LANGS),
  }),
});

export const collections = { blog, changelog };
