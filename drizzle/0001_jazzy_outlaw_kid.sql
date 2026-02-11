CREATE TABLE `processing_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(21) NOT NULL,
	`totalUrls` int NOT NULL,
	`processedUrls` int NOT NULL DEFAULT 0,
	`successCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `processing_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `processing_jobs_jobId_unique` UNIQUE(`jobId`)
);
--> statement-breakpoint
CREATE TABLE `race_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` text NOT NULL,
	`urlHash` varchar(64) NOT NULL,
	`name` text,
	`category` text,
	`finishTime` varchar(20),
	`bibNumber` varchar(50),
	`rankOverall` int,
	`rankCategory` int,
	`pace` varchar(20),
	`platform` varchar(100),
	`status` enum('completed','pending','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`extractedAt` timestamp NOT NULL DEFAULT (now()),
	`cachedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`userId` int NOT NULL,
	CONSTRAINT `race_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `race_results_urlHash_unique` UNIQUE(`urlHash`)
);
