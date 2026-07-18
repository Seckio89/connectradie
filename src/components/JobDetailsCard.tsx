import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, MapPin, Clock, User, Mail, Phone, FileText, Image as ImageIcon, DollarSign, AlertTriangle, Zap, Plus, CheckCircle, XCircle, CreditCard, Package, Info, Upload, X, Receipt, Building2, Trash2, Eye, PenLine, Crown, WifiOff, Lock, Circle, Loader2, Car } from 'lucide-react';
import AccessInstructions from './AccessInstructions';
import type { Job, Profile, Project } from '../types/database';
import { supabase } from '../lib/supabase';
import { getAuthHeaders } from '../lib/edgeFn';
import { offlineSubmitMilestone } from '../lib/offlineSync';
import { useAuth } from '../contexts/AuthContext';
import { isPro } from '../lib/subscription';
import { extractSuburb } from '../lib/contactGating';
import { redactContactInfo } from '../lib/redaction';
import { useSignedUrls } from '../hooks/useSignedUrl';
import { getSignedUrl } from '../lib/storage';

const RequestVariationModal = lazy(() => import('./RequestVariationModal'));
const CreateInvoiceModal = lazy(() => import('./CreateInvoiceModal'));
const InvoiceViewModal = lazy(() => import('./InvoiceViewModal'));
const SubscriptionModal = lazy(() => import('./SubscriptionModal'));

interface JobVariation {
  id: string;
  job_id: string;
  description: string;
  additional_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason_category: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

interface SubcontractorEntry {
  business_name: string;
  invoice_number: string;
  amount: string;
  gst: string;
  invoice_id?: string;
  file_name?: string;
  file_url?: string;
}

interface MilestoneSubcontractor {
  id: string;
  milestone_id: string;
  business_name: string;
  invoice_number: string | null;
  amount: number;
  invoice_id?: string | null;
}

interface JobMilestone {
  id: string;
  job_id: string;
  title: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid';
  due_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  approved_at: string | null;
  paid_at: string | null;
  stage_number: number;
  proof_images: string[];
  payment_type: 'direct' | 'subcontractor';
  invoice_number: string | null;
  subcontractor_business_name: string | null;
  subcontractors?: MilestoneSubcontractor[];
}

interface JobDetailsCardProps {
  job: Job;
  client?: Profile | null;
  isUnlocked?: boolean;
  showClientDetails?: boolean;
  onInvoiceModalChange?: (isOpen: boolean) => void;
}

interface ProjectJob {
  id: string;
  description: string;
  scheduled_time: string | null;
  status: string;
  is_delayed: boolean;
  tradie_id: string;
  tradie_details?: {
    trade_category: string;
  } | null;
}

export default function JobDetailsCard({ job, client, isUnlocked = false, showClientDetails = false, onInvoiceModalChange }: JobDetailsCardProps) {
  const { profile, tradieDetails } = useAuth();
  const isProUser = isPro(tradieDetails?.subscription_tier, profile?.is_premium);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const photoSignedUrls = useSignedUrls('job-attachments', job?.images_url || []);
  const [variations, setVariations] = useState<JobVariation[]>([]);
  const [showVariationModal, setShowVariationModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [milestones, setMilestones] = useState<JobMilestone[]>([]);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneAmount, setMilestoneAmount] = useState('');
  const [milestoneDueDate, setMilestoneDueDate] = useState('');
  const [milestonePaymentType, setMilestonePaymentType] = useState<'direct' | 'subcontractor'>('direct');
  const [subcontractors, setSubcontractors] = useState<SubcontractorEntry[]>([{ business_name: '', invoice_number: '', amount: '', gst: '' }]);
  const [processingInvoice, setProcessingInvoice] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectJobs, setProjectJobs] = useState<ProjectJob[]>([]);
  const [uploadingProof, setUploadingProof] = useState<string | null>(null);
  const [viewingProof, setViewingProof] = useState<{ images: string[]; index: number } | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState<number | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const isAcceptedOrBeyond = ['accepted', 'in_progress', 'completed'].includes(job.status);
  const canSeeContactDetails = isAcceptedOrBeyond || isUnlocked;
  const [offlineQueued, setOfflineQueued] = useState(false);

  useEffect(() => {
    onInvoiceModalChange?.(showCreateInvoice !== null);
  }, [showCreateInvoice]);

  useEffect(() => {
    fetchVariations();
    fetchMilestones();
    if (job.project_id && showClientDetails) {
      fetchProjectTimeline();
    }
  }, [job.id, job.project_id]);

  const fetchProjectTimeline = async () => {
    if (!job.project_id) return;
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', job.project_id)
        .maybeSingle();
      if (projectError) throw projectError;
      setProject(projectData as Project | null);

      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`id, description, scheduled_time, status, is_delayed, tradie_id, tradie_details:tradie_details!inner(trade_category)`)
        .eq('project_id', job.project_id)
        .neq('id', job.id)
        .in('status', ['accepted', 'in_progress', 'completed']);
      if (jobsError) throw jobsError;
      setProjectJobs(jobsData as ProjectJob[] || []);
    } catch {
      // silent
    }
  };

  const fetchVariations = async () => {
    try {
      const { data, error } = await supabase
        .from('job_variations')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVariations((data || []) as JobVariation[]);
    } catch {
      // silent
    }
  };

  const fetchMilestones = async () => {
    try {
      const { data, error } = await supabase
        .from('job_milestones')
        .select('*')
        .eq('job_id', job.id)
        .order('stage_number', { ascending: true });
      if (error) throw error;
      const milestonesWithSubs = await Promise.all(
        ((data || []) as JobMilestone[]).map(async (milestone: JobMilestone) => {
          if (milestone.payment_type === 'subcontractor') {
            const { data: subs } = await supabase
              .from('milestone_subcontractors')
              .select('*')
              .eq('milestone_id', milestone.id)
              .order('created_at', { ascending: true });
            return { ...milestone, subcontractors: subs || [] };
          }
          return { ...milestone, subcontractors: [] };
        })
      );
      setMilestones(milestonesWithSubs as JobMilestone[]);
    } catch {
      // silent
    }
  };

  const handleApproveVariation = async (variationId: string, additionalAmount: number) => {
    setLoading(true);
    try {
      const { error: updateVariationError } = await supabase
        .from('job_variations')
        .update({ status: 'approved' })
        .eq('id', variationId);
      if (updateVariationError) throw updateVariationError;
      const newBudgetAmount = (job.budget_amount || 0) + additionalAmount;
      const { error: updateJobError } = await supabase
        .from('jobs')
        .update({ budget_amount: newBudgetAmount })
        .eq('id', job.id);
      if (updateJobError) throw updateJobError;
      await fetchVariations();
      window.location.reload();
    } catch {
      alert('Failed to approve. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectVariation = async (variationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('job_variations')
        .update({ status: 'rejected' })
        .eq('id', variationId);
      if (error) throw error;
      await fetchVariations();
    } catch {
      alert('Failed to reject. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceUpload = async (file: File, index: number) => {
    setProcessingInvoice(index);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { resolve((reader.result as string).split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data: { user } } = await supabase.auth.getUser();
      let fileUrl = '';
      const fileName = file.name;
      if (user) {
        const filePath = `${user.id}/invoices/${job.id}/${Date.now()}-${file.name}`;
        const { data: uploadData } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { upsert: true });
        if (uploadData?.path) {
          // Store the bucket path; downstream parse-invoice fn signs it on demand.
          fileUrl = uploadData.path;
        }
      }
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`;
      const authHeaders = await getAuthHeaders();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ file_base64: base64, file_type: file.type }),
      });
      const data = await response.json();
      const updated = [...subcontractors];
      updated[index] = { ...updated[index], file_name: fileName, file_url: fileUrl };
      if (data.business_name) updated[index] = { ...updated[index], business_name: data.business_name };
      if (data.invoice_number) updated[index] = { ...updated[index], invoice_number: data.invoice_number };
      if (data.amount) updated[index] = { ...updated[index], amount: data.amount };
      if (data.gst) updated[index] = { ...updated[index], gst: data.gst };
      if (data.due_date) setMilestoneDueDate(data.due_date);
      setSubcontractors(updated);
    } catch {
      // silent
    } finally {
      setProcessingInvoice(null);
    }
  };

  const handleAddMilestone = async () => {
    const isSubType = milestonePaymentType === 'subcontractor';
    if (!milestoneTitle.trim()) { alert('Please provide a valid title'); return; }
    let totalAmount = 0;
    if (isSubType) {
      const validSubs = subcontractors.filter(s => s.business_name.trim() || parseFloat(s.amount) > 0 || s.invoice_id);
      if (validSubs.length === 0) { alert('Please attach at least one subcontractor invoice'); return; }
      totalAmount = validSubs.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    } else {
      if (!milestoneAmount || parseFloat(milestoneAmount) <= 0) { alert('Please provide a valid amount'); return; }
      totalAmount = parseFloat(milestoneAmount);
    }
    const existingTotal = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
    const newTotal = existingTotal + totalAmount;
    if (job.budget_amount && newTotal > job.budget_amount) {
      alert(`Total payments ($${newTotal.toFixed(2)}) cannot exceed job budget ($${job.budget_amount.toFixed(2)})`);
      return;
    }
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const nextStageNumber = milestones.length > 0 ? Math.max(...milestones.map(m => m.stage_number)) + 1 : 1;
      const insertData: Record<string, unknown> = {
        job_id: job.id, title: milestoneTitle, amount: totalAmount,
        due_date: milestoneDueDate || null, created_by: userData.user!.id,
        stage_number: nextStageNumber, payment_type: milestonePaymentType,
      };
      const { data: milestoneData, error } = await supabase
        .from('job_milestones')
        .insert(insertData)
        .select('id')
        .single();
      if (error) throw error;
      if (isSubType && milestoneData) {
        const validSubs = subcontractors.filter(s => s.business_name.trim() && parseFloat(s.amount) > 0);
        const subInserts = validSubs.map(s => ({
          milestone_id: milestoneData.id,
          business_name: s.business_name.trim(),
          invoice_number: s.invoice_number.trim() || null,
          amount: parseFloat(s.amount),
          invoice_id: s.invoice_id || null,
        }));
        const { error: subError } = await supabase.from('milestone_subcontractors').insert(subInserts);
        if (subError) throw subError;
      }
      setMilestoneTitle(''); setMilestoneAmount(''); setMilestoneDueDate('');
      setMilestonePaymentType('direct');
      setSubcontractors([{ business_name: '', invoice_number: '', amount: '', gst: '' }]);
      setShowAddMilestone(false);
      await fetchMilestones();
    } catch {
      alert('Failed to add progress payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveMilestone = async (milestoneId: string) => {
    setLoading(true);
    try {
      const result = await offlineSubmitMilestone(milestoneId, 'approved');
      if (result.online) { await fetchMilestones(); }
      else { setOfflineQueued(true); setTimeout(() => setOfflineQueued(false), 4000); }
    } catch {
      alert('Failed to approve payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (milestoneId: string) => {
    setLoading(true);
    try {
      const result = await offlineSubmitMilestone(milestoneId, 'paid');
      if (result.online) { await fetchMilestones(); }
      else { setOfflineQueued(true); setTimeout(() => setOfflineQueued(false), 4000); }
    } catch {
      alert('Failed to mark as paid. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadProofImages = async (milestoneId: string, files: FileList) => {
    if (!files || files.length === 0) return;
    setUploadingProof(milestoneId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${job.id}-${milestoneId}/${Date.now()}-${i}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('job-images')
          .upload(fileName, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('job-images').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
      const milestone = milestones.find(m => m.id === milestoneId);
      const existingImages = milestone?.proof_images || [];
      const { error: updateError } = await supabase
        .from('job_milestones')
        .update({ proof_images: [...existingImages, ...uploadedUrls] })
        .eq('id', milestoneId);
      if (updateError) throw updateError;
      await fetchMilestones();
    } catch {
      alert('Failed to upload proof images. Please try again.');
    } finally {
      setUploadingProof(null);
    }
  };

  const handleRemoveProofImage = async (milestoneId: string, imageUrl: string) => {
    try {
      const milestone = milestones.find(m => m.id === milestoneId);
      if (!milestone) return;
      const { error } = await supabase
        .from('job_milestones')
        .update({ proof_images: milestone.proof_images.filter(url => url !== imageUrl) })
        .eq('id', milestoneId);
      if (error) throw error;
      await fetchMilestones();
    } catch {
      alert('Failed to remove image. Please try again.');
    }
  };

  const calculatePaymentProgress = () => {
    if (!job.budget_amount) return null;
    const totalPaid = milestones.filter(m => m.status === 'paid').reduce((sum, m) => sum + Number(m.amount), 0);
    const percentage = (totalPaid / job.budget_amount) * 100;
    return { totalPaid, totalBudget: job.budget_amount, percentage: Math.min(percentage, 100) };
  };

  const getStatusBadge = () => {
    const styles: Record<string, string> = {
      pending: 'bg-warm-100 text-warm-700',
      accepted: 'bg-green-100 text-green-700',
      in_progress: 'bg-secondary-100 text-secondary-700',
      completed: 'bg-secondary-100 text-secondary-700',
      declined: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
      pending: 'Pending', accepted: 'Accepted', in_progress: 'In Progress',
      completed: 'Completed', declined: 'Declined',
    };
    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${styles[job.status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[job.status] || job.status}
      </span>
    );
  };

  const formatScheduledDate = () => {
    if (!job.scheduled_time) return null;
    const date = new Date(job.scheduled_time);
    const dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const timeStr = date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    const durationStr = job.estimated_duration ? ` | Est. ${job.estimated_duration}` : '';
    return `${dateStr} at ${timeStr}${durationStr}`;
  };

  const formatBudget = () => {
    if (!job.budget_type) return null;
    if (job.budget_type === 'request_quote') return { label: 'Quote Required', value: 'Awaiting quote from tradie', type: 'quote' };
    if (job.budget_amount) {
      const formattedAmount = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(job.budget_amount);
      if (job.budget_type === 'fixed_budget') return { label: 'Fixed Budget', value: formattedAmount, type: 'fixed' };
      return { label: 'Hourly Rate', value: `${formattedAmount}/hr`, type: 'hourly' };
    }
    return null;
  };

  const budgetInfo = formatBudget();
  const paymentProgress = calculatePaymentProgress();

  const approvedVariationsTotal = variations
    .filter(v => v.status === 'approved')
    .reduce((sum, v) => sum + Number(v.additional_amount), 0);

  const nextPendingMilestone = milestones.find(m => m.status === 'pending');
  const nextMilestoneAmount = nextPendingMilestone ? Number(nextPendingMilestone.amount) : null;

  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden">
      {offlineQueued && (
        <div className="m-4 flex items-center gap-3 px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl">
          <WifiOff className="w-5 h-5 text-warm-600 flex-shrink-0" />
          <p className="text-sm font-medium text-warm-800">Action queued offline. It will sync when you're back online.</p>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-900">Service Request</h3>
            {job.job_complexity === 'emergency' && (
              <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Emergency
              </span>
            )}
            {job.job_complexity === 'complex' && (
              <span className="px-3 py-1 bg-warm-100 text-warm-700 text-sm font-medium rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3" />Complex
              </span>
            )}
            {job.job_complexity === 'standard' && (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">Standard</span>
            )}
          </div>
          {getStatusBadge()}
        </div>

        {job.is_emergency && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm font-medium text-red-800">Emergency Job - Immediate Attention Required</p>
          </div>
        )}

        {/* ─── SECTION 1: JOB DETAILS ─── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1.5">Description</p>
            <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
              {canSeeContactDetails ? job.description : redactContactInfo(job.description)}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {job.location_address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {canSeeContactDetails ? (
                  <span className="text-gray-700">{job.location_address}</span>
                ) : (
                  <span className="text-gray-700">
                    {extractSuburb(job.location_address) || 'Suburb area'}
                    <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      <Lock className="w-3 h-3" />Full address after accept
                    </span>
                  </span>
                )}
              </div>
            )}
            {job.scheduled_time && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{formatScheduledDate()}</span>
              </div>
            )}
            {job.estimated_duration && !job.scheduled_time && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{job.estimated_duration}</span>
              </div>
            )}
            {job.parking_available !== null && job.parking_available !== undefined && (
              <div className="flex items-center gap-2 text-sm">
                <Car className={`w-4 h-4 flex-shrink-0 ${job.parking_available ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-gray-700">{job.parking_available ? 'Parking available on site' : 'No parking on site'}</span>
              </div>
            )}
          </div>

          {budgetInfo && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${budgetInfo.type === 'quote' ? 'bg-warm-100' : 'bg-green-100'}`}>
                <DollarSign className={`w-4 h-4 ${budgetInfo.type === 'quote' ? 'text-warm-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{budgetInfo.label}</p>
                <p className={`text-sm font-semibold ${budgetInfo.type === 'quote' ? 'text-warm-700' : 'text-green-700'}`}>
                  {budgetInfo.value}
                </p>
              </div>
            </div>
          )}

          {/* Access instructions are PIN-gated + server-withheld. The component
              shows nothing to viewers who aren't the assigned tradie/team. */}
          {canSeeContactDetails && <AccessInstructions jobId={job.id} />}

          {job.images_url && job.images_url.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-gray-400" />
                <p className="text-xs font-medium text-gray-500">Attached Photos</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {job.images_url.map((_, index) => {
                  const signedUrl = photoSignedUrls[index];
                  return (
                    <div key={index} className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                      {signedUrl ? (
                        <img
                          src={signedUrl}
                          alt={`Job photo ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                          onClick={() => setLightboxUrl(signedUrl)}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showClientDetails && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Contact Details</p>
              {canSeeContactDetails ? (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-800">{job.contact_name || client?.full_name || 'Client'}</span>
                  </div>
                  {(job.contact_phone || client?.phone) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <a href={`tel:${job.contact_phone || client?.phone}`} className="text-warm-600 hover:text-warm-700">
                        {job.contact_phone || client?.phone}
                      </a>
                    </div>
                  )}
                  {client?.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <a href={`mailto:${client.email}`} className="text-warm-600 hover:text-warm-700">{client.email}</a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-warm-50 border border-warm-200 rounded-lg p-3 flex items-start gap-3">
                  <div className="w-8 h-8 bg-warm-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-warm-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-warm-800">{job.contact_name || client?.full_name || 'Client'}</p>
                    <p className="text-xs text-warm-700 mt-0.5">Full contact details will be revealed once you accept this job.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Job Group Timeline */}
        {project && projectJobs.length > 0 && showClientDetails && (
          <div className="bg-white rounded-xl border border-secondary-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-secondary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-secondary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-secondary-900 text-sm">Job Group Timeline</h4>
                  <span className="text-xs bg-secondary-100 text-secondary-700 px-2 py-0.5 rounded-full">{project.title}</span>
                </div>
                <div className="space-y-1.5">
                  {projectJobs.map((pJob) => (
                    <div key={pJob.id} className="bg-secondary-50/50 rounded-lg p-2.5 border border-secondary-100">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm font-medium text-gray-900">{pJob.tradie_details?.trade_category || 'Tradie'}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            pJob.status === 'completed' ? 'bg-green-100 text-green-700' :
                            pJob.status === 'in_progress' ? 'bg-secondary-100 text-secondary-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>{pJob.status.replace('_', ' ')}</span>
                          {pJob.is_delayed && <span className="px-2 py-0.5 bg-warm-100 text-warm-700 rounded text-xs font-medium">Delayed</span>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {pJob.scheduled_time ? new Date(pJob.scheduled_time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'TBD'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-start gap-1.5 text-xs text-secondary-600">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p>Coordinate your work timing with other tradies in this group.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending Progress Payment Requests */}
        {variations.filter(v => v.status === 'pending').map((variation) => (
          <div key={variation.id} className="bg-warm-50 border border-warm-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warm-700" />
                <p className="font-semibold text-warm-900">Additional Cost Requested</p>
              </div>
              {variation.reason_category && (
                <span className="px-3 py-1 bg-warm-100 text-warm-700 text-xs font-medium rounded-full capitalize">
                  {variation.reason_category.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="text-sm text-warm-800">{variation.description}</p>
            {variation.photo_urls && variation.photo_urls.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {variation.photo_urls.map((url, idx) => (
                  <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden bg-warm-100 border border-warm-200 flex-shrink-0">
                    <img src={url} alt={`Evidence ${idx + 1}`} loading="lazy" decoding="async"
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => setLightboxUrl(url)} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-warm-700">+${variation.additional_amount.toFixed(2)}</p>
              {job.budget_amount != null && job.budget_amount > 0 && (
                <p className="text-xs text-warm-600">
                  New total: ${((job.budget_amount || 0) + approvedVariationsTotal + variation.additional_amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
            {!showClientDetails && (
              <div className="flex gap-2">
                <button onClick={() => handleApproveVariation(variation.id, variation.additional_amount)} disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                  <CheckCircle className="w-4 h-4" />Approve & Fund
                </button>
                <button onClick={() => handleRejectVariation(variation.id)} disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-white border border-red-300 text-red-600 rounded-xl hover:bg-red-50 disabled:bg-gray-100 flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                  <XCircle className="w-4 h-4" />Decline
                </button>
              </div>
            )}
            {showClientDetails && (
              <span className="inline-flex px-3 py-1 bg-warm-100 text-warm-700 text-sm font-medium rounded-full">Awaiting Client Approval</span>
            )}
          </div>
        ))}

        <VariationsHistory
          variations={variations}
          approvedVariationsTotal={approvedVariationsTotal}
          jobBudget={job.budget_amount ?? null}
        />

        {/* ─── SECTION 2: PAYMENT SCHEDULE ─── */}
        {isAcceptedOrBeyond && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-700" />
                <h4 className="font-semibold text-gray-900">Payment Schedule</h4>
              </div>
              {showClientDetails && isProUser && (
                <button onClick={() => setShowAddMilestone(!showAddMilestone)}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />Add Progress Payment
                </button>
              )}
              {showClientDetails && !isProUser && (
                <button onClick={() => setShowSubscriptionModal(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-warm-500 to-warm-600 text-white text-sm rounded-lg hover:from-warm-600 hover:to-warm-700 flex items-center gap-1.5">
                  <Crown className="w-4 h-4" />Payments
                  <span className="text-xs font-bold bg-white/20 px-1.5 py-0.5 rounded">PRO</span>
                </button>
              )}
            </div>

            {paymentProgress && milestones.length > 0 && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-green-800">Payment Progress</span>
                  <span className="text-xs font-semibold text-green-700">
                    ${paymentProgress.totalPaid.toFixed(2)} / ${paymentProgress.totalBudget.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-green-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-green-600 h-2 rounded-full transition-all duration-500" style={{ width: `${paymentProgress.percentage}%` }} />
                </div>
              </div>
            )}

            {/* Add Progress Payment Form */}
            {showAddMilestone && showClientDetails && (
              <AddPaymentForm
                milestoneTitle={milestoneTitle}
                setMilestoneTitle={setMilestoneTitle}
                milestoneAmount={milestoneAmount}
                setMilestoneAmount={setMilestoneAmount}
                milestoneDueDate={milestoneDueDate}
                setMilestoneDueDate={setMilestoneDueDate}
                milestonePaymentType={milestonePaymentType}
                setMilestonePaymentType={setMilestonePaymentType}
                subcontractors={subcontractors}
                setSubcontractors={setSubcontractors}
                processingInvoice={processingInvoice}
                dragOverIndex={dragOverIndex}
                setDragOverIndex={setDragOverIndex}
                handleInvoiceUpload={handleInvoiceUpload}
                isProUser={isProUser}
                setShowCreateInvoice={setShowCreateInvoice}
                setShowSubscriptionModal={setShowSubscriptionModal}
                setViewingInvoiceId={setViewingInvoiceId}
                loading={loading}
                handleAddMilestone={handleAddMilestone}
                onCancel={() => {
                  setShowAddMilestone(false);
                  setMilestoneTitle(''); setMilestoneAmount(''); setMilestoneDueDate('');
                  setMilestonePaymentType('direct');
                  setSubcontractors([{ business_name: '', invoice_number: '', amount: '', gst: '' }]);
                }}
              />
            )}

            {/* Payment Timeline */}
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                {showClientDetails ? 'No payments scheduled yet. Add your first progress payment above.' : 'No payment schedule has been set up yet.'}
              </p>
            ) : (
              <div className="space-y-0">
                {milestones.map((milestone, index) => (
                  <PaymentTimelineItem
                    key={milestone.id}
                    milestone={milestone}
                    isLast={index === milestones.length - 1}
                    showClientDetails={showClientDetails}
                    loading={loading}
                    uploadingProof={uploadingProof}
                    onApprove={() => handleApproveMilestone(milestone.id)}
                    onMarkPaid={() => handleMarkAsPaid(milestone.id)}
                    onUploadProof={(files) => handleUploadProofImages(milestone.id, files)}
                    onRemoveProof={(url) => handleRemoveProofImage(milestone.id, url)}
                    onViewProof={(images, idx) => setViewingProof({ images, index: idx })}
                    onViewInvoice={(id) => setViewingInvoiceId(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── SECTION 3: PROOF OF WORK & ACTIONS ─── */}
        {showClientDetails && job.status === 'in_progress' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <button
              onClick={() => setShowVariationModal(true)}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 text-gray-700 rounded-xl hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-700 flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Additional Cost
            </button>
          </div>
        )}
      </div>

      <Suspense fallback={<div className="flex items-center justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
        <RequestVariationModal
          isOpen={showVariationModal}
          onClose={() => setShowVariationModal(false)}
          jobId={job.id}
          onSuccess={fetchVariations}
          jobBudget={job.budget_amount}
          approvedVariationsTotal={approvedVariationsTotal}
          nextMilestoneAmount={nextMilestoneAmount}
        />
      </Suspense>

      {showCreateInvoice !== null && createPortal(
        <Suspense fallback={<div className="flex items-center justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <CreateInvoiceModal
            isOpen={true}
            onClose={() => setShowCreateInvoice(null)}
            jobId={job.id}
            prefillBusinessName={subcontractors[showCreateInvoice]?.business_name || ''}
            onInvoiceCreated={(invoice) => {
              const updated = [...subcontractors];
              updated[showCreateInvoice] = {
                ...updated[showCreateInvoice],
                business_name: invoice.business_name,
                invoice_number: invoice.invoice_number,
                amount: String(invoice.total_amount),
                invoice_id: invoice.id,
              };
              setSubcontractors(updated);
              setShowCreateInvoice(null);
            }}
          />
        </Suspense>,
        document.body
      )}

      <Suspense fallback={<div className="flex items-center justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
        <InvoiceViewModal
          isOpen={viewingInvoiceId !== null}
          onClose={() => setViewingInvoiceId(null)}
          invoiceId={viewingInvoiceId}
          viewerRole={showClientDetails ? 'tradie' : 'client'}
        />
      </Suspense>

      <Suspense fallback={<div className="flex items-center justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
        />
      </Suspense>

      {viewingProof && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewingProof(null)}>
          <button onClick={() => setViewingProof(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={viewingProof.images[viewingProof.index]} alt={`Proof ${viewingProof.index + 1}`}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg" />
            {viewingProof.images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full">
                <button onClick={() => setViewingProof({ ...viewingProof, index: viewingProof.index > 0 ? viewingProof.index - 1 : viewingProof.images.length - 1 })}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-white text-sm font-medium">{viewingProof.index + 1} / {viewingProof.images.length}</span>
                <button onClick={() => setViewingProof({ ...viewingProof, index: viewingProof.index < viewingProof.images.length - 1 ? viewingProof.index + 1 : 0 })}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT TIMELINE ITEM
   ═══════════════════════════════════════════════════════════════ */

interface PaymentTimelineItemProps {
  milestone: JobMilestone;
  isLast: boolean;
  showClientDetails: boolean;
  loading: boolean;
  uploadingProof: string | null;
  onApprove: () => void;
  onMarkPaid: () => void;
  onUploadProof: (files: FileList) => void;
  onRemoveProof: (url: string) => void;
  onViewProof: (images: string[], index: number) => void;
  onViewInvoice: (id: string) => void;
}

function PaymentTimelineItem({
  milestone, isLast, showClientDetails, loading, uploadingProof,
  onApprove, onMarkPaid, onUploadProof, onRemoveProof, onViewProof, onViewInvoice,
}: PaymentTimelineItemProps) {
  const isPaid = milestone.status === 'paid';
  const isApproved = milestone.status === 'approved';
  const isSubcontractor = milestone.payment_type === 'subcontractor';

  const iconColor = isPaid ? 'text-green-600' : isApproved ? 'text-secondary-600' : 'text-gray-400';
  const lineColor = isPaid ? 'bg-green-300' : 'bg-gray-200';
  const statusLabel = isPaid ? 'Paid' : isApproved ? 'Awaiting Payment' : 'Awaiting Approval';
  const statusStyle = isPaid ? 'text-green-700 bg-green-50' : isApproved ? 'text-secondary-700 bg-secondary-50' : 'text-warm-700 bg-warm-50';

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center pt-1">
        {isPaid ? (
          <CheckCircle className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
        ) : (
          <Circle className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
        )}
        {!isLast && <div className={`w-0.5 flex-1 mt-1 min-h-[16px] ${lineColor}`} />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-semibold text-gray-900 text-sm">{milestone.title}</span>
              {isSubcontractor && (
                <span className="px-1.5 py-0.5 bg-primary-100 text-navy-600 text-xs font-medium rounded flex items-center gap-1">
                  <Building2 className="w-3 h-3" />Sub
                </span>
              )}
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusStyle}`}>{statusLabel}</span>
            </div>
            <p className="text-lg font-bold text-gray-800">${Number(milestone.amount).toFixed(2)}</p>
            {milestone.due_date && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Due: {new Date(milestone.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>

          {!showClientDetails && (
            <div className="flex flex-col gap-1.5">
              {milestone.status === 'pending' && (
                <button onClick={onApprove} disabled={loading}
                  className="px-3 py-1.5 bg-warm-500 text-white text-xs rounded-lg hover:bg-warm-600 disabled:bg-gray-400 flex items-center gap-1.5 font-medium whitespace-nowrap">
                  <CheckCircle className="w-3.5 h-3.5" />Approve
                </button>
              )}
              {milestone.status === 'approved' && (
                <button onClick={onMarkPaid} disabled={loading}
                  className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-1.5 font-medium whitespace-nowrap">
                  Mark as Paid
                </button>
              )}
            </div>
          )}
        </div>

        {/* Subcontractor details */}
        {isSubcontractor && (milestone.subcontractors?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1">
            {milestone.subcontractors!.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-3 h-3 text-navy-400 flex-shrink-0" />
                  <span className="font-medium text-navy-700 truncate">{sub.business_name}</span>
                  {sub.invoice_number && <span className="text-navy-400">({sub.invoice_number})</span>}
                  {sub.invoice_id && (
                    <button onClick={() => onViewInvoice(sub.invoice_id!)}
                      className="text-secondary-600 hover:text-secondary-700 font-medium flex items-center gap-0.5 flex-shrink-0">
                      <Eye className="w-3 h-3" />View
                    </button>
                  )}
                </div>
                <span className="font-semibold text-navy-700">${Number(sub.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {isSubcontractor && (milestone.subcontractors?.length ?? 0) === 0 && milestone.subcontractor_business_name && (
          <div className="mt-2 flex items-center gap-3 text-xs text-navy-600">
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{milestone.subcontractor_business_name}</span>
            {milestone.invoice_number && <span className="flex items-center gap-1"><Receipt className="w-3 h-3" />Ref: {milestone.invoice_number}</span>}
          </div>
        )}

        {/* Proof of Work */}
        {(milestone.proof_images?.length > 0 || showClientDetails) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Proof of Work {milestone.proof_images?.length > 0 && `(${milestone.proof_images.length})`}
              </span>
              {showClientDetails && milestone.status !== 'paid' && (
                <label className={`cursor-pointer ${uploadingProof === milestone.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="file" multiple accept="image/*"
                    onChange={(e) => e.target.files && onUploadProof(e.target.files)}
                    disabled={uploadingProof === milestone.id} className="hidden" />
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition-colors">
                    <Upload className="w-3 h-3" />
                    {uploadingProof === milestone.id ? 'Uploading...' : 'Add Photos'}
                  </div>
                </label>
              )}
            </div>
            {milestone.proof_images?.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {milestone.proof_images.map((imageUrl, imgIndex) => (
                  <div key={imgIndex} className="relative group w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <img src={imageUrl} alt={`Proof ${imgIndex + 1}`} loading="lazy" decoding="async"
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => onViewProof(milestone.proof_images, imgIndex)} />
                    {showClientDetails && milestone.status !== 'paid' && (
                      <button onClick={(e) => { e.stopPropagation(); onRemoveProof(imageUrl); }}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">
                {showClientDetails ? 'Upload photos to show proof of work completion' : 'No proof images uploaded yet'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADD PAYMENT FORM
   ═══════════════════════════════════════════════════════════════ */

interface AddPaymentFormProps {
  milestoneTitle: string;
  setMilestoneTitle: (v: string) => void;
  milestoneAmount: string;
  setMilestoneAmount: (v: string) => void;
  milestoneDueDate: string;
  setMilestoneDueDate: (v: string) => void;
  milestonePaymentType: 'direct' | 'subcontractor';
  setMilestonePaymentType: (v: 'direct' | 'subcontractor') => void;
  subcontractors: SubcontractorEntry[];
  setSubcontractors: (v: SubcontractorEntry[]) => void;
  processingInvoice: number | null;
  dragOverIndex: number | null;
  setDragOverIndex: (v: number | null) => void;
  handleInvoiceUpload: (file: File, index: number) => void;
  isProUser: boolean;
  setShowCreateInvoice: (v: number | null) => void;
  setShowSubscriptionModal: (v: boolean) => void;
  setViewingInvoiceId: (v: string | null) => void;
  loading: boolean;
  handleAddMilestone: () => void;
  onCancel: () => void;
}

function AddPaymentForm({
  milestoneTitle, setMilestoneTitle, milestoneAmount, setMilestoneAmount,
  milestoneDueDate, setMilestoneDueDate, milestonePaymentType, setMilestonePaymentType,
  subcontractors, setSubcontractors, processingInvoice, dragOverIndex, setDragOverIndex,
  handleInvoiceUpload, isProUser, setShowCreateInvoice, setShowSubscriptionModal,
  setViewingInvoiceId, loading, handleAddMilestone, onCancel,
}: AddPaymentFormProps) {
  return (
    <div className="mb-4 bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input type="text" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)}
          placeholder={milestonePaymentType === 'subcontractor' ? 'e.g., Electrical rough-in, Plumbing fit-off' : 'e.g., Deposit, Materials, Final Payment'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
      </div>

      {milestonePaymentType === 'subcontractor' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Subcontractors</label>
            <button type="button" onClick={() => setSubcontractors([...subcontractors, { business_name: '', invoice_number: '', amount: '', gst: '' }])}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Plus className="w-3 h-3" />Add Another
            </button>
          </div>
          {subcontractors.map((sub, idx) => (
            <div key={idx} className="bg-white rounded-lg border border-secondary-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">Subcontractor {idx + 1}</span>
                <div className="flex items-center gap-1">
                  {sub.invoice_id && (
                    <button type="button" onClick={() => setViewingInvoiceId(sub.invoice_id!)}
                      className="p-1 text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50 rounded transition-colors" title="View Invoice">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {subcontractors.length > 1 && (
                    <button type="button" onClick={() => setSubcontractors(subcontractors.filter((_, i) => i !== idx))}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-gray-500">Attach Invoice</span>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-center">
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                      dragOverIndex === idx ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => { e.preventDefault(); setDragOverIndex(null); const file = e.dataTransfer.files[0]; if (file) handleInvoiceUpload(file, idx); }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = '.pdf,.png,.jpg,.jpeg';
                      input.onchange = (ev) => { const file = (ev.target as HTMLInputElement).files?.[0]; if (file) handleInvoiceUpload(file, idx); };
                      input.click();
                    }}
                  >
                    {processingInvoice === idx ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-secondary-600 font-medium">Scanning...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-500"><span className="text-secondary-600 font-medium">Upload</span> existing</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center px-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase">or</span>
                  </div>
                  {isProUser ? (
                    <button type="button" onClick={() => setShowCreateInvoice(idx)}
                      className="h-full border-2 border-secondary-200 bg-secondary-50 hover:bg-secondary-100 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 p-3">
                      <PenLine className="w-4 h-4 text-secondary-600" />
                      <span className="text-xs font-medium text-secondary-700">Create new</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setShowSubscriptionModal(true)}
                      className="h-full border-2 border-warm-200 bg-warm-50 hover:bg-warm-100 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 p-3">
                      <Crown className="w-4 h-4 text-warm-600" />
                      <span className="text-xs font-medium text-warm-700">Pro only</span>
                    </button>
                  )}
                </div>
              </div>
              {(sub.file_name || sub.file_url || sub.invoice_id) && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-secondary-50 rounded-lg border border-secondary-200">
                  <FileText className="w-4 h-4 text-secondary-600 flex-shrink-0" />
                  <span className="text-xs font-medium text-secondary-800 truncate flex-1">{sub.file_name || 'Invoice attached'}</span>
                  {sub.file_url && (
                    <button type="button"
                      onClick={async () => {
                        const signed = await getSignedUrl('documents', sub.file_url!, 600);
                        if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
                      }}
                      className="text-xs font-medium text-secondary-700 hover:text-secondary-900 flex items-center gap-1 flex-shrink-0">
                      <Eye className="w-3.5 h-3.5" />View
                    </button>
                  )}
                  {sub.invoice_id && (
                    <button type="button" onClick={() => setViewingInvoiceId(sub.invoice_id!)}
                      className="text-xs font-medium text-secondary-700 hover:text-secondary-900 flex items-center gap-1 flex-shrink-0">
                      <Eye className="w-3.5 h-3.5" />View
                    </button>
                  )}
                </div>
              )}
              {(sub.business_name || sub.amount || sub.invoice_number) && (
                <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1">
                  {sub.business_name && (
                    <div className="flex justify-between"><span className="text-gray-500">Business</span><span className="font-medium text-gray-800">{sub.business_name}</span></div>
                  )}
                  {sub.invoice_number && (
                    <div className="flex justify-between"><span className="text-gray-500">Invoice #</span><span className="font-medium text-gray-800">{sub.invoice_number}</span></div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Amount</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <input type="number" step="0.01" min="0" value={sub.amount}
                        onChange={(e) => { const updated = [...subcontractors]; updated[idx] = { ...updated[idx], amount: e.target.value }; setSubcontractors(updated); }}
                        className="w-24 text-right text-xs font-medium text-gray-800 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
                        placeholder="0.00" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">GST</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <input type="number" step="0.01" min="0" value={sub.gst}
                        onChange={(e) => { const updated = [...subcontractors]; updated[idx] = { ...updated[idx], gst: e.target.value }; setSubcontractors(updated); }}
                        className="w-24 text-right text-xs font-medium text-gray-800 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
                        placeholder="0.00" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {subcontractors.some(s => parseFloat(s.amount) > 0 || parseFloat(s.gst) > 0) && (
            <div className="flex justify-between items-center px-3 py-2 bg-secondary-50 rounded-lg border border-secondary-200">
              <span className="text-sm font-medium text-secondary-700">Total</span>
              <span className="text-sm font-bold text-secondary-800">
                ${subcontractors.reduce((sum, s) => sum + (parseFloat(s.amount) || 0) + (parseFloat(s.gst) || 0), 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {milestonePaymentType !== 'subcontractor' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
          <input type="number" step="0.01" min="0" value={milestoneAmount} onChange={(e) => setMilestoneAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
        <input type="date" value={milestoneDueDate} onChange={(e) => setMilestoneDueDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMilestonePaymentType('direct')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
              milestonePaymentType === 'direct' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>Direct Payment</button>
          <button type="button" onClick={() => setMilestonePaymentType('subcontractor')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
              milestonePaymentType === 'subcontractor' ? 'border-primary-500 bg-warm-50 text-warm-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>Subcontractor</button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleAddMilestone} disabled={loading}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium text-sm">
          Add Progress Payment
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm">Cancel</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VARIATIONS HISTORY
   ═══════════════════════════════════════════════════════════════ */

interface VariationsHistoryProps {
  variations: JobVariation[];
  approvedVariationsTotal: number;
  jobBudget: number | null;
}

function VariationsHistory({ variations, approvedVariationsTotal, jobBudget }: VariationsHistoryProps) {
  const resolved = variations.filter(v => v.status !== 'pending');
  const pending = variations.filter(v => v.status === 'pending');
  const approved = variations.filter(v => v.status === 'approved');
  const rejected = variations.filter(v => v.status === 'rejected');

  if (resolved.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Summary Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Approved</p>
            <p className="text-sm font-bold text-green-700">
              +${approvedVariationsTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400">{approved.length} variation{approved.length !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Pending</p>
            <p className="text-sm font-bold text-warm-600">{pending.length}</p>
            <p className="text-xs text-gray-400">awaiting review</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Declined</p>
            <p className="text-sm font-bold text-red-600">{rejected.length}</p>
            <p className="text-xs text-gray-400">variation{rejected.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {jobBudget != null && jobBudget > 0 && approvedVariationsTotal > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Running total (budget + approved)</span>
            <span className="font-bold text-gray-900">
              ${(jobBudget + approvedVariationsTotal).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-gray-600" />
          <h4 className="font-semibold text-gray-900 text-sm">Variations History</h4>
          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
            {resolved.length}
          </span>
        </div>

        <div className="space-y-0">
          {resolved
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .map((variation, idx) => {
              const isApproved = variation.status === 'approved';
              const isLast = idx === resolved.length - 1;

              return (
                <div key={variation.id} className="flex gap-3">
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center pt-1">
                    {isApproved ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}
                    {!isLast && <div className={`w-0.5 flex-1 mt-1 min-h-[16px] ${isApproved ? 'bg-green-200' : 'bg-red-200'}`} />}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {variation.reason_category && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full capitalize">
                          {variation.reason_category.replace('_', ' ')}
                        </span>
                      )}
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        isApproved ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {isApproved ? 'Approved' : 'Declined'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{variation.description}</p>
                    <p className={`text-lg font-bold mt-1 ${
                      isApproved ? 'text-green-700' : 'text-red-400 line-through'
                    }`}>
                      +${Number(variation.additional_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(variation.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {variation.photo_urls && variation.photo_urls.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                        {variation.photo_urls.map((url, pIdx) => (
                          <div key={pIdx} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                            <img src={url} alt={`Evidence ${pIdx + 1}`} loading="lazy" decoding="async"
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setLightboxUrl(url)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Attachment"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
