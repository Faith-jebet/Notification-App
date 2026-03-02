import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("tasks.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    syncId TEXT,
    title TEXT,
    startTime TEXT,
    notified INTEGER,
    completed INTEGER
  )
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/tasks/:syncId", (req, res) => {
    try {
      const { syncId } = req.params;
      console.log(`Fetching tasks for syncId: ${syncId}`);
      const tasks = db.prepare("SELECT * FROM tasks WHERE syncId = ?").all(syncId);
      res.json(tasks.map(t => ({
        ...t,
        notified: !!t.notified,
        completed: !!t.completed
      })));
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Socket.io for real-time updates
  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id} (Transport: ${socket.conn.transport.name})`);

    socket.on("join", (syncId) => {
      socket.join(syncId);
      console.log(`[Socket] ${socket.id} joined room: ${syncId}`);
    });

    socket.on("task:create", (data) => {
      try {
        const { syncId, task } = data;
        console.log(`[Socket] Creating task for ${syncId}: ${task.title}`);
        const stmt = db.prepare("INSERT INTO tasks (id, syncId, title, startTime, notified, completed) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run(task.id, syncId, task.title, task.startTime, task.notified ? 1 : 0, task.completed ? 1 : 0);
        io.to(syncId).emit("task:created", task);
      } catch (err) {
        console.error(`[Socket] Error creating task:`, err);
      }
    });

    socket.on("task:update", (data) => {
      try {
        const { syncId, task } = data;
        console.log(`[Socket] Updating task for ${syncId}: ${task.title}`);
        const stmt = db.prepare("UPDATE tasks SET title = ?, startTime = ?, notified = ?, completed = ? WHERE id = ? AND syncId = ?");
        stmt.run(task.title, task.startTime, task.notified ? 1 : 0, task.completed ? 1 : 0, task.id, syncId);
        io.to(syncId).emit("task:updated", task);
      } catch (err) {
        console.error(`[Socket] Error updating task:`, err);
      }
    });

    socket.on("task:delete", (data) => {
      try {
        const { syncId, id } = data;
        console.log(`[Socket] Deleting task ${id} for ${syncId}`);
        const stmt = db.prepare("DELETE FROM tasks WHERE id = ? AND syncId = ?");
        stmt.run(id, syncId);
        io.to(syncId).emit("task:deleted", id);
      } catch (err) {
        console.error(`[Socket] Error deleting task:`, err);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
