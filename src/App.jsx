import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Users, Clock, Coins, Calendar as CalendarIcon, Plus, X, Pencil, Trash2,
  LogOut, FileText, Printer, ChevronLeft, ChevronRight, Phone, Briefcase,
  Camera, ArrowLeft, Check, AlertTriangle, UserPlus, Crown, ShieldCheck, ShieldX,
  TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, LayoutDashboard, Headphones, Share2
} from 'lucide-react';

/* ============================== HELPERS ============================== */

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['D','S','T','Q','Q','S','S'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const euro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);

const pad2 = (n) => String(n).padStart(2, '0');

const dateKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

const todayObj = () => {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() };
};

function daysMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

async function resizeImage(file, maxW = 180) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageNaturalSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

/* ---------- Relatório em PDF + compartilhamento no WhatsApp ---------- */

const slugify = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

const soDigitos = (tel) => (tel || '').replace(/\D/g, '');

async function buildRelatorioPdf(linha, periodoLabel, logo) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const NAVY = [22, 40, 63];
  const ORANGE = [221, 90, 30];
  const INK_SOFT = [107, 114, 128];

  // Cabeçalho colorido
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 34, pageW, 1.4, 'F');

  if (logo) {
    try {
      const { w, h } = await getImageNaturalSize(logo);
      const maxW = 40, maxH = 20;
      let lw = maxW, lh = (h / w) * lw;
      if (lh > maxH) { lh = maxH; lw = (w / h) * lh; }
      doc.addImage(logo, 'JPEG', pageW - 14 - lw, 17 - lh / 2, lw, lh);
    } catch (e) { /* segue sem a logo se falhar */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('CONSTRUÇÕES PAULO C', 14, 16);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(255, 190, 160);
  doc.text('RELATÓRIO DE HORAS TRABALHADAS', 14, 24);

  // Cartão com dados do funcionário
  doc.setFillColor(244, 246, 250);
  doc.roundedRect(14, 42, pageW - 28, 26, 2, 2, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(linha.funcionario.nome, 20, 52);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK_SOFT);
  doc.text(`${linha.funcionario.cargo || 'Funcionário'}  ·  ${periodoLabel}`, 20, 58);
  doc.setTextColor(...NAVY);
  doc.setFont(undefined, 'bold');
  doc.text(`Valor/hora: ${euro(linha.valorHora)}`, 20, 64);

  autoTable(doc, {
    startY: 76,
    head: [['Data', 'Horas', 'Observação', 'Valor']],
    body: linha.entries.map((e) => [
      e.data.split('-').reverse().join('/'),
      `${e.horas}h`,
      e.observacao || '-',
      euro(e.horas * linha.valorHora),
    ]),
    styles: { fontSize: 9, textColor: [26, 36, 48], cellPadding: 4 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    theme: 'striped',
  });

  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 80;
  const boxY = finalY + 8;
  doc.setFillColor(...NAVY);
  doc.roundedRect(14, boxY, pageW - 28, 22, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text('TOTAL DE HORAS', 20, boxY + 9);
  doc.text('TOTAL A RECEBER', pageW / 2 + 6, boxY + 9);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(linha.totalHoras.toFixed(2).replace('.00', ''), 20, boxY + 17);
  doc.setTextColor(255, 170, 120);
  doc.text(euro(linha.totalReceber), pageW / 2 + 6, boxY + 17);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...INK_SOFT);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-PT')} pelo sistema Construções Paulo C`, 14, doc.internal.pageSize.getHeight() - 10);

  return doc;
}

async function compartilharRelatorioWhatsapp(linha, periodoLabel, logo, avisar) {
  const numero = soDigitos(linha.funcionario.telefone);
  if (!numero || numero.length < 8) {
    avisar(`Cadastre o telefone de ${linha.funcionario.nome} (com o código do país, ex: 5565912345678) para poder compartilhar por WhatsApp.`);
    return;
  }

  const doc = await buildRelatorioPdf(linha, periodoLabel, logo);
  const fileName = `relatorio-${slugify(linha.funcionario.nome)}.pdf`;
  const blob = doc.output('blob');

  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: fileName,
        text: `Relatório de horas — ${linha.funcionario.nome}`,
      });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // usuário cancelou o compartilhamento
    console.error(e);
  }

  // Sem suporte a compartilhamento nativo (ex: computador): baixa o PDF e abre o WhatsApp já na conversa certa
  doc.save(fileName);
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(`Olá ${linha.funcionario.nome}, segue o relatório de horas em anexo.`)}`, '_blank');
  avisar('O PDF foi baixado e o WhatsApp abriu na conversa certa — é só anexar o arquivo baixado na conversa.');
}

/* ============================== STORAGE ============================== */

/* ---------- Mapeamento camelCase (app) <-> snake_case (Supabase) ---------- */

const funcFromDb = (r) => ({
  id: r.id, nome: r.nome, foto: r.foto || '', telefone: r.telefone || '',
  cargo: r.cargo || '', valorHora: Number(r.valor_hora) || 0,
  dataContratacao: r.data_contratacao || '', status: r.status || 'Ativo',
});
const funcToDb = (f) => ({
  nome: f.nome, foto: f.foto || null, telefone: f.telefone || null,
  cargo: f.cargo || null, valor_hora: f.valorHora, data_contratacao: f.dataContratacao || null,
  status: f.status,
});
const horaFromDb = (r) => ({ id: r.id, funcionarioId: r.funcionario_id, data: r.data, horas: Number(r.horas), observacao: r.observacao || '' });
const usuarioFromDb = (r) => ({ id: r.id, nome: r.nome || '', email: r.email, senha: r.senha, role: r.role, status: r.status });
const lancFromDb = (r) => ({ id: r.id, tipo: r.tipo, categoria: r.categoria || '', descricao: r.descricao || '', valor: Number(r.valor) || 0, data: r.data });
const lancToDb = (l) => ({ tipo: l.tipo, categoria: l.categoria || null, descricao: l.descricao || null, valor: l.valor, data: l.data });

/* ---------- Camada de dados (Supabase) ---------- */

const db = {
  async listarUsuarios() {
    const { data, error } = await supabase.from('usuarios').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(usuarioFromDb);
  },
  async criarUsuario(u) {
    const { data, error } = await supabase.from('usuarios').insert({ nome: u.nome || null, email: u.email, senha: u.senha, role: u.role, status: u.status }).select().single();
    if (error) throw error;
    return usuarioFromDb(data);
  },
  async atualizarUsuario(id, patch) {
    const { error } = await supabase.from('usuarios').update(patch).eq('id', id);
    if (error) throw error;
  },
  async removerUsuario(id) {
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) throw error;
  },

  async listarFuncionarios() {
    const { data, error } = await supabase.from('funcionarios').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(funcFromDb);
  },
  async salvarFuncionario(f) {
    if (f.id && f.__existe) {
      const { error } = await supabase.from('funcionarios').update(funcToDb(f)).eq('id', f.id);
      if (error) throw error;
      return f.id;
    }
    const { data, error } = await supabase.from('funcionarios').insert(funcToDb(f)).select().single();
    if (error) throw error;
    return data.id;
  },
  async removerFuncionario(id) {
    const { error } = await supabase.from('funcionarios').delete().eq('id', id);
    if (error) throw error;
  },

  async listarHoras() {
    const { data, error } = await supabase.from('horas_trabalhadas').select('*');
    if (error) throw error;
    return (data || []).map(horaFromDb);
  },
  async salvarHora(funcionarioId, data, vals) {
    const { error } = await supabase.from('horas_trabalhadas')
      .upsert({ funcionario_id: funcionarioId, data, horas: vals.horas, observacao: vals.observacao || null }, { onConflict: 'funcionario_id,data' });
    if (error) throw error;
  },
  async removerHora(funcionarioId, data) {
    const { error } = await supabase.from('horas_trabalhadas').delete().eq('funcionario_id', funcionarioId).eq('data', data);
    if (error) throw error;
  },

  async listarLancamentos() {
    const { data, error } = await supabase.from('lancamentos').select('*').order('data', { ascending: false });
    if (error) throw error;
    return (data || []).map(lancFromDb);
  },
  async salvarLancamento(l) {
    if (l.id && l.__existe) {
      const { error } = await supabase.from('lancamentos').update(lancToDb(l)).eq('id', l.id);
      if (error) throw error;
      return l.id;
    }
    const { data, error } = await supabase.from('lancamentos').insert(lancToDb(l)).select().single();
    if (error) throw error;
    return data.id;
  },
  async removerLancamento(id) {
    const { error } = await supabase.from('lancamentos').delete().eq('id', id);
    if (error) throw error;
  },

  async getLogo() {
    const { data, error } = await supabase.from('config').select('logo').eq('id', 'app').maybeSingle();
    if (error) throw error;
    return data ? data.logo || '' : '';
  },
  async salvarLogo(logoBase64) {
    const { error } = await supabase.from('config').upsert({ id: 'app', logo: logoBase64 });
    if (error) throw error;
  },
};

/* ============================== STYLE ============================== */

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    :root {
      --bg: #EEF1F6;
      --bg-alt: #E2E7EF;
      --paper: #FFFFFF;
      --ink: #1A2430;
      --ink-soft: #6B7280;
      --navy: #16283F;
      --navy-light: #26445F;
      --orange: #DD5A1E;
      --orange-dark: #A6420F;
      --steel: #4E7C93;
      --line: #E3E6EC;
      --ok: #16A34A;
      --off: #DC2626;
      --white: #FFFFFF;
      --purple: #6C5CE7;
      --blue: #3B82F6;
      --shadow-sm: 0 1px 2px rgba(22,40,63,0.06), 0 1px 1px rgba(22,40,63,0.04);
      --shadow-md: 0 4px 14px rgba(22,40,63,0.08), 0 2px 4px rgba(22,40,63,0.05);
      --shadow-lg: 0 20px 48px rgba(15,25,40,0.24), 0 6px 16px rgba(15,25,40,0.12);
    }

    * { box-sizing: border-box; }

    .pc-root {
      font-family: 'IBM Plex Sans', sans-serif;
      color: var(--ink);
      background: var(--bg);
      min-height: 100vh;
      position: relative;
      -webkit-font-smoothing: antialiased;
    }
    .mono { font-family: 'IBM Plex Mono', monospace; }
    .disp {
      font-family: 'Oswald', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .blueprint-bg {
      background-image:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 28px),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 28px);
    }
    .pc-crop { position: relative; }
    .pc-crop::before, .pc-crop::after,
    .pc-crop .cc2::before, .pc-crop .cc2::after { content: ''; position: absolute; width: 11px; height: 11px; border-color: var(--orange); }
    .pc-crop::before { top: -1px; left: -1px; border-top: 2px solid var(--orange); border-left: 2px solid var(--orange); }
    .pc-crop::after { top: -1px; right: -1px; border-top: 2px solid var(--orange); border-right: 2px solid var(--orange); }
    .pc-crop .cc2 { position: absolute; inset: 0; pointer-events: none; }
    .pc-crop .cc2::before { bottom: -1px; left: -1px; top: auto; border-bottom: 2px solid var(--orange); border-left: 2px solid var(--orange); }
    .pc-crop .cc2::after { bottom: -1px; right: -1px; top: auto; border-bottom: 2px solid var(--orange); border-right: 2px solid var(--orange); }

    .pc-btn {
      font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.05em;
      font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 4px;
      border: 1.5px solid transparent; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      transition: transform 0.1s ease, background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .pc-btn:active { transform: translateY(1px) scale(0.98); }
    .pc-btn-primary { background: var(--orange); color: var(--white); box-shadow: 0 2px 8px rgba(221,90,30,0.35); }
    .pc-btn-primary:hover { background: var(--orange-dark); box-shadow: 0 4px 14px rgba(221,90,30,0.45); transform: translateY(-1px); }
    .pc-btn-navy { background: var(--navy); color: var(--white); box-shadow: 0 2px 8px rgba(22,40,63,0.3); }
    .pc-btn-navy:hover { background: var(--navy-light); transform: translateY(-1px); }
    .pc-btn-outline { background: transparent; color: var(--navy); border-color: var(--line); }
    .pc-btn-outline:hover { background: var(--navy); color: var(--white); border-color: var(--navy); }
    .pc-btn-danger { background: transparent; color: var(--off); border-color: rgba(166,57,47,0.35); }
    .pc-btn-danger:hover { background: var(--off); color: var(--white); border-color: var(--off); }
    .pc-btn-ghost { background: transparent; color: var(--ink); }
    .pc-btn-ghost:hover { background: rgba(0,0,0,0.06); }
    .pc-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

    .pc-input {
      width: 100%; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 4px;
      background: var(--white); font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; color: var(--ink);
      outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .pc-input:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(221,90,30,0.14); }
    .pc-label {
      font-family: 'Oswald', sans-serif; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--ink-soft); display: block; margin-bottom: 6px;
    }

    .pc-card { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow-sm); transition: box-shadow 0.2s ease; }
    .pc-stamp {
      display: inline-flex; align-items: center; justify-content: center; border: 2px solid var(--orange);
      color: var(--orange); border-radius: 50%; font-family: 'Oswald', sans-serif; font-weight: 700;
      transform: rotate(-6deg); box-shadow: 0 2px 6px rgba(221,90,30,0.25);
    }
    .pc-badge { font-family: 'Oswald', sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 9px; border-radius: 20px; font-weight: 600; }
    .pc-badge-ok { background: rgba(62,122,78,0.14); color: var(--ok); }
    .pc-badge-off { background: rgba(166,57,47,0.14); color: var(--off); }

    .pc-row-hover { transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease; }
    .pc-row-hover:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); border-color: var(--orange) !important; }

    .pc-cal-cell {
      aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: 1px solid var(--line); background: var(--white); cursor: pointer; position: relative; border-radius: 4px;
      transition: background 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
    }
    .pc-cal-cell:hover { background: var(--bg-alt); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .pc-cal-cell.has-hours { background: rgba(221,90,30,0.10); border-color: var(--orange); }
    .pc-cal-cell.empty { visibility: hidden; }

    .pc-modal-overlay {
      position: fixed; inset: 0; background: rgba(13,22,36,0.6); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
      animation: pcFadeIn 0.15s ease;
    }
    .pc-modal {
      background: var(--paper); border-radius: 8px; max-width: 460px; width: 100%;
      max-height: 88vh; overflow-y: auto; border: 1px solid var(--line); box-shadow: var(--shadow-lg);
      animation: pcModalIn 0.18s cubic-bezier(0.2,0.8,0.3,1);
    }
    @keyframes pcFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pcModalIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .pc-table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
    .pc-table th { text-align: left; font-family: 'Oswald', sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; color: var(--ink-soft); border-bottom: 2px solid var(--navy); padding: 8px 10px; }
    .pc-table td { padding: 8px 10px; border-bottom: 1px dashed var(--line); }
    .pc-table tbody tr:hover { background: rgba(221,90,30,0.05); }

    @media print {
      .no-print { display: none !important; }
      .pc-root { background: white !important; }
      .print-only-block { break-inside: avoid; }
    }
  `}</style>
);

/* ============================== SMALL UI PIECES ============================== */

function StatCard({ icon: Icon, label, value, subtitle, color = '#4E7C93' }) {
  return (
    <div className="pc-card" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={19} color={color} />
        </div>
        <span className="disp" style={{ fontSize: 11, color: 'var(--ink-soft)', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize: 25, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>{subtitle}</div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: color }} />
    </div>
  );
}

function Confirm({ text, onConfirm, onCancel, confirmLabel = 'Excluir', confirmClass = 'pc-btn-danger' }) {
  return (
    <div className="pc-modal-overlay" onClick={onCancel}>
      <div className="pc-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <AlertTriangle size={20} color="#A6392F" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{text}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="pc-btn pc-btn-ghost" onClick={onCancel}>Cancelar</button>
            <button className={`pc-btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== LOGIN ============================== */

function LoginScreen({ onLogin, onRequestAccess, requestSent }) {
  const [aba, setAba] = useState('entrar'); // 'entrar' | 'solicitar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');

  const submit = (e) => {
    e.preventDefault();
    setErro('');
    if (aba === 'entrar') {
      const res = onLogin({ email: email.trim(), senha });
      if (res && res.erro) setErro(res.erro);
    } else {
      if (!email.trim() || senha.length < 4) { setErro('Preencha e-mail e uma senha com pelo menos 4 caracteres.'); return; }
      if (senha !== confirmar) { setErro('As senhas não coincidem.'); return; }
      const res = onRequestAccess({ email: email.trim(), senha, nome: nome.trim() });
      if (res && res.erro) setErro(res.erro);
    }
  };

  return (
    <div className="pc-root blueprint-bg" style={{ background: 'var(--navy)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <GlobalStyle />
      <div style={{ position: 'absolute', inset: 0, background: 'var(--navy)' }} className="blueprint-bg" />
      <div className="pc-crop" style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'var(--paper)', borderRadius: 6, padding: 32 }}>
        <div className="cc2" />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="pc-stamp" style={{ width: 56, height: 56, margin: '0 auto 14px', fontSize: 20 }}>PC</div>
          <h1 className="disp" style={{ fontSize: 20, margin: 0, color: 'var(--navy)' }}>Construções Paulo C</h1>
          <p className="pc-label" style={{ marginTop: 6 }}>Gestão de Funcionários &amp; Horas</p>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button type="button" onClick={() => { setAba('entrar'); setErro(''); }} className="pc-btn"
            style={{ flex: 1, justifyContent: 'center', background: aba === 'entrar' ? 'var(--navy)' : 'transparent', color: aba === 'entrar' ? 'white' : 'var(--ink)', border: '1.5px solid var(--line)' }}>Entrar</button>
          <button type="button" onClick={() => { setAba('solicitar'); setErro(''); }} className="pc-btn"
            style={{ flex: 1, justifyContent: 'center', background: aba === 'solicitar' ? 'var(--navy)' : 'transparent', color: aba === 'solicitar' ? 'white' : 'var(--ink)', border: '1.5px solid var(--line)' }}>Solicitar acesso</button>
        </div>

        {aba === 'solicitar' && requestSent ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <UserPlus size={26} color="var(--orange)" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>Solicitação enviada! Assim que um administrador aprovar seu acesso, você poderá entrar com o e-mail e senha informados.</p>
            <button className="pc-btn pc-btn-outline" style={{ marginTop: 8 }} onClick={() => setAba('entrar')}>Voltar para o login</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {aba === 'solicitar' && (
              <div style={{ marginBottom: 14 }}>
                <label className="pc-label">Nome</label>
                <input className="pc-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" required />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label className="pc-label">E-mail</label>
              <input className="pc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.pt" required />
            </div>
            <div style={{ marginBottom: aba === 'solicitar' ? 14 : 6 }}>
              <label className="pc-label">Senha</label>
              <input className="pc-input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" required />
            </div>
            {aba === 'solicitar' && (
              <div style={{ marginBottom: 6 }}>
                <label className="pc-label">Confirmar senha</label>
                <input className="pc-input" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="••••••••" required />
              </div>
            )}
            {erro && <p style={{ color: 'var(--off)', fontSize: 13, marginTop: 8 }}>{erro}</p>}
            <button type="submit" className="pc-btn pc-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
              {aba === 'entrar' ? 'Entrar' : 'Enviar solicitação'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ============================== TOP BAR ============================== */

function AppShell({ title, activeScreen, onNavigate, onLogout, podeGerenciarUsuarios, pendentesCount, logo, onUploadLogo, children }) {
  const logoInputRef = useRef(null);
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'financeiro', label: 'Financeiro', icon: Wallet },
    { key: 'relatorios', label: 'Relatórios', icon: FileText },
  ];
  if (podeGerenciarUsuarios) navItems.push({ key: 'usuarios', label: 'Usuários', icon: Users, badge: pendentesCount });

  return (
    <div className="pc-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <GlobalStyle />
      <div className="no-print" style={{ background: 'var(--navy)', color: 'white', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            onClick={() => podeGerenciarUsuarios && logoInputRef.current && logoInputRef.current.click()}
            title={podeGerenciarUsuarios ? 'Clique para trocar a logo' : undefined}
            className={logo ? '' : 'pc-stamp'}
            style={{
              width: logo ? 'auto' : 62, minWidth: 62, maxWidth: 190, height: 56, fontSize: 15,
              borderColor: 'white', color: 'white', flexShrink: 0,
              cursor: podeGerenciarUsuarios ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
              borderRadius: logo ? 8 : '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: logo ? 'white' : undefined, padding: logo ? 6 : 0, transform: logo ? 'none' : undefined,
            }}>
            {logo ? <img src={logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : 'PC'}
            {podeGerenciarUsuarios && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s ease' }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0}>
                <Camera size={16} color="white" />
              </div>
            )}
          </div>
          {podeGerenciarUsuarios && (
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) onUploadLogo(e.target.files[0]); e.target.value = ''; }} />
          )}
          <div>
            <div className="disp" style={{ fontSize: 14, lineHeight: 1.35 }}>CONSTRUÇÕES PAULO C —</div>
            <div className="disp" style={{ fontSize: 12, color: 'var(--orange)', letterSpacing: '0.1em' }}>{title}</div>
          </div>
        </div>
        <button onClick={onLogout} className="pc-btn pc-btn-ghost" style={{ color: 'white' }}><LogOut size={15} /> Sair</button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="no-print" style={{ width: 236, flexShrink: 0, background: 'var(--navy)', display: 'flex', flexDirection: 'column', padding: '18px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {navItems.map((item) => {
              const active = activeScreen === item.key;
              return (
                <button key={item.key} onClick={() => onNavigate(item.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 6,
                    border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', position: 'relative',
                    background: active ? 'rgba(221,90,30,0.16)' : 'transparent',
                    color: active ? 'var(--orange)' : 'rgba(255,255,255,0.72)',
                    borderLeft: active ? '3px solid var(--orange)' : '3px solid transparent',
                    fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 600,
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}>
                  <item.icon size={17} />
                  {item.label}
                  {item.badge > 0 && (
                    <span className="mono" style={{ marginLeft: 'auto', background: 'var(--orange)', color: 'white', fontSize: 10, borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <a href="https://wa.me/5565981562442" target="_blank" rel="noopener noreferrer"
              style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none', cursor: 'pointer', transition: 'background 0.15s ease' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
              <Headphones size={18} color="var(--orange)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>Precisa de ajuda?</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Fale conosco no WhatsApp.</div>
              </div>
            </a>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg)' }}>
          <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== MONTH CALENDAR (generic) ============================== */

function MonthCalendar({ year, month, onPrev, onNext, renderDay, dayClassName }) {
  const cells = daysMatrix(year, month);
  return (
    <div className="pc-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="pc-btn pc-btn-ghost" onClick={onPrev}><ChevronLeft size={18} /></button>
        <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>{MESES[month]} {year}</span>
        <button className="pc-btn pc-btn-ghost" onClick={onNext}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="mono" style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((d, i) => (
          <div
            key={i}
            className={`pc-cal-cell ${d === null ? 'empty' : ''} ${d !== null && dayClassName ? dayClassName(d) : ''}`}
            onClick={() => d !== null && renderDay.onClick && renderDay.onClick(d)}
          >
            {d !== null && renderDay.content(d)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== FUNCIONARIO FORM MODAL ============================== */

function FuncionarioModal({ funcionario, onSave, onClose }) {
  const [form, setForm] = useState(funcionario || {
    nome: '', foto: '', telefone: '', cargo: '', valorHora: '', dataContratacao: '', status: 'Ativo',
  });
  const fileRef = useRef(null);

  const handleFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    setForm((f) => ({ ...f, foto: dataUrl }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.valorHora) return;
    onSave({ ...form, id: form.id || uid(), valorHora: parseFloat(form.valorHora) });
  };

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span className="disp" style={{ fontSize: 16, color: 'var(--navy)' }}>{funcionario ? 'Editar Funcionário' : 'Novo Funcionário'}</span>
            <button className="pc-btn pc-btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
          </div>
          <form onSubmit={submit}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
              <div onClick={() => fileRef.current.click()} style={{
                width: 64, height: 64, borderRadius: '50%', background: form.foto ? `url(${form.foto}) center/cover` : 'var(--bg-alt)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed var(--line)', flexShrink: 0,
              }}>
                {!form.foto && <Camera size={20} color="var(--ink-soft)" />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFoto} />
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Foto (opcional)<br />Clique no círculo para escolher</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="pc-label">Nome *</label>
              <input className="pc-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="pc-label">Telefone (com código do país)</label>
                <input className="pc-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="Ex: 5565912345678" />
              </div>
              <div>
                <label className="pc-label">Cargo</label>
                <input className="pc-input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="pc-label">Valor / hora (€) *</label>
                <input className="pc-input" type="number" step="0.01" min="0" value={form.valorHora} onChange={(e) => setForm({ ...form, valorHora: e.target.value })} required />
              </div>
              <div>
                <label className="pc-label">Data de contratação</label>
                <input className="pc-input" type="date" value={form.dataContratacao} onChange={(e) => setForm({ ...form, dataContratacao: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="pc-label">Status</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Ativo', 'Inativo'].map((s) => (
                  <button type="button" key={s} onClick={() => setForm({ ...form, status: s })}
                    className="pc-btn"
                    style={{
                      flex: 1, justifyContent: 'center',
                      background: form.status === s ? (s === 'Ativo' ? 'var(--ok)' : 'var(--off)') : 'transparent',
                      color: form.status === s ? 'white' : 'var(--ink)',
                      border: `1.5px solid ${form.status === s ? 'transparent' : 'var(--line)'}`,
                    }}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="pc-btn pc-btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="pc-btn pc-btn-primary"><Check size={15} /> Salvar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ============================== DIA MODAL (horas trabalhadas) ============================== */

function DiaModal({ data, entrada, onSave, onDelete, onClose }) {
  const [horas, setHoras] = useState(entrada ? String(entrada.horas) : '');
  const [obs, setObs] = useState(entrada ? entrada.observacao || '' : '');
  const [confirmDel, setConfirmDel] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const h = parseFloat(horas);
    if (isNaN(h) || h < 0) return;
    onSave({ horas: h, observacao: obs });
  };

  const [y, m, d] = data.split('-').map(Number);
  const label = `${pad2(d)}/${pad2(m)}/${y}`;

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <span className="pc-label" style={{ margin: 0 }}>Registro de horas</span>
              <div className="disp mono" style={{ fontSize: 20, color: 'var(--navy)' }}>{label}</div>
            </div>
            <button className="pc-btn pc-btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
          </div>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <label className="pc-label">Horas trabalhadas *</label>
              <input className="pc-input mono" type="number" step="0.25" min="0" max="24" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ex: 8" required autoFocus />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label className="pc-label">Observação (opcional)</label>
              <textarea className="pc-input" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {entrada ? (
                <button type="button" className="pc-btn pc-btn-danger" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Excluir</button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="pc-btn pc-btn-ghost" onClick={onClose}>Cancelar</button>
                <button type="submit" className="pc-btn pc-btn-primary"><Check size={15} /> Salvar</button>
              </div>
            </div>
          </form>
        </div>
      </div>
      {confirmDel && (
        <Confirm text={`Excluir o registro de ${label}?`} onConfirm={() => { onDelete(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
      )}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard({ funcionarios, horas, lancamentos, onOpenFuncionario, onNovoFuncionario, onAbrirRelatorios }) {
  const [cur, setCur] = useState(todayObj());

  const horasDoMes = useMemo(() => {
    const prefix = `${cur.y}-${pad2(cur.m + 1)}`;
    return horas.filter((h) => h.data.startsWith(prefix));
  }, [horas, cur]);

  const totalHorasMes = horasDoMes.reduce((s, h) => s + h.horas, 0);
  const totalFolhaMes = horasDoMes.reduce((s, h) => {
    const f = funcionarios.find((fu) => fu.id === h.funcionarioId);
    return s + h.horas * (f ? f.valorHora : 0);
  }, 0);

  const lancamentosDoMes = useMemo(() => {
    const prefix = `${cur.y}-${pad2(cur.m + 1)}`;
    return lancamentos.filter((l) => l.data.startsWith(prefix));
  }, [lancamentos, cur]);
  const totalEntradasMes = lancamentosDoMes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const totalSaidasMes = lancamentosDoMes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const lucroMes = totalEntradasMes - totalSaidasMes - totalFolhaMes;

  const horasPorDia = useMemo(() => {
    const map = {};
    horasDoMes.forEach((h) => { map[h.data] = (map[h.data] || 0) + h.horas; });
    return map;
  }, [horasDoMes]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16, marginBottom: 22 }}>
        <StatCard icon={Users} label="Funcionários" value={funcionarios.length} subtitle="Total cadastrados" color="var(--purple)" />
        <StatCard icon={Clock} label={`Horas — ${MESES[cur.m]}`} value={totalHorasMes.toFixed(2).replace('.00','')} subtitle="Total de horas registradas" color="var(--blue)" />
        <StatCard icon={Coins} label={`Folha — ${MESES[cur.m]}`} value={euro(totalFolhaMes)} subtitle="Total da folha" color="var(--ok)" />
        <StatCard icon={Wallet} label={`Lucro — ${MESES[cur.m]}`} value={euro(lucroMes)} subtitle={lucroMes >= 0 ? 'Resultado positivo' : 'Resultado negativo'} color={lucroMes >= 0 ? 'var(--ok)' : 'var(--off)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dash-grid">
        <MonthCalendar
          year={cur.y} month={cur.m}
          onPrev={() => setCur((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 })}
          onNext={() => setCur((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 })}
          dayClassName={(d) => horasPorDia[dateKey(cur.y, cur.m, d)] ? 'has-hours' : ''}
          renderDay={{
            content: (d) => (
              <>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{d}</span>
                {horasPorDia[dateKey(cur.y, cur.m, d)] ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--orange-dark)' }}>{horasPorDia[dateKey(cur.y, cur.m, d)]}h</span>
                ) : null}
              </>
            ),
          }}
        />
        <div className="pc-card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>Funcionários</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pc-btn pc-btn-outline" onClick={onAbrirRelatorios}><FileText size={14} /> Relatórios</button>
              <button className="pc-btn pc-btn-primary" onClick={onNovoFuncionario}><Plus size={14} /> Novo</button>
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 340, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {funcionarios.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Nenhum funcionário cadastrado ainda.</p>}
            {funcionarios.map((f) => (
              <div key={f.id} onClick={() => onOpenFuncionario(f.id)} className="pc-row-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', background: 'var(--white)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: f.foto ? `url(${f.foto}) center/cover` : 'var(--bg-alt)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!f.foto && <Users size={14} color="var(--ink-soft)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{f.cargo || '—'} · {euro(f.valorHora)}/h</div>
                </div>
                <span className={`pc-badge ${f.status === 'Ativo' ? 'pc-badge-ok' : 'pc-badge-off'}`}>{f.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 720px) { .dash-grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

/* ============================== PERFIL DO FUNCIONARIO ============================== */

function PerfilFuncionario({ funcionario, horas, onBack, onEdit, onDelete, onSaveDia, onDeleteDia }) {
  const [cur, setCur] = useState(todayObj());
  const [diaSel, setDiaSel] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const horasFunc = useMemo(() => horas.filter((h) => h.funcionarioId === funcionario.id), [horas, funcionario.id]);
  const mapHoras = useMemo(() => {
    const m = {};
    horasFunc.forEach((h) => { m[h.data] = h; });
    return m;
  }, [horasFunc]);

  const horasMes = useMemo(() => {
    const prefix = `${cur.y}-${pad2(cur.m + 1)}`;
    return horasFunc.filter((h) => h.data.startsWith(prefix));
  }, [horasFunc, cur]);

  const totalHorasMes = horasMes.reduce((s, h) => s + h.horas, 0);
  const totalReceberMes = totalHorasMes * funcionario.valorHora;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} className="pc-btn pc-btn-outline" style={{ padding: 8 }}><ArrowLeft size={16} /></button>
        <span className="disp" style={{ fontSize: 16, color: 'var(--navy)', flex: 1 }}>{funcionario.nome}</span>
        <button className="pc-btn pc-btn-outline" onClick={onEdit}><Pencil size={14} /> Editar</button>
        <button className="pc-btn pc-btn-danger" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Excluir</button>
      </div>

      <div className="pc-card" style={{ padding: 20, marginBottom: 18, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: funcionario.foto ? `url(${funcionario.foto}) center/cover` : 'var(--bg-alt)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!funcionario.foto && <Users size={26} color="var(--ink-soft)" />}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="disp" style={{ fontSize: 20, color: 'var(--navy)' }}>{funcionario.nome}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
            <span><Briefcase size={12} style={{ verticalAlign: -2 }} /> {funcionario.cargo || '—'}</span>
            {funcionario.telefone && <span><Phone size={12} style={{ verticalAlign: -2 }} /> {funcionario.telefone}</span>}
            <span className={`pc-badge ${funcionario.status === 'Ativo' ? 'pc-badge-ok' : 'pc-badge-off'}`}>{funcionario.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <div>
            <div className="pc-label" style={{ margin: 0 }}>Valor/hora</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{euro(funcionario.valorHora)}</div>
          </div>
          <div>
            <div className="pc-label" style={{ margin: 0 }}>Horas — {MESES[cur.m]}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{totalHorasMes.toFixed(2).replace('.00','')}</div>
          </div>
          <div>
            <div className="pc-label" style={{ margin: 0 }}>A receber</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--orange-dark)' }}>{euro(totalReceberMes)}</div>
          </div>
        </div>
      </div>

      <MonthCalendar
        year={cur.y} month={cur.m}
        onPrev={() => setCur((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 })}
        onNext={() => setCur((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 })}
        dayClassName={(d) => mapHoras[dateKey(cur.y, cur.m, d)] ? 'has-hours' : ''}
        renderDay={{
          onClick: (d) => setDiaSel(dateKey(cur.y, cur.m, d)),
          content: (d) => {
            const entry = mapHoras[dateKey(cur.y, cur.m, d)];
            return (
              <>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{d}</span>
                {entry ? <span className="mono" style={{ fontSize: 9, color: 'var(--orange-dark)' }}>{entry.horas}h</span> : null}
              </>
            );
          },
        }}
      />

      {diaSel && (
        <DiaModal
          data={diaSel}
          entrada={mapHoras[diaSel]}
          onClose={() => setDiaSel(null)}
          onSave={(vals) => { onSaveDia(funcionario.id, diaSel, vals); setDiaSel(null); }}
          onDelete={() => { onDeleteDia(funcionario.id, diaSel); setDiaSel(null); }}
        />
      )}
      {confirmDel && (
        <Confirm text={`Excluir o funcionário "${funcionario.nome}"? Todos os registros de horas dele também serão apagados.`}
          onConfirm={() => { onDelete(funcionario.id); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
      )}
    </>
  );
}

/* ============================== RELATORIOS ============================== */

function Relatorios({ funcionarios, horas, logo }) {
  const now = todayObj();
  const [filtroFunc, setFiltroFunc] = useState('todos');
  const [mesRef, setMesRef] = useState(`${now.y}-${pad2(now.m + 1)}`);
  const [modo, setModo] = useState('mes'); // 'mes' | 'periodo'
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const filtrado = useMemo(() => {
    return horas.filter((h) => {
      if (filtroFunc !== 'todos' && h.funcionarioId !== filtroFunc) return false;
      if (modo === 'mes') return h.data.startsWith(mesRef);
      if (inicio && h.data < inicio) return false;
      if (fim && h.data > fim) return false;
      return true;
    });
  }, [horas, filtroFunc, mesRef, modo, inicio, fim]);

  const linhas = useMemo(() => {
    const byFunc = {};
    filtrado.forEach((h) => {
      if (!byFunc[h.funcionarioId]) byFunc[h.funcionarioId] = [];
      byFunc[h.funcionarioId].push(h);
    });
    return Object.entries(byFunc).map(([fid, entries]) => {
      const f = funcionarios.find((x) => x.id === fid);
      const totalHoras = entries.reduce((s, e) => s + e.horas, 0);
      return {
        funcionario: f,
        dias: entries.length,
        totalHoras,
        valorHora: f ? f.valorHora : 0,
        totalReceber: totalHoras * (f ? f.valorHora : 0),
        entries: entries.sort((a, b) => a.data.localeCompare(b.data)),
      };
    }).filter((l) => l.funcionario);
  }, [filtrado, funcionarios]);

  const totalGeralHoras = linhas.reduce((s, l) => s + l.totalHoras, 0);
  const totalGeralValor = linhas.reduce((s, l) => s + l.totalReceber, 0);

  const periodoLabel = modo === 'mes' ? `Referência: ${mesRef}` : `Período: ${inicio || '—'} a ${fim || '—'}`;
  const linhaSelecionada = filtroFunc !== 'todos' ? linhas.find((l) => l.funcionario.id === filtroFunc) : null;

  const handleCompartilhar = async () => {
    if (!linhaSelecionada) return;
    setEnviando(true);
    setAviso('');
    await compartilharRelatorioWhatsapp(linhaSelecionada, periodoLabel, logo, setAviso);
    setEnviando(false);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <span className="disp" style={{ fontSize: 16, color: 'var(--navy)', flex: 1 }}>Relatórios</span>
        {linhaSelecionada && (
          <button className="pc-btn pc-btn-primary no-print" onClick={handleCompartilhar} disabled={enviando}>
            <Share2 size={14} /> {enviando ? 'Preparando...' : 'Compartilhar no WhatsApp'}
          </button>
        )}
        <button className="pc-btn pc-btn-outline no-print" onClick={() => window.print()}><Printer size={14} /> Imprimir / PDF</button>
      </div>
      {aviso && (
        <div className="pc-card no-print" style={{ padding: '10px 14px', marginBottom: 14, borderColor: 'var(--orange)', background: 'rgba(221,90,30,0.06)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--orange-dark)' }}>{aviso}</span>
        </div>
      )}
      <div style={{ maxWidth: 1000 }}>
        <div className="pc-card no-print" style={{ padding: 16, marginBottom: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 180 }}>
            <label className="pc-label">Funcionário</label>
            <select className="pc-input" value={filtroFunc} onChange={(e) => setFiltroFunc(e.target.value)}>
              <option value="todos">Todos os funcionários</option>
              {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="pc-label">Período</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="pc-btn" style={{ background: modo === 'mes' ? 'var(--navy)' : 'transparent', color: modo === 'mes' ? 'white' : 'var(--ink)', border: '1.5px solid var(--line)' }} onClick={() => setModo('mes')}>Mês</button>
              <button className="pc-btn" style={{ background: modo === 'periodo' ? 'var(--navy)' : 'transparent', color: modo === 'periodo' ? 'white' : 'var(--ink)', border: '1.5px solid var(--line)' }} onClick={() => setModo('periodo')}>Personalizado</button>
            </div>
          </div>
          {modo === 'mes' ? (
            <div>
              <label className="pc-label">Mês de referência</label>
              <input className="pc-input" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label className="pc-label">De</label>
                <input className="pc-input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div>
                <label className="pc-label">Até</label>
                <input className="pc-input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="print-only-block" style={{ marginBottom: 10 }}>
          <div className="disp" style={{ fontSize: 18, color: 'var(--navy)' }}>Construções Paulo C — Relatório de Horas</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {modo === 'mes' ? `Referência: ${mesRef}` : `Período: ${inicio || '—'} a ${fim || '—'}`} · {filtroFunc === 'todos' ? 'Todos os funcionários' : funcionarios.find((f) => f.id === filtroFunc)?.nome}
          </div>
        </div>

        {linhas.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Nenhum registro de horas encontrado para este filtro.</p>}

        {linhas.map((l) => (
          <div key={l.funcionario.id} className="pc-card print-only-block" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>{l.funcionario.nome}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{l.dias} dia(s) trabalhado(s) · {euro(l.valorHora)}/h</span>
            </div>
            <table className="pc-table">
              <thead>
                <tr><th>Data</th><th>Horas</th><th>Observação</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
              </thead>
              <tbody>
                {l.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.data.split('-').reverse().join('/')}</td>
                    <td>{e.horas}h</td>
                    <td style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>{e.observacao || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{euro(e.horas * l.valorHora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--navy)' }}>
              <span className="mono" style={{ fontSize: 13 }}>Total horas: <strong>{l.totalHoras.toFixed(2).replace('.00','')}</strong></span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--orange-dark)' }}>Total a receber: <strong>{euro(l.totalReceber)}</strong></span>
            </div>
          </div>
        ))}

        {linhas.length > 0 && (
          <div className="pc-card print-only-block" style={{ padding: 16, background: 'var(--navy)', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <span className="disp" style={{ fontSize: 14 }}>Total geral do período</span>
              <span className="mono" style={{ fontSize: 14 }}>{totalGeralHoras.toFixed(2).replace('.00','')}h · <strong>{euro(totalGeralValor)}</strong></span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================== LANÇAMENTO FINANCEIRO (modal) ============================== */

function LancamentoModal({ lancamento, onSave, onClose }) {
  const [form, setForm] = useState(lancamento || {
    tipo: 'entrada', categoria: '', descricao: '', valor: '', data: new Date().toISOString().slice(0, 10),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.valor || !form.data) return;
    onSave({ ...form, id: form.id || uid(), valor: parseFloat(form.valor) });
  };

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span className="disp" style={{ fontSize: 16, color: 'var(--navy)' }}>{lancamento ? 'Editar Lançamento' : 'Novo Lançamento'}</span>
            <button className="pc-btn pc-btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
          </div>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label className="pc-label">Tipo</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setForm({ ...form, tipo: 'entrada' })}
                  className="pc-btn" style={{
                    flex: 1, justifyContent: 'center',
                    background: form.tipo === 'entrada' ? 'var(--ok)' : 'transparent',
                    color: form.tipo === 'entrada' ? 'white' : 'var(--ink)',
                    border: `1.5px solid ${form.tipo === 'entrada' ? 'transparent' : 'var(--line)'}`,
                  }}><ArrowUpCircle size={15} /> Entrada</button>
                <button type="button" onClick={() => setForm({ ...form, tipo: 'saida' })}
                  className="pc-btn" style={{
                    flex: 1, justifyContent: 'center',
                    background: form.tipo === 'saida' ? 'var(--off)' : 'transparent',
                    color: form.tipo === 'saida' ? 'white' : 'var(--ink)',
                    border: `1.5px solid ${form.tipo === 'saida' ? 'transparent' : 'var(--line)'}`,
                  }}><ArrowDownCircle size={15} /> Saída</button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="pc-label">Categoria</label>
              <input className="pc-input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder={form.tipo === 'entrada' ? 'Ex: Serviço prestado' : 'Ex: Material, combustível...'} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="pc-label">Descrição (opcional)</label>
              <textarea className="pc-input" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div>
                <label className="pc-label">Valor (€) *</label>
                <input className="pc-input mono" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
              </div>
              <div>
                <label className="pc-label">Data *</label>
                <input className="pc-input" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="pc-btn pc-btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="pc-btn pc-btn-primary"><Check size={15} /> Salvar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ============================== FINANCEIRO ============================== */

function Financeiro({ lancamentos, onBack, onNovo, onEditar, onExcluir }) {
  const now = todayObj();
  const [mesRef, setMesRef] = useState(`${now.y}-${pad2(now.m + 1)}`);
  const [confirmDel, setConfirmDel] = useState(null);

  const doMes = useMemo(
    () => lancamentos.filter((l) => l.data.startsWith(mesRef)).sort((a, b) => b.data.localeCompare(a.data)),
    [lancamentos, mesRef]
  );
  const totalEntradas = doMes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const totalSaidas = doMes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const saldo = totalEntradas - totalSaidas;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span className="disp" style={{ fontSize: 16, color: 'var(--navy)', flex: 1 }}>Financeiro</span>
        <button className="pc-btn pc-btn-primary" onClick={onNovo}><Plus size={15} /> Novo</button>
      </div>
      <div style={{ maxWidth: 900 }}>
        <div style={{ marginBottom: 18 }}>
          <label className="pc-label">Mês de referência</label>
          <input className="pc-input" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} style={{ maxWidth: 200 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
          <StatCard icon={TrendingUp} label="Entradas" value={euro(totalEntradas)} subtitle="Receitas do mês" color="var(--ok)" />
          <StatCard icon={TrendingDown} label="Saídas" value={euro(totalSaidas)} subtitle="Despesas do mês" color="var(--off)" />
          <StatCard icon={Wallet} label="Saldo do mês" value={euro(saldo)} subtitle={saldo >= 0 ? 'Resultado positivo' : 'Resultado negativo'} color={saldo >= 0 ? 'var(--ok)' : 'var(--off)'} />
        </div>

        <div className="pc-card" style={{ padding: 18 }}>
          <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>Lançamentos do mês</span>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doMes.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhum lançamento neste mês ainda.</p>}
            {doMes.map((l) => (
              <div key={l.id} className="pc-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--white)', flexWrap: 'wrap' }}>
                {l.tipo === 'entrada'
                  ? <ArrowUpCircle size={20} color="var(--ok)" style={{ flexShrink: 0 }} />
                  : <ArrowDownCircle size={20} color="var(--off)" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{l.categoria || (l.tipo === 'entrada' ? 'Entrada' : 'Saída')}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                    {l.data.split('-').reverse().join('/')}{l.descricao ? ` · ${l.descricao}` : ''}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: l.tipo === 'entrada' ? 'var(--ok)' : 'var(--off)' }}>
                  {l.tipo === 'entrada' ? '+' : '−'} {euro(l.valor)}
                </span>
                <button className="pc-btn pc-btn-ghost" style={{ padding: 6 }} onClick={() => onEditar(l)}><Pencil size={14} /></button>
                <button className="pc-btn pc-btn-ghost" style={{ padding: 6, color: 'var(--off)' }} onClick={() => setConfirmDel(l)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmDel && (
        <Confirm text={`Excluir o lançamento "${confirmDel.categoria || (confirmDel.tipo === 'entrada' ? 'Entrada' : 'Saída')}" de ${euro(confirmDel.valor)}?`}
          onConfirm={() => { onExcluir(confirmDel.id); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}

/* ============================== PAINEL DE USUARIOS / ACESSO ============================== */

function UsuariosPanel({ usuarios, currentUser, onBack, onAprovar, onRecusar, onPromover, onTransferirPosse, onRemover }) {
  const [confirmAction, setConfirmAction] = useState(null); // {text, onConfirm}

  const pendentes = usuarios.filter((u) => u.status === 'pendente');
  const aprovados = usuarios.filter((u) => u.status === 'aprovado');
  const souOwner = currentUser.role === 'owner';

  const rolelabel = { owner: 'Proprietário', admin: 'Administrador', usuario: 'Usuário' };
  const roleBadgeStyle = (role) => ({
    owner: { background: 'rgba(221,90,30,0.16)', color: 'var(--orange-dark)' },
    admin: { background: 'rgba(78,124,147,0.16)', color: 'var(--steel)' },
    usuario: { background: 'rgba(75,85,99,0.14)', color: 'var(--ink-soft)' },
  }[role]);

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <span className="disp" style={{ fontSize: 16, color: 'var(--navy)' }}>Usuários &amp; Acesso</span>
      </div>
      <div style={{ maxWidth: 800 }}>

        <div className="pc-card" style={{ padding: 18, marginBottom: 18 }}>
          <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>Solicitações pendentes</span>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendentes.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhuma solicitação de cadastro no momento.</p>}
            {pendentes.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--white)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.nome || u.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{u.email}</div>
                </div>
                <button className="pc-btn pc-btn-primary" onClick={() => onAprovar(u.id)}><ShieldCheck size={14} /> Aceitar</button>
                <button className="pc-btn pc-btn-danger" onClick={() => setConfirmAction({ text: `Recusar a solicitação de ${u.email}?`, label: 'Recusar', onConfirm: () => onRecusar(u.id) })}><ShieldX size={14} /> Recusar</button>
              </div>
            ))}
          </div>
        </div>

        <div className="pc-card" style={{ padding: 18 }}>
          <span className="disp" style={{ fontSize: 15, color: 'var(--navy)' }}>Pessoas com acesso</span>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aprovados.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--white)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.nome || u.email} {u.id === currentUser.id && <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(você)</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{u.email}</div>
                </div>
                <span className="pc-badge" style={roleBadgeStyle(u.role)}>{u.role === 'owner' && <Crown size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}{rolelabel[u.role]}</span>
                {u.id !== currentUser.id && u.role === 'usuario' && (
                  <button className="pc-btn pc-btn-outline" onClick={() => onPromover(u.id)}>Tornar administrador</button>
                )}
                {souOwner && u.id !== currentUser.id && u.role !== 'owner' && (
                  <button className="pc-btn pc-btn-navy" onClick={() => setConfirmAction({ text: `Transferir a posse do sistema para ${u.email}? Você passará a ser administrador e deixará de ser o proprietário.`, label: 'Transferir posse', danger: false, onConfirm: () => onTransferirPosse(u.id) })}>
                    <Crown size={14} /> Transferir posse
                  </button>
                )}
                {u.id !== currentUser.id && u.role !== 'owner' && (
                  <button className="pc-btn pc-btn-danger" onClick={() => setConfirmAction({ text: `Remover o acesso de ${u.email}?`, label: 'Remover', onConfirm: () => onRemover(u.id) })}><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmAction && (
        <Confirm text={confirmAction.text}
          confirmLabel={confirmAction.label || 'Confirmar'}
          confirmClass={confirmAction.danger === false ? 'pc-btn-navy' : 'pc-btn-danger'}
          onConfirm={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)} />
      )}
    </>
  );
}

/* ============================== APP ROOT ============================== */

const OWNER_SEED = { email: 'edusouzaleite@hotmail.com', senha: '25081995' };

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [erroConexao, setErroConexao] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [requestSent, setRequestSent] = useState(false);
  const [funcionarios, setFuncionarios] = useState([]);
  const [horas, setHoras] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [logo, setLogo] = useState('');
  const [screen, setScreen] = useState('dashboard'); // dashboard | perfil | relatorios | usuarios | financeiro
  const [perfilId, setPerfilId] = useState(null);
  const [modalFuncionario, setModalFuncionario] = useState(null); // null | 'new' | funcionario obj
  const [modalLancamento, setModalLancamento] = useState(null); // null | 'new' | lancamento obj

  useEffect(() => {
    (async () => {
      try {
        let us = await db.listarUsuarios();
        if (!us || us.length === 0) {
          const criado = await db.criarUsuario({ nome: 'Eduardo', email: OWNER_SEED.email, senha: OWNER_SEED.senha, role: 'owner', status: 'aprovado' });
          us = [criado];
        }
        const [fs, hs, ls] = await Promise.all([db.listarFuncionarios(), db.listarHoras(), db.listarLancamentos()]);
        setUsuarios(us);
        setFuncionarios(fs);
        setHoras(hs);
        setLancamentos(ls);
        db.getLogo().then(setLogo).catch(() => {}); // tabela config é opcional; não bloqueia o carregamento
        setLoaded(true);
      } catch (e) {
        console.error(e);
        setErroConexao('Não foi possível conectar ao banco de dados. Confira se o arquivo .env está configurado com a URL e a chave do seu projeto Supabase, e se rodou o script supabase-setup.sql.');
      }
    })();
  }, []);

  const uploadLogo = async (file) => {
    try {
      const dataUrl = await resizeImage(file, 480);
      setLogo(dataUrl);
      await db.salvarLogo(dataUrl);
    } catch (e) { console.error(e); }
  };

  const handleLogin = ({ email, senha }) => {
    const u = usuarios.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u || u.senha !== senha) return { erro: 'E-mail ou senha incorretos.' };
    if (u.status !== 'aprovado') return { erro: 'Seu acesso ainda não foi aprovado por um administrador.' };
    setCurrentUserId(u.id);
    return {};
  };

  const handleRequestAccess = ({ email, senha, nome }) => {
    if (usuarios.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
      return { erro: 'Já existe uma conta ou solicitação com este e-mail.' };
    }
    (async () => {
      try {
        const novo = await db.criarUsuario({ nome, email, senha, role: 'usuario', status: 'pendente' });
        setUsuarios((list) => [...list, novo]);
      } catch (e) { console.error(e); }
    })();
    setRequestSent(true);
    return {};
  };

  const aprovarUsuario = (id) => {
    setUsuarios((list) => list.map((u) => u.id === id ? { ...u, status: 'aprovado' } : u));
    db.atualizarUsuario(id, { status: 'aprovado' }).catch(console.error);
  };
  const recusarUsuario = (id) => {
    setUsuarios((list) => list.filter((u) => u.id !== id));
    db.removerUsuario(id).catch(console.error);
  };
  const removerUsuario = (id) => {
    setUsuarios((list) => list.filter((u) => u.id !== id));
    db.removerUsuario(id).catch(console.error);
  };
  const promoverAdmin = (id) => {
    setUsuarios((list) => list.map((u) => u.id === id ? { ...u, role: 'admin' } : u));
    db.atualizarUsuario(id, { role: 'admin' }).catch(console.error);
  };
  const transferirPosse = (paraId) => {
    setUsuarios((list) => list.map((u) => {
      if (u.id === paraId) return { ...u, role: 'owner' };
      if (u.id === currentUserId) return { ...u, role: 'admin' };
      return u;
    }));
    db.atualizarUsuario(paraId, { role: 'owner' }).catch(console.error);
    db.atualizarUsuario(currentUserId, { role: 'admin' }).catch(console.error);
  };

  const saveFuncionario = (f) => {
    const existe = funcionarios.some((x) => x.id === f.id);
    (async () => {
      try {
        if (existe) {
          await db.salvarFuncionario({ ...f, __existe: true });
          setFuncionarios((list) => list.map((x) => x.id === f.id ? f : x));
        } else {
          const novoId = await db.salvarFuncionario(f);
          setFuncionarios((list) => [...list, { ...f, id: novoId }]);
        }
      } catch (e) { console.error(e); }
    })();
    setModalFuncionario(null);
  };

  const deleteFuncionario = (id) => {
    setFuncionarios((list) => list.filter((f) => f.id !== id));
    setHoras((list) => list.filter((h) => h.funcionarioId !== id));
    setScreen('dashboard');
    setPerfilId(null);
    db.removerFuncionario(id).catch(console.error);
  };

  const saveDia = (funcionarioId, data, vals) => {
    setHoras((list) => {
      const idx = list.findIndex((h) => h.funcionarioId === funcionarioId && h.data === data);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = { ...copy[idx], ...vals };
        return copy;
      }
      return [...list, { id: uid(), funcionarioId, data, ...vals }];
    });
    db.salvarHora(funcionarioId, data, vals).catch(console.error);
  };

  const deleteDia = (funcionarioId, data) => {
    setHoras((list) => list.filter((h) => !(h.funcionarioId === funcionarioId && h.data === data)));
    db.removerHora(funcionarioId, data).catch(console.error);
  };

  const saveLancamento = (l) => {
    const existe = lancamentos.some((x) => x.id === l.id);
    (async () => {
      try {
        if (existe) {
          await db.salvarLancamento({ ...l, __existe: true });
          setLancamentos((list) => list.map((x) => x.id === l.id ? l : x));
        } else {
          const novoId = await db.salvarLancamento(l);
          setLancamentos((list) => [{ ...l, id: novoId }, ...list]);
        }
      } catch (e) { console.error(e); }
    })();
    setModalLancamento(null);
  };

  const deleteLancamento = (id) => {
    setLancamentos((list) => list.filter((l) => l.id !== id));
    db.removerLancamento(id).catch(console.error);
  };

  if (erroConexao) {
    return (
      <div className="pc-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy, #16283F)', padding: 20 }}>
        <GlobalStyle />
        <div className="pc-card" style={{ maxWidth: 420, padding: 24, background: 'var(--paper, #F4F1E7)' }}>
          <span className="disp" style={{ fontSize: 16, color: 'var(--navy, #16283F)' }}>Erro de conexão</span>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>{erroConexao}</p>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="pc-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy, #16283F)' }}>
        <GlobalStyle />
        <span className="disp" style={{ color: 'white', fontSize: 14 }}>Carregando...</span>
      </div>
    );
  }

  const currentUser = usuarios.find((u) => u.id === currentUserId);

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} onRequestAccess={handleRequestAccess} requestSent={requestSent} />;
  }

  const perfil = funcionarios.find((f) => f.id === perfilId);
  const podeGerenciarUsuarios = currentUser.role === 'owner' || currentUser.role === 'admin';
  const pendentesCount = usuarios.filter((u) => u.status === 'pendente').length;

  const screenTitles = { dashboard: 'Dashboard', financeiro: 'Financeiro', relatorios: 'Relatórios', usuarios: 'Usuários', perfil: 'Funcionário' };
  const activeNav = screen === 'perfil' ? 'dashboard' : screen;

  return (
    <>
      <AppShell
        title={screenTitles[screen] || 'Dashboard'}
        activeScreen={activeNav}
        onNavigate={(key) => { setScreen(key); setPerfilId(null); }}
        onLogout={() => window.location.reload()}
        podeGerenciarUsuarios={podeGerenciarUsuarios}
        pendentesCount={pendentesCount}
        logo={logo}
        onUploadLogo={uploadLogo}
      >
        {screen === 'dashboard' && (
          <Dashboard
            funcionarios={funcionarios}
            horas={horas}
            lancamentos={lancamentos}
            onOpenFuncionario={(id) => { setPerfilId(id); setScreen('perfil'); }}
            onNovoFuncionario={() => setModalFuncionario('new')}
            onAbrirRelatorios={() => setScreen('relatorios')}
          />
        )}
        {screen === 'financeiro' && (
          <Financeiro
            lancamentos={lancamentos}
            onNovo={() => setModalLancamento('new')}
            onEditar={(l) => setModalLancamento(l)}
            onExcluir={deleteLancamento}
          />
        )}
        {screen === 'usuarios' && podeGerenciarUsuarios && (
          <UsuariosPanel
            usuarios={usuarios}
            currentUser={currentUser}
            onAprovar={aprovarUsuario}
            onRecusar={recusarUsuario}
            onPromover={promoverAdmin}
            onTransferirPosse={transferirPosse}
            onRemover={removerUsuario}
          />
        )}
        {screen === 'perfil' && perfil && (
          <PerfilFuncionario
            funcionario={perfil}
            horas={horas}
            onBack={() => { setScreen('dashboard'); setPerfilId(null); }}
            onEdit={() => setModalFuncionario(perfil)}
            onDelete={deleteFuncionario}
            onSaveDia={saveDia}
            onDeleteDia={deleteDia}
          />
        )}
        {screen === 'relatorios' && (
          <Relatorios funcionarios={funcionarios} horas={horas} logo={logo} />
        )}
      </AppShell>
      {modalFuncionario && (
        <FuncionarioModal
          funcionario={modalFuncionario === 'new' ? null : modalFuncionario}
          onSave={saveFuncionario}
          onClose={() => setModalFuncionario(null)}
        />
      )}
      {modalLancamento && (
        <LancamentoModal
          lancamento={modalLancamento === 'new' ? null : modalLancamento}
          onSave={saveLancamento}
          onClose={() => setModalLancamento(null)}
        />
      )}
    </>
  );
}
