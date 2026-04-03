/**
 * Audit Log Service - TypeScript
 * Portado de: backend/app/services/audit_log_service.py
 * 
 * Rastro de Auditoria Imutável (Compliance)
 * Garante segurança jurídica registrando todas as alterações de status.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ============== INTERFACES ==============

export interface AuditLogEntry {
    entity_type: "expense" | "receipt" | "reconciliation" | "transaction" | "supplier";
    entity_id: string;
    action: "APPROVE" | "REJECT" | "FLAG_FRAUD" | "CREATE" | "UPDATE" | "DELETE" | "VALIDATE";
    actor_id: string;
    previous_state?: Record<string, any> | null;
    new_state?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
}

// ============== AUDIT LOG SERVICE ==============

export class AuditLogService {
    private supabase: SupabaseClient;
    private tableName = "audit_log_immutable";

    constructor(supabase?: SupabaseClient) {
        if (supabase) {
            this.supabase = supabase;
        } else {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
    }

    /**
     * Registra uma ação no log de auditoria.
     * Este registro deve ser APPEND-ONLY no banco de dados.
     */
    async logAction(entry: AuditLogEntry): Promise<void> {
        const logEntry = {
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            action: entry.action,
            actor_id: entry.actor_id,
            previous_state: entry.previous_state || null,
            new_state: entry.new_state || null,
            metadata: entry.metadata || null,
            performed_at: new Date().toISOString(),
            client_ip: entry.metadata?.ip || null,
            user_agent: entry.metadata?.user_agent || null
        };

        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .insert(logEntry);

            if (error) {
                throw error;
            }

            console.log(`[AUDIT TRAIL] Ação registrada: ${entry.action} em ${entry.entity_type} ${entry.entity_id} por ${entry.actor_id}`);
        } catch (e) {
            // Falha no log de auditoria é CRÍTICA
            console.error(`🚨 [CRITICAL] FALHA AO GRAVAR AUDIT LOG: ${(e as Error).message}`);
            // Em um sistema real, isso poderia parar a operação ou enviar alerta
        }
    }

    /**
     * Busca logs de uma entidade específica
     */
    async getLogsForEntity(entityType: string, entityId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .select('*')
            .eq('entity_type', entityType)
            .eq('entity_id', entityId)
            .order('performed_at', { ascending: false });

        if (error) {
            console.error(`Erro ao buscar logs: ${error.message}`);
            return [];
        }

        return data || [];
    }

    /**
     * Busca logs por ator (usuário que fez a ação)
     */
    async getLogsByActor(actorId: string, limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .select('*')
            .eq('actor_id', actorId)
            .order('performed_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error(`Erro ao buscar logs: ${error.message}`);
            return [];
        }

        return data || [];
    }

    /**
     * Busca logs recentes (para dashboard de auditoria)
     */
    async getRecentLogs(limit: number = 50): Promise<any[]> {
        const { data, error } = await this.supabase
            .from(this.tableName)
            .select('*')
            .order('performed_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error(`Erro ao buscar logs: ${error.message}`);
            return [];
        }

        return data || [];
    }
}
