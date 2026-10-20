ALTER TABLE `chapters` ADD `teaching_plan` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `learning_request` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `brief` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `quality_policy_version` integer;--> statement-breakpoint
ALTER TABLE `courses` ADD `generation_agent` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `preparation_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `preparation_stage` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `preparation_error` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `preparation_updated_at` integer;--> statement-breakpoint
ALTER TABLE `courses` ADD `preparation_version` integer DEFAULT 1 NOT NULL;