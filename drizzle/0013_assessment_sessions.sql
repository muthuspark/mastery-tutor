CREATE TABLE `assessment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL,
	`submission` text,
	`result` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_open_unique` ON `assessment_sessions` (`user_id`,`chapter_id`) WHERE "assessment_sessions"."status" = 'open';