const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../config/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`,
            [email, hash, name],
            function (err) {
                if (err) return res.status(400).json({ error: 'Email já existe' });
                res.json({ id: this.lastID, email, name });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    console.log('🔐 [LOGIN] Tentativa:', email);

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(401).json({ error: 'Erro no servidor' });
        if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            console.log('✅ [LOGIN] Sucesso:', email);
            res.json({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                condominio: 'Condomínio Solar' // TODO: buscar do banco
            });
        } else {
            res.status(401).json({ error: 'Senha incorreta' });
        }
    });
});

module.exports = router;
