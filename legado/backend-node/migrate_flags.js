const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'local_audi_home.db'));

db.serialize(() => {
    // Tenta adicionar a coluna audit_flags
    db.run("ALTER TABLE comprovantes ADD COLUMN audit_flags TEXT", (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('✅ Coluna audit_flags já existe.');
        } else if (err) {
            console.error('❌ Erro ao adicionar coluna:', err.message);
        } else {
            console.log('✅ Coluna audit_flags criada com sucesso.');
        }
    });

     // Garente audit_status também
    db.run("ALTER TABLE comprovantes ADD COLUMN audit_status TEXT DEFAULT 'pendente'", (err) => {
        if (err && err.message.includes('duplicate column')) {
            console.log('✅ Coluna audit_status já existe.');
        } else {
            console.log('✅ Coluna audit_status criada.');
        }
    });
});
