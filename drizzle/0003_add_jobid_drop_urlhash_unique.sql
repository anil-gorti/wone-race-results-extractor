ALTER TABLE `race_results` ADD `jobId` varchar(21);--> statement-breakpoint
ALTER TABLE `race_results` DROP INDEX `race_results_urlHash_unique`;
