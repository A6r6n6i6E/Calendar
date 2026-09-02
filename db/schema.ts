import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const planState = sqliteTable("plan_state", {
  id: text("id").primaryKey().notNull(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
});
