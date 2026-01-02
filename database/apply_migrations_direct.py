import os
import sys
from sqlalchemy import create_engine, text

# Senha fornecida pelo usuário (URL encoded: @ vira %40)
DB_PASSWORD = "InRuJo%403001"
DB_HOST = "aws-0-us-west-2.pooler.supabase.com"
DB_PORT = "6543"
DB_USER = "postgres.vkpaebpjcvbbfuohlesf"
DB_NAME = "postgres"

# Connection String
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

def apply_migrations():
    print(f"🔌 Conectando ao Banco de Dados: {DB_HOST}...")
    
    try:
        engine = create_engine(DATABASE_URL)
        
        # Ler o arquivo SQL
        sql_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../RODAR_NO_SUPABASE.sql'))
        with open(sql_path, 'r') as f:
            sql_content = f.read()
            
        print("📜 Lendo arquivo SQL...")
        
        # Executar SQL
        with engine.connect() as connection:
            # SQLAlchemy não suporta executar script inteiro de uma vez facilmente em alguns drivers,
            # mas vamos tentar com text()
            print("🚀 Executando migrations...")
            connection.execute(text(sql_content))
            connection.commit()
            
        print("✅ Migrations aplicadas com SUCESSO!")
        return True
        
    except Exception as e:
        print(f"❌ Erro ao aplicar migrations: {str(e)}")
        return False

if __name__ == "__main__":
    # Instalar psycopg2-binary se necessário (driver postgres)
    try:
        import psycopg2
    except ImportError:
        print("📦 Instalando driver PostgreSQL...")
        os.system("python3 -m pip install psycopg2-binary")
    
    apply_migrations()
