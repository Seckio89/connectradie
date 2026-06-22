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

function getStatusDot(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-500';
    case 'in_progress': return 'bg-primary-500';
    case 'accepted': return 'bg-warm-500';
    case 'pending': return 'bg-gray-400';
    case 'declined': return 'bg-red-400';
    default: return 'bg-gray-400';
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

      await supabase.rpc('auto_complete_ended_projects');

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
      case 'active': return 'bg-secondary-100 text-secondary-700';
      case 'ongoing': return 'bg-warm-100 text-warm-700';
      case 'end_date': return 'bg-warm-100 text-warm-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
            <p className="text-gray-600 mt-1">Group related jobs to keep everything organised and on track</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {projects.length > 0 && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Grid view"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Timeline view"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-warm-500 text-white rounded-xl hover:bg-warm-600 transition-colors min-h-[44px]"
            >
              <Plus className="w-5 h-5" />
              Add Job Group
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <EmptyState
              icon={FolderOpen}
              title="No Projects Created"
              description="Group related jobs together to keep everything organised and help your tradies coordinate their work."
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
                  className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-secondary-100 rounded-lg flex-shrink-0">
                          <Package className="w-5 h-5 text-secondary-600" />
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
                                className="flex-1 px-2 py-1 text-sm font-semibold text-gray-900 border border-primary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                              <button
                                onClick={() => handleSaveTitle(project.id)}
                                disabled={savingTitle}
                                className="p-2 text-primary-600 hover:bg-primary-50 rounded transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-2 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                                {project.title}
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(project.id);
                                  setEditTitle(project.title);
                                }}
                                className="p-2 rounded text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-all sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
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
                        className="p-2.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {project.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                    )}

                    {firstJob && (
                      <div className="space-y-2 mb-3">
                        {category && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-700">{category}</span>
                          </div>
                        )}
                        {suburb && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-600">{suburb}</span>
                          </div>
                        )}
                        {isSingleJob && (
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {cleanDescription(firstJob.description)}
                          </p>
                        )}
                      </div>
                    )}

                    {project.jobs.length === 0 && !project.description && (
                      <p className="text-sm text-gray-400 italic mb-3">No jobs added yet</p>
                    )}

                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(project.start_date)}</span>
                      </div>
                      {project.estimated_end_date && (
                        <>
                          <span className="text-gray-300">-</span>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(project.estimated_end_date)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {project.jobs.length > 0 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        {project.jobs.slice(0, 3).map((job) => (
                          <div key={job.id} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${getStatusDot(job.status)}`} />
                            <span className="text-xs text-gray-500 truncate max-w-[80px]">
                              {extractCategory(job.description) || cleanDescription(job.description).substring(0, 15)}
                            </span>
                          </div>
                        ))}
                        {additionalCount > 0 && (
                          <span className="px-3 py-1 bg-secondary-100 text-secondary-700 text-xs font-medium rounded-full whitespace-nowrap">
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
  getStatusDot: (s: string) => string;
  extractCategory: (d: string) => string | null;
  cleanDescription: (d: string) => string;
}) {
  return (
    <div className="space-y-6">
      {projects.map((project) => (
        <div
          key={project.id}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer"
          onClick={() => onSelect(project)}
        >
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary-100 rounded-lg">
                  <Package className="w-5 h-5 text-secondary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{project.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(project.start_date)} - {formatDate(project.estimated_end_date)}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-sm text-gray-500">{project.jobs.length} {project.jobs.length === 1 ? 'job' : 'jobs'}</span>
            </div>
          </div>

          {project.jobs.length > 0 && (
            <div className="px-5 py-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-gray-200" />

                <div className="space-y-4">
                  {project.jobs.map((job, index) => {
                    const category = extractCategory(job.description);
                    const desc = cleanDescription(job.description);
                    return (
                      <div key={job.id} className="relative flex items-start gap-4 pl-1">
                        <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 ${getStatusDot(job.status)}`}>
                          <span className="text-white text-xs font-bold">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            {category && (
                              <span className="text-xs font-medium text-primary-700 bg-primary-50 px-3 py-1 rounded-full">{category}</span>
                            )}
                            <span className={`text-xs font-medium capitalize px-3 py-1 rounded-full ${
                              job.status === 'completed' ? 'bg-green-50 text-green-700' :
                              job.status === 'in_progress' ? 'bg-secondary-50 text-secondary-700' :
                              job.status === 'accepted' ? 'bg-warm-50 text-warm-700' :
                              'bg-gray-50 text-gray-600'
                            }`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1 truncate">{desc}</p>
                          {job.scheduled_date && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
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
      