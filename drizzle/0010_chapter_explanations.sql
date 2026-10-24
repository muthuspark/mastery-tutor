ALTER TABLE `chapters` ADD `original_explanation_level` integer;
--> statement-breakpoint
CREATE TABLE `chapter_explanations` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text NOT NULL,
	`source_content_version` integer NOT NULL,
	`source_preparation_version` integer NOT NULL,
	`import_key` text,
	`parent_explanation_id` text,
	`request_id` text,
	`direction` text,
	`level` integer,
	`content` text,
	`status` text NOT NULL,
	`error` text,
	`job_version` integer DEFAULT 1 NOT NULL,
	`last_retry_request_id` text,
	`created_at` integer NOT NULL,
	`generated_at` integer,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_explanations_chapter_ordinal_unique` ON `chapter_explanations` (`chapter_id`,`ordinal`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_explanations_chapter_request_unique` ON `chapter_explanations` (`chapter_id`,`request_id`) WHERE `request_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_explanations_chapter_import_unique` ON `chapter_explanations` (`chapter_id`,`import_key`) WHERE `import_key` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_explanations_one_active_per_chapter_unique` ON `chapter_explanations` (`chapter_id`) WHERE `status` IN ('pending', 'generating');
--> statement-breakpoint
WITH `legacy_candidates` AS (
	SELECT `chapter_id`, `generation_version` AS `content_version`, `content`, `generated_at`, 0 AS `is_current`, 'chapter-version:' || `generation_version` AS `import_key`
	FROM `chapter_versions`
	UNION ALL
	SELECT `chapters`.`id`, `chapters`.`content_generation_version`, `chapters`.`content`, `chapters`.`generated_at`, 1, 'chapter-current:' || `chapters`.`content_generation_version`
	FROM `chapters`
	WHERE `chapters`.`content` IS NOT NULL
		AND (`chapters`.`content_generation_status` = 'ready'
			OR (`chapters`.`content_generation_status` = 'pending' AND `chapters`.`content_generation_version` = 1 AND `chapters`.`generated_at` IS NOT NULL))
		AND NOT EXISTS (
			SELECT 1 FROM `chapter_versions`
			WHERE `chapter_versions`.`chapter_id` = `chapters`.`id`
				AND `chapter_versions`.`generation_version` = `chapters`.`content_generation_version`
		)
), `ordered_legacy` AS (
	SELECT *, ROW_NUMBER() OVER (PARTITION BY `legacy_candidates`.`chapter_id` ORDER BY `content_version`, `is_current`) AS `ordinal`
	FROM `legacy_candidates`
)
INSERT INTO `chapter_explanations` (
	`id`, `chapter_id`, `ordinal`, `kind`, `source_content_version`, `source_preparation_version`, `import_key`, `level`, `content`, `status`, `created_at`, `generated_at`
)
SELECT
	'legacy-' || `ordered_legacy`.`chapter_id` || '-' || `ordered_legacy`.`import_key`,
	`ordered_legacy`.`chapter_id`,
	`ordered_legacy`.`ordinal`,
	'legacy',
	`ordered_legacy`.`content_version`,
	COALESCE(`courses`.`preparation_version`, 1),
	`ordered_legacy`.`import_key`,
	NULL,
	`ordered_legacy`.`content`,
	'ready',
	COALESCE(`ordered_legacy`.`generated_at`, `chapters`.`created_at`),
	`ordered_legacy`.`generated_at`
FROM `ordered_legacy`
JOIN `chapters` ON `chapters`.`id` = `ordered_legacy`.`chapter_id`
JOIN `courses` ON `courses`.`id` = `chapters`.`course_id`;
