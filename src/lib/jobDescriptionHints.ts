// Trade-specific description prompts to help clients provide useful details.
// Each hint is a short phrase the client can tap to append to their description.
// Sources: common quoting requirements from Australian trade associations (HIA, MBA, MPAQ).

export const JOB_DESCRIPTION_HINTS: Record<string, string[]> = {
  Cleaner: [
    '3-bedroom house',
    'End of lease clean',
    'Oven and rangehood included',
    'Windows inside and out',
    'Carpet steam clean needed',
    'Furnished / unfurnished',
  ],
  Plumber: [
    'Leaking tap in kitchen',
    'Blocked drain — sewage backing up',
    'New hot water system install',
    'Toilet running constantly',
    'Gas fitting required',
    'Burst pipe — urgent',
  ],
  Electrician: [
    'Switchboard upgrade needed',
    'Install new power points',
    'Ceiling fan installation',
    'Smoke alarm compliance check',
    'LED downlight install',
    'Safety switch (RCD) install',
  ],
  Builder: [
    'Granny flat build',
    'Structural wall removal',
    'Deck or pergola construction',
    'Extension — approx size',
    'Council plans already approved',
    'Knock down and rebuild',
  ],
  Painter: [
    'Interior walls and ceilings',
    'Exterior repaint — weatherboard',
    'Exterior repaint — brick render',
    'Feature wall / accent colour',
    'Number of rooms:',
    'Ceiling height over 3m',
  ],
  Landscaper: [
    'New turf — approx area',
    'Garden bed design and planting',
    'Retaining wall needed',
    'Irrigation system install',
    'Tree removal / pruning',
    'Paving or decking area',
  ],
  Carpenter: [
    'Built-in wardrobe install',
    'Timber deck — approx size',
    'Door and frame replacement',
    'Skirting and architrave install',
    'Pergola construction',
    'Custom shelving / joinery',
  ],
  Roofer: [
    'Roof leak — location:',
    'Full roof replacement',
    'Gutter and downpipe replacement',
    'Ridge capping repair',
    'Tile to Colorbond conversion',
    'Roof inspection and report',
  ],
  Tiler: [
    'Bathroom floor and walls',
    'Kitchen splashback',
    'Outdoor patio tiling',
    'Tiles supplied / need supply',
    'Waterproofing included',
    'Approx area in sqm:',
  ],
  Concreter: [
    'Driveway slab — approx size',
    'Shed slab / house slab',
    'Concrete path or walkway',
    'Exposed aggregate finish',
    'Coloured or stamped concrete',
    'Old concrete removal needed',
  ],
  HVAC: [
    'Split system install — room size',
    'Ducted system service',
    'Unit not cooling / heating',
    'Brand and model if known:',
    'Multi-head split system',
    'Gas heating install or repair',
  ],
  Pest: [
    'Termite inspection needed',
    'Cockroach / ant treatment',
    'Rodent problem',
    'Pre-purchase pest report',
    'Spider treatment — indoor/outdoor',
    'Property type: house / unit',
  ],
  Locksmith: [
    'Locked out — need urgent entry',
    'Rekey all locks after move-in',
    'Deadbolt installation',
    'Smart lock / keypad install',
    'Window lock replacements',
    'Master key system setup',
  ],
  Fencer: [
    'Colorbond fence — length:',
    'Timber paling fence',
    'Pool fence — AS 1926 compliant',
    'Gate installation / repair',
    'Old fence removal needed',
    'Retaining wall + fence combo',
  ],
  Bricklayer: [
    'Letterbox or garden wall build',
    'Brick repair / repointing',
    'Retaining wall — block or brick',
    'Brick extension wall',
    'Render over existing brick',
    'Feature brick wall',
  ],
  'Pool Builder': [
    'New pool — concrete or fibreglass',
    'Pool renovation / resurface',
    'Pool fencing to code',
    'Equipment upgrade — pump/filter',
    'Pool heating install',
    'Spa / swim spa install',
  ],
  Bathroom: [
    'Full bathroom renovation',
    'Shower screen replacement',
    'Vanity and tapware upgrade',
    'Waterproofing and tiling',
    'Bath to shower conversion',
    'Approx bathroom size:',
  ],
  Kitchen: [
    'Full kitchen renovation',
    'Benchtop replacement only',
    'New cabinetry and layout',
    'Splashback tiling',
    'Appliance installation',
    'Demolition of existing kitchen',
  ],
  Renovation: [
    'Which rooms / areas:',
    'Structural changes needed',
    'Cosmetic refresh only',
    'Heritage or older home',
    'Council approval status:',
    'Budget range in mind:',
  ],
  Demolition: [
    'Internal strip-out only',
    'Full house demolition',
    'Asbestos present / unknown',
    'Shed or garage removal',
    'Pool demolition and fill',
    'Concrete removal',
  ],
  Excavation: [
    'Site cut for new build',
    'Trenching for services',
    'Pool excavation',
    'Driveway excavation',
    'Soil removal — approx volume',
    'Rock present on site',
  ],
};

// Fallback hints for trades not in the map
export const DEFAULT_JOB_HINTS = [
  'Describe the issue or what you need',
  'Mention the room or area',
  'Include approximate size if relevant',
  'Note any access issues',
  'Mention if materials are supplied',
  'Any time constraints or deadlines',
];

/**
 * Get description hints for a given trade category.
 */
export function getJobHints(category: string | null): string[] {
  if (!category) return DEFAULT_JOB_HINTS;
  // Direct match first
  if (JOB_DESCRIPTION_HINTS[category]) return JOB_DESCRIPTION_HINTS[category];
  // Case-insensitive fallback
  const key = Object.keys(JOB_DESCRIPTION_HINTS).find(
    (k) => k.toLowerCase() === category.toLowerCase()
  );
  return key ? JOB_DESCRIPTION_HINTS[key] : DEFAULT_JOB_HINTS;
}
