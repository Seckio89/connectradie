/*
  # Make Job Images Bucket Public
  
  1. Changes
    - Update `job-images` bucket to be public
    - This allows public URLs to work for image viewing
    - Maintains existing upload restrictions (authenticated users only)
  
  2. Security
    - Public read access for all users (including unauthenticated)
    - Upload still requires authentication
    - Users can only upload to their own folder
*/

-- Update the job-images bucket to be public
UPDATE storage.buckets
SET public = true
WHERE id = 'job-images';