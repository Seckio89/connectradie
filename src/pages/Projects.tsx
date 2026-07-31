import { useState, useEffect } from 'react';
import { Plus, Calendar, Package, Clock, CheckCircle2, XCircle, FolderOpen, Trash2, PenLine, MapPin, Briefcase, X, LayoutList, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project, Job } from '../types/database';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectDetailsModal from '../components/ProjectDetailsModal';
import ConfirmModal from '../components/ConfirmModal';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';

interface ProjectWithJobs extends Project {
  jobs: Job[];
}

function extractCategory(description: string): string | null {
  const match = description.match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

function cleanDescription(description: string): string {
  return description.replace(/^\[[^\]]+\]\s*/, '');
}

function extractSuburbFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const secondLast = parts[parts.length - 2];
    const statePostcodePattern = /^[A-Z]{2,3}\s+\d{4}$/;
    if (statePostcodePattern.test(secondLast) && parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return secondLast;
  }
  return null;
}

function getStatusDot(status: string | null) {
  switch (status) {
    case 'completed': return 'bg-ct-teal/[0.14]';
    case 'in_progress': return 'bg-ct-surface-2';
    case 'accepted': return 'bg-ct-teal';
    case 'pending': return 'bg-ct-surface-2';
    case 'declined': return 'bg-ct-rose';
    default: return 'bg-ct-surface-2';
  }
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithJobs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithJobs | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectWithJobs | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');

  useEffect(() => {
    if (user) {
      loadProjects();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadProjects = async () => {
    try {
      setLoading(true);

      // NOTE: we deliberately do NOT call the auto_complete_ended_projects RPC
      // here. It's a SECURITY DEFINER maintenance function that sweeps projects
      // platform-wide, so EXECUTE is restricted to service_role
      // (20260528210000_security_critical_revokes) — a signed-in user must not be
      // able to trigger it. The call therefore 403'd on every Projects load and
      // did nothing but log an error. The `auto-complete-ended-projects` cron
      // (daily, 00:00) performs the sweep server-side.

      if (!user?.id) {
        setLoading(false);
        return;
      }

      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .returns<Project[]>();

      if (projectsError) throw projectsError;

      const projectsWithJobs = await Promise.all(
        (projectsData || []).map(async (project) => {
          const { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .eq('project_id', project.id)
            .order('created_at', { ascending: false })
            .returns<Job[]>();

          return {
            ...project,
            jobs: jobs || [],
          };
        })
      );

      setProjects(projectsWithJobs);

      if (selectedProject) {
        const updatedProject = projectsWithJobs.find(p => p.id === selectedProject.id);
        if (updatedProject) {
          setSelectedProject(updatedProject);
        }
      }
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTitle = async (projectId: string) => {
    if (!editTitle.trim()) return;
    setSavingTitle(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ title: editTitle.trim() })
        .eq('id', projectId);
      if (!error) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, title: editTitle.trim() } : p
        ));
      }
    } catch {
      // no-op
    } finally {
      setSavingTitle(false);
      setEditingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-ct-surface-2 text-ct-mute-2';
      case 'ongoing': return 'bg-ct-amber/[0.13] text-ct-amber';
      case 'end_date': return 'bg-ct-amber/[0.13] text-ct-amber';
      case 'completed': return 'bg-ct-teal/[0.14] text-ct-teal';
      case 'cancelled': return 'bg-ct-surface-2 text-ct-mute-2';
      default: return 'bg-ct-surface-2 text-ct-mute-2';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="w-3.5 h-3.5" />;
      case 'end_date': return <Calendar className="w-3.5 h-3.5" />;
      case 'completed': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'cancelled': return <XCircle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'ongoing': return 'Ongoing';
      case 'end_date': return 'End Date';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      setDeleting(true);

      // Unlink any jobs from this project first
      await supabase
        .from('jobs')
        .update({ project_id: null })
        .eq('project_id', projectToDelete.id);

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectToDelete.id);
      if (error) throw error;
      setProjectToDelete(null);
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete this project. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ct-teal/30"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ct-paper">Jobs</h1>
            <p className="text-ct-mute-2 mt-1">Group related jobs to keep everything organised and on track</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {projects.length > 0 && (
              <div className="flex items-center bg-ct-surface-2 rounded-ct-sm p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-ct-xs transition-colors ${viewMode === 'grid' ? 'bg-ct-surface shadow-sm text-ct-paper' : 'text-ct-mute hover:text-ct-mute-2'}`}
                  title="Grid view"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`p-2 rounded-ct-xs transition-colors ${viewMode === 'timeline' ? 'bg-ct-surface shadow-sm text-ct-paper' : 'text-ct-mute hover:text-ct-mute-2'}`}
                  title="Timeline view"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-ct-teal text-ct-ink rounded-ct-md hover:brightness-110 transition-colors min-h-[44px]"
            >
              <Plus className="w-5 h-5" />
              Add Job Group
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line">
            <EmptyState
              icon={FolderOpen}
              title="Group your jobs into projects"
              description="Bundle related jobs under one project so your crew can see what's connected and nothing slips through."
              actionLabel="Create Project"
              onAction={() => setShowCreateModal(true)}
            />
          </div>
        ) : (
          viewMode === 'timeline' ? (
            <ProjectTimeline
              projects={projects}
              onSelect={(p) => setSelectedProject(p)}
              formatDate={formatDate}
              getStatusColor={getStatusColor}
              getStatusLabel={getStatusLabel}
              getStatusDot={getStatusDot}
              extractCategory={extractCategory}
              cleanDescription={cleanDescription}
            />
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const firstJob = project.jobs[0] || null;
              const category = firstJob ? extractCategory(firstJob.description) : null;
              const suburb = firstJob ? extractSuburbFromAddress(firstJob.location_address) : null;
              const isSingleJob = project.jobs.length === 1;
              const additionalCount = project.jobs.length > 1 ? project.jobs.length - 1 : 0;
              const isEditing = editingId === project.id;

              return (
                <div
                  key={project.id}
                  onClick={() => {
                    if (!isEditing) setSelectedProject(project);
                  }}
                  className="bg-ct-surface rounded-ct-lg border border-ct-line hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-ct-surface-2 rounded-ct-sm flex-shrink-0">
                          <Package className="w-5 h-5 text-ct-mute-2" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTitle(project.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autoFocus
                                className="flex-1 px-2 py-1 text-sm font-semibold text-ct-paper border border-ct-teal/30 rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                              />
                              <button
                                onClick={() => handleSaveTitle(project.id)}
                                disabled={savingTitle}
                                className="p-2 text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-xs transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-2 text-ct-mute hover:bg-ct-surface-2 rounded-ct-xs transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-ct-paper group-hover:text-ct-mute-2 transition-colors truncate">
                                {project.title}
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(project.id);
                                  setEditTitle(project.title);
                                }}
                                className="p-2 rounded-ct-xs text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 transition-all sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
                                title="Rename project"
                              >
                                <PenLine className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                              {getStatusIcon(project.status)}
                              {getStatusLabel(project.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                        className="p-2.5 rounded-ct-sm text-ct-mute hover:text-ct-rose hover:bg-ct-rose/[0.13] transition-colors flex-shrink-0"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {project.description && (
                      <p className="text-sm text-ct-mute mb-3 line-clamp-2">{project.description}</p>
                    )}

                    {firstJob && (
                      <div className="space-y-2 mb-3">
                        {category && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-ct-mute flex-shrink-0" />
                            <span className="text-sm font-medium text-ct-mute-2">{category}</span>
                          </div>
                        )}
                        {suburb && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-ct-mute flex-shrink-0" />
                            <span className="text-sm text-ct-mute-2">{suburb}</span>
                          </div>
                        )}
                        {isSingleJob && (
                          <p className="text-sm text-ct-mute line-clamp-2">
                            {cleanDescription(firstJob.description)}
                          </p>
                        )}
                      </div>
                    )}

                    {project.jobs.length === 0 && !project.description && (
                      <p className="text-sm text-ct-mute italic mb-3">No jobs in this group yet — open it and use “Add jobs”.</p>
                    )}

                    <div className="flex items-center gap-3 pt-3 border-t border-ct-line-soft">
                      <div className="flex items-center gap-1.5 text-xs text-ct-mute">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(project.start_date)}</span>
                      </div>
                      {project.estimated_end_date && (
                        <>
                          <span className="text-ct-mute">-</span>
                          <div className="flex items-center gap-1.5 text-xs text-ct-mute">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(project.estimated_end_date)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {project.jobs.length > 0 && (
                    <div className="px-6 py-3 bg-ct-surface-2 border-t border-ct-line-soft">
                      <div className="flex items-center gap-2">
                        {project.jobs.slice(0, 3).map((job) => (
                          <div key={job.id} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${getStatusDot(job.status)}`} />
                            <span className="text-xs text-ct-mute truncate max-w-[80px]">
                              {extractCategory(job.description) || cleanDescription(job.description).substring(0, 15)}
                            </span>
                          </div>
                        ))}
                        {additionalCount > 0 && (
                          <span className="px-3 py-1 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-full whitespace-nowrap">
                            +{additionalCount} other {additionalCount === 1 ? 'job' : 'jobs'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )
        )}

        {showCreateModal && (
          <CreateProjectModal
            onClose={() => setShowCreateModal(false)}
            onCreated={loadProjects}
          />
        )}

        {selectedProject && (
          <ProjectDetailsModal
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            onUpdated={loadProjects}
          />
        )}

        {projectToDelete && (
          <ConfirmModal
            title="Delete Job Group"
            message={`Are you sure you want to delete "${projectToDelete.title}"? The jobs in this group will remain but won't be grouped together. This action cannot be undone.`}
            confirmText={deleting ? 'Deleting...' : 'Delete Job Group'}
            type="danger"
            onConfirm={handleDeleteProject}
            onCancel={() => setProjectToDelete(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function ProjectTimeline({ projects, onSelect, formatDate, getStatusColor, getStatusLabel, getStatusDot, extractCategory, cleanDescription }: {
  projects: ProjectWithJobs[];
  onSelect: (p: ProjectWithJobs) => void;
  formatDate: (d: string | null) => string;
  getStatusColor: (s: string) => string;
  getStatusLabel: (s: string) => string;
  getStatusDot: (s: string | null) => string;
  extractCategory: (d: string) => string | null;
  cleanDescription: (d: string) => string;
}) {
  return (
    <div className="space-y-6">
      {projects.map((project) => (
        <div
          key={project.id}
          className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden hover:shadow-md transition-all cursor-pointer"
          onClick={() => onSelect(project)}
        >
          <div className="p-5 border-b border-ct-line-soft">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
                  <Package className="w-5 h-5 text-ct-mute-2" />
                </div>
                <div>
                  <h3 className="font-semibold text-ct-paper">{project.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                    <span className="text-xs text-ct-mute">
                      {formatDate(project.start_date)} - {formatDate(project.estimated_end_date)}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-sm text-ct-mute">{project.jobs.length} {project.jobs.length === 1 ? 'job' : 'jobs'}</span>
            </div>
          </div>

          {project.jobs.length > 0 && (
            <div className="px-5 py-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-ct-line" />

                <div className="space-y-4">
                  {project.jobs.map((job, index) => {
                    const category = extractCategory(job.description);
                    const desc = cleanDescription(job.description);
                    return (
                      <div key={job.id} className="relative flex items-start gap-4 pl-1">
                        <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 ${getStatusDot(job.status)}`}>
                          <span className="text-ct-paper text-xs font-bold">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            {category && (
                              <span className="text-xs font-medium text-ct-mute-2 bg-ct-surface-2 px-3 py-1 rounded-full">{category}</span>
                            )}
                            <span className={`text-xs font-medium capitalize px-3 py-1 rounded-full ${
                              job.status === 'completed' ? 'bg-ct-teal/[0.14] text-ct-teal' :
                              job.status === 'in_progress' ? 'bg-ct-surface-2 text-ct-mute-2' :
                              job.status === 'accepted' ? 'bg-ct-amber/[0.13] text-ct-amber' :
                              'bg-ct-surface-2 text-ct-mute-2'
                            }`}>
                              {(job.status ?? 'pending').replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-ct-mute-2 mt-1 truncate">{desc}</p>
                          {job.scheduled_date && (
                            <p className="text-xs text-ct-mute mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(job.scheduled_date)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
