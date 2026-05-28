
-- Create public bucket for announcement images
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcements_images', 'announcements_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read
CREATE POLICY "Announcement images are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'announcements_images');

-- Anyone can upload (admin is gated client-side by password; matches existing app model)
CREATE POLICY "Anyone can upload announcement images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'announcements_images');

-- Anyone can delete (admin-gated client side)
CREATE POLICY "Anyone can delete announcement images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'announcements_images');
