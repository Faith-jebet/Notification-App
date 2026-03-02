/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Bell, 
  BellOff, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Calendar as CalendarIcon,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isFuture, addMinutes, parseISO, compareAsc } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Task {
  id: string;
  title: string;
  startTime: string; // ISO string
  notified: boolean;
  completed: boolean;
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('taskpulse_tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Persistence
  useEffect(() => {
    localStorage.setItem('taskpulse_tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startTime) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      startTime: new Date(startTime).toISOString(),
      notified: false,
      completed: false,
    };

    setTasks(prev => [...prev, newTask].sort((a, b) => 
      compareAsc(parseISO(a.startTime), parseISO(b.startTime))
    ));
    setTitle('');
    setStartTime('');
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const toggleComplete = (id: string) => {
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  };

  // Notification logic
  const [activeAlerts, setActiveAlerts] = useState<{id: string, title: string}[]>([]);

  const triggerNotification = useCallback((taskTitle: string, taskTime: Date) => {
    const title = 'Task Starting Soon!';
    const options = {
      body: `"${taskTitle}" is about to start at ${format(taskTime, 'p')}.`,
      icon: '/favicon.ico',
      tag: 'task-reminder'
    };

    // 1. Try Native Notification
    if (notificationPermission === 'granted') {
      try {
        new Notification(title, options);
      } catch (err) {
        console.error('Native notification failed:', err);
      }
    }

    // 2. Always show In-App Alert as fallback/secondary
    const alertId = crypto.randomUUID();
    setActiveAlerts(prev => [...prev, { id: alertId, title: taskTitle }]);
    
    // Auto-remove in-app alert after 10 seconds
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    }, 10000);

    // 3. Play a subtle sound if possible
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {/* Ignore autoplay blocks */});
    } catch (e) {
      // Ignore audio errors
    }
  }, [notificationPermission]);

  const checkReminders = useCallback(() => {
    const now = new Date();
    const notificationThreshold = addMinutes(now, 2); // Notify if starting within 2 minutes

    setTasks(prev => {
      let changed = false;
      const nextTasks = prev.map(task => {
        const taskTime = parseISO(task.startTime);
        
        // If task is starting soon (or just started), not notified yet, and not completed
        // We allow a small window in the past (30s) to catch tasks that just ticked over
        const isStartingSoon = taskTime <= notificationThreshold && taskTime > new Date(now.getTime() - 30000);

        if (!task.notified && !task.completed && isStartingSoon) {
          triggerNotification(task.title, taskTime);
          changed = true;
          return { ...task, notified: true };
        }
        return task;
      });
      return changed ? nextTasks : prev;
    });
  }, [triggerNotification]);

  const testNotification = () => {
    if (notificationPermission !== 'granted') {
      requestPermission();
    }
    triggerNotification("Test Task", new Date());
  };

  useEffect(() => {
    const interval = setInterval(checkReminders, 5000); // Check every 5 seconds for better responsiveness
    return () => clearInterval(interval);
  }, [checkReminders]);

  const upcomingTasks = tasks.filter(t => !t.completed && isFuture(parseISO(t.startTime)));
  const pastTasks = tasks.filter(t => t.completed || isPast(parseISO(t.startTime)));

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* In-App Alerts Overlay */}
      <div className="fixed top-20 right-6 z-50 space-y-3 pointer-events-none">
        <AnimatePresence>
          {activeAlerts.map(alert => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 pointer-events-auto min-w-[300px] border border-white/20"
            >
              <div className="bg-white/20 p-2 rounded-xl">
                <Bell className="animate-bounce" size={20} />
              </div>
              <div className="flex-grow">
                <p className="text-xs font-bold uppercase tracking-widest opacity-70">Starting Now</p>
                <p className="font-semibold">{alert.title}</p>
              </div>
              <button 
                onClick={() => setActiveAlerts(prev => prev.filter(a => a.id !== alert.id))}
                className="hover:bg-white/10 p-1 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <Bell size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">TaskPulse</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={testNotification}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-black/5 text-black/60 hover:bg-black/10 transition-colors"
            >
              Test Alert
            </button>
            <button 
              onClick={requestPermission}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                notificationPermission === 'granted' 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              )}
            >
              {notificationPermission === 'granted' ? (
                <><Bell size={14} /> Notifications On</>
              ) : (
                <><BellOff size={14} /> Enable Notifications</>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Add Task Form */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
          <form onSubmit={addTask} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-black/40 px-1">
                What's on your mind?
              </label>
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Team Sync Meeting"
                className="w-full px-4 py-3 rounded-xl bg-[#F9F9F9] border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-black/40 px-1">
                  Start Time
                </label>
                <div className="relative">
                  <input 
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F9F9F9] border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all appearance-none"
                    required
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                </div>
              </div>
              
              <div className="flex items-end">
                <button 
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Plus size={20} /> Add Task
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Task Lists */}
        <div className="space-y-10">
          {/* Upcoming */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-black/40 uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon size={14} /> Upcoming Tasks
              </h2>
              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {upcomingTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {upcomingTasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12 bg-white/50 rounded-2xl border border-dashed border-black/10"
                  >
                    <p className="text-black/30 text-sm">No upcoming tasks. Enjoy your day!</p>
                  </motion.div>
                ) : (
                  upcomingTasks.map((task) => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      onDelete={deleteTask} 
                      onToggle={toggleComplete} 
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Past / Completed */}
          {pastTasks.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-black/40 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={14} /> Completed & Past
                </h2>
              </div>
              <div className="space-y-3 opacity-60">
                <AnimatePresence mode="popLayout">
                  {pastTasks.map((task) => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      onDelete={deleteTask} 
                      onToggle={toggleComplete} 
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-2xl mx-auto px-6 py-12 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-black/30 text-xs">
          <AlertCircle size={14} />
          <p>Keep this tab open to receive real-time notifications.</p>
        </div>
      </footer>
    </div>
  );
}

const TaskItem: React.FC<{ 
  task: Task; 
  onDelete: (id: string) => void; 
  onToggle: (id: string) => void;
}> = ({ 
  task, 
  onDelete, 
  onToggle 
}) => {
  const isOverdue = isPast(parseISO(task.startTime)) && !task.completed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md",
        task.completed && "bg-[#FAFAFA]"
      )}
    >
      <button 
        onClick={() => onToggle(task.id)}
        className={cn(
          "flex-shrink-0 transition-colors",
          task.completed ? "text-emerald-500" : "text-black/20 hover:text-emerald-500"
        )}
      >
        {task.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
      </button>

      <div className="flex-grow min-w-0">
        <h3 className={cn(
          "font-medium truncate transition-all",
          task.completed && "text-black/30 line-through"
        )}>
          {task.title}
        </h3>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn(
            "text-xs flex items-center gap-1 font-medium",
            isOverdue ? "text-rose-500" : "text-black/40"
          )}>
            <Clock size={12} />
            {format(parseISO(task.startTime), 'MMM d, p')}
          </span>
          {task.notified && !task.completed && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
              Notified
            </span>
          )}
        </div>
      </div>

      <button 
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-black/20 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
      >
        <Trash2 size={18} />
      </button>
    </motion.div>
  );
}

