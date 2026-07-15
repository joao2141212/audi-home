# Winker Integration

## Papel no AudiCondo

O Winker vira a fonte principal de dados operacionais/documentais do condomínio.
Nesta primeira base, a integração captura:

- portal/condomínio vinculado ao login;
- divisões e unidades;
- documentos oficiais;
- marcação de documentos financeiros;
- providers, recursos de reserva e manutenções como registros externos.

## Rotas usadas

Base URL:

```txt
https://api.winker.com.br/v1
```

Login:

```txt
POST /auth/login
```

Observação importante: o campo `key` precisa ser enviado como string.

Leituras:

```txt
GET /me
GET /division?id_portal={id_portal}&with_units=1
GET /portal/{id_portal}/document?page={page}
GET /portal/{id_portal}/about
GET /portal/{id_portal}/provider
GET /booking?id_portal={id_portal}
GET /maintenance?id_portal={id_portal}
```

## Edge Function

Função:

```txt
supabase/functions/sync-winker
```

Body manual:

```json
{
  "condominio_id": "uuid-do-condominio",
  "username": "email@cliente.com",
  "password": "senha",
  "key": "app-key-winker",
  "id_portal": 8837
}
```

Para agendamento, configurar secrets:

```txt
WINKER_USERNAME
WINKER_PASSWORD
WINKER_APP_KEY
WINKER_PORTAL_ID
WINKER_CONDOMINIO_ID
SYNC_WINKER_SECRET
```

Chamada agendada:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sync-winker" \
  -H "x-sync-secret: $SYNC_WINKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trigger_source":"scheduled"}'
```

Intervalo recomendado inicial: 39 minutos.

## Tabelas criadas

```txt
winker_connections
winker_divisions
winker_units
winker_documents
winker_external_records
winker_sync_runs
```

`winker_documents.is_financial` marca automaticamente documentos com termos como:

```txt
balancete
demonstrativo
prestação de contas
receitas
despesas
```

## Limite conhecido

A API oficial lista documentos e metadados. No teste atual, o endpoint de download binário documentado retornou 404.

O download pelo app logado redireciona para a CDN assinada, mas isso não deve ser tratado como a integração definitiva. Para produção, pedir à Winker o endpoint oficial de download de arquivos por `id_document` ou `file.uuid`.
