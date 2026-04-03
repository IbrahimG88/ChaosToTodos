# ChaosToTodo — Fullstack Web App Plan

## 🧠 Overview
ChaosToTodo is a fullstack web application that converts raw, unstructured text into organized, structured todo items using AI (Claude).

The application focuses on productivity by transforming "brain dumps" into actionable tasks with categorization, prioritization, and powerful search.

---

## 🚀 Core Features

### 1. AI Text Parsing
- Input: Raw text
- Process: Claude (via backend, using Claude Code Pro subscription)
- Output: Structured JSON todos and with due dates today, every day of current week and todo later todo items

### 2. Todo Management
- Create, edit, delete todos
- Each todo includes:
  - Title
  - Priority (Low / Medium / High)
  - Category (predefined + user-created)
  - due date for each todo item 
  - Subtasks

### 3. Smart Search & Filtering
- Keyword search across:
  - Titles
  - Subtasks
  - Categories
  - Priorities
- Filters:
  - Category
  - Priority
- Toggle visibility:
  - Categories
  - Priorities

### 4. Authentication
- User login system a free one

### 5. Offline Support
- PWA support
- Local caching
- Sync when online

---

## 🧱 Tech Stack (Zero Cost)

### Frontend & Backend
- Next.js (fullstack framework)

### Styling
- Tailwind CSS

### Database
- Supabase (PostgreSQL)

### Authentication
- Clerk

### AI Processing
- Claude (via Claude Code Pro subscription)

### Hosting
- Vercel (free tier)

---

## 🏗️ Architecture

User → Next.js Frontend → API Routes → Claude → Supabase DB

---

## 📂 Project Structure

/app  
  /dashboard  
  /todos  
  /api  
    /parse  
    /todos  

/components  
/lib  
  /db  
  /ai  
  /auth  

---

## 🗄️ Database Schema (Initial)

### Users
- id
- email

### Todos
- id
- user_id
- title
- priority
- category
- todo item to do date
- created_at
- updated_at

### Subtasks
- id
- todo_id
- title
- completed

### Categories
- id
- user_id
- name

---

## 🔌 API Design

### POST /api/parse
- Input: raw text
- Output: structured todos (via Claude)

### CRUD /api/todos
- Create todo
- Update todo
- Delete todo
- Fetch todos

---

## 🤖 AI Prompt Design (Claude)

Goal:
Convert raw text into structured todos.

Rules:
- Extract actionable tasks only
- Assign priority if implied
- assign due dates decided by claude
- Suggest category
- Break into subtasks if needed
- Return ONLY JSON (strict format)

Example Output:
```json
{
  "todos": [
    {
      "title": "Prepare meeting notes",
      "priority": "high",
      "category": "Work",
      "due date": "today",
      "subtasks": [
        "Review last meeting",
        "Draft agenda"
      ]
    }
  ]
}