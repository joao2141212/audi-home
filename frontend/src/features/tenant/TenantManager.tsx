import { useState, useEffect, useCallback } from 'react'
import {
    Users, Plus, Edit3, ChevronRight,
    Loader2, Search, X, Save,
    UserCheck, UserX, ShieldAlert
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface Morador {
    id: string
    condominio_id: string
    nome: string
    cpf: string | null
    email: string | null
    telefone: string | null
    unidade: string
    bloco: string | null
    tipo: 'proprietario' | 'inquilino' | 'responsavel'
    ativo: boolean
    data_entrada: string | null
    observacoes: string | null
    total_comprovantes: number
    comprovantes_aprovados: number
    comprovantes_suspeitos: number
    comprovantes_rejeitados: number
    total_pago_aprovado: number
    maior_fraud_score: number | null
    ultimo_comprovante_em: string | null
}

const EMPTY_FORM: {
    nome: string; cpf: string; email: string; telefone: string
    unidade: string; bloco: string
    tipo: 'proprietario' | 'inquilino' | 'responsavel'
    data_entrada: string; observacoes: string
} = {
    nome: '', cpf: '', email: '', telefone: '',
    unidade: '', bloco: '',
    tipo: 'inquilino',
    data_entrada: '',
    observacoes: ''
}

export function TenantManager() {
    const { user } = useAuth()
    const [moradores, setMoradores] = useState<Morador[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterAtivo, setFilterAtivo] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

    const fmt = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const load = useCallback(async () => {
        if (!user?.condominio_id) return
        setLoading(true)
        try {
            let query = supabase.from('view_moradores_resumo').select('*')
                .eq('condominio_id', user.condominio_id)

            if (filterAtivo === 'ativos') query = query.eq('ativo', true)
            else if (filterAtivo === 'inativos') query = query.eq('ativo', false)

            const { data, error } = await query.order('unidade')
            if (error) throw error
            setMoradores((data || []) as Morador[])
        } catch (err: any) {
            showToast(err.message, 'error')
        } finally {
            setLoading(false)
        }
    }, [user, filterAtivo])

    useEffect(() => { load() }, [load])

    const filtered = moradores.filter(m => {
        const q = search.toLowerCase()
        return !q || m.nome.toLowerCase().includes(q) || m.unidade.toLowerCase().includes(q) ||
            m.cpf?.includes(q) || m.email?.toLowerCase().includes(q)
    })

    const openNew = () => {
        setForm(EMPTY_FORM)
        setEditId(null)
        setShowForm(true)
    }

    const openEdit = (m: Morador) => {
        setForm({
            nome: m.nome, cpf: m.cpf || '', email: m.email || '',
            telefone: m.telefone || '', unidade: m.unidade, bloco: m.bloco || '',
            tipo: m.tipo as 'proprietario' | 'inquilino' | 'responsavel',
            data_entrada: m.data_entrada || '', observacoes: m.observacoes || ''
        })
        setEditId(m.id)
        setShowForm(true)
    }

    const save = async () => {
        if (!form.nome.trim() || !form.unidade.trim()) {
            showToast('Nome e Unidade são obrigatórios', 'error'); return
        }
        setSaving(true)
        try {
            const payload = {
                nome: form.nome.trim(), cpf: form.cpf || null, email: form.email || null,
                telefone: form.telefone || null, unidade: form.unidade.trim(),
                bloco: form.bloco || null, tipo: form.tipo,
                data_entrada: form.data_entrada || null,
                observacoes: form.observacoes || null,
                condominio_id: user!.condominio_id!
            }

            if (editId) {
                const { error } = await supabase.from('moradores').update(payload).eq('id', editId)
                if (error) throw error
                showToast('Morador atualizado!', 'success')
            } else {
                const { error } = await supabase.from('moradores').insert(payload)
                if (error) throw error
                showToast('Morador cadastrado!', 'success')
            }

            setShowForm(false)
            await load()
        } catch (err: any) {
            showToast(err.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const toggleAtivo = async (m: Morador) => {
        await supabase.from('moradores').update({ ativo: !m.ativo }).eq('id', m.id)
        await load()
        showToast(m.ativo ? 'Morador desativado' : 'Morador reativado', 'success')
    }

    const scoreColor = (s: number | null) =>
        !s || s < 30 ? 'text-emerald-600' : s < 60 ? 'text-amber-600' : 'text-rose-600'

    const tipoLabel = { proprietario: 'Proprietário', inquilino: 'Inquilino', responsavel: 'Responsável' }

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={cn("fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold text-white animate-in slide-in-from-top-2",
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600')}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Moradores & Inquilinos</h2>
                    <p className="text-slate-500 text-sm mt-1">Gerencie residentes e visualize o histórico de comprovantes por unidade</p>
                </div>
                <button onClick={openNew}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                    <Plus className="h-4 w-4" />
                    Novo morador
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-900">
                                {editId ? 'Editar Morador' : 'Novo Morador'}
                            </h3>
                            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Nome completo *', key: 'nome', type: 'text', span: 2 },
                                { label: 'Unidade / Apto *', key: 'unidade', type: 'text', span: 1 },
                                { label: 'Bloco / Torre', key: 'bloco', type: 'text', span: 1 },
                                { label: 'CPF', key: 'cpf', type: 'text', span: 1 },
                                { label: 'Telefone', key: 'telefone', type: 'text', span: 1 },
                                { label: 'E-mail', key: 'email', type: 'email', span: 2 },
                                { label: 'Data de entrada', key: 'data_entrada', type: 'date', span: 1 },
                            ].map(f => (
                                <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">{f.label}</label>
                                    <input type={f.type} value={(form as any)[f.key]}
                                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                            ))}

                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo</label>
                                <select value={form.tipo} onChange={e => setForm(prev => ({ ...prev, tipo: e.target.value as any }))}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                    <option value="inquilino">Inquilino</option>
                                    <option value="proprietario">Proprietário</option>
                                    <option value="responsavel">Responsável</option>
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-600 mb-1">Observações</label>
                                <textarea rows={2} value={form.observacoes}
                                    onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowForm(false)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">
                                Cancelar
                            </button>
                            <button onClick={save} disabled={saving}
                                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {editId ? 'Salvar' : 'Cadastrar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-6">
                {/* Left: list */}
                <div className="flex-1 space-y-4">
                    {/* Filters */}
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input type="text" placeholder="Buscar por nome, unidade, CPF..."
                                value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                        {(['todos', 'ativos', 'inativos'] as const).map(f => (
                            <button key={f} onClick={() => setFilterAtivo(f)}
                                className={cn("px-4 py-2 rounded-xl text-xs font-bold border capitalize",
                                    filterAtivo === f ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200")}>
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                            <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="font-bold text-slate-900">Nenhum morador cadastrado</h3>
                            <p className="text-slate-400 text-sm mt-1">Clique em "Novo morador" para começar.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(m => (
                                <div key={m.id}
                                    onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}
                                    className={cn("bg-white rounded-2xl border p-4 cursor-pointer transition-all",
                                        selectedId === m.id ? "border-indigo-300 shadow-md shadow-indigo-100" : "border-slate-200 hover:border-slate-300",
                                        !m.ativo && "opacity-60"
                                    )}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center font-black text-indigo-600 text-sm shrink-0">
                                            {m.unidade}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 truncate">{m.nome}</span>
                                                {!m.ativo && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold uppercase">Inativo</span>}
                                                {m.comprovantes_suspeitos > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-bold">
                                                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                                                        {m.comprovantes_suspeitos} suspeito{m.comprovantes_suspeitos > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                                                <span>{tipoLabel[m.tipo]}</span>
                                                {m.bloco && <span>Bloco {m.bloco}</span>}
                                                <span>{m.total_comprovantes} comprovante{m.total_comprovantes !== 1 ? 's' : ''}</span>
                                                {m.total_pago_aprovado > 0 && (
                                                    <span className="text-emerald-600 font-semibold">
                                                        {fmt(m.total_pago_aprovado)} aprovado
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {m.maior_fraud_score != null && m.maior_fraud_score > 0 && (
                                                <span className={cn("text-xs font-black", scoreColor(m.maior_fraud_score))}>
                                                    Max {m.maior_fraud_score}
                                                </span>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); openEdit(m) }}
                                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                                                <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                                            </button>
                                            <button onClick={e => { e.stopPropagation(); toggleAtivo(m) }}
                                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                                                title={m.ativo ? 'Desativar' : 'Reativar'}>
                                                {m.ativo
                                                    ? <UserX className="h-3.5 w-3.5 text-slate-400" />
                                                    : <UserCheck className="h-3.5 w-3.5 text-emerald-500" />}
                                            </button>
                                            <ChevronRight className={cn("h-4 w-4 text-slate-300 transition-transform", selectedId === m.id && "rotate-90")} />
                                        </div>
                                    </div>

                                    {/* Expanded stats */}
                                    {selectedId === m.id && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-4 gap-3">
                                            {[
                                                { label: 'Aprovados', value: m.comprovantes_aprovados, color: 'text-emerald-600' },
                                                { label: 'Suspeitos', value: m.comprovantes_suspeitos, color: 'text-rose-600' },
                                                { label: 'Rejeitados', value: m.comprovantes_rejeitados, color: 'text-rose-400' },
                                                { label: 'Total pago (aprovado)', value: fmt(m.total_pago_aprovado), color: 'text-indigo-600' },
                                            ].map(s => (
                                                <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase">{s.label}</p>
                                                    <p className={cn("font-black mt-0.5", s.color)}>{s.value}</p>
                                                </div>
                                            ))}
                                            {m.ultimo_comprovante_em && (
                                                <div className="col-span-4 text-xs text-slate-400">
                                                    Último comprovante: {new Date(m.ultimo_comprovante_em).toLocaleDateString('pt-BR')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Summary footer */}
            {!loading && filtered.length > 0 && (
                <div className="flex gap-6 text-sm text-slate-400 font-medium border-t border-slate-100 pt-4">
                    <span><b className="text-slate-900">{filtered.filter(m => m.ativo).length}</b> ativos</span>
                    <span><b className="text-slate-900">{filtered.filter(m => !m.ativo).length}</b> inativos</span>
                    <span><b className="text-rose-600">{filtered.filter(m => m.comprovantes_suspeitos > 0).length}</b> com comprovantes suspeitos</span>
                    <span className="ml-auto">
                        Total aprovado: <b className="text-emerald-600">{fmt(filtered.reduce((s, m) => s + m.total_pago_aprovado, 0))}</b>
                    </span>
                </div>
            )}
        </div>
    )
}
