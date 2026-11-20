// src/services/workspaceService.ts — Team & Workspace management via Supabase
import { supabase } from '../lib/supabase';
import type { Workspace, WorkspaceMember, WorkspaceInvitation, WorkspaceMessage, WorkspaceTask } from '../types';

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function fetchUserWorkspaces(): Promise<Workspace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const userEmail = (user.email || '').trim().toLowerCase();

  // Fetch workspaces user owns or has access to via RLS
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Error fetching workspaces:', error.message);
    return [];
  }

  // Also fetch member records for this user to attach their roles
  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, status')
    .or(`user_id.eq.${user.id},email.ilike.${userEmail}`);

  const roleMap = new Map<string, 'owner' | 'admin' | 'member'>();
  const activeWsIds = new Set<string>();

  (memberRows || []).forEach((m: any) => {
    if (m.status === 'active' || !m.status) {
      activeWsIds.add(m.workspace_id);
      roleMap.set(m.workspace_id, m.role);
    }
  });

  // Filter to workspaces where user is owner or active member
  return (data || [])
    .filter((ws: any) => ws.owner_id === user.id || activeWsIds.has(ws.id))
    .map((ws: any) => ({
      ...ws,
      role: ws.owner_id === user.id ? 'owner' : (roleMap.get(ws.id) || 'member'),
    }));
}

export async function createWorkspace(
  name: string,
  description?: string
): Promise<Workspace> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to create a workspace.');

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `ws-${Date.now()}`;

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      slug: `${slug}-${Math.random().toString(36).substring(2, 6)}`,
      owner_id: user.id,
      description: description || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create workspace.');
  }

  return {
    ...data,
    role: 'owner',
  };
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);
}

// ── Workspace Members & Invitations ───────────────────────────────────────────

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Error fetching workspace members:', error.message);
    return [];
  }
  return data || [];
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: 'admin' | 'member' = 'member'
): Promise<WorkspaceMember> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to invite members.');

  const trimmedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      email: trimmedEmail,
      role,
      status: 'invited',
      invited_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to invite team member.');
  }

  return data;
}

export async function updateWorkspaceMemberRole(
  memberId: string,
  role: 'admin' | 'member'
): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}

export async function removeWorkspaceMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}

export async function fetchUserInvitations(): Promise<WorkspaceInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return [];

  const userEmail = user.email.trim().toLowerCase();

  // Fetch pending invitations matching this user's email or user_id
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      id,
      workspace_id,
      email,
      role,
      status,
      invited_by,
      joined_at,
      created_at,
      workspaces:workspace_id (
        name,
        description,
        slug
      )
    `)
    .eq('status', 'invited')
    .or(`email.ilike.${userEmail},user_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching user invitations:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invited_by: row.invited_by,
    joined_at: row.joined_at,
    created_at: row.created_at,
    workspace_name: row.workspaces?.name || 'Security Workspace',
    workspace_description: row.workspaces?.description || null,
  }));
}

export async function acceptWorkspaceInvitation(invitationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to accept an invitation.');

  const { error } = await supabase
    .from('workspace_members')
    .update({
      status: 'active',
      user_id: user.id,
      joined_at: new Date().toISOString(),
    })
    .eq('id', invitationId);

  if (error) throw new Error(error.message);
}

export async function declineWorkspaceInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', invitationId);

  if (error) throw new Error(error.message);
}

// ── Workspace Conversations / Chat ───────────────────────────────────────────

export async function fetchWorkspaceMessages(workspaceId: string): Promise<WorkspaceMessage[]> {
  const { data, error } = await supabase
    .from('workspace_messages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Error fetching workspace messages:', error.message);
    return [];
  }
  return data || [];
}

export async function sendWorkspaceMessage(
  workspaceId: string,
  content: string
): Promise<WorkspaceMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to send a message.');

  const senderName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Analyst';

  const { data, error } = await supabase
    .from('workspace_messages')
    .insert({
      workspace_id: workspaceId,
      sender_id: user.id,
      sender_email: user.email || 'operator@aegis.sec',
      sender_name: senderName,
      content: content.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to send message.');
  }

  return data;
}

export async function deleteWorkspaceMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_messages')
    .delete()
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export function subscribeToWorkspaceMessages(
  workspaceId: string,
  onMessage: (message: WorkspaceMessage) => void
) {
  const channel = supabase
    .channel(`workspace-messages-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'workspace_messages',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        if (payload.new) {
          onMessage(payload.new as WorkspaceMessage);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Workspace Task Assignments ───────────────────────────────────────────────

export async function fetchWorkspaceTasks(workspaceId: string): Promise<WorkspaceTask[]> {
  const { data, error } = await supabase
    .from('workspace_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching workspace tasks:', error.message);
    return [];
  }
  return data || [];
}

export async function createWorkspaceTask(task: {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string | null;
  assignedEmail?: string | null;
  dueDate?: string | null;
}): Promise<WorkspaceTask> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to create a task.');

  const { data, error } = await supabase
    .from('workspace_tasks')
    .insert({
      workspace_id: task.workspaceId,
      title: task.title.trim(),
      description: task.description?.trim() || null,
      priority: task.priority || 'medium',
      status: 'todo',
      assigned_to: task.assignedTo || null,
      assigned_email: task.assignedEmail || null,
      created_by: user.id,
      due_date: task.dueDate || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create workspace task.');
  }

  return data;
}

export async function updateWorkspaceTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled'
): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function updateWorkspaceTask(
  taskId: string,
  updates: Partial<Pick<WorkspaceTask, 'title' | 'description' | 'status' | 'priority' | 'assigned_to' | 'assigned_email' | 'due_date'>>
): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function deleteWorkspaceTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export function subscribeToWorkspaceTasks(
  workspaceId: string,
  onChange: () => void
) {
  const channel = supabase
    .channel(`workspace-tasks-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workspace_tasks',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
