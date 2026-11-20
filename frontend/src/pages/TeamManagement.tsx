// src/pages/TeamManagement.tsx — Collaborative security workspace, member roles, chat & tasks
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Plus,
  Trash2,
  Crown,
  Mail,
  Building2,
  ExternalLink,
  MessageSquare,
  CheckSquare,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Button, Badge, Modal, EmptyState, Spinner } from '../components/ui';
import WorkspaceChat from '../components/workspace/WorkspaceChat';
import WorkspaceTasks from '../components/workspace/WorkspaceTasks';
import toast from 'react-hot-toast';

export default function TeamManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    workspaces,
    currentWorkspace,
    members,
    invitations,
    isLoading,
    isOwnerOrAdmin,
    setCurrentWorkspace,
    createWorkspace,
    inviteMember,
    acceptInvitation,
    declineInvitation,
    removeMember,
    updateMemberRole,
    deleteCurrentWorkspace,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'members' | 'chat' | 'tasks'>('members');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);

  // New workspace form
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      await inviteMember(inviteEmail, inviteRole);
      setInviteEmail('');
      setIsInviteOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) {
      toast.error('Workspace name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      await createWorkspace(newWsName, newWsDesc);
      setNewWsName('');
      setNewWsDesc('');
      setIsCreateOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create workspace';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvite = async (invitationId: string) => {
    setProcessingInviteId(invitationId);
    try {
      await acceptInvitation(invitationId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept invitation';
      toast.error(msg);
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineInvite = async (invitationId: string) => {
    if (!confirm('Decline this workspace invitation?')) return;
    setProcessingInviteId(invitationId);
    try {
      await declineInvitation(invitationId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to decline invitation';
      toast.error(msg);
    } finally {
      setProcessingInviteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="aegis-container flex min-h-[55vh] flex-col items-center justify-center gap-2.5 py-16">
        <Spinner size="md" label="" />
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Loading organization workspace…
        </p>
      </div>
    );
  }

  // Active members vs pending outgoing invites
  const activeMembers = members.filter((m) => m.status === 'active' || !m.status);
  const pendingOutgoing = members.filter((m) => m.status === 'invited');

  const myRole =
    currentWorkspace?.owner_id === user?.id ? 'Owner' : currentWorkspace?.role || 'Member';

  const stats = [
    { label: 'Active members', value: String(activeMembers.length), tone: 'text-ink' },
    { label: 'Your role', value: myRole, tone: 'text-forest', capitalize: true },
    {
      label: 'Created',
      value: currentWorkspace?.created_at
        ? new Date(currentWorkspace.created_at).toLocaleDateString()
        : '—',
      tone: 'text-muted',
    },
    { label: 'Workspace slug', value: currentWorkspace?.slug || 'default', tone: 'text-muted' },
  ];

  const tabs = [
    {
      id: 'members' as const,
      label: 'Members',
      icon: Users,
      meta: activeMembers.length + (pendingOutgoing.length > 0 ? `+${pendingOutgoing.length}` : ''),
    },
    { id: 'chat' as const, label: 'Briefing', icon: MessageSquare, meta: undefined },
    { id: 'tasks' as const, label: 'Tasks', icon: CheckSquare, meta: undefined },
  ];

  return (
    <div className="aegis-container pb-16 pt-6">
      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Organization / workspace</p>
          <h1 className="aegis-page-title">Team &amp; access</h1>
          <p className="aegis-lede mt-3">
            Organize analysts, share scan evidence, brief the team in real time, and coordinate
            remediation as assignable work.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            className="flex-1 sm:flex-initial"
          >
            New workspace
          </Button>
          {currentWorkspace && isOwnerOrAdmin ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsInviteOpen(true)}
              leftIcon={<UserPlus className="h-3.5 w-3.5" />}
              className="flex-1 sm:flex-initial"
            >
              Invite member
            </Button>
          ) : null}
        </div>
      </header>

      {invitations.length > 0 ? (
        <section
          aria-label="Pending workspace invitations"
          className="mt-2 border border-line-strong bg-forest/5"
        >
          <div className="aegis-panel-head !border-line-strong">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-forest/30 bg-forest/10 text-forest">
                <Mail className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="aegis-eyebrow">Inbox / invitation</p>
                <h2 className="mt-1 font-display text-[15px] font-semibold text-ink">
                  {invitations.length} pending workspace{' '}
                  {invitations.length === 1 ? 'invitation' : 'invitations'}
                </h2>
              </div>
            </div>
            <p className="hidden max-w-xs text-[10.5px] leading-relaxed text-muted sm:block">
              Accept to join the team and collaborate on scans and tasks.
            </p>
          </div>

          <div className="grid gap-px bg-line md:grid-cols-2">
            {invitations.map((inv) => (
              <article key={inv.id} className="flex flex-col justify-between gap-3 bg-paper p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="flex min-w-0 items-center gap-1.5 font-display text-[13.5px] font-semibold text-ink">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />
                      <span className="truncate">{inv.workspace_name}</span>
                    </h3>
                    <Badge variant="cyan" size="xs">
                      {inv.role}
                    </Badge>
                  </div>
                  {inv.workspace_description ? (
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                      {inv.workspace_description}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    Invited {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 border-t border-line pt-2.5">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAcceptInvite(inv.id)}
                    isLoading={processingInviteId === inv.id}
                    leftIcon={<Check className="h-3.5 w-3.5" />}
                    className="flex-1"
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeclineInvite(inv.id)}
                    disabled={processingInviteId === inv.id}
                    leftIcon={<X className="h-3.5 w-3.5" />}
                    className="flex-1 text-critical hover:border-critical/40 hover:bg-critical/10"
                  >
                    Decline
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Active workspace" className="aegis-panel mt-6">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="aegis-eyebrow">Workspace / active</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {workspaces.length > 0 ? (
                  <label className="sr-only" htmlFor="workspace-select">
                    Active workspace
                  </label>
                ) : null}
                {workspaces.length > 0 ? (
                  <select
                    id="workspace-select"
                    value={currentWorkspace?.id || ''}
                    onChange={(e) => {
                      const match = workspaces.find((w) => w.id === e.target.value);
                      if (match) setCurrentWorkspace(match);
                    }}
                    className="min-h-9 max-w-full cursor-pointer border border-line-strong bg-paper px-2 font-mono text-[12px] font-medium text-ink outline-none transition-colors focus:border-forest"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.owner_id === user?.id ? '(Owner)' : `(${w.role || 'Member'})`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-mono text-[12px] text-muted">None configured</span>
                )}
              </div>
              <p className="mt-1 line-clamp-1 text-[11px] text-muted">
                {currentWorkspace?.description ||
                  'Collaborative workspace for security posture scans and team investigations.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="flex min-h-9 items-center gap-1.5 border border-line bg-paper px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              Team scans
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>

            {currentWorkspace && currentWorkspace.owner_id === user?.id ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `Are you sure you want to delete workspace "${currentWorkspace.name}"? This cannot be undone.`,
                    )
                  ) {
                    deleteCurrentWorkspace();
                  }
                }}
                className="flex min-h-9 items-center gap-1.5 border border-critical/30 bg-critical/8 px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-critical transition-colors hover:bg-critical/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                title="Delete this workspace"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Delete
              </button>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-canvas px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {stat.label}
              </dt>
              <dd
                className={`mt-1 truncate font-mono text-[13px] font-semibold ${stat.tone} ${
                  stat.capitalize ? 'capitalize' : ''
                }`}
                title={stat.value}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {workspaces.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No workspaces configured"
            description="Create your first collaborative security workspace to invite teammates, share telemetry scans, and manage access."
            action={
              <Button variant="primary" size="md" onClick={() => setIsCreateOpen(true)}>
                Create team workspace
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6">
          <div
            role="tablist"
            aria-label="Workspace sections"
            className="flex flex-wrap items-center gap-1 border-b border-line"
          >
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex min-h-11 items-center gap-2 border-b-2 px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                    selected
                      ? 'border-ink text-ink'
                      : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {tab.label}
                  {tab.meta ? <span className="text-[9px] text-muted">{tab.meta}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="pt-4">
            {activeTab === 'members' ? (
              <div className="space-y-4">
                <section className="aegis-panel overflow-hidden" aria-label="Active team members">
                  <div className="aegis-panel-head">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Users className="h-4 w-4 text-forest" aria-hidden="true" />
                      <h2 className="font-display text-[14px] font-semibold text-ink">
                        Active members
                        <span className="ml-1.5 font-mono text-[10px] font-normal tabular-nums text-muted">
                          {activeMembers.length}
                        </span>
                      </h2>
                    </div>
                    {isOwnerOrAdmin ? (
                      <button
                        type="button"
                        onClick={() => setIsInviteOpen(true)}
                        className="flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-forest transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add teammate
                      </button>
                    ) : null}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="aegis-table w-full text-left">
                      <thead>
                        <tr>
                          <th scope="col">Member</th>
                          <th scope="col">Role</th>
                          <th scope="col">Status</th>
                          <th scope="col">Joined</th>
                          {isOwnerOrAdmin ? (
                            <th scope="col" className="text-right">
                              Actions
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {activeMembers.map((member) => {
                          const isOwner =
                            member.role === 'owner' || member.user_id === currentWorkspace?.owner_id;
                          const isCurrentUser =
                            member.user_id === user?.id ||
                            (user?.email && member.email.toLowerCase() === user.email.toLowerCase());

                          return (
                            <tr key={member.id} className="transition-colors hover:bg-canvas">
                              <td>
                                <div className="flex items-center gap-2.5">
                                  <span
                                    aria-hidden="true"
                                    className="flex h-7 w-7 shrink-0 items-center justify-center border border-line bg-canvas font-mono text-[11px] font-semibold uppercase text-muted"
                                  >
                                    {member.email.charAt(0)}
                                  </span>
                                  <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] font-medium text-ink">
                                    <span className="truncate">{member.email}</span>
                                    {isCurrentUser ? (
                                      <Badge variant="info" size="xs">
                                        You
                                      </Badge>
                                    ) : null}
                                  </span>
                                </div>
                              </td>

                              <td>
                                <span
                                  className={`inline-flex items-center gap-1 border px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] ${
                                    isOwner
                                      ? 'border-high/30 bg-high/10 text-high'
                                      : member.role === 'admin'
                                        ? 'border-line-strong bg-elevated text-ink'
                                        : 'border-line bg-canvas text-muted'
                                  }`}
                                >
                                  {isOwner ? <Crown className="h-3 w-3" aria-hidden="true" /> : null}
                                  {member.role}
                                </span>
                              </td>

                              <td>
                                <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-safe">
                                  <span className="h-1.5 w-1.5 bg-safe" aria-hidden="true" />
                                  Active
                                </span>
                              </td>

                              <td className="font-mono text-[10.5px] text-muted">
                                {member.joined_at
                                  ? new Date(member.joined_at).toLocaleDateString()
                                  : 'Active'}
                              </td>

                              {isOwnerOrAdmin ? (
                                <td className="text-right">
                                  {!isOwner && !isCurrentUser ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                                        Role for {member.email}
                                      </label>
                                      <select
                                        id={`role-${member.id}`}
                                        value={member.role}
                                        onChange={(e) =>
                                          updateMemberRole(
                                            member.id,
                                            e.target.value as 'admin' | 'member',
                                          )
                                        }
                                        className="min-h-9 cursor-pointer border border-line-strong bg-canvas px-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink outline-none transition-colors focus:border-forest"
                                      >
                                        <option value="member">Member</option>
                                        <option value="admin">Admin</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (confirm(`Remove ${member.email} from the workspace?`)) {
                                            removeMember(member.id);
                                          }
                                        }}
                                        title="Remove member"
                                        aria-label={`Remove ${member.email} from workspace`}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-critical/10 hover:text-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                                      Protected
                                    </span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <ul className="divide-y divide-line md:hidden">
                    {activeMembers.map((member) => {
                      const isOwner =
                        member.role === 'owner' || member.user_id === currentWorkspace?.owner_id;
                      const isCurrentUser =
                        member.user_id === user?.id ||
                        (user?.email && member.email.toLowerCase() === user.email.toLowerCase());
                      return (
                        <li key={member.id} className="space-y-2.5 bg-paper p-3.5">
                          <div className="flex items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-canvas font-mono text-[12px] font-semibold uppercase text-muted"
                            >
                              {member.email.charAt(0)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="break-all font-mono text-[11.5px] font-medium text-ink">
                                {member.email}
                              </p>
                              {isCurrentUser ? (
                                <Badge variant="info" size="xs" className="mt-1">
                                  You
                                </Badge>
                              ) : null}
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.06em] text-safe">
                              <span className="h-1.5 w-1.5 bg-safe" aria-hidden="true" />
                              Active
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                              {member.role}
                            </span>
                            {isOwnerOrAdmin && !isOwner && !isCurrentUser ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Remove ${member.email}?`)) removeMember(member.id);
                                }}
                                className="flex min-h-9 items-center px-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-critical hover:text-ink"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {pendingOutgoing.length > 0 ? (
                  <section
                    className="aegis-panel overflow-hidden"
                    aria-label="Pending outgoing invitations"
                  >
                    <div className="aegis-panel-head">
                      <div className="flex items-center gap-2.5">
                        <Mail className="h-4 w-4 text-high" aria-hidden="true" />
                        <h3 className="font-display text-[14px] font-semibold text-ink">
                          Pending invitations
                          <span className="ml-1.5 font-mono text-[10px] font-normal tabular-nums text-muted">
                            {pendingOutgoing.length}
                          </span>
                        </h3>
                      </div>
                    </div>

                    <ul className="divide-y divide-line">
                      {pendingOutgoing.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[11.5px] font-medium text-ink">
                              {inv.email}
                            </p>
                            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                              {inv.role} · sent {new Date(inv.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          {isOwnerOrAdmin ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Revoke invitation for ${inv.email}?`)) {
                                  removeMember(inv.id);
                                }
                              }}
                              leftIcon={<Trash2 className="h-3 w-3 text-critical" />}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'chat' ? <WorkspaceChat /> : null}

            {activeTab === 'tasks' ? <WorkspaceTasks /> : null}
          </div>
        </div>
      )}

      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite team analyst"
        description={`Send an invitation to join ${currentWorkspace?.name ?? 'this workspace'}`}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="aegis-label mb-1.5 block">
              Email address
            </label>
            <div className="aegis-input-shell gap-2.5 px-3">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <input
                id="invite-email"
                type="email"
                required
                placeholder="analyst@organization.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="min-h-11 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-muted"
              />
            </div>
          </div>

          <div>
            <label htmlFor="invite-role" className="aegis-label mb-1.5 block">
              Workspace role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className="min-h-11 w-full cursor-pointer border border-line-strong bg-canvas px-2.5 font-mono text-[11.5px] text-ink outline-none transition-colors focus:border-forest"
            >
              <option value="member">Member — run, view, and export workspace scans</option>
              <option value="admin">Admin — manage members &amp; workspace settings</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Send invitation
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create team workspace"
        description="Set up an isolated environment for your project or operations team"
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div>
            <label htmlFor="workspace-name" className="aegis-label mb-1.5 block">
              Workspace name <span className="text-critical">*</span>
            </label>
            <input
              id="workspace-name"
              type="text"
              required
              placeholder="e.g., Enterprise SecOps"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
            />
          </div>

          <div>
            <label htmlFor="workspace-desc" className="aegis-label mb-1.5 block">
              Description{' '}
              <span className="normal-case tracking-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="workspace-desc"
              rows={2}
              placeholder="Mission, team scope, or purpose…"
              value={newWsDesc}
              onChange={(e) => setNewWsDesc(e.target.value)}
              className="w-full resize-none border border-line-strong bg-canvas p-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Create workspace
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
