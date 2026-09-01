const express = require("express");
const { query, queryOne, queryAll } = require("../db/pool");

const contacts = express.Router();
const projects = express.Router();

// ── CONTACTS ──────────────────────────────────────────────────────────────────

contacts.get("/", async (req, res) => {
    const rows = await queryAll("SELECT * FROM contacts WHERE user_id = $1 ORDER BY name ASC", [req.userId]);
    res.json(rows);
});

contacts.post("/", async (req, res) => {
    const { name, email, phone, company, role, notes, tags } = req.body;
    const { rows: [c] } = await query(
        `INSERT INTO contacts (user_id, name, email, phone, company, role, notes, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.userId, name, email, phone, company, role, notes, tags]
    );
    res.status(201).json(c);
});

contacts.patch("/:id", async (req, res) => {
    const fields = ["name", "email", "phone", "company", "role", "notes", "tags"];
    const sets = [], params = [];
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            params.push(req.body[f]);
            sets.push(`${f} = $${params.length}`);
        }
    });
    if (!sets.length) return res.status(400).json({ error: "No fields to update" });
    params.push(req.params.id, req.userId);
    const { rows: [c] } = await query(
        `UPDATE contacts SET ${sets.join(",")}, updated_at = now() 
     WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
        params
    );
    if (!c) return res.status(404).json({ error: "Contact not found" });
    res.json(c);
});

contacts.delete("/:id", async (req, res) => {
    await query("DELETE FROM contacts WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    res.json({ success: true });
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────

projects.get("/", async (req, res) => {
    const rows = await queryAll(
        `SELECT p.*, c.name as contact_name, pl.name as playlist_name 
     FROM projects p
     LEFT JOIN contacts c ON c.id = p.contact_id
     LEFT JOIN playlists pl ON pl.id = p.playlist_id
     WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
        [req.userId]
    );
    res.json(rows);
});

projects.post("/", async (req, res) => {
    const { name, status, notes, contact_id, playlist_id } = req.body;
    const { rows: [p] } = await query(
        `INSERT INTO projects (user_id, name, status, notes, contact_id, playlist_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, name, status || 'to_do', notes, contact_id, playlist_id]
    );
    res.status(201).json(p);
});

projects.patch("/:id", async (req, res) => {
    const fields = ["name", "status", "notes", "contact_id", "playlist_id"];
    const sets = [], params = [];
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            params.push(req.body[f]);
            sets.push(`${f} = $${params.length}`);
        }
    });
    if (!sets.length) return res.status(400).json({ error: "No fields to update" });
    params.push(req.params.id, req.userId);
    const { rows: [p] } = await query(
        `UPDATE projects SET ${sets.join(",")}, updated_at = now() 
     WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
        params
    );
    if (!p) return res.status(404).json({ error: "Project not found" });
    res.json(p);
});

projects.delete("/:id", async (req, res) => {
    await query("DELETE FROM projects WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    res.json({ success: true });
});

module.exports = { contacts, projects };
