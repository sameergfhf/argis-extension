// src/components/workspace/WorkspaceTasks.tsx — Task assignment & management
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Calendar, User, CheckSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  fetchWorkspaceTasks,
  createWorkspaceTask,
  updateWorkspaceTaskStatus,
  deleteWorkspaceTask,
  subscribeToWorkspaceTasks,
} from '../../services/workspaceService';
import type { WorkspaceTask } from '../../types';
import { Button, Badge, Modal, Spinner } from '../ui';
import toast from 'react-hot-toast';

export default function WorkspaceTasks() {
  const { user } = useAuth();
  const { currentWorkspace, members, isOwnerOrAdmin } = useWorkspace();
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress' | 'completed'>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  // Create Task Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [taskAssignee, setTaskAssignee] = useState<string>(''); // member email
  const [taskDueDate, setTaskDueDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    try {
      const data = await fetchWorkspaceTasks(currentWorkspace.id);
      setTasks(data);
    } catch (err) {
      console.warn('Error loading tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadTasks();
    if (!currentWorkspace?.id) return;

    const unsubscribe = subscribeToWorkspaceTasks(currentWorkspace.id, () => {
      loadTasks();
    });

    return () => {
      unsubscribe();
    };
  }, [currentWorkspace?.id, loadTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !currentWorkspace?.id) {
      toast.error('Task title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedMember = members.find((m) => m.email === taskAssignee);
      await createWorkspaceTask({
        workspaceId: currentWorkspace.id,
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        priority: taskPriority,
        assignedTo: selectedMember?.user_id || undefined,
        assignedEmail: taskAssignee || undefined,
        dueDate: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
      });

      toast.success('Task created & assigned!');
      setTaskTitle('');
      setTaskDesc('');
      setTaskPriority('medium');
      setTaskAssignee('');
      setTaskDueDate('');
      setIsCreateOpen(false);
      await loadTasks();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create task';
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (
    taskId: string,
    nextStatus: 'todo' | 'in_progress' | 'completed' | 'cancelled'
  ) => {
    try {
      await updateWorkspaceTaskStatus(taskId, nextStatus);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: nextStatus, updated_at: new Date().toISOString() } : t
        )
      );
      toast.success(`Task status updated to ${nextStatus.replace('_', ' ')}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update task status';
      toast.error(errorMsg);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteWorkspaceTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete task';
      toast.error(errorMsg);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (onlyMine) {
      const isAssignedToMe =
        (t.assigned_to && t.assigned_to === user?.id) ||
        (t.assigned_email && user?.email && t.assigned_email.toLowerCase() === user.email.toLowerCase());
      if (!isAssignedToMe) return false;
    }
    return true;
  });

  const todoCount = tasks.filter((t) => t.status === 'todo').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const priorityStyles: Record<string, { label: string; badgeVariant: 'critical' | 'high' | 'medium' | 'outline' }> = {
    critical: { label: 'CRITICAL', badgeVariant: 'critical' },
    high: { label: 'HIGH', badgeVariant: 'high' },
    medium: { label: 'MEDIUM', badgeVariant: 'medium' },
    low: { label: 'LOW', badgeVariant: 'outline' },
  };

  const counters = [
    { label: 'To do', value: todoCount, tone: 'text-ink' },
    { label: 'In progress', value: inProgressCount, tone: 'text-high' },
    { label: 'Completed', value: completedCount, tone: 'text-safe' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
        <dl className="grid w-full grid-cols-3 divide-x divide-line border border-line bg-canvas sm:w-auto">
          {counters.map((counter) => (
            <div key={counter.label} className="px-3.5 py-2.5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {counter.label}
              </dt>
              <dd className={`mt-1 font-mono text-[18px] font-semibold leading-none tabular-nums ${counter.tone}`}>
                {counter.value}
              </dd>
            </div>
          ))}
        </dl>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsCreateOpen(true)}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          className="self-start sm:self-center"
        >
          Assign task
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-canvas p-2">
        <div role="group" aria-label="Filter tasks by status" className="flex flex-wrap items-center gap-1">
          {(['all', 'todo', 'in_progress', 'completed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={statusFilter === st}
              onClick={() => setStatusFilter(st)}
              className={`flex min-h-9 items-center rounded-[4px] px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                statusFilter === st
                  ? 'bg-forest text-[var(--aegis-primary-hover-fg)]'
                  : 'text-muted hover:bg-elevated hover:text-ink'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine((prev) => !prev)}
          className={`flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
            onlyMine
              ? 'border-forest/30 bg-forest/10 text-forest'
              : 'border-line bg-paper text-muted hover:text-ink'
          }`}
        >
          <User className="h-3 w-3" aria-hidden="true" />
          Assigned to me
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2.5 border border-line bg-paper py-14">
          <Spinner size="sm" label="" />
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            Loading workspace tasks…
          </p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-line bg-canvas px-6 py-12 text-center">
          <CheckSquare className="h-6 w-6 text-muted" aria-hidden="true" />
          <h4 className="font-display text-[14px] font-semibold text-ink">
            No tasks match this filter
          </h4>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">
            Create tasks to assign remediation actions, investigate specific findings, or track
            security sprints.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus className="h-3 w-3" />}
            className="mt-1.5"
          >
            Create task
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {filteredTasks.map((task) => {
            const isCreator = task.created_by === user?.id;
            const canDelete = isCreator || isOwnerOrAdmin;
            const isAssignedToMe =
              (task.assigned_to && task.assigned_to === user?.id) ||
              (task.assigned_email && user?.email && task.assigned_email.toLowerCase() === user.email.toLowerCase());
            const priorityConfig = priorityStyles[task.priority] || priorityStyles.medium;

            return (
              <li
                key={task.id}
                className={`bg-paper px-4 py-3.5 transition-colors hover:bg-canvas ${
                  task.status === 'completed' ? 'border-l-2 border-l-safe/50' : ''
                }`}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className={`break-words text-[13px] font-semibold leading-snug ${
                          task.status === 'completed' ? 'text-muted line-through' : 'text-ink'
                        }`}
                      >
                        {task.title}
                      </h4>
                      <Badge variant={priorityConfig.badgeVariant} size="xs">
                        {priorityConfig.label}
                      </Badge>
                      {isAssignedToMe ? (
                        <Badge variant="info" size="xs">
                          For you
                        </Badge>
                      ) : null}
                    </div>

                    {task.description ? (
                      <p className="line-clamp-3 text-[11.5px] leading-relaxed text-muted">
                        {task.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 font-mono text-[10px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span className="uppercase tracking-[0.06em]">Assignee</span>
                        <strong className="font-medium text-ink">
                          {task.assigned_email || 'Unassigned'}
                        </strong>
                      </span>

                      {task.due_date ? (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span className="uppercase tracking-[0.06em]">Due</span>
                          <span className="tabular-nums text-ink">
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                    <label htmlFor={`task-status-${task.id}`} className="sr-only">
                      Status for {task.title}
                    </label>
                    <select
                      id={`task-status-${task.id}`}
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value as any)}
                      className="min-h-9 cursor-pointer border border-line bg-canvas px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink outline-none transition-colors focus:border-forest"
                    >
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                        aria-label={`Delete task: ${task.title}`}
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-critical/10 hover:text-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Assign workspace task"
        description={`Create and assign an actionable task in ${currentWorkspace?.name}`}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label htmlFor="task-title" className="aegis-label mb-1.5 block">
              Task title <span className="text-critical">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              required
              placeholder="e.g., Remediate HSTS and CSP headers on production API"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
            />
          </div>

          <div>
            <label htmlFor="task-description" className="aegis-label mb-1.5 block">
              Description &amp; remediation details
            </label>
            <textarea
              id="task-description"
              rows={3}
              placeholder="Provide background, steps to reproduce, or verification criteria…"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="w-full resize-none border border-line-strong bg-canvas p-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="task-priority" className="aegis-label mb-1.5 block">
                Priority level
              </label>
              <select
                id="task-priority"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
                className="min-h-11 w-full cursor-pointer border border-line-strong bg-canvas px-2.5 font-mono text-[11.5px] text-ink outline-none transition-colors focus:border-forest"
              >
                <option value="critical">Critical — immediate blocker</option>
                <option value="high">High — high security risk</option>
                <option value="medium">Medium — standard remediation</option>
                <option value="low">Low — informational / hygiene</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-assignee" className="aegis-label mb-1.5 block">
                Assign to teammate
              </label>
              <select
                id="task-assignee"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="min-h-11 w-full cursor-pointer border border-line-strong bg-canvas px-2.5 font-mono text-[11.5px] text-ink outline-none transition-colors focus:border-forest"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.email} ({m.role}) {m.user_id === user?.id ? '— (You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="task-due" className="aegis-label mb-1.5 block">
              Due date <span className="normal-case tracking-normal text-muted">(optional)</span>
            </label>
            <input
              id="task-due"
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className="min-h-11 w-full border border-line-strong bg-canvas px-2.5 font-mono text-[11.5px] text-ink outline-none transition-colors focus:border-forest"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Assign task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
