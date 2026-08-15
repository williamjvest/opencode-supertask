ALTER TABLE `task_runs` ADD `handoff_message` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `handoff_requested_at` integer;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `herdr_workspace_id` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `herdr_tab_id` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `herdr_pane_id` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `handoff_error` text;