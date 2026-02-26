/*
  # Create portfolio images table

  1. New Tables
    - `portfolio_images`
      - `id` (uuid, primary key)
      - `tradie_id` (uuid, FK to profiles.id) - the tradie who owns the image
      - `image_url` (text) - URL to the portfolio image
      - `caption` (text, nullable) - optional description of the work
      - `sort_order` (integer) - ordering of images in the gallery
      - `created_at` (timestamptz) - when the image was added

  2. Security
    - Enable RLS on `portfolio_images` table
    - Tradies can manage their own portfolio images (CRUD)
    - Anyone can view portfolio images (public read for the public profile page)

  3. Indexes
    - Index on `tradie_id` for fast lookups
*/

CREATE TABLE IF NOT EXISTS portfolio_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id),
  image_url text NOT NULL,
  caption text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE portfolio_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portfolio images"
  ON portfolio_images
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Tradies can insert own portfolio images"
  ON portfolio_images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

CREATE POLICY "Tradies can update own portfolio images"
  ON portfolio_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);

CREATE POLICY "Tradies can delete own portfolio images"
  ON portfolio_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = tradie_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_images_tradie_id ON portfolio_images(tradie_id);
