-- Migration: Fix Row Level Security on workspaces & workspace_members, and add workspace_messages and workspace_tasks
-- Applied to Supabase project pvkeptzxtodwfxlousla

-- 1. Helper functions with SECURITY DEFINER and row_security = off to eliminate RLS recursion
CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_email text;
BEGIN
  IF ws_id IS NULL OR u_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws_id AND owner_id = u_id) THEN
    RETURN true;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = u_id;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND (user_id = u_id OR (v_email IS NOT NULL AND lower(email) = lower(v_email)))
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_email text;
BEGIN
  IF ws_id IS NULL OR u_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws_id AND owner_id = u_id) THEN
    RETURN true;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = u_id;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND (user_id = u_id OR (v_email IS NOT NULL AND lower(email) = lower(v_email)))
      AND status = 'active'
  );
END;
$$;

-- 2. Trigger on newly created workspace to add owner to members
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, email, role, status)
  VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(
      (SELECT email FROM auth.users WHERE id = NEW.owner_id),
      auth.jwt() ->> 'email',
      'owner@team.local'
    ),
    'owner',
    'active'
  )
  ON CONFLICT (workspace_id, email) DO UPDATE
  SET user_id = EXCLUDED.user_id, role = 'owner', status = 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;
CREATE TRIGGER on_workspace_created
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace();

-- 3. RLS policies on workspaces (using SECURITY DEFINER function to avoid circular subqueries)
ALTER POLICY "workspaces: member can read"
ON public.workspaces
USING (
  owner_id = auth.uid()
  OR is_workspace_member(id, auth.uid())
);

ALTER POLICY "workspaces: authenticated can insert"
ON public.workspaces
WITH CHECK (
  auth.uid() = owner_id
);

ALTER POLICY "workspaces: admin can update"
ON public.workspaces
USING (
  owner_id = auth.uid() OR is_workspace_admin(id, auth.uid())
)
WITH CHECK (
  owner_id = auth.uid() OR is_workspace_admin(id, auth.uid())
);

ALTER POLICY "workspaces: owner can delete"
ON public.workspaces
USING (
  owner_id = auth.uid()
);

-- 4. RLS policies on workspace_members (no direct auth.users queries and no circular subqueries)
ALTER POLICY "workspace_members: member can read"
ON public.workspace_members
USING (
  is_workspace_member(workspace_id, auth.uid())
  OR user_id = auth.uid()
  OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);

ALTER POLICY "workspace_members: admin can insert"
ON public.workspace_members
WITH CHECK (
  is_workspace_admin(workspace_id, auth.uid())
);

ALTER POLICY "workspace_members: admin or self can update"
ON public.workspace_members
USING (
  is_workspace_admin(workspace_id, auth.uid())
  OR user_id = auth.uid()
  OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
)
WITH CHECK (
  is_workspace_admin(workspace_id, auth.uid())
  OR user_id = auth.uid()
  OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);

ALTER POLICY "workspace_members: admin or self can delete"
ON public.workspace_members
USING (
  is_workspace_admin(workspace_id, auth.uid())
  OR user_id = auth.uid()
  OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);

-- 5. Create workspace_messages table (Conversations / Chat)
CREATE TABLE IF NOT EXISTS public.workspace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  sender_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_messages' AND policyname = 'workspace_messages: members can read'
  ) THEN
    CREATE POLICY "workspace_messages: members can read"
    ON public.workspace_messages
    FOR SELECT
    TO authenticated
    USING (
      is_workspace_member(workspace_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_messages' AND policyname = 'workspace_messages: members can insert'
  ) THEN
    CREATE POLICY "workspace_messages: members can insert"
    ON public.workspace_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
      is_workspace_member(workspace_id, auth.uid())
      AND auth.uid() = sender_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_messages' AND policyname = 'workspace_messages: sender or admin can delete'
  ) THEN
    CREATE POLICY "workspace_messages: sender or admin can delete"
    ON public.workspace_messages
    FOR DELETE
    TO authenticated
    USING (
      auth.uid() = sender_id
      OR is_workspace_admin(workspace_id, auth.uid())
    );
  END IF;
END $$;

-- 6. Create workspace_tasks table (Task Assignment)
CREATE TABLE IF NOT EXISTS public.workspace_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_email text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_tasks' AND policyname = 'workspace_tasks: members can read'
  ) THEN
    CREATE POLICY "workspace_tasks: members can read"
    ON public.workspace_tasks
    FOR SELECT
    TO authenticated
    USING (
      is_workspace_member(workspace_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_tasks' AND policyname = 'workspace_tasks: members can insert'
  ) THEN
    CREATE POLICY "workspace_tasks: members can insert"
    ON public.workspace_tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (
      is_workspace_member(workspace_id, auth.uid())
      AND auth.uid() = created_by
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_tasks' AND policyname = 'workspace_tasks: members can update'
  ) THEN
    CREATE POLICY "workspace_tasks: members can update"
    ON public.workspace_tasks
    FOR UPDATE
    TO authenticated
    USING (
      is_workspace_member(workspace_id, auth.uid())
    )
    WITH CHECK (
      is_workspace_member(workspace_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_tasks' AND policyname = 'workspace_tasks: creator or admin can delete'
  ) THEN
    CREATE POLICY "workspace_tasks: creator or admin can delete"
    ON public.workspace_tasks
    FOR DELETE
    TO authenticated
    USING (
      is_workspace_admin(workspace_id, auth.uid())
      OR created_by = auth.uid()
    );
  END IF;
END $$;

-- 7. Supabase Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
