import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres.vheqwyakucpvymjojezn:@Jp974403024@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Necessário para Supabase
});

const sql = `
-- Recriar tabelas do zero para garantir consistência
DROP TABLE IF EXISTS public.transacoes_bancarias;
DROP TABLE IF EXISTS public.extratos_bancarios;

-- Criar tabela de Extratos
CREATE TABLE public.extratos_bancarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data_upload timestamptz DEFAULT now() NOT NULL,
  arquivo_nome text NOT NULL,
  periodo_inicio date,
  periodo_fim date,
  instituicao text,
  total_creditos numeric(12,2) DEFAULT 0,
  total_debitos numeric(12,2) DEFAULT 0,
  status text DEFAULT 'processado'
);

-- Criar tabela de Transações
CREATE TABLE public.transacoes_bancarias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  extrato_id uuid REFERENCES public.extratos_bancarios(id) ON DELETE CASCADE NOT NULL,
  data_transacao date NOT NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('CREDIT', 'DEBIT')),
  conciliado boolean DEFAULT false
);

-- Habilitar RLS (Segurança)
ALTER TABLE public.extratos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_bancarias ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (Liberado para Anonimous/Publico por equanto para facilitar o teste)
CREATE POLICY "Acesso Total Extratos" ON public.extratos_bancarios FOR ALL USING (true);
CREATE POLICY "Acesso Total Transacoes" ON public.transacoes_bancarias FOR ALL USING (true);

-- Criar Bucket de Storage para os arquivos (tentativa, pode falhar se já existir)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('extratos', 'extratos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access Bucket" ON storage.objects FOR ALL USING (bucket_id = 'extratos');
`;

async function run() {
    try {
        console.log('🔌 Conectando ao Banco de Dados...');
        await client.connect();
        console.log('✅ Conectado!');

        console.log('🔨 Criando tabelas...');
        await client.query(sql);
        console.log('🚀 Tabelas criadas com sucesso!');

    } catch (err) {
        console.error('❌ Erro na migração:', err);
    } finally {
        await client.end();
    }
}

run();
