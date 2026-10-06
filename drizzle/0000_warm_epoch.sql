CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`response` text NOT NULL,
	`score` real NOT NULL,
	`feedback` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_attempt_question_unique` ON `answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `answers_attempt_idx` ON `answers` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`attempt_no` integer NOT NULL,
	`score` real NOT NULL,
	`passed` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_chapter_attempt_no_unique` ON `attempts` (`chapter_id`,`attempt_no`);--> statement-breakpoint
CREATE INDEX `attempts_chapter_created_idx` ON `attempts` (`chapter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`idx` integer NOT NULL,
	`title` text NOT NULL,
	`objectives` text NOT NULL,
	`prerequisites` text NOT NULL,
	`content` text,
	`pretest` text,
	`summary` text,
	`status` text DEFAULT 'locked' NOT NULL,
	`depth_hint` text,
	`generated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_course_idx_unique` ON `chapters` (`course_id`,`idx`);--> statement-breakpoint
CREATE INDEX `chapters_course_status_idx` ON `chapters` (`course_id`,`status`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`level` text DEFAULT 'foundational' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`options` text,
	`rubric` text NOT NULL,
	`model_answer` text NOT NULL,
	`concept_tag` text NOT NULL,
	`is_review` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_chapter_idx` ON `questions` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`concept_tag` text NOT NULL,
	`source_question_id` text NOT NULL,
	`misses` integer DEFAULT 1 NOT NULL,
	`due_after_chapter_idx` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_items_course_concept_unique` ON `review_items` (`course_id`,`concept_tag`);--> statement-breakpoint
CREATE INDEX `review_items_course_due_idx` ON `review_items` (`course_id`,`due_after_chapter_idx`);