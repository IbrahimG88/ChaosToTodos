import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';

// ─── Auth context (lets AppInner work with or without Clerk) ──────────────────
const AuthCtx = createContext({ getToken: async () => null, clerkEnabled: false });
const useAppAuth = () => useContext(AuthCtx);

function ClerkAuthBridge({ children }) {
  const { getToken } = useAuth();
  return <AuthCtx.Provider value={{ getToken, clerkEnabled: true }}>{children}</AuthCtx.Provider>;
}

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const API_URL   = import.meta.env.VITE_API_URL || '';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIO_ORDER = { high: 0, medium: 1, low: 2 };

const PRIO = {
  high:   { label: 'High',   bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444', border: '#fecaca' },
  medium: { label: 'Medium', bg: '#fffbeb', text: '#92400e', dot: '#f59e0b', border: '#fde68a' },
  low:    { label: 'Low',    bg: '#f0fdf4', text: '#15803d', dot: '#22c55e', border: '#bbf7d0' },
  null:   { label: 'None',   bg: '#f8fafc', text: '#64748b', dot: '#cbd5e1', border: '#e2e8f0' },
};

const PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#0ea5e9',
  '#f59e0b','#10b981','#ef4444','#f97316',
  '#14b8a6','#06b6d4','#84cc16','#a855f7',
];

// ─── Utils ────────────────────────────────────────────────────────────────────

const uid   = () => Math.random().toString(36).slice(2, 11);
const load  = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const byPriority = (arr) =>
  [...arr].sort((a, b) => (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3));

const localDateStr = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const dayToDate = (day) => {
  if (!day || day === 'someday') return null;
  const today = new Date();
  if (day === 'today') return localDateStr(today);
  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const target = DAYS.indexOf(day.toLowerCase());
  if (target === -1) return null;
  const diff = (target - today.getDay() + 7) % 7 || 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return localDateStr(d);
};

const formatDueDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: 'Today', overdue: false };
  if (diff === 1) return { label: 'Tomorrow', overdue: false };
  if (diff < 7)  return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), overdue: false };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
};

const matchSearch = (todo, q) => {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    todo.task.toLowerCase().includes(lq) ||
    todo.subtasks.some(s => s.text.toLowerCase().includes(lq)) ||
    (todo.priority && PRIO[todo.priority]?.label.toLowerCase().includes(lq))
  );
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcPencil  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcTrash   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IcPlus    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IcChevron = ({ open }) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .18s' }}><polyline points="6 9 12 15 18 9"/></svg>;
const IcSearch  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcX       = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcUndo    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
const IcUpload  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IcBolt    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;

// ─── PriorityDropdown ─────────────────────────────────────────────────────────

function PriorityDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cfg = PRIO[value] ?? PRIO.null;

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div className="pd-wrap" ref={ref}>
      <button
        type="button"
        className="pd-btn"
        style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
        onClick={() => setOpen(o => !o)}
        title="Set priority"
      >
        <span className="dot" style={{ background: cfg.dot }} />
        <span>{cfg.label}</span>
        <IcChevron open={open} />
      </button>
      {open && (
        <div className="pd-menu">
          {['high', 'medium', 'low', null].map(p => {
            const c = PRIO[p] ?? PRIO.null;
            return (
              <button
                key={String(p)}
                type="button"
                className={`pd-opt ${value === p ? 'active' : ''}`}
                onClick={() => { onChange(p); setOpen(false); }}
              >
                <span className="dot" style={{ background: c.dot }} />
                <span>{c.label}</span>
                {value === p && <span className="pd-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SubtaskRow ───────────────────────────────────────────────────────────────

function SubtaskRow({ st, onToggle, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(st.text);
  const ref = useRef(null);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== st.text) onEdit(t);
    else setDraft(st.text);
    setEditing(false);
  };

  useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select(); }
  }, [editing]);

  return (
    <div className={`st-row ${st.completed ? 'done' : ''}`}>
      <input type="checkbox" className="cb" checked={st.completed} onChange={onToggle} />
      {editing ? (
        <textarea
          ref={ref} rows={2} className="iedit"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setDraft(st.text); setEditing(false); }
          }}
        />
      ) : (
        <span className="st-text" onDoubleClick={() => setEditing(true)}>{st.text}</span>
      )}
      <div className="row-acts">
        <button type="button" className="ib" title="Edit subtask" onClick={() => setEditing(true)}><IcPencil /></button>
        <button type="button" className="ib danger" title="Delete subtask" onClick={onDelete}><IcTrash /></button>
      </div>
    </div>
  );
}

// ─── TodoRow ──────────────────────────────────────────────────────────────────

function TodoRow({ todo, onUpdate, onDelete, onDeleteSubtask, onToggle, onToggleSubtask }) {
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(todo.task);
  const [expanded,   setExpanded]   = useState(true);
  const [addingSub,  setAddingSub]  = useState(false);
  const [subDraft,   setSubDraft]   = useState('');
  const editRef = useRef(null);
  const subRef  = useRef(null);

  const commitEdit = () => {
    const t = draft.trim();
    if (t) onUpdate({ task: t });
    else setDraft(todo.task);
    setEditing(false);
  };

  const submitSub = () => {
    const t = subDraft.trim();
    if (!t) return;
    onUpdate({ subtasks: [...todo.subtasks, { id: uid(), text: t, completed: false }] });
    setSubDraft('');
    setAddingSub(false);
  };

  useEffect(() => {
    if (editing  && editRef.current) { editRef.current.focus(); editRef.current.select(); }
  }, [editing]);
  useEffect(() => {
    if (addingSub && subRef.current)  subRef.current.focus();
  }, [addingSub]);

  return (
    <div className={`todo-row ${todo.completed ? 'done' : ''}`}>
      <div className="todo-top">
        <input type="checkbox" className="cb" checked={todo.completed} onChange={onToggle} />
        <div className="todo-body">
          {editing ? (
            <textarea
              ref={editRef} rows={2} className="iedit task-iedit"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') { setDraft(todo.task); setEditing(false); }
              }}
            />
          ) : (
            <span className="todo-text" onDoubleClick={() => { setDraft(todo.task); setEditing(true); }}>
              {todo.task}
            </span>
          )}
          {(() => {
            const fmt = todo.dueDate ? formatDueDate(todo.dueDate) : null;
            return (
              <div className="due-row">
                {fmt && (
                  <span className={`due-badge ${fmt.overdue ? 'overdue' : ''}`}>📅 {fmt.label}</span>
                )}
                <input
                  type="date"
                  className="due-input"
                  value={todo.dueDate || ''}
                  onChange={e => onUpdate({ dueDate: e.target.value || null })}
                  title="Set due date"
                />
              </div>
            );
          })()}
        </div>
        <div className="todo-acts">
          <PriorityDropdown value={todo.priority} onChange={p => onUpdate({ priority: p })} />
          <button type="button" className="ib" title="Edit task"    onClick={() => { setDraft(todo.task); setEditing(true); }}><IcPencil /></button>
          <button type="button" className="ib" title="Add subtask"  onClick={() => setAddingSub(true)}><IcPlus /></button>
          {todo.subtasks.length > 0 && (
            <button type="button" className="ib" title="Toggle subtasks" onClick={() => setExpanded(e => !e)}>
              <IcChevron open={expanded} />
            </button>
          )}
          <button type="button" className="ib danger" title="Delete task" onClick={onDelete}><IcTrash /></button>
        </div>
      </div>

      {expanded && todo.subtasks.length > 0 && (
        <div className="st-list">
          {todo.subtasks.map((st, i) => (
            <SubtaskRow
              key={st.id}
              st={st}
              onToggle={() => onToggleSubtask(st.id)}
              onEdit={text => onUpdate({ subtasks: todo.subtasks.map((s, j) => j === i ? { ...s, text } : s) })}
              onDelete={() => onDeleteSubtask(st.id)}
            />
          ))}
        </div>
      )}

      {addingSub && (
        <div className="add-sub-form">
          <textarea
            ref={subRef} rows={2} className="iedit"
            placeholder="Subtask… (Enter to save, Esc to cancel)"
            value={subDraft}
            onChange={e => setSubDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitSub(); }
              if (e.key === 'Escape') { setSubDraft(''); setAddingSub(false); }
            }}
          />
          <div className="mini-row">
            <button type="button" className="btn xs primary" onClick={submitSub}>Add</button>
            <button type="button" className="btn xs ghost"   onClick={() => { setSubDraft(''); setAddingSub(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CategoryBlock ────────────────────────────────────────────────────────────

function CategoryBlock({ name, color, todos, onUpdateTodo, onDeleteTodo, onDeleteSubtask, onToggleTodo, onToggleSubtask, onAddTodo }) {
  const [addingTodo, setAddingTodo] = useState(false);
  const [taskDraft,  setTaskDraft]  = useState('');
  const [prioDraft,  setPrioDraft]  = useState(null);
  const addRef = useRef(null);

  useEffect(() => {
    if (addingTodo && addRef.current) addRef.current.focus();
  }, [addingTodo]);

  const submitTodo = () => {
    const t = taskDraft.trim();
    if (!t) return;
    onAddTodo({ id: uid(), task: t, completed: false, priority: prioDraft, category: name, subtasks: [], createdAt: Date.now() });
    setTaskDraft(''); setPrioDraft(null); setAddingTodo(false);
  };

  const sorted    = byPriority(todos);
  const doneCount = todos.filter(t => t.completed).length;

  return (
    <div className="cat-block">
      <div className="cat-head" style={{ borderLeftColor: color }}>
        <span className="dot lg" style={{ background: color }} />
        <h3 className="cat-name">{name}</h3>
        <span className="cat-stat">{doneCount}/{todos.length} done</span>
        <button type="button" className="ib small" title={`Add task to ${name}`} onClick={() => setAddingTodo(true)}><IcPlus /></button>
      </div>

      <div className="todo-list">
        {sorted.map(todo => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onUpdate={changes => onUpdateTodo(todo.id, changes)}
            onDelete={() => onDeleteTodo(todo.id)}
            onDeleteSubtask={sid => onDeleteSubtask(todo.id, sid)}
            onToggle={() => onToggleTodo(todo.id)}
            onToggleSubtask={sid => onToggleSubtask(todo.id, sid)}
          />
        ))}
        {todos.length === 0 && <p className="empty-cat">No tasks yet — add one below</p>}
      </div>

      {addingTodo ? (
        <div className="add-todo-form">
          <textarea
            ref={addRef} rows={2} className="iedit task-iedit"
            placeholder="Task description… (Enter to save, Esc to cancel)"
            value={taskDraft}
            onChange={e => setTaskDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTodo(); }
              if (e.key === 'Escape') { setTaskDraft(''); setAddingTodo(false); }
            }}
          />
          <div className="form-row">
            <PriorityDropdown value={prioDraft} onChange={setPrioDraft} />
            <div className="mini-row">
              <button type="button" className="btn xs primary" onClick={submitTodo}>Add Task</button>
              <button type="button" className="btn xs ghost" onClick={() => { setTaskDraft(''); setAddingTodo(false); }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="add-task-row" onClick={() => setAddingTodo(true)}>
          <IcPlus /><span>Add task</span>
        </button>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function AppInner() {
  const { getToken, clerkEnabled } = useAppAuth();
  const [todos,    setTodos]    = useState(() => load('ctd_todos', []));
  const [catMeta,  setCatMeta]  = useState(() => load('ctd_cats',  {}));
  const [inputText, setInputText] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [search,   setSearch]   = useState('');
  const [undo,     setUndo]     = useState(null); // { type, data, label }
  const [priFilter, setPriFilter] = useState({ high: true, medium: true, low: true, null: true });
  const [showNewCat,  setShowNewCat]  = useState(false);
  const [newCatName,  setNewCatName]  = useState('');
  const undoTimer = useRef(null);
  const fileRef   = useRef(null);
  const newCatRef = useRef(null);

  // Persist
  useEffect(() => store('ctd_todos', todos),   [todos]);
  useEffect(() => store('ctd_cats',  catMeta), [catMeta]);

  useEffect(() => {
    if (showNewCat && newCatRef.current) newCatRef.current.focus();
  }, [showNewCat]);

  // ─── Category helpers ───────────────────────────────────────

  const nextColor = useCallback((existing = catMeta) => {
    const used = new Set(Object.values(existing).map(m => m.color));
    return PALETTE.find(c => !used.has(c)) ?? PALETTE[Object.keys(existing).length % PALETTE.length];
  }, [catMeta]);

  const syncCatMeta = useCallback((newTodos, base) => {
    let changed = false;
    const updated = { ...base };
    for (const t of newTodos) {
      if (t.category && !updated[t.category]) {
        const used = new Set(Object.values(updated).map(m => m.color));
        updated[t.category] = {
          color: PALETTE.find(c => !used.has(c)) ?? PALETTE[Object.keys(updated).length % PALETTE.length],
          visible: true,
        };
        changed = true;
      }
    }
    return changed ? updated : base;
  }, []);

  // ─── Undo ───────────────────────────────────────────────────

  const pushUndo = useCallback((action) => {
    setUndo(action);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    const { type, data } = undo;
    if (type === 'delete_todo') {
      setTodos(prev => {
        const next = [...prev];
        next.splice(data.index, 0, data.todo);
        return next;
      });
    } else if (type === 'delete_subtask') {
      setTodos(prev => prev.map(t =>
        t.id === data.todoId
          ? { ...t, subtasks: [...t.subtasks.slice(0, data.index), data.subtask, ...t.subtasks.slice(data.index)] }
          : t
      ));
    } else if (type === 'toggle_todo') {
      setTodos(prev => prev.map(t => t.id === data.todoId ? { ...t, completed: data.was } : t));
    } else if (type === 'toggle_subtask') {
      setTodos(prev => prev.map(t =>
        t.id === data.todoId
          ? { ...t, subtasks: t.subtasks.map(s => s.id === data.subtaskId ? { ...s, completed: data.was } : s) }
          : t
      ));
    }
    setUndo(null);
  }, [undo]);

  // ─── Todo operations ────────────────────────────────────────

  const updateTodo = useCallback((id, changes) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t)), []);

  const deleteTodo = useCallback((id) => {
    setTodos(prev => {
      const idx  = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      pushUndo({ type: 'delete_todo', data: { todo: prev[idx], index: idx }, label: `"${prev[idx].task}"` });
      return prev.filter(t => t.id !== id);
    });
  }, [pushUndo]);

  const deleteSubtask = useCallback((todoId, subtaskId) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t;
      const idx = t.subtasks.findIndex(s => s.id === subtaskId);
      if (idx < 0) return t;
      pushUndo({ type: 'delete_subtask', data: { todoId, subtask: t.subtasks[idx], index: idx }, label: `"${t.subtasks[idx].text}"` });
      return { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) };
    }));
  }, [pushUndo]);

  const toggleTodo = useCallback((id) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== id) return t;
      pushUndo({ type: 'toggle_todo', data: { todoId: id, was: t.completed }, label: `"${t.task}"` });
      return { ...t, completed: !t.completed };
    }));
  }, [pushUndo]);

  const toggleSubtask = useCallback((todoId, subtaskId) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t;
      return {
        ...t,
        subtasks: t.subtasks.map(s => {
          if (s.id !== subtaskId) return s;
          pushUndo({ type: 'toggle_subtask', data: { todoId, subtaskId, was: s.completed }, label: `"${s.text}"` });
          return { ...s, completed: !s.completed };
        }),
      };
    }));
  }, [pushUndo]);

  const addTodo = useCallback((todo) => {
    setTodos(prev => [...prev, todo]);
    setCatMeta(prev => syncCatMeta([todo], prev));
  }, [syncCatMeta]);

  // ─── Category operations ────────────────────────────────────

  const toggleCat = name =>
    setCatMeta(prev => ({ ...prev, [name]: { ...prev[name], visible: !(prev[name]?.visible ?? true) } }));

  const toggleAllCats = () => {
    setCatMeta(prev => {
      const allOn = Object.values(prev).every(m => m.visible !== false);
      return Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, visible: !allOn }]));
    });
  };

  const createCategory = () => {
    const name = newCatName.trim();
    if (!name || catMeta[name]) return;
    setCatMeta(prev => ({ ...prev, [name]: { color: nextColor(prev), visible: true } }));
    setNewCatName('');
    setShowNewCat(false);
  };

  // ─── Parse ──────────────────────────────────────────────────

  const handleParse = async () => {
    if (!inputText.trim()) { setParseErr('Please enter some text first.'); return; }
    setParseErr('');
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const token = await getToken({ skipCache: true });
      let res;
      try {
        res = await fetch(`${API_URL}/api/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          body: JSON.stringify({ text: inputText }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('The server returned an empty response. Please try again.');
      }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setAnalysis(data.analysis || null);

      const parsed = (data.todos || []).map(item => ({
        id:        uid(),
        task:      item.task,
        completed: false,
        priority:  item.importance || null,
        category:  item.category || 'General',
        dueDate:   dayToDate(item.day),
        subtasks:  (item.subtasks || []).map(s => ({ id: uid(), text: s, completed: false })),
        createdAt: Date.now(),
      }));

      if (parsed.length === 0) {
        setParseErr('No tasks found. Try adding action items to your text.');
      } else {
        setTodos(prev => {
          const merged = [...prev, ...parsed];
          setCatMeta(prevCats => syncCatMeta(merged, prevCats));
          return merged;
        });
      }
    } catch (err) {
      setParseErr(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setInputText(ev.target.result); setParseErr(''); };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── Derived data ───────────────────────────────────────────

  const todayStr = localDateStr(new Date());

  const allCatNames = useMemo(() => {
    const fromMeta  = Object.keys(catMeta);
    const fromTodos = [...new Set(todos.map(t => t.category).filter(Boolean))];
    const regular   = [...new Set([...fromMeta, ...fromTodos])].sort();
    const hasToday  = todos.some(t => t.dueDate === todayStr);
    return hasToday ? ['Today', ...regular.filter(c => c !== 'Today')] : regular;
  }, [catMeta, todos, todayStr]);

  const visibleCatNames = allCatNames.filter(n => n === 'Today' || catMeta[n]?.visible !== false);
  const allVisible      = allCatNames.length > 0 && allCatNames.every(n => n === 'Today' || catMeta[n]?.visible !== false);

  const filteredTodos = useMemo(() =>
    todos.filter(t =>
      matchSearch(t, search) &&
      (priFilter[t.priority ?? 'null'] !== false)
    ), [todos, search, priFilter]);

  const todosByCat = useMemo(() => {
    const map = {};
    for (const t of filteredTodos) {
      const bucket = t.dueDate === todayStr ? 'Today' : t.category;
      if (!map[bucket]) map[bucket] = [];
      map[bucket].push(t);
    }
    return map;
  }, [filteredTodos]);

  const undoLabel = undo
    ? undo.type === 'delete_todo'     ? `Deleted ${undo.label}`
    : undo.type === 'delete_subtask'  ? `Deleted subtask ${undo.label}`
    : undo.type === 'toggle_todo'     ? `Marked ${undo.label} as ${undo.data.was ? 'incomplete' : 'complete'}`
    :                                   `Toggled subtask ${undo.label}`
    : '';

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="app">

      {/* Header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="logo">
            <span className="logo-ic">✅</span>
            <div>
              <h1 className="logo-title">ChaosToTodos</h1>
              <p className="logo-sub">Turn messy notes into a clean todo list</p>
            </div>
          </div>
          {clerkEnabled && (
            <div className="hdr-user">
              <UserButton afterSignOutUrl="/" />
            </div>
          )}
          <div className="search-box">
            <IcSearch />
            <input
              className="search-inp"
              placeholder="Search tasks, subtasks, priorities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clr" onClick={() => setSearch('')} title="Clear search">
                <IcX />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">

        {/* Input card */}
        <div className="card input-card">
          <div className="card-head">
            <h2 className="card-title">Paste Your Chaos</h2>
            <div className="card-acts">
              <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={loading}>
                <IcUpload /> Upload .txt
              </button>
              {todos.length > 0 && (
                <button type="button" className="btn ghost sm danger-ghost"
                  disabled={loading}
                  onClick={() => { if (window.confirm('Clear all todos and start fresh?')) { setTodos([]); setCatMeta({}); setAnalysis(null); } }}>
                  Clear All
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".txt" onChange={handleFileUpload} style={{ display: 'none' }} />
          <textarea
            className="chaos-ta"
            placeholder={`Dump your brain here…\n\n"Need to call dentist ASAP — urgent. Finish Q4 report by Friday, very important. Pick up groceries Saturday: milk, eggs, bread. Pay credit card this week. Maybe learn guitar someday."`}
            value={inputText}
            onChange={e => { setInputText(e.target.value); setParseErr(''); }}
            disabled={loading}
          />
          <div className="card-foot">
            {inputText && <span className="char-ct">{inputText.length.toLocaleString()} chars</span>}
            <button type="button" className="btn primary" onClick={handleParse} disabled={loading || !inputText.trim()}>
              {loading ? <><span className="spin" /> Parsing…</> : <><IcBolt /> Parse My Todos</>}
            </button>
          </div>
        </div>

        {parseErr && <div className="err-banner">⚠️ {parseErr}</div>}

        {loading && (
          <div className="loading-state">
            <div className="loading-dots"><span /><span /><span /></div>
            <p>Claude is reading your chaos… this can take 30–60 seconds.</p>
          </div>
        )}

        {/* Analysis panel */}
        {analysis && (
          <div className="card analysis-card">
            <h2 className="card-title">✨ AI Recommendations</h2>
            <div className="analysis-grid">
              <div className="analysis-block">
                <div className="analysis-label">⚡ Do Today</div>
                <p className="analysis-text">{analysis.today}</p>
              </div>
              <div className="analysis-block">
                <div className="analysis-label">📅 This Week</div>
                <p className="analysis-text">{analysis.thisWeek}</p>
              </div>
            </div>
          </div>
        )}

        {/* Todos area */}
        {(todos.length > 0 || allCatNames.length > 0) && (
          <div className="todos-area">

            {/* Filter bar */}
            <div className="filter-bar">
              <div className="filter-row">
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${allVisible ? 'chip-on all-chip' : 'chip-off'}`}
                    onClick={toggleAllCats}
                  >
                    All Categories
                  </button>
                  {allCatNames.map(name => {
                    const meta = catMeta[name] ?? { color: name === 'Today' ? '#f59e0b' : '#6366f1', visible: true };
                    const on   = meta.visible !== false;
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`chip ${on ? 'chip-on' : 'chip-off'}`}
                        style={on ? { background: meta.color + '18', borderColor: meta.color + '55', color: meta.color } : {}}
                        onClick={() => toggleCat(name)}
                      >
                        <span className="dot sm" style={{ background: meta.color }} />
                        {name}
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="btn ghost sm" onClick={() => setShowNewCat(true)}>
                  <IcPlus /> New Category
                </button>
              </div>
              <div className="chip-row prio-row">
                <span className="filter-label">Priority:</span>
                {(['high', 'medium', 'low']).map(p => {
                  const cfg = PRIO[p];
                  const on  = priFilter[p] !== false;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`chip ${on ? 'chip-on' : 'chip-off'}`}
                      style={on ? { background: cfg.bg, borderColor: cfg.border, color: cfg.text } : {}}
                      onClick={() => setPriFilter(prev => ({ ...prev, [p]: !prev[p] }))}
                    >
                      <span className="dot sm" style={{ background: cfg.dot }} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add category form */}
            {showNewCat && (
              <div className="new-cat-form card">
                <label className="form-label">New category name</label>
                <input
                  ref={newCatRef}
                  className="cat-inp"
                  placeholder="e.g. Home, Study, Side Project…"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  createCategory();
                    if (e.key === 'Escape') { setShowNewCat(false); setNewCatName(''); }
                  }}
                />
                <div className="mini-row">
                  <button type="button" className="btn xs primary" onClick={createCategory}>Create</button>
                  <button type="button" className="btn xs ghost"   onClick={() => { setShowNewCat(false); setNewCatName(''); }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Category blocks */}
            <div className="cat-grid">
              {visibleCatNames.filter(name => !search || (todosByCat[name] || []).length > 0).map(name => {
                const meta     = catMeta[name] ?? { color: name === 'Today' ? '#f59e0b' : '#6366f1' };
                const catTodos = todosByCat[name] || [];
                return (
                  <CategoryBlock
                    key={name}
                    name={name}
                    color={meta.color}
                    todos={catTodos}
                    onUpdateTodo={updateTodo}
                    onDeleteTodo={deleteTodo}
                    onDeleteSubtask={deleteSubtask}
                    onToggleTodo={toggleTodo}
                    onToggleSubtask={toggleSubtask}
                    onAddTodo={addTodo}
                  />
                );
              })}
            </div>

            {search && filteredTodos.length === 0 && (
              <div className="no-results">No tasks match "<strong>{search}</strong>"</div>
            )}
          </div>
        )}
      </main>

      <footer className="ftr">Powered by Claude AI</footer>

      {/* Undo toast */}
      {undo && (
        <div className="undo-toast">
          <span className="undo-msg">{undoLabel}</span>
          <button type="button" className="undo-btn" onClick={handleUndo}><IcUndo /> Undo</button>
          <button type="button" className="ib light sm" onClick={() => { clearTimeout(undoTimer.current); setUndo(null); }}><IcX /></button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // No Clerk key → run without auth (local dev / preview)
  if (!CLERK_KEY) {
    return (
      <AuthCtx.Provider value={{ getToken: async () => null, clerkEnabled: false }}>
        <AppInner />
      </AuthCtx.Provider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <SignedOut>
        <div className="auth-screen">
          <div className="auth-card">
            <div className="logo" style={{ justifyContent: 'center', marginBottom: 24 }}>
              <span className="logo-ic">✅</span>
              <div>
                <h1 className="logo-title">ChaosToTodos</h1>
                <p className="logo-sub">Turn messy notes into a clean todo list</p>
              </div>
            </div>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <ClerkAuthBridge>
          <AppInner />
        </ClerkAuthBridge>
      </SignedIn>
    </ClerkProvider>
  );
}
