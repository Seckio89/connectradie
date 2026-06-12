import { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Save,
  Loader2,
  CheckCircle2,
  Clock,
  DollarSign,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { JobMilestone } from '../types/database';

type MilestoneStatus = JobMilestone['status'];

interface MilestoneTemplate {
  title: string;
  description: string;
}

// ── Australian industry-standard milestone templates ──
// Sources: Home Building Act 1989 (NSW) s8/s8A, Domestic Building Contracts Act 1995 (VIC) s40,
// QBCC Act 1994 Schedule 1B, HIA Lump Sum Contract, Safe Work Australia codes of practice,
// AS 3740:2021 (waterproofing), SPASA/MPBAA pool building standards.
const MILESTONE_TEMPLATES: Record<string, MilestoneTemplate[]> = {

  // ── Building contracts — statutory progress payment stages ──
  // Based on VIC DBCA s40 definitions and HIA contract Schedule 2.
  // NSW s8A requires payments match completed work value; deposit capped at 10% (s8).
  // QLD QBCC deposit capped at 5% for contracts ≥$20k (Schedule 1B QBCC Act).
  Builder: [
    { title: 'Deposit', description: 'NSW: max 10% of contract price (s8 HBA 1989). QLD: max 5% for contracts ≥$20k (QBCC Act)' },
    { title: 'Base Stage', description: 'Concrete slab poured, or footings and base brickwork to floor level for timber/suspended floors' },
    { title: 'Frame Stage', description: 'Wall frames, roof trusses, and door frames erected and approved by building surveyor' },
    { title: 'Lock-up Stage', description: 'External wall cladding and roof fixed, flooring laid, external doors and windows installed' },
    { title: 'Fixing Stage', description: 'Internal cladding, plasterboard, architraves, skirting, doors, built-in shelves, baths, basins, cabinets fitted' },
    { title: 'Practical Completion', description: 'All contracted work complete, painting finished, fixtures installed, final inspection passed' },
  ],
  Renovation: [
    { title: 'Deposit', description: 'NSW: max 10% (s8 HBA 1989). QLD: max 5% for contracts ≥$20k. Must not exceed value of work done' },
    { title: 'Demolition & Strip-out', description: 'Existing structure stripped to required extent, asbestos survey completed if pre-1990 build' },
    { title: 'Base / Structural Stage', description: 'New footings, slab, or structural modifications completed' },
    { title: 'Frame Stage', description: 'New framing erected and approved by building surveyor' },
    { title: 'Lock-up Stage', description: 'External cladding, roofing, windows, and doors installed — building is weatherproof' },
    { title: 'Fixing Stage', description: 'Plasterboard, internal doors, cabinetry, architraves, skirting, and built-ins fitted' },
    { title: 'Practical Completion', description: 'All work complete, final clean, handover inspection passed' },
  ],
  Extension: [
    { title: 'Deposit', description: 'NSW: max 10% (s8 HBA 1989). QLD: max 5% for contracts ≥$20k. Must not exceed value of work done' },
    { title: 'Base Stage', description: 'Excavation, footings, under-slab drainage, and concrete slab completed' },
    { title: 'Frame Stage', description: 'Structural framework erected including wall frames, roof trusses, and tie-in to existing structure' },
    { title: 'Lock-up Stage', description: 'External walls, roof covering, windows, and doors installed — extension is weatherproof' },
    { title: 'Fixing Stage', description: 'Internal linings, plasterboard, doors, cabinetry, and built-in fittings installed' },
    { title: 'Practical Completion', description: 'All work complete, painting finished, final inspection and handover' },
  ],

  // ── Wet area trades ──
  // Bathroom waterproofing must comply with AS 3740:2021 and requires inspection before tiling.
  Bathroom: [
    { title: 'Demolition & Strip-out', description: 'Old fixtures, tiles, and linings removed down to wall studs and slab (1–2 days)' },
    { title: 'Rough-in (Plumbing & Electrical)', description: 'Licensed plumber and electrician install pipes and wiring in open wall cavities' },
    { title: 'Wall & Floor Preparation', description: 'Water-resistant sheeting (e.g. Villaboard) applied to walls, cement screed laid to floor for drainage fall' },
    { title: 'Waterproofing', description: 'Liquid membrane applied to floors and walls per AS 3740:2021. Must be inspected/certified before tiling. 2–3 day cure' },
    { title: 'Tiling & Grouting', description: 'Wall and floor tiles laid, grouted, and silicone sealed at internal corners' },
    { title: 'Fit-off & Commissioning', description: 'Vanity, toilet, taps, shower screen, mirrors, towel rails installed. Plumber and electrician complete final connections' },
  ],
  // Kitchen does NOT require waterproofing under AS 3740 (not a classified wet area unless laundry combined).
  // Stages sourced from renovatingforprofit.com.au and real tradie workflows.
  Kitchen: [
    { title: 'Demolition & Strip-out', description: 'Disconnect water, gas, and electricity. Remove old cabinets, appliances, and surfaces' },
    { title: 'Rough-in (Plumbing & Electrical)', description: 'New plumbing and electrical lines run to suit new layout. Power points repositioned as needed' },
    { title: 'Wall Prep & Painting', description: 'Walls patched, plastered, and painted before cabinetry is installed (avoids difficult access later)' },
    { title: 'Cabinetry & Benchtop Install', description: 'Base cabinets installed and levelled, wall cabinets mounted, benchtops templated, fabricated, and fitted' },
    { title: 'Splashback & Tiling', description: 'Tiled or glass splashback installed after benchtops are set' },
    { title: 'Final Fit-off', description: 'Sink, tapware, appliances connected. Electrician and plumber complete final connections and testing' },
  ],

  // ── Structural & civil trades ──
  // Concreting stages sourced from Concept Concrete, Holcim Australia, and Bunnings guides.
  Concreter: [
    { title: 'Site Preparation & Excavation', description: 'Clear site, excavate to required depth (100–150mm residential), compact subgrade' },
    { title: 'Base & Formwork', description: 'Lay and compact gravel base (100–150mm), install timber or steel formwork, set levels' },
    { title: 'Reinforcement', description: 'Place steel reinforcement mesh or rebar on bar chairs at correct cover depth' },
    { title: 'Concrete Pour & Finishing', description: 'Pour concrete, screed level, bull float, cut control joints every 2–3m, trowel finish' },
    { title: 'Curing & Formwork Strip', description: 'Cure minimum 7 days (wet cure or compound). Strip formwork after 24–48 hours. Site clean-up' },
  ],
  // Bricklaying stages use industry-standard terms: DPC, plate height, gables.
  Bricklayer: [
    { title: 'To DPC (Damp Proof Course)', description: 'Brickwork built up to damp proof course level above slab or footing' },
    { title: 'To Plate Height', description: 'External and internal walls built to top plate height with lintels over openings' },
    { title: 'Gables & Internal Skins', description: 'Gable ends completed, internal brick skins and any feature walls built' },
  ],
  // Excavation stages sourced from Safe Work Australia Code of Practice and SafeWork NSW.
  Excavation: [
    { title: 'Site Clear & Set-out', description: 'Vegetation cleared, site boundaries marked, underground services located (Dial Before You Dig)' },
    { title: 'Bulk Excavation & Benching', description: 'Main cut to design level using excavator. Bench or batter slopes as required for stability' },
    { title: 'Trenching', description: 'Service trenches excavated for footings, drainage, and utilities' },
    { title: 'Spoil Removal & Backfill', description: 'Excess spoil removed from site. Backfill compacted in layers to engineering specification' },
  ],

  // ── Outdoor & perimeter trades ──
  // Pool construction stages sourced from NT Pools (10 phases), Poolfab, and SPASA/MPBAA standards.
  'Pool Builder': [
    { title: 'Excavation', description: 'Pool hole excavated to design specifications (1–3 days depending on size and access)' },
    { title: 'Steel Reinforcement', description: 'Rebar framework constructed in criss-cross pattern to provide structural support against cracking' },
    { title: 'Plumbing & Electrical', description: 'Circulation pipes, filtration lines, and electrical conduits installed within the shell framework' },
    { title: 'Concrete Shell (Shotcrete)', description: 'Shotcrete sprayed onto steel framework to form pool walls and floor. Minimum 2–4 week cure period' },
    { title: 'Coping & Tiling', description: 'Pool edge coping installed, waterline tiles and any feature tiles laid and grouted' },
    { title: 'Interior Finish', description: 'Interior surface applied (pebblecrete, glass bead, or tile). Acid wash completed' },
    { title: 'Fencing & Compliance', description: 'Pool safety fencing installed to AS 1926. Council/certifier inspection for compliance certificate' },
    { title: 'Equipment & Handover', description: 'Pump, filter, chlorinator commissioned. Chemical balance set. Owner receives maintenance training' },
  ],
  // Landscaping stages sourced from Whyte Gardens, MJ Landscapes, and Tech Skill Australia.
  Landscaper: [
    { title: 'Site Preparation & Drainage', description: 'Site cleared, levels set, drainage and irrigation rough-in installed' },
    { title: 'Hardscape Construction', description: 'Retaining walls, paving, concrete works, decking, stairs, and structural features built' },
    { title: 'Softscaping & Planting', description: 'Garden beds prepared, trees and shrubs planted, turf laid, mulch spread' },
    { title: 'Final Details & Handover', description: 'Lighting, irrigation fit-off, garden edging, furniture placement, site clean-up' },
  ],
  // Fencing stages sourced from Bunnings, Stratco, and Eastside Fencing guides.
  Fencer: [
    { title: 'Post Installation', description: 'Post holes dug (~600mm deep), posts set plumb in concrete footings, cured and checked for level' },
    { title: 'Rails & Infill', description: 'Rails fixed to posts (2 rails ≤1200mm, 3 rails for 1200–1800mm). Palings, panels, or Colorbond sheets attached' },
    { title: 'Completion & Clean-up', description: 'Gates hung, post caps fitted, any plinths installed, site cleared of waste' },
  ],

  // ── General multi-stage trades ──
  // Carpentry uses industry-standard "First Fix" and "Second Fix" terminology.
  Carpenter: [
    { title: 'First Fix (Structural)', description: 'Wall frames, floor joists, roof trusses, load-bearing supports, and staircases installed' },
    { title: 'Second Fix (Finishing)', description: 'Architraves, skirting boards, doors hung, built-in shelving, timber flooring, and custom joinery fitted' },
  ],
  // Roofing stages sourced from Perth Skyline Roofing, Sydney Roofers, and industry guides.
  Roofer: [
    { title: 'Strip & Inspection', description: 'Existing roofing removed, roof structure inspected for damage or rot, repairs completed' },
    { title: 'Sarking & Flashing', description: 'Sarking/underlay installed, all flashings fabricated and fitted around penetrations and edges' },
    { title: 'Roof Sheeting / Tiling', description: 'New roofing material (Colorbond, tiles, etc.) installed with correct fastening and overlap' },
    { title: 'Gutters, Downpipes & Clean-up', description: 'Gutters set to correct fall, downpipes connected to stormwater, debris removed, final inspection' },
  ],
  // Demolition stages sourced from Safe Work Australia Code of Practice for Demolition Work.
  // Pre-demolition asbestos survey is mandatory under WHS Regulations.
  Demolition: [
    { title: 'Asbestos Survey & Hazmat Assessment', description: 'Competent person assesses for asbestos (mandatory pre-1990 builds) and hazardous materials per WHS Regs' },
    { title: 'Soft Strip', description: 'Internal fittings, fixtures, services, and non-structural elements removed. Licensed asbestos removal if required' },
    { title: 'Structural Demolition', description: 'Main structure demolished safely per SWMS (Safe Work Method Statement). Machine or hand demolition' },
    { title: 'Site Clear & Waste Disposal', description: 'All debris removed, waste classified and disposed to licensed facilities, site left clean and level' },
  ],
};

interface LocalMilestone {
  id?: string;
  title: string;
  description: string;
  amount: string;
  due_date: string;
  status: MilestoneStatus;
  stage_number: number;
  isNew?: boolean;
}

interface MilestoneEditorProps {
  jobId: string;
  milestones: JobMilestone[];
  onUpdate: () => void;
  readOnly?: boolean;
  tradeCategory?: string;
}

const STATUS_CONFIG: Record<MilestoneStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: CheckCircle2 },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: DollarSign },
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MilestoneEditor({ jobId, milestones, onUpdate, readOnly = false, tradeCategory }: MilestoneEditorProps) {
  const { user } = useAuth();
  const [localMilestones, setLocalMilestones] = useState<LocalMilestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);

  const availableTemplate = tradeCategory ? MILESTONE_TEMPLATES[tradeCategory] : undefined;

  useEffect(() => {
    const mapped: LocalMilestone[] = milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: '',
      amount: String(m.amount / 100),
      due_date: m.due_date || '',
      status: m.status,
      stage_number: m.stage_number,
    }));
    setLocalMilestones(mapped);
    setDeletedIds([]);
  }, [milestones]);

  const totalCents = localMilestones.reduce((sum, m) => {
    const dollars = parseFloat(m.amount) || 0;
    return sum + Math.round(dollars * 100);
  }, 0);

  const completedCount = localMilestones.filter((m) => m.status === 'paid').length;
  const approvedCount = localMilestones.filter((m) => m.status === 'approved').length;
  const progressPercent = localMilestones.length > 0
    ? Math.round(((completedCount + approvedCount * 0.5) / localMilestones.length) * 100)
    : 0;

  const addMilestone = () => {
    setLocalMilestones((prev) => [
      ...prev,
      {
        title: '',
        description: '',
        amount: '',
        due_date: '',
        status: 'pending',
        stage_number: prev.length + 1,
        isNew: true,
      },
    ]);
  };

  const loadTemplate = () => {
    if (!availableTemplate) return;
    const templateMilestones: LocalMilestone[] = availableTemplate.map((t, i) => ({
      title: t.title,
      description: t.description,
      amount: '',
      due_date: '',
      status: 'pending' as MilestoneStatus,
      stage_number: i + 1,
      isNew: true,
    }));
    // Mark any existing milestones for deletion
    setDeletedIds((prev) => [
      ...prev,
      ...localMilestones.filter((m) => m.id).map((m) => m.id!),
    ]);
    setLocalMilestones(templateMilestones);
    setShowTemplateConfirm(false);
  };

  const removeMilestone = (index: number) => {
    const m = localMilestones[index];
    if (m.id) {
      setDeletedIds((prev) => [...prev, m.id!]);
    }
    setLocalMilestones((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((item, i) => ({ ...item, stage_number: i + 1 }));
    });
  };

  const updateField = (index: number, field: keyof LocalMilestone, value: string) => {
    setLocalMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setError('');
    setSuccessMsg('');

    // Validate
    for (let i = 0; i < localMilestones.length; i++) {
      const m = localMilestones[i];
      if (!m.title.trim()) {
        setError(`Milestone ${i + 1}: Title is required.`);
        return;
      }
      const amt = parseFloat(m.amount);
      if (!amt || amt <= 0) {
        setError(`Milestone ${i + 1}: Amount must be greater than zero.`);
        return;
      }
    }

    setSaving(true);

    try {
      // Delete removed milestones
      for (const id of deletedIds) {
        const { error: delErr } = await supabase.from('job_milestones').delete().eq('id', id);
        if (delErr) throw delErr;
      }

      // Upsert milestones
      for (const m of localMilestones) {
        const amountCents = Math.round(parseFloat(m.amount) * 100);
        const payload = {
          job_id: jobId,
          title: m.title.trim(),
          amount: amountCents,
          due_date: m.due_date || null,
          status: m.status,
          stage_number: m.stage_number,
          created_by: user.id,
          payment_type: 'milestone',
        };

        if (m.id && !m.isNew) {
          const { error: upErr } = await supabase
            .from('job_milestones')
            .update(payload)
            .eq('id', m.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase.from('job_milestones').insert(payload);
          if (insErr) throw insErr;
        }
      }

      setDeletedIds([]);
      setSuccessMsg('Milestones saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      onUpdate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save milestones.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-primary-600" />
          </div>
          <h4 className="text-base font-bold text-gray-900">Milestones</h4>
          {localMilestones.length > 0 && (
            <span className="text-xs text-gray-500 ml-1">({localMilestones.length})</span>
          )}
        </div>
        {localMilestones.length > 0 && (
          <span className="text-sm font-semibold text-gray-700">
            Total: ${formatCents(totalCents)}
          </span>
        )}
      </div>

      {/* Load template button */}
      {!readOnly && availableTemplate && localMilestones.length === 0 && !showTemplateConfirm && (
        <button
          onClick={() => loadTemplate()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-50 border-2 border-dashed border-primary-200 text-primary-700 font-medium rounded-xl hover:bg-primary-100 hover:border-primary-300 transition-colors text-sm"
        >
          <FileText className="w-4 h-4" />
          Load {tradeCategory} milestone template
        </button>
      )}

      {/* Template confirm when milestones already exist */}
      {!readOnly && availableTemplate && localMilestones.length > 0 && showTemplateConfirm && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800 font-medium mb-2">
            This will replace your current milestones with the {tradeCategory} template. Continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={loadTemplate}
              className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              Yes, load template
            </button>
            <button
              onClick={() => setShowTemplateConfirm(false)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!readOnly && availableTemplate && localMilestones.length > 0 && !showTemplateConfirm && (
        <button
          onClick={() => setShowTemplateConfirm(true)}
          className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          <FileText className="w-3.5 h-3.5" />
          Reset to {tradeCategory} template
        </button>
      )}

      {/* Progress bar */}
      {localMilestones.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {completedCount} of {localMilestones.length} paid
              {approvedCount > 0 && `, ${approvedCount} approved`}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestone list */}
      {localMilestones.length === 0 && readOnly && (
        <div className="py-8 text-center text-sm text-gray-400">
          No milestones have been added yet.
        </div>
      )}

      <div className="space-y-0 divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {localMilestones.map((m, index) => {
          const statusCfg = STATUS_CONFIG[m.status];
          const StatusIcon = statusCfg.icon;

          return (
            <div key={m.id || `new-${index}`} className="bg-white p-4 relative group">
              {readOnly ? (
                /* Read-only view */
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-400 mr-2">{index + 1}.</span>
                      <span className="font-semibold text-gray-900">{m.title || 'Untitled'}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.color}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                    </span>
                  </div>
                  {m.description && (
                    <p className="text-sm text-gray-500 mt-1 ml-5">{m.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 ml-5 text-sm text-gray-600">
                    <span className="font-medium">${parseFloat(m.amount || '0').toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                    {m.due_date && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span className="flex items-center gap-1 text-gray-500">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(m.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Editable view */
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-400 mt-2.5 w-5 text-right flex-shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        value={m.title}
                        onChange={(e) => updateField(index, 'title', e.target.value)}
                        placeholder="Milestone title (e.g. Foundation Work)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-medium"
                      />
                      <input
                        type="text"
                        value={m.description}
                        onChange={(e) => updateField(index, 'description', e.target.value)}
                        placeholder="Brief description (optional)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-600"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[120px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                          <input
                            type="number"
                            value={m.amount}
                            onChange={(e) => updateField(index, 'amount', e.target.value)}
                            placeholder="Amount"
                            min="0"
                            step="0.01"
                            className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>
                        <div className="relative flex-1 min-w-[140px]">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="date"
                            value={m.due_date}
                            onChange={(e) => updateField(index, 'due_date', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${statusCfg.bg} ${statusCfg.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMilestone(index)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-1.5 opacity-0 group-hover:opacity-100"
                      title="Remove milestone"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add milestone button */}
        {!readOnly && (
          <button
            onClick={addMilestone}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary-600 hover:bg-primary-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Milestone
          </button>
        )}
      </div>

      {/* Error / Success messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Save button */}
      {!readOnly && localMilestones.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Milestones
            </>
          )}
        </button>
      )}
    </div>
  );
}
