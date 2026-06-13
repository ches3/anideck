import { relations } from "drizzle-orm";
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

export const sourceRootsRelations = relations(sourceRoots, ({ many }) => ({
  includeRules: many(sourceIncludeRules),
  excludeRules: many(sourceExcludeRules),
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

export type SourceRoot = typeof sourceRoots.$inferSelect;
export type NewSourceRoot = typeof sourceRoots.$inferInsert;
export type SourceIncludeRule = typeof sourceIncludeRules.$inferSelect;
export type NewSourceIncludeRule = typeof sourceIncludeRules.$inferInsert;
export type SourceExcludeRule = typeof sourceExcludeRules.$inferSelect;
export type NewSourceExcludeRule = typeof sourceExcludeRules.$inferInsert;
