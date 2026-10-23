CREATE TABLE `studio_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_links` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`calendar` text,
	`kind` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`board` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
