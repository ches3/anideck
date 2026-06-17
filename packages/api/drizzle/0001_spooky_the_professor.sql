CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`root_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`original_work_title` text NOT NULL,
	`original_title` text NOT NULL,
	`active` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_episode_path` ON `episodes` (`root_id`,`relative_path`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`original_title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_work_root_title` ON `works` (`root_id`,`original_title`);