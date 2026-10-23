CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`calendar` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`space` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
