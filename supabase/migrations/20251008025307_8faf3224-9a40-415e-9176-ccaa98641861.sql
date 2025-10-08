-- Create storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true);

-- Create RLS policies for profile pictures
CREATE POLICY "Users can view all profile pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can upload their own profile pictures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile pictures"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile pictures"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add profile_picture_url column to kids table
ALTER TABLE public.kids
ADD COLUMN profile_picture_url text;