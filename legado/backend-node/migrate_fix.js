const sqlite3 = require('sqlite3').verbose();
const DB_PATH = '/Users/pedroduarte/Desktop/audi home/local_audi_home.db';
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    console.log(`🔌 Conectando ao banco em: ${DB_PATH}`);
    
    // Adicionar audit_flags
    db.run("ALTER TABLE comprovantes ADD COLUMN audit_flags TEXT", (err) => {
        if (err) {
            console.log(`ℹ️ Coluna audit_flags: ${err.message}`);
        } else {
            console.log('✅ Coluna audit_flags criada.');
        }
    });

    // Adicionar audit_status
    db.run("ALTER TABLE comprovantes ADD COLUMN audit_status TEXT DEFAULT 'pendente'", (err) => {
        if (err) {
            console.log(`ℹ️ Coluna audit_status: ${err.message}`);
        } else {
            console.log('✅ Coluna audit_status criada.');
        }
    });
});
