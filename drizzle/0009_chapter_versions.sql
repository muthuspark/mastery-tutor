CREATE TABLE `chapter_versions` (
	`chapter_id` text NOT NULL,
	`generation_version` integer NOT NULL,
	`content` text NOT NULL,
	`pretest` text,
	`summary` text,
	`depth_hint` text,
	`generated_at` integer,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_versions_chapter_version_unique` ON `chapter_versions` (`chapter_id`,`generation_version`);