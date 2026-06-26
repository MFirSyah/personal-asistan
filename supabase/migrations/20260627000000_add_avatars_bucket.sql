-- Create 'avatars' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for 'avatars' bucket
-- Allow public viewing of avatars
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Auth Upload Access" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their own avatars
CREATE POLICY "Auth Update Access" 
ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete their own avatars
CREATE POLICY "Auth Delete Access" 
ON storage.objects FOR DELETE 
USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
);
