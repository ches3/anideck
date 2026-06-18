import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const sourceRoots = sqliteTable("source_roots", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
});

export const sourceIncludeRules = sqliteTable(
  "source_include_rules",
  {
    id: text("id").primaryKey(),
    rootId: text("root_id")
      .notNull()
      .references(() => sourceRoots.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    unique("unique_source_include_rule_pattern").on(table.rootId, table.pattern),
    unique("unique_source_include_rule_sort_order").on(table.rootId, table.sortOrder),
  ],
);

export const sourceExcludeRules = sqliteTable(
  "source_exclude_rules",
  {
    id: text("id").primaryKey(),
    rootId: text("root_id")
      .notNull()
      .references(() => sourceRoots.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    unique("unique_source_exclude_rule_pattern").on(table.rootId, table.pattern),
    unique("unique_source_exclude_rule_sort_order").on(table.rootId, table.sortOrder),
  ],
);

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    rootId: text("root_id")
      .notNull()
      .references(() => sourceRoots.id, { onDelete: "cascade" }),
    originalTitle: text("original_title").notNull(),
    annictWorkId: text("annict_work_id"),
    annictTitle: text("annict_title"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("unique_work_root_title").on(table.rootId, table.originalTitle)],
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    rootId: text("root_id")
      .notNull()
      .references(() => sourceRoots.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    originalWorkTitle: text("original_work_title").notNull(),
    originalTitle: text("original_title").notNull(),
    active: integer("active", { mode: "boolean" }).notNull(),
    annictEpisodeId: text("annict_episode_id"),
    annictTitle: text("annict_title"),
    annictEpisodeNumber: integer("annict_episode_number"),
    annictEpisodeNumberText: text("annict_episode_number_text"),
    annictNoEpisodes: integer("annict_no_episodes", { mode: "boolean" }),
    annictStatus: text("annict_status", { enum: ["matched", "not_found", "error"] }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("unique_episode_path").on(table.rootId, table.relativePath)],
);

export const sourceRootsRelations = relations(sourceRoots, ({ many }) => ({
  includeRules: many(sourceIncludeRules),
  excludeRules: many(sourceExcludeRules),
  works: many(works),
  episodes: many(episodes),
}));

export const sourceIncludeRulesRelations = relations(sourceIncludeRules, ({ one }) => ({
  root: one(sourceRoots, {
    fields: [sourceIncludeRules.rootId],
    references: [sourceRoots.id],
  }),
}));

export const sourceExcludeRulesRelations = relations(sourceExcludeRules, ({ one }) => ({
  root: one(sourceRoots, {
    fields: [sourceExcludeRules.rootId],
    references: [sourceRoots.id],
  }),
}));

export const worksRelations = relations(works, ({ one, many }) => ({
  root: one(sourceRoots, {
    fields: [works.rootId],
    references: [sourceRoots.id],
  }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  work: one(works, {
    fields: [episodes.workId],
    references: [works.id],
  }),
  root: one(sourceRoots, {
    fields: [episodes.rootId],
    references: [sourceRoots.id],
  }),
}));

export type SourceRoot = typeof sourceRoots.$inferSelect;
export type NewSourceRoot = typeof sourceRoots.$inferInsert;
export type SourceIncludeRule = typeof sourceIncludeRules.$inferSelect;
export type NewSourceIncludeRule = typeof sourceIncludeRules.$inferInsert;
export type SourceExcludeRule = typeof sourceExcludeRules.$inferSelect;
export type NewSourceExcludeRule = typeof sourceExcludeRules.$inferInsert;
export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
