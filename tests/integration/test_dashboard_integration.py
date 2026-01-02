#!/usr/bin/env python3
"""
Script de Teste Final - Dashboard Integrado
Valida que o endpoint dashboard/summary está funcionando corretamente
"""
import asyncio
import httpx
from datetime import datetime
import json

BASE_URL = "http://localhost:8000"

async def test_dashboard_summary():
    """Testa o endpoint principal do dashboard"""
    print("=" * 60)
    print("🧪 TESTE DASHBOARD - INTEGRAÇÃO API")
    print("=" * 60)
    print(f"📍 URL: {BASE_URL}/api/v1/dashboard/summary")
    print(f"🕐 Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(f"{BASE_URL}/api/v1/dashboard/summary", params={"condominio_id": "test-condo"})
            
            print(f"\n📊 Status: {r.status_code}")
            
            if r.status_code == 200:
                data = r.json()
                print("\n✅ RESPOSTA DA API:")
                print("-" * 40)
                print(f"  • Orçamento Anual: R$ {data['orcamento_anual']:,.2f} ({data['orcamento_trend']})")
                print(f"  • Despesas Totais: R$ {data['despesas_totais']:,.2f} ({data['despesas_trend']})")
                print(f"  • Fundo Reserva: R$ {data['fundo_reserva']:,.2f} ({data['fundo_trend']})")
                print(f"  • Dados Gráfico: {len(data['grafico_dados'])} meses")
                print(f"  • Alertas: {len(data['alertas'])} pendentes")
                print(f"  • Última Atualização: {data['ultima_atualizacao']}")
                
                print("\n📈 DADOS DO GRÁFICO:")
                for item in data['grafico_dados']:
                    print(f"     {item['name']}: Receitas R$ {item['receitas']:,.0f} | Despesas R$ {item['despesas']:,.0f}")
                
                print("\n🔔 ALERTAS:")
                for alerta in data['alertas']:
                    print(f"     [{alerta['severity'].upper()}] {alerta['title']}: {alerta['description']}")
                
                return True
            else:
                print(f"\n❌ Erro: {r.text}")
                return False
                
        except Exception as e:
            print(f"\n❌ Exceção: {e}")
            return False

async def main():
    success = await test_dashboard_summary()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ DASHBOARD API FUNCIONANDO CORRETAMENTE!")
        print("\n🎯 PRÓXIMO PASSO:")
        print("   Abra o frontend (localhost:5173) e vá para Dashboard")
        print("   Os dados agora vêm da API real (zerados até conectar banco)")
    else:
        print("❌ DASHBOARD API COM PROBLEMAS")
        print("   Verifique se o backend está rodando")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
