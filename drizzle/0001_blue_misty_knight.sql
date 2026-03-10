CREATE TABLE `aiSummaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`clinicalSummary` text,
	`emotionalThemes` text,
	`interventionSuggestions` text,
	`progressNotes` text,
	`riskIndicators` text,
	`status` enum('pending','generating','completed','error') NOT NULL DEFAULT 'pending',
	`generatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiSummaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `aiSummaries_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinicianId` int NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`dateOfBirth` varchar(20),
	`gender` varchar(50),
	`pronouns` varchar(50),
	`email` varchar(320),
	`phone` varchar(30),
	`diagnosis` text,
	`treatmentGoals` text,
	`notes` text,
	`consentSigned` boolean NOT NULL DEFAULT false,
	`hipaaAcknowledged` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emotionReadings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`offsetSeconds` float NOT NULL,
	`arousal` float NOT NULL,
	`valence` float NOT NULL,
	`dominance` float NOT NULL,
	`confidence` float,
	`rawFeatures` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emotionReadings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `escalationAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`clientId` int NOT NULL,
	`clinicianId` int NOT NULL,
	`alertType` enum('sustained_high_arousal','sudden_valence_drop','low_dominance_sustained','combined_distress') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`offsetSeconds` float,
	`description` text,
	`acknowledged` boolean NOT NULL DEFAULT false,
	`notificationSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `escalationAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`clinicianId` int NOT NULL,
	`sessionDate` timestamp NOT NULL,
	`durationSeconds` int,
	`audioUrl` text,
	`audioKey` varchar(512),
	`status` enum('recording','uploaded','analyzing','completed','error') NOT NULL DEFAULT 'recording',
	`clinicianNotes` text,
	`sessionType` varchar(100),
	`avgArousal` float,
	`avgValence` float,
	`avgDominance` float,
	`escalationDetected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`fullText` text,
	`language` varchar(10),
	`segments` json,
	`wordCount` int,
	`status` enum('pending','processing','completed','error') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transcripts_id` PRIMARY KEY(`id`),
	CONSTRAINT `transcripts_sessionId_unique` UNIQUE(`sessionId`)
);
