CREATE TABLE `source_exclude_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`pattern` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_source_exclude_rule_pattern` ON `source_exclude_rules` (`root_id`,`pattern`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_source_exclude_rule_sort_order` ON `source_exclude_rules` (`root_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `source_include_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`pattern` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`root_id`) REFERENCES `source_roots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_source_include_rule_pattern` ON `source_include_rules` (`root_id`,`pattern`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_source_include_rule_sort_order` ON `source_include_rules` (`root_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `source_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL
);
