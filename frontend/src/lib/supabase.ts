import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://pvkeptzxtodwfxlousla.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2a2VwdHp4dG9kd2Z4bG91c2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzE5NDIsImV4cCI6MjEwNzY0Nzk0Mn0.Ywa25aa5Llqek1vReeka7iG9te1v-HQItocmRy9nCo4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
