/**
 * AUDI HOME - Backend Modular v2.0
 * Servidor Express limpo e organizado
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./config/database');

// Import Routes
const authRoutes = require('./routes/auth');
const receiptsRoutes = require('./routes/receipts');
const statementsRoutes = require('./routes/statements');
const transactionsRoutes = require('./routes/transactions');
const reconciliationRoutes = require('./routes/reconciliation');
const dashboardRoutes = require('./routes/dashboard');
const budgetRoutes = require('./routes/budget');
const revenueRoutes = require('./routes/revenue');
const reserveRoutes = require('./routes/reserve');
const auditRoutes = require('./routes/audit');

// EXPERIMENTAL (pode ser removido sem quebrar nada)
const experimentalCerebras = require('./routes/experimental-cerebras');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0-modular' }));

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/statements', statementsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/expenses', (req, res, next) => { req.url = '/expenses'; transactionsRoutes(req, res, next); });
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/reserve', reserveRoutes);
app.use('/api/audit', auditRoutes);

// EXPERIMENTAL (remova esta linha para desativar)
app.use('/api/experimental', experimentalCerebras);

// Start Server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor Modular v2.0 rodando em http://localhost:${PORT}`);
    });
});
