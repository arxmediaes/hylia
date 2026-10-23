import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const spaces=sqliteTable('spaces',{id:text('id').primaryKey(),name:text('name').notNull()});
export const members=sqliteTable('members',{id:text('id').primaryKey(),user:text('user').notNull(),space:text('space').notNull(),name:text('name').notNull()});
export const calendars=sqliteTable('calendars',{id:text('id').primaryKey(),space:text('space').notNull(),name:text('name').notNull(),color:text('color').notNull()});
export const events=sqliteTable('events',{id:text('id').primaryKey(),space:text('space').notNull(),calendar:text('calendar').notNull(),data:text('data').notNull()});
export const planImports=sqliteTable('plan_imports',{id:text('id').primaryKey(),created:text('created').notNull()});

export const planArchives=sqliteTable('plan_archives',{id:text('id').primaryKey(),space:text('space').notNull(),calendar:text('calendar').notNull(),data:text('data').notNull(),archived:text('archived').notNull()});
export const studioBoards=sqliteTable('studio_boards',{id:text('id').primaryKey(),space:text('space').notNull(),title:text('title').notNull()});
export const studioRefs=sqliteTable('studio_refs',{id:text('id').primaryKey(),space:text('space').notNull(),board:text('board').notNull(),data:text('data').notNull()});
export const studioSettings=sqliteTable('studio_settings',{id:text('id').primaryKey(),data:text('data').notNull()});
export const studioLinks=sqliteTable('studio_links',{id:text('id').primaryKey(),space:text('space').notNull(),calendar:text('calendar'),kind:text('kind').notNull(),created:text('created').notNull()});
