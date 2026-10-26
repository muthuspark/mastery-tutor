CREATE TABLE `invitations` (
	`email` text PRIMARY KEY NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
