-- Remove the trigger that auto-assigns every new job to a project.
-- Jobs should appear in "My Jobs" independently. Users can manually
-- group jobs into projects when they choose to.
DROP TRIGGER IF EXISTS auto_assign_project_trigger ON jobs;
