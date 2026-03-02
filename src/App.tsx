/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Plus, 
  Bell, 
  BellOff, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Calendar as CalendarIcon,
  AlertCircle,
  Smartphone,
  Monitor,
  Share2,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isFuture, addMinutes, parseISO, compareAsc } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

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

// Use the user's email as the default syncId if available
const DEFAULT_SYNC_ID = "faithjebetkiprono@gmail.com";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [syncId, setSyncId] = useState(() => localStorage.getItem('taskpulse_sync_id') || DEFAULT_SYNC_ID);
  const [isConnected, setIsConnected] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<{id: string, title: string}[]>([]);
  
  const socketRef = useRef<Socket | null>(null);

  // Initialize Socket.io
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join', syncId);
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('task:created', (task: Task) => {
      setTasks(prev => {
        if (prev.find(t => t.id === task.id)) return prev;
        return [...prev, task].sort((a, b) => compareAsc(parseISO(a.startTime), parseISO(b.startTime)));
      });
    });

    socket.on('task:updated', (updatedTask: Task) => {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    });

    socket.on('task:deleted', (id: string) => {
      setTasks(prev => prev.filter(t => t.id !== id));
    });

    // Initial fetch
    fetch(`/api/tasks/${syncId}`)
      .then(res => res.json())
      .then(data => setTasks(data.sort((a: Task, b: Task) => compareAsc(parseISO(a.startTime), parseISO(b.startTime)))));

    return () => {
      socket.disconnect();
    };
  }, [syncId]);

  // Persistence for syncId
  useEffect(() => {
    localStorage.setItem('taskpulse_sync_id', syncId);
  }, [syncId]);

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

    socketRef.current?.emit('task:create', { syncId, task: newTask });
    setTitle('');
    setStartTime('');
  };

  const deleteTask = (id: string) => {
    socketRef.current?.emit('task:delete', { syncId, id });
  };

  const toggleComplete = (task: Task) => {
    const updated = { ...task, completed: !task.completed };
    socketRef.current?.emit('task:update', { syncId, task: updated });
  };

  const triggerNotification = useCallback((taskTitle: string, taskTime: Date) => {
    const title = 'Task Starting Soon!';
    const options = {
      body: `"${taskTitle}" is about to start at ${format(taskTime, 'p')}.`,
      icon: '/favicon.ico',
      tag: 'task-reminder'
    };

    if (notificationPermission === 'granted') {
      try {
        new Notification(title, options);
      } catch (err) {
        console.error('Native notification failed:', err);
      }
    }

    const alertId = crypto.randomUUID();
    setActiveAlerts(prev => [...prev, { id: alertId, title: taskTitle }]);
    
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    }, 10000);

    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {}
  }, [notificationPermission]);

  const checkReminders = useCallback(() => {
    const now = new Date();
    const notificationThreshold = addMinutes(now, 2);

    setTasks(prev => {
      let changed = false;
      const nextTasks = prev.map(task => {
        const taskTime = parseISO(task.startTime);
        const isStartingSoon = taskTime <= notificationThreshold && taskTime > new Date(now.getTime() - 30000);

        if (!task.notified && !task.completed && isStartingSoon) {
          triggerNotification(task.title, taskTime);
          changed = true;
          const updated = { ...task, notified: true };
          socketRef.current?.emit('task:update', { syncId, task: updated });
          return updated;
        }
        return task;
      });
      return changed ? nextTasks : prev;
    });
  }, [triggerNotification, syncId]);

  useEffect(() => {
    const interval = setInterval(checkReminders, 5000);
    return () => clearInterval(interval);
  }, [checkReminders]);

  const testNotification = () => {
    if (notificationPermission !== 'granted') requestPermission();
    triggerNotification("Test Task", new Date());
  };

  const upcomingTasks = tasks.filter(t => !t.completed && isFuture(parseISO(t.startTime)));
  const pastTasks = tasks.filter(t => t.completed || isPast(parseISO(t.startTime)));

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100 pb-20 sm:pb-0">
      {/* In-App Alerts Overlay */}
      <div className="fixed top-20 right-6 z-50 space-y-3 pointer-events-none w-full max-w-[calc(100vw-3rem)] sm:max-w-sm">
        <AnimatePresence>
          {activeAlerts.map(alert => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 pointer-events-auto border border-white/20"
            >
              <div className="bg-white/20 p-2 rounded-xl">
                <Bell className="animate-bounce" size={20} />
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Starting Now</p>
                <p className="font-semibold truncate">{alert.title}</p>
              </div>
              <button 
                onClick={() => setActiveAlerts(prev => prev.filter(a => a.id !== alert.id))}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <Bell size={18} />
            </div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">TaskPulse</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-all",
              isConnected ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            )}>
              {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{isConnected ? "Live" : "Offline"}</span>
            </div>
            
            <button 
              onClick={requestPermission}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                notificationPermission === 'granted' 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              )}
            >
              <Bell size={14} />
              <span className="hidden sm:inline">{notificationPermission === 'granted' ? "On" : "Enable"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form & Sync Info */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-black/30 mb-4 flex items-center gap-2">
              <Plus size={16} /> New Task
            </h2>
            <form onSubmit={addTask} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">
                  Task Title
                </label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Team Sync Meeting"
                  className="w-full px-4 py-3 rounded-xl bg-[#F9F9F9] border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 px-1">
                  Start Time
                </label>
                <div className="relative">
                  <input 
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F9F9F9] border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm appearance-none"
                    required
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                </div>
              </div>
              
              <button 
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
              >
                <Plus size={20} /> Create Task
              </button>
            </form>
          </section>

          {/* Sync Info - Device Orientation */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-black/30 flex items-center gap-2">
                <Share2 size={16} /> Multi-Device Sync
              </h2>
              <div className="flex gap-1">
                <Smartphone size={14} className="text-black/20" />
                <Monitor size={14} className="text-black/20" />
              </div>
            </div>
            <p className="text-xs text-black/50 mb-4 leading-relaxed">
              Use this Sync ID on your other devices to see your tasks in real-time.
            </p>
            <div className="flex items-center gap-2 bg-[#F9F9F9] p-3 rounded-xl border border-black/5">
              <input 
                type="text" 
                value={syncId}
                onChange={(e) => setSyncId(e.target.value)}
                className="bg-transparent text-xs font-mono flex-grow outline-none text-emerald-700"
                placeholder="Enter Sync ID"
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(syncId);
                  alert("Sync ID copied!");
                }}
                className="p-1.5 hover:bg-black/5 rounded-lg transition-colors text-black/30"
              >
                <Share2 size={14} />
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-black/5 flex items-center justify-between">
              <button 
                onClick={testNotification}
                className="text-[10px] font-bold uppercase tracking-widest text-black/40 hover:text-emerald-600 transition-colors flex items-center gap-1.5"
              >
                <Bell size={12} /> Test Notification
              </button>
              <span className="text-[10px] text-black/20 italic">v2.0 Device Sync</span>
            </div>
          </section>
        </div>

        {/* Right Column: Task Lists */}
        <div className="lg:col-span-7 space-y-10">
          {/* Upcoming */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-black/40 uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon size={14} /> Upcoming
              </h2>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {upcomingTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {upcomingTasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-black/10"
                  >
                    <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <CheckCircle2 size={24} className="text-emerald-200" />
                    </div>
                    <p className="text-black/30 text-sm font-medium">All caught up!</p>
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
                <h2 className="text-sm font-bold text-black/40 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={14} /> History
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

      {/* Mobile Bottom Bar (Optional for better mobile feel) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 p-4 flex sm:hidden items-center justify-around z-10">
        <button className="flex flex-col items-center gap-1 text-emerald-600">
          <CalendarIcon size={20} />
          <span className="text-[10px] font-bold uppercase">Tasks</span>
        </button>
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="bg-emerald-500 text-white p-3 rounded-full -mt-10 shadow-xl shadow-emerald-500/40"
        >
          <Plus size={24} />
        </button>
        <button className="flex flex-col items-center gap-1 text-black/30">
          <RefreshCw size={20} />
          <span className="text-[10px] font-bold uppercase">Sync</span>
        </button>
      </div>

      {/* Desktop Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-12 text-center space-y-4 hidden sm:block">
        <div className="flex items-center justify-center gap-2 text-black/20 text-[10px] font-bold uppercase tracking-widest">
          <AlertCircle size={14} />
          <p>Real-time sync active for {syncId}</p>
        </div>
      </footer>
    </div>
  );
}

const TaskItem: React.FC<{ 
  task: Task; 
  onDelete: (id: string) => void; 
  onToggle: (task: Task) => void;
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
        "group bg-white p-4 sm:p-5 rounded-2xl border border-black/5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md active:scale-[0.99] sm:active:scale-100",
        task.completed && "bg-[#FAFAFA]"
      )}
    >
      <button 
        onClick={() => onToggle(task)}
        className={cn(
          "flex-shrink-0 transition-colors p-1",
          task.completed ? "text-emerald-500" : "text-black/10 hover:text-emerald-500"
        )}
      >
        {task.completed ? <CheckCircle2 size={28} /> : <Circle size={28} />}
      </button>

      <div className="flex-grow min-w-0">
        <h3 className={cn(
          "font-semibold text-sm sm:text-base truncate transition-all",
          task.completed && "text-black/30 line-through"
        )}>
          {task.title}
        </h3>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn(
            "text-[10px] sm:text-xs flex items-center gap-1 font-bold uppercase tracking-tight",
            isOverdue ? "text-rose-500" : "text-black/30"
          )}>
            <Clock size={12} />
            {format(parseISO(task.startTime), 'MMM d, p')}
          </span>
          {task.notified && !task.completed && (
            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
              Notified
            </span>
          )}
        </div>
      </div>

      <button 
        onClick={() => onDelete(task.id)}
        className="p-2 text-black/10 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 size={20} />
      </button>
    </motion.div>
  );
}


