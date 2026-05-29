-- "Hot tip" chips on the recurring-service form inserted only the short keyword
-- (e.g. "vacuum"), which read as a broad label rather than a useful task line.
-- Add a detail column so a chip inserts a specific, professional task description
-- while its label stays short. Falls back to the keyword where no detail is set.
ALTER TABLE public.service_description_keywords
  ADD COLUMN IF NOT EXISTS detail text;

UPDATE public.service_description_keywords k
SET detail = v.detail
FROM (VALUES
  -- Regular Domestic Clean
  ('Regular Domestic Clean','vacuum','Vacuum all carpets, rugs and hard floors throughout'),
  ('Regular Domestic Clean','mopping','Mop all hard floors — kitchen, bathrooms, laundry and hallways'),
  ('Regular Domestic Clean','bathrooms','Clean and sanitise bathrooms — toilet, shower, bath, basin, mirrors and tiles'),
  ('Regular Domestic Clean','dusting','Dust all surfaces, shelves, furniture and accessible ledges'),
  ('Regular Domestic Clean','kitchen surfaces','Wipe down kitchen benchtops, splashback, sink and appliance exteriors'),
  ('Regular Domestic Clean','skirting boards','Wipe down skirting boards and door frames'),
  ('Regular Domestic Clean','window sills','Wipe internal window sills and ledges'),
  ('Regular Domestic Clean','cobwebs','Remove cobwebs from ceilings, corners and cornices'),
  ('Regular Domestic Clean','bin emptying','Empty all bins and replace liners'),
  ('Regular Domestic Clean','bed linen change','Strip and remake beds with fresh linen (linen provided)'),
  -- Deep Clean
  ('Deep Clean','oven clean','Deep clean oven inside and out, including racks and trays'),
  ('Deep Clean','grout scrub','Scrub and detail tile grout in bathrooms and kitchen'),
  ('Deep Clean','inside cupboards','Clean inside cupboards and drawers (emptied beforehand)'),
  ('Deep Clean','behind appliances','Clean behind and under appliances — fridge, oven and washing machine'),
  ('Deep Clean','exhaust fans','Clean range hood and bathroom exhaust fans'),
  ('Deep Clean','light fixtures','Dust and wipe light fixtures and ceiling fans'),
  ('Deep Clean','window tracks','Detail window tracks, runners and frames'),
  ('Deep Clean','mould treatment','Treat and remove mould from bathroom seals and ceilings'),
  -- End of Lease Clean
  ('End of Lease Clean','bond clean','Full bond clean to agent standard for deposit return'),
  ('End of Lease Clean','oven degreasing','Degrease oven, grill and stovetop to as-new condition'),
  ('End of Lease Clean','carpet steam','Professional carpet steam clean throughout'),
  ('End of Lease Clean','window cleaning','Clean all windows inside and out, including tracks and screens'),
  ('End of Lease Clean','wall marks','Spot-clean wall marks, scuffs and fingerprints'),
  ('End of Lease Clean','garage sweep','Sweep out and tidy garage and external areas'),
  -- Commercial Clean
  ('Commercial Clean','floor polishing','Buff and polish hard floors in common areas'),
  ('Commercial Clean','sanitisation','Sanitise high-touch points — door handles, switches, desks and shared equipment'),
  ('Commercial Clean','high traffic areas','Detail high-traffic areas — entry, corridors and kitchenette'),
  ('Commercial Clean','waste disposal','Empty all bins and remove waste to the collection point'),
  ('Commercial Clean','reception area','Clean and present reception / front-of-house area')
) AS v(service_type, keyword, detail)
WHERE k.service_type = v.service_type AND k.keyword = v.keyword;
