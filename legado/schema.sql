-- ==========================================
-- AUDI HOME - SUPABASE CORE SCHEMA
-- Hierarchy: Master -> Gestor -> Síndico
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ADMISTRADORAS (Groups of Condos)
CREATE TABLE IF NOT EXISTS public.administradoras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONDOMINIOS
CREATE TABLE IF NOT EXISTS public.condominios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    administradora_id UUID REFERENCES public.administradoras(id),
    nome TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    endereco TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PERFIS (Extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('master', 'gestor', 'sindico')),
    administradora_id UUID REFERENCES public.administradoras(id),
    condominio_id UUID REFERENCES public.condominios(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FINANCIAL DATA (Multi-tenant via condominio_id)
CREATE TABLE IF NOT EXISTS public.extratos_bancarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id UUID NOT NULL REFERENCES public.condominios(id),
    arquivo_nome TEXT,
    periodo_inicio DATE,
    periodo_fim DATE,
    instituicao TEXT,
    total_creditos NUMERIC(15,2) DEFAULT 0,
    total_debitos NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transacoes_bancarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id UUID NOT NULL REFERENCES public.condominios(id),
    extrato_id UUID REFERENCES public.extratos_bancarios(id) ON DELETE CASCADE,
    data_transacao DATE NOT NULL,
    descricao TEXT,
    valor NUMERIC(15,2) NOT NULL,
    tipo TEXT CHECK (tipo IN ('CREDIT', 'DEBIT')),
    conciliado BOOLEAN DEFAULT FALSE,
    audit_status TEXT DEFAULT 'pendente',
    audit_report TEXT,
    favorecido TEXT,
    documento_favorecido TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fornecedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cnpj TEXT UNIQUE NOT NULL,
    razao_social TEXT,
    nome_fantasia TEXT,
    situacao_cadastral TEXT,
    cnae_principal TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comprovantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condominio_id UUID NOT NULL REFERENCES public.condominios(id),
    fornecedor_id UUID REFERENCES public.fornecedores(id),
    transacao_id UUID REFERENCES public.transacoes_bancarias(id),
    data_emissao DATE NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    descricao TEXT,
    arquivo_nome TEXT,
    natureza_servico TEXT,
    status TEXT DEFAULT 'pendente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.administradoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extratos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacoes_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprovantes ENABLE ROW LEVEL SECURITY;

-- POLICIES: PERFIS
CREATE POLICY "Users can view their own profile" ON public.perfis
    FOR SELECT USING (auth.uid() = id);

-- POLICIES: CONDOMINIOS (The Key of Tenure)
CREATE POLICY "Master can see all condominios" ON public.condominios
    FOR ALL USING (
        (SELECT role FROM perfis WHERE id = auth.uid()) = 'master'
    );

CREATE POLICY "Gestor can see their administradora condominios" ON public.condominios
    FOR ALL USING (
        administradora_id = (SELECT administradora_id FROM perfis WHERE id = auth.uid())
    );

CREATE POLICY "Sindico can see their own condominio" ON public.condominios
    FOR ALL USING (
        id = (SELECT condominio_id FROM perfis WHERE id = auth.uid())
    );

-- POLICIES: TRANSACOES (Inherit from Condominio access)
CREATE POLICY "Access transactions based on condominio access" ON public.transacoes_bancarias
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.condominios c 
            WHERE c.id = transacoes_bancarias.condominio_id
        )
    );

-- 6. AUTO-CREATE PERFIL ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, email, role)
  VALUES (new.id, new.email, 'sindico'); -- Default role
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
