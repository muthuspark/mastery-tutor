CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_type` text NOT NULL,
	`target_id` text NOT NULL,
	`generation_version` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_run_at` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_target_version_unique` ON `generation_jobs` (`artifact_type`,`target_id`,`generation_version`);--> statement-breakpoint
CREATE INDEX `generation_jobs_status_next_run_idx` ON `generation_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `generation_jobs_lease_expiry_idx` ON `generation_jobs` (`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `chapters` ADD `content_generation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `content_generation_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `content_generation_error` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `content_generation_updated_at` integer;--> statement-breakpoint
ALTER TABLE `chapters` ADD `quiz_generation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `quiz_generation_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `quiz_generation_error` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `quiz_generation_updated_at` integer;