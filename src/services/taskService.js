import { addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toDate, fmtDateTime } from '../lib/utils';
import { notifyRoles, notifyUsers, logActivity } from './notifications';

export async function createTask(data, profile) {
  const ref = await addDoc(collection(db, 'tasks'), {
    title: data.title.trim(),
    description: data.description?.trim() || '',
    assigneeId: data.assigneeId,
    assigneeName: data.assigneeName,
    priority: data.priority || 'medium',
    status: 'todo',
    dueDate: Timestamp.fromDate(data.dueDate),
    clientId: data.clientId || null,
    clientName: data.clientName || null,
    createdBy: profile.id,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
    overdueNotified: false,
  });
  if (data.assigneeId !== profile.id) {
    await notifyUsers([data.assigneeId], {
      title: `New task: ${data.title}`,
      body: `Assigned by ${profile.name} · due ${fmtDateTime(data.dueDate)}`,
      link: '/tasks',
      type: 'task',
    });
  }
  logActivity(profile, 'task.create', { title: data.title, assignee: data.assigneeName });
  return ref.id;
}

export async function updateTask(task, changes, profile) {
  const patch = { ...changes, updatedAt: serverTimestamp() };
  if (changes.dueDate instanceof Date) {
    patch.dueDate = Timestamp.fromDate(changes.dueDate);
    patch.overdueNotified = false;
  }
  // Record who ticked it off, so the whole team sees 'completed by …'.
  if (changes.status === 'done' && task.status !== 'done') {
    patch.completedAt = serverTimestamp();
    patch.completedBy = profile.id;
    patch.completedByName = profile.name;
  }
  if (changes.status && changes.status !== 'done') {
    patch.completedAt = null;
    patch.completedBy = null;
    patch.completedByName = null;
  }
  await updateDoc(doc(db, 'tasks', task.id), patch);

  // Keep admins and the task creator updated on team progress.
  if (changes.status === 'done' && task.status !== 'done') {
    const late = toDate(task.dueDate) < new Date();
    const payload = {
      title: `${profile.name} completed a task${late ? ' (late)' : ''}`,
      body: task.title,
      link: '/tasks?view=team',
      type: 'success',
    };
    await Promise.all([
      notifyRoles(['superadmin', 'admin', 'manager'], payload, { exclude: [profile.id] }),
      task.createdBy !== profile.id ? notifyUsers([task.createdBy], payload) : null,
    ]).catch(() => {});
    logActivity(profile, 'task.done', { title: task.title, late });
  }
  if (changes.assigneeId && changes.assigneeId !== task.assigneeId) {
    await notifyUsers([changes.assigneeId], {
      title: `Task reassigned to you: ${task.title}`,
      body: `By ${profile.name}`,
      link: '/tasks',
      type: 'task',
    });
  }
}

export const deleteTask = (task) => deleteDoc(doc(db, 'tasks', task.id));

/**
 * Overdue alerts. Runs in the browser of the assignee (and leadership) every minute;
 * the `overdueNotified` flag guarantees each task alerts only once per deadline.
 */
export async function flagOverdueTasks(tasks) {
  const now = new Date();
  const overdue = tasks.filter((t) => t.status !== 'done' && !t.overdueNotified && toDate(t.dueDate) < now);
  for (const t of overdue) {
    try {
      await updateDoc(doc(db, 'tasks', t.id), { overdueNotified: true });
      const payload = {
        title: `Overdue: ${t.title}`,
        body: `${t.pool ? t.assigneeName : t.assigneeName} · was due ${fmtDateTime(t.dueDate)}`,
        link: '/tasks',
        type: 'overdue',
      };
      await notifyUsers(t.pool ? [...(t.assigneeIds || [])] : [t.assigneeId, t.createdBy], payload);
      await notifyRoles(['superadmin', 'admin'], payload, { exclude: [t.assigneeId, t.createdBy] });
    } catch (e) {
      // Another session may have already flagged it — safe to ignore.
    }
  }
}
