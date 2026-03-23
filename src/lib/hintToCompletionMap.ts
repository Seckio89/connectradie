// Maps each client-facing hint (from jobDescriptionHints.ts) to the corresponding
// tradie-facing completion prompt(s) (from JobCompletionModal.tsx).
// Used to filter the completion checklist so it only shows tasks the client selected.

import { JOB_DESCRIPTION_HINTS } from './jobDescriptionHints';

/**
 * category → { hint → completion prompt(s) }
 *
 * Only categories that exist in BOTH JOB_DESCRIPTION_HINTS and COMPLETION_PROMPTS
 * need entries here. Categories missing from this map fall back to showing all prompts.
 */
const HINT_TO_COMPLETION_MAP: Record<string, Record<string, string[]>> = {
  Cleaner: {
    'Mop floors':         ['Floors vacuumed and mopped'],
    'Wipe down surfaces': ['All rooms deep cleaned and sanitised'],
    'Vacuum carpets':     ['Floors vacuumed and mopped'],
    'Clean bathrooms':    ['Kitchen and bathrooms scrubbed'],
    'Kitchen deep clean': ['Kitchen and bathrooms scrubbed'],
    'Window cleaning':    ['Windows and glass cleaned'],
    'Oven and rangehood': ['Oven and rangehood degreased'],
    'End of lease clean': ['All rooms deep cleaned and sanitised', 'Kitchen and bathrooms scrubbed', 'Floors vacuumed and mopped', 'Windows and glass cleaned', 'Rubbish removed from site'],
    'Office clean':       ['All rooms deep cleaned and sanitised', 'Floors vacuumed and mopped'],
    'Dust and polish':    ['All rooms deep cleaned and sanitised'],
    'Rubbish removal':    ['Rubbish removed from site'],
    'Steam clean carpets': ['Floors vacuumed and mopped'],
  },
  Plumber: {
    'Leaking tap':        ['Leak repaired and pressure tested', 'Tap washer replaced — no further leaks'],
    'Blocked drain':      ['Blocked drain cleared'],
    'Hot water system':   ['Hot water system serviced'],
    'Toilet repair':      ['New fixture installed and tested'],
    'Gas fitting':        ['Compliance certificate issued'],
    'Burst pipe':         ['Leak repaired and pressure tested'],
    'New tap install':    ['New fixture installed and tested'],
    'Pipe replacement':   ['Leak repaired and pressure tested', 'Compliance certificate issued'],
    'Backflow prevention': ['New fixture installed and tested', 'Compliance certificate issued'],
    'Sewer repair':       ['Blocked drain cleared', 'Compliance certificate issued'],
  },
  Electrician: {
    'Switchboard upgrade': ['Switchboard upgraded to current standards', 'Certificate of compliance issued'],
    'Power points':       ['New circuit installed and tested', 'All points tested — no faults found'],
    'Ceiling fan':        ['New circuit installed and tested', 'All points tested — no faults found'],
    'Smoke alarms':       ['Smoke alarms tested and compliant'],
    'LED downlights':     ['New circuit installed and tested', 'All points tested — no faults found'],
    'Safety switch':      ['Safety switch (RCD) installed', 'Certificate of compliance issued'],
    'Rewiring':           ['Faulty wiring replaced', 'All points tested — no faults found', 'Certificate of compliance issued'],
    'Outdoor lighting':   ['New circuit installed and tested', 'All points tested — no faults found'],
    'EV charger':         ['New circuit installed and tested', 'Certificate of compliance issued'],
    'Data cabling':       ['New circuit installed and tested', 'All points tested — no faults found'],
  },
  Builder: {
    'Granny flat':        ['All structural work complete to plans', 'Practical completion achieved', 'Site cleaned and cleared'],
    'Wall removal':       ['All structural work complete to plans', 'Frame inspection passed'],
    'Deck build':         ['All structural work complete to plans', 'Practical completion achieved', 'Site cleaned and cleared'],
    'Pergola':            ['All structural work complete to plans', 'Practical completion achieved', 'Site cleaned and cleared'],
    'Extension':          ['All structural work complete to plans', 'Frame inspection passed', 'Practical completion achieved'],
    'Renovation':         ['All structural work complete to plans', 'Practical completion achieved', 'Defect-free handover'],
    'Council approved':   ['All structural work complete to plans'],
    'Knock down rebuild': ['All structural work complete to plans', 'Frame inspection passed', 'Lock-up stage reached', 'Fixing stage complete', 'Practical completion achieved', 'Defect-free handover', 'Site cleaned and cleared'],
    'Structural repair':  ['All structural work complete to plans', 'Frame inspection passed'],
    'Retaining wall':     ['All structural work complete to plans', 'Site cleaned and cleared'],
  },
  Painter: {
    'Interior walls':     ['All surfaces prepped and primed', 'Two coats applied — even coverage', 'Colour as per client specification'],
    'Ceilings':           ['All surfaces prepped and primed', 'Two coats applied — even coverage'],
    'Exterior repaint':   ['All surfaces prepped and primed', 'Two coats applied — even coverage', 'Colour as per client specification'],
    'Feature wall':       ['All surfaces prepped and primed', 'Two coats applied — even coverage', 'Colour as per client specification'],
    'Weatherboard':       ['All surfaces prepped and primed', 'Two coats applied — even coverage'],
    'Brick render':       ['All surfaces prepped and primed', 'Two coats applied — even coverage'],
    'Doors and trim':     ['Trim and edges cut in cleanly', 'Touch-ups completed'],
    'Spray paint':        ['All surfaces prepped and primed', 'Two coats applied — even coverage', 'Drop sheets removed — area cleaned'],
    'Colour consultation': ['Colour as per client specification'],
    'Prep and sand':      ['All surfaces prepped and primed', 'Drop sheets removed — area cleaned'],
  },
  Landscaper: {
    'New turf':           ['Turf laid and watered in'],
    'Garden beds':        ['Garden beds prepared and planted'],
    'Retaining wall':     ['Retaining wall built to spec'],
    'Irrigation':         ['Irrigation system installed and tested'],
    'Tree removal':       ['Site levelled and cleared'],
    'Paving':             ['Paving laid and compacted'],
    'Mulching':           ['Mulch spread to all garden beds'],
    'Hedge trimming':     ['Garden beds prepared and planted', 'Site levelled and cleared'],
    'Garden design':      ['Garden beds prepared and planted', 'Site levelled and cleared'],
    'Lawn mowing':        ['Turf laid and watered in', 'Site levelled and cleared'],
  },
  Carpenter: {
    'Built-in wardrobe':  ['Custom joinery installed', 'All timber treated and sealed'],
    'Timber deck':        ['Deck built and oiled'],
    'Door replacement':   ['Second fix — doors, architraves, skirting fitted'],
    'Skirting boards':    ['Second fix — doors, architraves, skirting fitted'],
    'Pergola':            ['Pergola constructed to plans', 'All timber treated and sealed'],
    'Custom shelving':    ['Custom joinery installed'],
    'Window frames':      ['Second fix — doors, architraves, skirting fitted'],
    'Stair repair':       ['First fix framing complete', 'All timber treated and sealed'],
    'Timber flooring':    ['All timber treated and sealed'],
    'Gate build':         ['All timber treated and sealed', 'Custom joinery installed'],
  },
  Roofer: {
    'Roof leak':          ['No leaks — water tested', 'Flashing and ridgecapping sealed'],
    'Full replacement':   ['Old roof stripped and removed', 'Sarking and battens installed', 'New roofing sheets/tiles laid', 'Flashing and ridgecapping sealed', 'Gutters and downpipes connected', 'No leaks — water tested'],
    'Gutter clean':       ['Gutters and downpipes connected'],
    'Downpipes':          ['Gutters and downpipes connected'],
    'Ridge capping':      ['Flashing and ridgecapping sealed'],
    'Tile repair':        ['New roofing sheets/tiles laid', 'No leaks — water tested'],
    'Colorbond':          ['New roofing sheets/tiles laid', 'Flashing and ridgecapping sealed'],
    'Roof inspection':    ['No leaks — water tested'],
    'Flashing repair':    ['Flashing and ridgecapping sealed', 'No leaks — water tested'],
    'Skylight install':   ['No leaks — water tested', 'Flashing and ridgecapping sealed'],
  },
  Tiler: {
    'Bathroom tiles':     ['Tiles laid and levelled', 'Grouted and sealed', 'Silicone applied to all edges'],
    'Kitchen splashback': ['Tiles laid and levelled', 'Grouted and sealed'],
    'Floor tiles':        ['Surface prepared and primed', 'Tiles laid and levelled', 'Grouted and sealed'],
    'Outdoor patio':      ['Surface prepared and primed', 'Tiles laid and levelled', 'Grouted and sealed'],
    'Waterproofing':      ['Surface prepared and primed'],
    'Tile repair':        ['Tiles laid and levelled', 'Grouted and sealed', 'Excess adhesive cleaned up'],
    'Mosaic feature':     ['Tiles laid and levelled', 'Grouted and sealed', 'No chips or cracks — clean finish'],
    'Grout replacement':  ['Grouted and sealed', 'Silicone applied to all edges'],
    'Wall tiles':         ['Surface prepared and primed', 'Tiles laid and levelled', 'Grouted and sealed'],
    'Tiles supplied':     ['Tiles laid and levelled'],
  },
  Concreter: {
    'Driveway slab':      ['Formwork set and reinforcement placed', 'Concrete poured and finished', 'Expansion joints cut', 'Surface sealed/coated'],
    'Shed slab':          ['Formwork set and reinforcement placed', 'Concrete poured and finished'],
    'Concrete path':      ['Formwork set and reinforcement placed', 'Concrete poured and finished', 'Expansion joints cut'],
    'Exposed aggregate':  ['Concrete poured and finished', 'Surface sealed/coated'],
    'Coloured concrete':  ['Concrete poured and finished', 'Surface sealed/coated'],
    'Old concrete removal': ['Forms stripped — edges clean'],
    'Retaining wall':     ['Formwork set and reinforcement placed', 'Concrete poured and finished'],
    'Steps and stairs':   ['Formwork set and reinforcement placed', 'Concrete poured and finished', 'Forms stripped — edges clean'],
    'Pool surround':      ['Formwork set and reinforcement placed', 'Concrete poured and finished', 'Surface sealed/coated'],
    'Stamped finish':     ['Concrete poured and finished', 'Surface sealed/coated', 'Curing period complete'],
  },
  HVAC: {
    'Split system':       ['Unit installed and mounted', 'System commissioned — cooling/heating tested'],
    'Ducted service':     ['System commissioned — cooling/heating tested', 'Filter and maintenance info provided'],
    'Not cooling':        ['System commissioned — cooling/heating tested'],
    'Not heating':        ['System commissioned — cooling/heating tested'],
    'Multi-head system':  ['Unit installed and mounted', 'Refrigerant lines connected and tested', 'System commissioned — cooling/heating tested'],
    'Gas heating':        ['Electrical connected to standards', 'System commissioned — cooling/heating tested'],
    'Filter clean':       ['Filter and maintenance info provided'],
    'New install':        ['Unit installed and mounted', 'Refrigerant lines connected and tested', 'Electrical connected to standards', 'System commissioned — cooling/heating tested', 'Remote and controls programmed', 'Filter and maintenance info provided'],
    'Thermostat':         ['Remote and controls programmed'],
    'Refrigerant top-up': ['Refrigerant lines connected and tested', 'System commissioned — cooling/heating tested'],
  },
  Pest: {
    'Termite inspection': ['Full property inspected', 'Report provided to client', 'Recommend follow-up in 12 months'],
    'Cockroach treatment': ['Treatment applied to affected areas', 'Report provided to client'],
    'Ant treatment':      ['Treatment applied to affected areas', 'Entry points sealed'],
    'Rodent control':     ['Full property inspected', 'Bait stations installed', 'Entry points sealed'],
    'Spider spray':       ['Treatment applied to affected areas'],
    'Pre-purchase report': ['Full property inspected', 'Report provided to client'],
    'Bee removal':        ['Treatment applied to affected areas'],
    'Flea treatment':     ['Treatment applied to affected areas', 'Report provided to client'],
    'Possum removal':     ['Full property inspected', 'Entry points sealed'],
    'Bed bugs':           ['Treatment applied to affected areas', 'Report provided to client', 'Recommend follow-up in 12 months'],
  },
  Locksmith: {
    'Locked out':         ['Lock replaced / rekeyed', 'Keys tested and working'],
    'Rekey locks':        ['Lock replaced / rekeyed', 'Keys tested and working', 'Spare keys provided to client'],
    'Deadbolt install':   ['Deadbolt installed', 'Keys tested and working'],
    'Smart lock':         ['Lock replaced / rekeyed', 'Keys tested and working'],
    'Window locks':       ['All entry points secured'],
    'Master key system':  ['Lock replaced / rekeyed', 'Keys tested and working', 'Spare keys provided to client'],
    'Safe opening':       ['Keys tested and working'],
    'Lock replacement':   ['Lock replaced / rekeyed', 'Keys tested and working', 'Spare keys provided to client'],
    'Garage lock':        ['All entry points secured', 'Keys tested and working'],
    'Emergency entry':    ['Lock replaced / rekeyed', 'Keys tested and working'],
  },
  Fencer: {
    'Colorbond fence':    ['Post holes dug and posts set in concrete', 'Rails and palings/panels fixed', 'Site cleaned up'],
    'Timber paling':      ['Post holes dug and posts set in concrete', 'Rails and palings/panels fixed', 'All timber treated or coated', 'Site cleaned up'],
    'Pool fence':         ['Post holes dug and posts set in concrete', 'Rails and palings/panels fixed', 'Gate hung and latching correctly', 'Site cleaned up'],
    'Gate install':       ['Gate hung and latching correctly'],
    'Old fence removal':  ['Site cleaned up'],
    'Retaining wall':     ['Post holes dug and posts set in concrete', 'Site cleaned up'],
    'Slat screen':        ['Post holes dug and posts set in concrete', 'Rails and palings/panels fixed', 'Site cleaned up'],
    'Chain wire':         ['Post holes dug and posts set in concrete', 'Rails and palings/panels fixed', 'Site cleaned up'],
    'Post replacement':   ['Post holes dug and posts set in concrete'],
    'Fence repair':       ['Rails and palings/panels fixed', 'Site cleaned up'],
  },
  Bricklayer: {
    'Letterbox build':    ['Brickwork laid to plan — courses level', 'Mortar joints tooled and finished', 'Clean-down completed'],
    'Brick repair':       ['Brickwork laid to plan — courses level', 'Mortar joints tooled and finished', 'Clean-down completed'],
    'Repointing':         ['Mortar joints tooled and finished', 'Clean-down completed'],
    'Retaining wall':     ['Brickwork laid to plan — courses level', 'DPC (damp proof course) in place', 'Clean-down completed'],
    'Extension wall':     ['Brickwork laid to plan — courses level', 'Lintels installed above openings', 'DPC (damp proof course) in place', 'Ready for next trade'],
    'Render over brick':  ['Brickwork laid to plan — courses level', 'Clean-down completed'],
    'Feature wall':       ['Brickwork laid to plan — courses level', 'Mortar joints tooled and finished', 'Clean-down completed'],
    'Garden wall':        ['Brickwork laid to plan — courses level', 'Mortar joints tooled and finished', 'Clean-down completed'],
    'Chimney repair':     ['Brickwork laid to plan — courses level', 'Mortar joints tooled and finished'],
    'Block wall':         ['Brickwork laid to plan — courses level', 'DPC (damp proof course) in place', 'Ready for next trade'],
  },
  'Pool Builder': {
    'Concrete pool':      ['Excavation complete', 'Steel reinforcement and plumbing in', 'Shell poured / shotcrete applied', 'Coping and tiling complete', 'Equipment installed and commissioned', 'Pool filled and chemically balanced', 'Fencing compliant (AS 1926)', 'Council inspection passed'],
    'Fibreglass pool':    ['Excavation complete', 'Equipment installed and commissioned', 'Pool filled and chemically balanced', 'Fencing compliant (AS 1926)', 'Council inspection passed'],
    'Pool resurface':     ['Shell poured / shotcrete applied', 'Coping and tiling complete', 'Pool filled and chemically balanced'],
    'Pool fencing':       ['Fencing compliant (AS 1926)', 'Council inspection passed'],
    'Pump and filter':    ['Equipment installed and commissioned'],
    'Pool heating':       ['Equipment installed and commissioned'],
    'Spa install':        ['Excavation complete', 'Equipment installed and commissioned', 'Pool filled and chemically balanced'],
    'Green pool cleanup': ['Pool filled and chemically balanced'],
    'Pool cover':         ['Equipment installed and commissioned'],
    'Tile repair':        ['Coping and tiling complete'],
  },
  Bathroom: {
    'Full renovation':    ['Waterproofing applied and certified (AS 3740)', 'Tiling complete — all grouted and sealed', 'Fixtures installed and tested', 'Plumbing pressure tested — no leaks', 'Exhaust fan installed and operational', 'Silicone sealed all wet areas'],
    'Shower screen':      ['Fixtures installed and tested', 'Silicone sealed all wet areas'],
    'Vanity upgrade':     ['Fixtures installed and tested', 'Plumbing pressure tested — no leaks'],
    'Waterproofing':      ['Waterproofing applied and certified (AS 3740)'],
    'Tiling':             ['Tiling complete — all grouted and sealed', 'Silicone sealed all wet areas'],
    'Bath to shower':     ['Waterproofing applied and certified (AS 3740)', 'Tiling complete — all grouted and sealed', 'Fixtures installed and tested', 'Plumbing pressure tested — no leaks', 'Silicone sealed all wet areas'],
    'Tapware replace':    ['Fixtures installed and tested', 'Plumbing pressure tested — no leaks'],
    'Mirror install':     ['Fixtures installed and tested'],
    'Heated towel rail':  ['Fixtures installed and tested'],
    'Exhaust fan':        ['Exhaust fan installed and operational'],
  },
  Kitchen: {
    'Full renovation':    ['Cabinetry installed and aligned', 'Benchtop fitted and sealed', 'Splashback tiled and grouted', 'Plumbing connected — sink tested', 'Appliances connected and tested', 'All handles and hardware fitted'],
    'Benchtop replace':   ['Benchtop fitted and sealed'],
    'New cabinetry':      ['Cabinetry installed and aligned', 'All handles and hardware fitted'],
    'Splashback':         ['Splashback tiled and grouted'],
    'Appliance install':  ['Appliances connected and tested'],
    'Demolition':         ['Cabinetry installed and aligned'],
    'Sink and tap':       ['Plumbing connected — sink tested'],
    'Rangehood':          ['Appliances connected and tested'],
    'Pantry build':       ['Cabinetry installed and aligned', 'All handles and hardware fitted'],
    'Lighting upgrade':   ['Appliances connected and tested'],
  },
  Renovation: {
    'Bathroom':           ['Demolition and strip-out complete', 'All trades signed off', 'Painting and finishing complete', 'Final clean done — ready for handover'],
    'Kitchen':            ['Demolition and strip-out complete', 'All trades signed off', 'Painting and finishing complete', 'Final clean done — ready for handover'],
    'Living area':        ['Structural modifications done to spec', 'Painting and finishing complete', 'Final clean done — ready for handover'],
    'Structural changes': ['Structural modifications done to spec', 'All trades signed off'],
    'Cosmetic refresh':   ['Painting and finishing complete', 'Final clean done — ready for handover'],
    'Heritage home':      ['Structural modifications done to spec', 'All trades signed off', 'Painting and finishing complete'],
    'Council approved':   ['Structural modifications done to spec', 'All trades signed off'],
    'Full house':         ['Demolition and strip-out complete', 'Structural modifications done to spec', 'All trades signed off', 'Painting and finishing complete', 'Final clean done — ready for handover', 'Client walkthrough completed'],
    'Single room':        ['Painting and finishing complete', 'Final clean done — ready for handover'],
    'Open plan conversion': ['Demolition and strip-out complete', 'Structural modifications done to spec', 'All trades signed off'],
  },
  Demolition: {
    'Internal strip-out': ['Structure safely demolished', 'All waste removed and disposed legally', 'Site cleared and levelled'],
    'Full house demo':    ['Asbestos survey completed (pre-demolition)', 'Structure safely demolished', 'All waste removed and disposed legally', 'Site cleared and levelled', 'Services capped and made safe'],
    'Asbestos removal':   ['Asbestos survey completed (pre-demolition)', 'All waste removed and disposed legally'],
    'Shed removal':       ['Structure safely demolished', 'All waste removed and disposed legally', 'Site cleared and levelled'],
    'Pool demolition':    ['Structure safely demolished', 'All waste removed and disposed legally', 'Site cleared and levelled'],
    'Concrete removal':   ['Structure safely demolished', 'All waste removed and disposed legally', 'Site cleared and levelled'],
    'Wall removal':       ['Structure safely demolished', 'Services capped and made safe'],
    'Bathroom strip':     ['Structure safely demolished', 'All waste removed and disposed legally', 'Services capped and made safe'],
    'Kitchen strip':      ['Structure safely demolished', 'All waste removed and disposed legally', 'Services capped and made safe'],
    'Rubbish disposal':   ['All waste removed and disposed legally'],
  },
  Excavation: {
    'Site cut':           ['Site excavated to required depth', 'Site levelled and compacted'],
    'Trenching':          ['Site excavated to required depth', 'Services located and protected'],
    'Pool dig':           ['Site excavated to required depth', 'Soil removed / retained as specified'],
    'Driveway':           ['Site excavated to required depth', 'Site levelled and compacted'],
    'Soil removal':       ['Soil removed / retained as specified'],
    'Rock breaking':      ['Site excavated to required depth', 'Soil removed / retained as specified'],
    'Stump removal':      ['Site excavated to required depth', 'Site levelled and compacted'],
    'Levelling':          ['Site levelled and compacted'],
    'Drainage':           ['Site excavated to required depth', 'Services located and protected'],
    'Bobcat work':        ['Site excavated to required depth', 'Site levelled and compacted', 'Ready for next stage'],
  },
};

/**
 * Filter completion prompts to only those relevant to the client's job description.
 *
 * Parses the description for client-selected hints, maps them to completion prompts,
 * and returns only matching prompts (preserving original order).
 * Falls back to all prompts if no hints are detected (custom description).
 */
export function getFilteredCompletionPrompts(
  category: string,
  description: string,
  allPrompts: string[],
): string[] {
  const categoryMap = HINT_TO_COMPLETION_MAP[category];
  if (!categoryMap) return allPrompts;

  // Find which hints appear in the description (case-insensitive)
  const descLower = description.toLowerCase();
  const matchedPrompts = new Set<string>();
  let hintsFound = 0;

  for (const hint of Object.keys(categoryMap)) {
    if (descLower.includes(hint.toLowerCase())) {
      hintsFound++;
      for (const prompt of categoryMap[hint]) {
        matchedPrompts.add(prompt);
      }
    }
  }

  // Fallback: if no hints detected (fully custom description), show all
  if (hintsFound === 0) return allPrompts;

  // Filter allPrompts preserving original order, keeping only matched ones
  const filtered = allPrompts.filter((p) => matchedPrompts.has(p));

  // Safety fallback: if mapping produced empty result, show all
  return filtered.length > 0 ? filtered : allPrompts;
}
