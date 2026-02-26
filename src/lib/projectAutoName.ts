import { supabase } from './supabase';
import { extractSuburb } from './contactGating';

const GENERIC_TITLES = [
  'my project',
  'new project',
  'untitled',
  'untitled project',
  'my job group',
  'new job group',
];

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.includes(title.toLowerCase().trim());
}

function extractCategoryFromDescription(description: string): string | null {
  const match = description.match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

function buildProjectTitle(description: string, locationAddress: string | null): string {
  const category = extractCategoryFromDescription(description);
  const suburb = extractSuburb(locationAddress);

  if (category && suburb) {
    return `${category} at ${suburb}`;
  }
  if (category) {
    return category;
  }
  if (suburb) {
    return `Job at ${suburb}`;
  }
  return description.replace(/^\[[^\]]+\]\s*/, '').substring(0, 40);
}

function buildProjectDescription(description: string): string {
  const cleaned = description.replace(/^\[[^\]]+\]\s*/, '');
  return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
}

export async function autoNameProject(projectId: string, job: { description: string; location_address: string | null }): Promise<void> {
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('title, description')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return;

    const { count } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const isFirstJob = (count ?? 0) <= 1;
    const shouldRename = isGenericTitle(project.title) || isFirstJob;

    if (!shouldRename) return;

    const newTitle = buildProjectTitle(job.description, job.location_address);
    const newDescription = !project.description ? buildProjectDescription(job.description) : project.description;

    await supabase
      .from('projects')
      .update({
        title: newTitle,
        ...(newDescription !== project.description ? { description: newDescription } : {}),
      })
      .eq('id', projectId);
  } catch {
    // silent - auto-naming is non-critical
  }
}
