CREATE TABLE `concept_review_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`normalized_tag` text NOT NULL,
	`display_tag` text NOT NULL,
	`source_question_id` text,
	`source_content_version` integer NOT NULL,
	`due_date` text NOT NULL,
	`interval_stage` integer DEFAULT 0 NOT NULL,
	`last_observed_at` integer,
	`last_observed_date` text,
	`last_outcome` text,
	`last_miss_date` text,
	`suspended` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_concept_unique` ON `concept_review_schedules` (`user_id`,`chapter_id`,`normalized_tag`);--> statement-breakpoint
CREATE INDEX `study_due_idx` ON `concept_review_schedules` (`user_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `study_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`time_zone` text NOT NULL,
	`initialized_at` integer NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_event_id` text NOT NULL,
	`outcome` text NOT NULL,
	`observed_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `concept_review_schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_event_unique` ON `study_review_events` (`schedule_id`,`source_kind`,`source_event_id`);--> statement-breakpoint
CREATE TABLE `study_review_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL,
	`submission` text,
	`result` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_open_unique` ON `study_review_sessions` (`user_id`) WHERE "study_review_sessions"."status" = 'open';
--> statement-breakpoint
CREATE TRIGGER study_source_deleted BEFORE DELETE ON chapters BEGIN
 DELETE FROM study_review_sessions WHERE EXISTS (SELECT 1 FROM json_each(study_review_sessions.snapshot, '$.questions') WHERE json_extract(value, '$.chapterId') = OLD.id);
 UPDATE assessment_sessions SET status = 'invalidated' WHERE status = 'open' AND EXISTS (SELECT 1 FROM json_each(assessment_sessions.snapshot, '$.questions') WHERE json_extract(value, '$.chapterId') = OLD.id);
END;
