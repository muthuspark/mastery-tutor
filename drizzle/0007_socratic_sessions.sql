CREATE TABLE `socratic_sessions` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`generation_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
