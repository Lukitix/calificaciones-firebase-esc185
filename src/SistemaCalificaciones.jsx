import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Save, Plus, Trash2, LogOut, Lock, Eye, EyeOff, Search, X, Mail, CheckCircle, Lock as LockIcon, Unlock, FileDown, Paperclip, FileText, Upload, Download, ChevronDown } from 'lucide-react';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── DATOS ESTÁTICOS ────────────────────────────────────────────────────────
const areas = {
  curriculares: [
    { nombre: 'Lengua y Literatura', color1: '#667eea', color2: '#764ba2', icon: '📖' },
    { nombre: 'Matemática', color1: '#f093fb', color2: '#f5576c', icon: '🔢' },
    { nombre: 'Ciencias Naturales', color1: '#43e97b', color2: '#38f9d7', icon: '🌿' },
    { nombre: 'Ciencias Sociales', color1: '#4facfe', color2: '#00f2fe', icon: '🌍' },
    { nombre: 'Formación Ética y Ciudadana', color1: '#ff6b9d', color2: '#c471ed', icon: '⚖️' },
  ],
  convivencia: [
    { nombre: 'Convivencia', color1: '#f59e0b', color2: '#d97706', icon: '🏫', sinCriterios: true },
  ],
  especiales: [
    { nombre: 'Educación Artística: Plástica', color1: '#fa709a', color2: '#fee140', icon: '🎨' },
    { nombre: 'Educación Física', color1: '#30cfd0', color2: '#330867', icon: '⚽' },
    { nombre: 'Informática', color1: '#a18cd1', color2: '#fbc2eb', icon: '💻' },
    { nombre: 'Lengua Extranjera: Inglés', color1: '#ff9a56', color2: '#ff6a88', icon: '🗣️' },
    { nombre: 'Educación Artística: Música', color1: '#c471f5', color2: '#fa71cd', icon: '🎵' },
    { nombre: 'Tecnología', color1: '#ff6b6b', color2: '#ee5a6f', icon: '🔧' },
    { nombre: 'Lengua Extranjera: Portugués', color1: '#4facfe', color2: '#00f2fe', icon: '📚' },
    { nombre: 'Laboratorio', color1: '#00c6ff', color2: '#0072ff', icon: '🧪' },
  ],
  talleres: [
    { nombre: 'Taller de Ajedrez', color1: '#1a1a2e', color2: '#16213e', icon: '♟️' },
    { nombre: 'Taller de Música', color1: '#6d28d9', color2: '#4c1d95', icon: '🎼' },
    { nombre: 'Taller de Plástica', color1: '#be185d', color2: '#9d174d', icon: '🖌️' },
    { nombre: 'Taller de Danza', color1: '#ec4899', color2: '#be123c', icon: '💃' },
  ]
};

const grados = ['1°A','1°B','1°C','1°D','1°E','2°A','2°B','2°C','2°D','2°E','3°A','3°B','3°C','3°D','3°E','4°A','4°B','4°C','4°D','4°E','5°A','5°B','5°C','5°D','5°E','6°A','6°B','6°C','6°D','6°E','7°A','7°B','7°C','7°D','7°E'];

// ─── FECHAS DE CIERRE DE BIMESTRES ──────────────────────────────────────────
const CIERRES_BIMESTRE = [
  { bim: 1, inicio: new Date('2026-03-02T12:00:00'), cierre: new Date('2026-05-08T12:00:00'), inicioStr: '02/03/2026', cierreStr: '08/05/2026', dias: 47 },
  { bim: 2, inicio: new Date('2026-05-11T12:00:00'), cierre: new Date('2026-07-31T12:00:00'), inicioStr: '11/05/2026', cierreStr: '31/07/2026', dias: 50 },
  { bim: 3, inicio: new Date('2026-08-03T12:00:00'), cierre: new Date('2026-10-09T12:00:00'), inicioStr: '03/08/2026', cierreStr: '09/10/2026', dias: 47 },
  { bim: 4, inicio: new Date('2026-10-12T12:00:00'), cierre: new Date('2026-12-04T12:00:00'), inicioStr: '12/10/2026', cierreStr: '04/12/2026', dias: 38 },
];

const getRecordatorioBimestre = () => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (const b of CIERRES_BIMESTRE) {
    const diff = Math.floor((b.cierre - hoy) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff <= 2) {
      return { bim: b.bim, diff, cierre: b.cierreStr };
    }
  }
  return null;
};

// Formato visual del grado: 7°A → 7° "A"  (solo para mostrar, la clave interna sigue siendo 7°A)
const gradoLabel = (g) => g ? g.replace(/°([A-Z])/, '° "$1"') : g;

// ─── UTILIDADES ─────────────────────────────────────────────────────────────
const asegurarEstructuraEstudiante = (estudiante) => {
  const bimestres = { ...estudiante.bimestres || {} };
  for (let i = 1; i <= 4; i++) {
    if (!bimestres[i]) bimestres[i] = { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'', observacion:'' };
    if (bimestres[i].observacion === undefined) bimestres[i].observacion = '';
  }
  return { ...estudiante, bimestres };
};

const calcularCuatrimestre = (b1, b2) => {
  const n1 = parseFloat(b1), n2 = parseFloat(b2);
  return isNaN(n1) || isNaN(n2) ? '' : ((n1 + n2) / 2).toFixed(2);
};

const calcularPromedioFinal = (b1, b2, b3, b4) => {
  const vals = [b1, b2, b3, b4].map(parseFloat).filter(n => !isNaN(n));
  if (vals.length < 4) return '';
  const c1 = (vals[0] + vals[1]) / 2;
  const c2 = (vals[2] + vals[3]) / 2;
  return ((vals[0] + vals[1] + vals[2] + vals[3] + c1 + c2) / 6).toFixed(2);
};

const safeKey = (str) => str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ°]/g, '_');

const capitalizarNombre = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(^|[\s,])(\p{L})/gu, (m) => m.toUpperCase()).trim();
};

// ─── ESCALA CONCEPTUAL (solo 1°, 2° y 3° grado) ─────────────────────────────
const esPrimerCiclo = (grado) => grado && ['1','2','3'].includes(grado.charAt(0));

const escalaConceptual = [
  { min: 2, max: 3, abrev: 'NS',  texto: 'NO SATISFACTORIO' },
  { min: 4, max: 5, abrev: 'PS',  texto: 'POCO SATISFACTORIO' },
  { min: 6, max: 7, abrev: 'SAT', texto: 'SATISFACTORIO' },
  { min: 8, max: 8, abrev: 'MS',  texto: 'MUY SATISFACTORIO' },
  { min: 9, max: 9, abrev: 'DIS', texto: 'DISTINGUIDO' },
  { min: 10, max: 10, abrev: 'SOB', texto: 'SOBRESALIENTE' },
];

const getConceptual = (nota) => {
  const n = parseFloat(nota);
  if (isNaN(n)) return null;
  // Redondear: decimal >= 0.5 sube, < 0.5 baja
  const redondeado = Math.floor(n) + (n % 1 >= 0.5 ? 1 : 0);
  return escalaConceptual.find(e => redondeado >= e.min && redondeado <= e.max) || null;
};

const abrevConceptual = (nota) => {
  const c = getConceptual(nota);
  return c ? c.abrev : (nota || '');
};

const textoConceptual = (nota) => {
  const n = parseFloat(nota);
  if (isNaN(n)) return nota || '';
  const redondeado = Math.floor(n) + (n % 1 >= 0.5 ? 1 : 0);
  const c = escalaConceptual.find(e => redondeado >= e.min && redondeado <= e.max);
  return c ? `${c.texto} (${redondeado})` : (nota || '');
};

const colorNota = (nota) => {
  const n = parseFloat(nota);
  if (isNaN(n) || nota === '' || nota === null || nota === undefined) return null;
  return n >= 6 ? { bg: '#dcfce7', text: '#15803d' } : { bg: '#fee2e2', text: '#dc2626' };
};

// ─── SISTEMA DE MODALES ──────────────────────────────────────────────────────
function useModal() {
  const [modal, setModal] = useState(null);
  const showAlert = useCallback((mensaje, tipo = 'info', titulo = null) =>
    new Promise(resolve => setModal({ tipo: 'alert', mensaje, tipo_icono: tipo, titulo, resolve })), []);
  const showConfirm = useCallback((mensaje, titulo = '¿Está seguro?') =>
    new Promise(resolve => setModal({ tipo: 'confirm', mensaje, titulo, resolve })), []);
  const showConfirmYesNo = useCallback((mensaje, titulo = '') =>
    new Promise(resolve => setModal({ tipo: 'yesno', mensaje, titulo, resolve })), []);
  const showPrompt = useCallback((mensaje, placeholder = '', titulo = null) =>
    new Promise(resolve => setModal({ tipo: 'prompt', mensaje, placeholder, titulo, resolve })), []);
  const closeModal = useCallback((valor = null) => {
    setModal(prev => { if (prev?.resolve) prev.resolve(valor); return null; });
  }, []);
  return { modal, showAlert, showConfirm, showConfirmYesNo, showPrompt, closeModal };
}

function ModalRenderer({ modal, closeModal }) {
  const [inputVal, setInputVal] = useState('');
  useEffect(() => setInputVal(''), [modal]);
  useEffect(() => {
    const handler = (e) => {
      if (!modal) return;
      if (e.key === 'Escape') closeModal(null);
      if (e.key === 'Enter') {
        if (modal.tipo === 'alert') closeModal(true);
        if (modal.tipo === 'prompt') closeModal(inputVal.trim() || null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, closeModal, inputVal]);
  if (!modal) return null;
  const iconos = {
    info:    { emoji: 'ℹ️', bg: 'bg-blue-100',   text: 'text-blue-700',   btn: 'bg-blue-600 hover:bg-blue-700' },
    success: { emoji: '✅', bg: 'bg-green-100',  text: 'text-green-700',  btn: 'bg-green-600 hover:bg-green-700' },
    warning: { emoji: '⚠️', bg: 'bg-yellow-100', text: 'text-yellow-700', btn: 'bg-yellow-600 hover:bg-yellow-700' },
    error:   { emoji: '❌', bg: 'bg-red-100',    text: 'text-red-700',    btn: 'bg-red-600 hover:bg-red-700' },
  };
  const estilo = iconos[modal.tipo_icono] || iconos.info;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className={`px-6 py-4 ${estilo.bg} flex items-center gap-3`}>
          <span className="text-2xl">{estilo.emoji}</span>
          <h3 className={`text-lg font-bold ${estilo.text}`}>
            {modal.titulo || (modal.tipo === 'confirm' ? '¿Está seguro?' : modal.tipo === 'prompt' ? 'Ingresá un valor' : 'Aviso')}
          </h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-700 text-base leading-relaxed">{modal.mensaje}</p>
          {modal.tipo === 'prompt' && (
            <input autoFocus type="text" value={inputVal} onChange={e => setInputVal(e.target.value)}
              placeholder={modal.placeholder}
              className="mt-4 w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800"
              onKeyDown={e => { if (e.key === 'Enter') closeModal(inputVal.trim() || null); }} />
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          {modal.tipo === 'alert' && (
            <button onClick={() => closeModal(true)} className={`px-6 py-2.5 rounded-xl text-white font-semibold transition-all ${estilo.btn}`}>Aceptar</button>
          )}
          {modal.tipo === 'confirm' && (<>
            <button onClick={() => closeModal(false)} className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cancelar</button>
            <button onClick={() => closeModal(true)} className="px-6 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-all">Confirmar</button>
          </>)}
          {modal.tipo === 'yesno' && (<>
            <button onClick={() => closeModal(false)} className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">No</button>
            <button onClick={() => closeModal(true)} className="px-6 py-2.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-all">Sí</button>
          </>)}
          {modal.tipo === 'prompt' && (<>
            <button onClick={() => closeModal(null)} className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cancelar</button>
            <button onClick={() => closeModal(inputVal.trim() || null)} className={`px-6 py-2.5 rounded-xl text-white font-semibold transition-all ${estilo.btn}`}>Agregar</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── ESTILOS GLOBALES ────────────────────────────────────────────────────────
const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');
html, body, #root { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 100% !important; overflow-x: hidden; }
* { font-family: 'Inter', sans-serif; box-sizing: border-box; font-size: 16px; }
h1,h2,h3,h4,h5 { font-family: 'Outfit', sans-serif; }
:root {
  --navy: #1e3a5f; --navy2: #2d5282; --navy-lt: #eef3f9;
  --indigo: #4338ca; --violet: #5b21b6; --violet-lt: #ede9fe;
  --border: #e2e8f0; --slate: #475569; --slate-lt: #f8fafc;
  --text: #1e293b; --muted: #64748b;
  --green: #16a34a; --green-lt: #dcfce7;
  --red: #dc2626; --red-lt: #fee2e2;
  --amber: #d97706; --amber-lt: #fef3c7;
  --blue-lt: #eff6ff; --zebra: #eceff4;
  --bim-sep: 2px solid #2d4a6a;
  --r: 8px; --r-lg: 12px;
  --sh: 0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.06);
  --sh-md: 0 4px 14px rgba(0,0,0,.10);
}
@keyframes marquee { 0% { transform: translateX(0%) } 100% { transform: translateX(-33.33%) } }
.animate-marquee { display: inline-block; animation: marquee 22s linear infinite; }
@keyframes modalEntrada { from { opacity: 0; transform: scale(0.92) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.95); } }
.fade-in { animation: fadeIn 0.25s ease-out both; }
.card-materia { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; animation: fadeInUp 0.3s ease-out both; }
.card-materia:hover { transform: translateY(-2px); box-shadow: var(--sh-md); border-color: var(--navy) !important; }
.card-materia:nth-child(1) { animation-delay: 0.03s; } .card-materia:nth-child(2) { animation-delay: 0.06s; }
.card-materia:nth-child(3) { animation-delay: 0.09s; } .card-materia:nth-child(4) { animation-delay: 0.12s; }
.card-materia:nth-child(5) { animation-delay: 0.15s; } .card-materia:nth-child(6) { animation-delay: 0.18s; }
.card-materia:nth-child(7) { animation-delay: 0.21s; } .card-materia:nth-child(8) { animation-delay: 0.24s; }
.btn-primary { transition: all 0.15s ease; }
.btn-primary:hover { filter: brightness(1.08); box-shadow: 0 4px 12px rgba(0,0,0,.15); }
.btn-primary:active { filter: brightness(0.97); }
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 0.5; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
.nota-input { width: 44px; height: 34px; padding: 2px; border: 1.5px solid var(--border); border-radius: 6px; text-align: center; font-size: 13px; font-weight: 700; color: var(--text); background: #f8fafc; transition: border-color 0.15s, background 0.15s; font-family: 'Inter', sans-serif; }
.nota-input:focus { outline: none; border-color: var(--indigo); background: #fff; }
.tabla-header { background: var(--navy); color: white; }
.tabla-row { transition: background-color 0.15s ease; }
.tabla-row:nth-child(even) { background: var(--zebra); }
.tabla-row:hover { background: #d6dff0 !important; }
.bim-sep-left { border-left: var(--bim-sep) !important; }
.bim-sep-right { border-right: var(--bim-sep) !important; }
.chip-grado { transition: all 0.15s ease; }
.chip-grado:hover { transform: scale(1.04); }
.toast-visible { animation: toastIn 0.25s ease-out both; }
.n-field-input { border: 1.5px solid var(--border); border-radius: var(--r); padding: 10px 14px; font-size: 15px; font-family: 'Inter', sans-serif; color: var(--text); outline: none; width: 100%; transition: border-color 0.15s; background: #fff; line-height: 1.5; }
.n-field-input:focus { border-color: var(--indigo); }
`;

// ─── SUBCOMPONENTES ──────────────────────────────────────────────────────────
function TopBar({ titulo, onInicio, onCerrarSesion }) {
  return (
    <div className="flex justify-between items-center mb-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>{titulo}</h2>
      <div className="flex gap-2">
        <button onClick={onInicio} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 'var(--r)' }}>
          <Home size={15} /> Inicio
        </button>
        <button onClick={onCerrarSesion} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
          style={{ background: 'var(--red-lt)', color: 'var(--red)', border: '1.5px solid #fecaca', borderRadius: 'var(--r)' }}>
          <LogOut size={15} /> Salir
        </button>
      </div>
    </div>
  );
}

function ChipsGrado({ lista, seleccionado, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lista.map(g => (
        <button key={g} onClick={() => onChange(g)} className="chip-grado px-3 py-1.5 font-bold text-sm"
          style={{
            borderRadius: 'var(--r)', border: '1.5px solid',
            borderColor: seleccionado === g ? 'var(--navy)' : 'var(--border)',
            background: seleccionado === g ? 'var(--navy)' : '#fff',
            color: seleccionado === g ? '#fff' : 'var(--slate)',
          }}>
          {gradoLabel(g)}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, color = 'purple' }) {
  const colores = {
    purple: { bg: 'var(--violet-lt)', text: 'var(--violet)' },
    blue:   { bg: 'var(--blue-lt)',   text: '#1d4ed8' },
    green:  { bg: 'var(--green-lt)',  text: 'var(--green)' },
    red:    { bg: 'var(--red-lt)',    text: 'var(--red)' },
  };
  const c = colores[color] || colores.purple;
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{children}</span>;
}

function Spinner({ texto = 'Cargando...' }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center" style={{ background: 'var(--navy)' }}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-md)', padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, border: '4px solid var(--border)', borderTop: '4px solid var(--navy)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 14 }}>{texto}</p>
      </div>
    </div>
  );
}

// ─── NOTA INPUT ─────────────────────────────────────────────────────────────
// Estado local para evitar pérdida de foco al escribir números de 2 dígitos
// primerCiclo: si true, muestra abreviatura conceptual al perder el foco
function NotaInput({ value, onCommit, title, primerCiclo = false }) {
  const [local, setLocal] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setLocal(value ?? '');
  }, [value]);

  // Cuando focused pasa a true, hacer foco real en el input
  useEffect(() => {
    if (focused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focused]);

  const handleChange = (ev) => {
    const v = ev.target.value;
    if (/^(\d{0,2}([.,]\d{0,2})?)?$/.test(v)) {
      setLocal(v.replace(',', '.'));
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(local);
    if (!isNaN(n) && local !== '') {
      const clamped = Math.min(10, Math.max(1, n));
      // Mantener hasta 2 decimales, sin redondear
      const rounded = Math.round(clamped * 100) / 100;
      const final = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '').replace(/(\.\d)$/, '$10');
      setLocal(final);
      onCommit(final);
    } else {
      setLocal('');
      onCommit('');
    }
  };

  const step = (dir) => {
    const current = parseFloat(local) || 0;
    const next = Math.min(10, Math.max(1, Math.round((current + dir * 0.5) * 2) / 2));
    const final = next % 1 === 0 ? String(next) : next.toFixed(1);
    setLocal(final);
    onCommit(final);
  };

  // En primer ciclo: si hay valor y no está en foco, mostrar abreviatura
  const mostrarAbrev = primerCiclo && !focused && local !== '';

  return (
    <div className="flex flex-col items-center" title={title}>
      <button type="button"
        onMouseDown={e => { e.preventDefault(); step(1); }}
        className="w-[44px] h-[16px] flex items-center justify-center text-[9px] text-gray-400 hover:text-purple-700 hover:bg-purple-100 select-none transition-colors"
        style={{ background: '#f3f0ff', border: '1px solid #ddd6fe', borderBottom: 'none', borderRadius: '4px 4px 0 0' }}
      >▲</button>
      {mostrarAbrev ? (
        <div
          onClick={() => setFocused(true)}
          className="nota-input flex items-center justify-center font-black cursor-text"
          style={{ borderRadius: 0, borderTop: '1px solid #ddd6fe', borderBottom: '1px solid #ddd6fe', fontSize: '9px', color: colorNota(local)?.text || '#6d28d9', backgroundColor: colorNota(local)?.bg || '#f5f3ff' }}
        >
          {abrevConceptual(local)}
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text" inputMode="decimal" className="nota-input"
          style={{ borderRadius: 0, borderTop: '1px solid #ddd6fe', borderBottom: '1px solid #ddd6fe', backgroundColor: local ? (colorNota(local)?.bg || '') : '', color: local ? (colorNota(local)?.text || '#374151') : '#374151' }}
          value={local} onChange={handleChange} onBlur={handleBlur} onFocus={() => setFocused(true)} />
      )}
      <button type="button"
        onMouseDown={e => { e.preventDefault(); step(-1); }}
        className="w-[44px] h-[16px] flex items-center justify-center text-[9px] text-gray-400 hover:text-purple-700 hover:bg-purple-100 select-none transition-colors"
        style={{ background: '#f3f0ff', border: '1px solid #ddd6fe', borderTop: 'none', borderRadius: '0 0 4px 4px' }}
      >▼</button>
    </div>
  );
}

// ─── TOAST DE FEEDBACK ───────────────────────────────────────────────────────
function Toast({ visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 bg-green-500 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm toast-visible">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L7 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Guardado en la nube ☁️
    </div>
  );
}

// ─── GENERADOR DE PDF ────────────────────────────────────────────────────────
function generarPDF({ materia, grado, estActuales, criteriosPorBimestre, usuario }) {
  try {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const hoy = new Date().toLocaleDateString('es-AR');
  const nombreDocente = usuario?.rol === 'administrador' ? 'Raquel Noemí Maciszonek' : (usuario?.nombre || '—');
  const primerCiclo = esPrimerCiclo(grado);

  // Header violeta
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Escuela Provincial N° 185 — "Juan Areco"', pageW / 2, 10, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Asignatura: ${materia.nombre}   |   Grado: ${gradoLabel(grado)}   |   Docente: ${nombreDocente}`, pageW / 2, 18, { align: 'center' });
  doc.text(`Fecha de emisión: ${hoy}`, pageW / 2, 24, { align: 'center' });

  // Cabecera de tabla
  const head = [['Apellido y Nombres', '1° Bimestre', '2° Bimestre', '1° Cuatrim.', '3° Bimestre', '4° Bimestre', '2° Cuatrim.', 'Prom. Final']];

  const body = estActuales.map(e => {
    const b1 = e.bimestres?.[1]?.nota || '';
    const b2 = e.bimestres?.[2]?.nota || '';
    const b3 = e.bimestres?.[3]?.nota || '';
    const b4 = e.bimestres?.[4]?.nota || '';
    const c1raw = calcularCuatrimestre(b1, b2);
    const c2raw = calcularCuatrimestre(b3, b4);
    const pfraw = calcularPromedioFinal(b1, b2, b3, b4);
    // Si no hay promedio final, mostrar el último bimestre disponible
    const pfMostrar = pfraw || b4 || b3 || b2 || b1;
    const fmt = (v) => v ? (primerCiclo ? textoConceptual(v) : v) : '—';
    return [e.nombre, fmt(b1), fmt(b2), fmt(c1raw), fmt(b3), fmt(b4), fmt(c2raw), fmt(pfMostrar)];
  });

  autoTable(doc, {
    startY: 32,
    head,
    body,
    styles: { font: 'helvetica', fontSize: primerCiclo ? 8 : 11, cellPadding: 3, halign: 'center', lineColor: [200, 200, 200], lineWidth: 0.2 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 55 },
      3: { fillColor: [237, 233, 254] },
      6: { fillColor: [237, 233, 254] },
      7: { fillColor: [199, 210, 254], fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.3,
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7 && !primerCiclo) {
        const val = parseFloat(data.cell.raw);
        if (!isNaN(val)) {
          data.cell.styles.textColor = val >= 7 ? [22, 163, 74] : val >= 4 ? [180, 83, 9] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // Criterios al pie — agrupados por bimestre
  const bimestresConCrits = [1,2,3,4].filter(b => (criteriosPorBimestre[b]||[]).length > 0);
  const finalY = doc.lastAutoTable.finalY + 8;
  let currentY = finalY;
  if (bimestresConCrits.length > 0) {
    doc.setFontSize(7); doc.setTextColor(130,130,130);
    bimestresConCrits.forEach(b => {
      const critsB = criteriosPorBimestre[b].join(', ');
      const texto = `Criterios de evaluación considerados en el ${b}° Bimestre: ${critsB}`;
      doc.text(texto, 14, currentY, { maxWidth: pageW - 28 });
      currentY += 5;
    });
    currentY += 3;
  }

  // Tabla de escala conceptual al pie (solo primer ciclo)
  if (primerCiclo) {
    doc.setFontSize(7); doc.setTextColor(100, 50, 200);
    doc.setFont('helvetica', 'bold');
    doc.text('Escala de calificaciones conceptuales:', 14, currentY);
    currentY += 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80,80,80);
    const escalaTexto = escalaConceptual.map(e => `${e.abrev} = ${e.texto} (${e.min === e.max ? e.min : `${e.min}-${e.max}`})`).join('   ·   ');
    doc.text(escalaTexto, 14, currentY, { maxWidth: pageW - 28 });
    currentY += 8;
  }

  // Firma — abajo a la derecha, línea alineada con nombre
  const firmaY = currentY;
  const esDocGrado = usuario?.rol === 'docente_grado';
  const lineaRol = esDocGrado ? `Docente ${gradoLabel(grado)}` : `Prof. ${materia.nombre}`;
  const firmaX = pageW - 75;
  const anchoLinea = 65;
  doc.setTextColor(60,60,60); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.line(firmaX, firmaY + 4, firmaX + anchoLinea, firmaY + 4);
  doc.text(nombreDocente, firmaX + anchoLinea / 2, firmaY + 9, { align: 'center' });
  doc.text(lineaRol, firmaX + anchoLinea / 2, firmaY + 14, { align: 'center' });
  doc.text(hoy, firmaX + anchoLinea / 2, firmaY + 19, { align: 'center' });

  doc.save(`Calificaciones_${materia.nombre.replace(/[^\w]/g,'_')}_${grado}_${hoy.replace(/\//g,'-')}.pdf`);
    return true;
  } catch(err) {
    console.error('Error generando PDF:', err);
    return false;
  }
}

// ─── PDF UNIFICADO ───────────────────────────────────────────────────────────
async function generarPDFUnificado({ usuario, alumnosGlobales, db, todosUsuarios, includeTalleres = false }) {
  const doc_ref = doc;
  try {
    const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdfDoc.internal.pageSize.getWidth();
    const hoy = new Date().toLocaleDateString('es-AR');
    const esAdmin = usuario?.rol === 'administrador';
    const nombreDocente = usuario?.nombre || '—';
    const gradosDocente = esAdmin
      ? Object.keys(alumnosGlobales).filter(g => (alumnosGlobales[g] || []).length > 0).sort()
      : usuario?.gradosAsignados?.length > 0
        ? usuario.gradosAsignados
        : [usuario?.gradoAsignado].filter(Boolean);

    const abreviarMateria = (nombre) => {
      const abrevs = {
        'Lengua y Literatura': 'Lengua y Lit.',
        'Ciencias Sociales': 'Cs. Sociales',
        'Ciencias Naturales': 'Cs. Naturales',
        'Formación Ética y Ciudadana': 'Form. Ética',
        'Educación Artística: Plástica': 'Art.: Plástica',
        'Educación Artística: Música': 'Art.: Música',
        'Educación Física': 'Ed. Física',
        'Lengua Extranjera: Inglés': 'Inglés',
        'Lengua Extranjera: Portugués': 'Portugués',
        'Taller de Ajedrez': 'T. Ajedrez',
        'Taller de Música': 'T. Música',
        'Taller de Plástica': 'T. Plástica',
        'Taller de Danza': 'T. Danza',
        'Convivencia': 'Convivencia',
      };
      return abrevs[nombre] || nombre;
    };

    // Obtener materias que el docente tiene asignadas para un grado
    const getMateriasDocente = (grado) => {
      if (esAdmin) return [...areas.curriculares, ...areas.especiales, ...areas.talleres, ...areas.convivencia];
      // Para docente de grado: todas las curriculares + convivencia
      return [...areas.curriculares, ...areas.convivencia];
    };

    const encabezado = (titulo, grado) => {
      pdfDoc.setFillColor(124, 58, 237);
      pdfDoc.rect(0, 0, pageW, 28, 'F');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFontSize(13); pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Escuela Provincial N° 185 — "Juan Areco"', pageW / 2, 10, { align: 'center' });
      pdfDoc.setFontSize(9.5); pdfDoc.setFont('helvetica', 'normal');
      const linea2 = esAdmin
        ? `${titulo}   |   Grado: ${gradoLabel(grado)}   |   Dirección`
        : `${titulo}   |   Grado: ${gradoLabel(grado)}   |   Docente: ${nombreDocente}`;
      pdfDoc.text(linea2, pageW / 2, 18, { align: 'center' });
      pdfDoc.text(`Fecha de emisión: ${hoy}`, pageW / 2, 24, { align: 'center' });
    };

    const agregarFirma = (finalY, grado) => {
      if (esAdmin) return; // Admin: sin firma
      const firmaX = pageW - 75;
      pdfDoc.setTextColor(60,60,60); pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.line(firmaX, finalY + 4, firmaX + 65, finalY + 4);
      pdfDoc.text(nombreDocente, firmaX + 32, finalY + 9, { align: 'center' });
      pdfDoc.text(`Docente de Grado ${gradoLabel(grado)}`, firmaX + 32, finalY + 14, { align: 'center' });
      pdfDoc.text(hoy, firmaX + 32, finalY + 19, { align: 'center' });
    };

    let primerPagina = true;

    for (const grado of gradosDocente) {
      const alumnosDelGrado = alumnosGlobales[grado] || [];
      if (alumnosDelGrado.length === 0) continue;
      const primerCiclo = esPrimerCiclo(grado);

      const alumnosOrdenados = [...alumnosDelGrado].sort((a, b) => {
        if ((a.sexo||'V') !== (b.sexo||'V')) return (a.sexo||'V') === 'V' ? -1 : 1;
        return a.nombre.localeCompare(b.nombre, 'es');
      });

      const buildBody = (datos) => alumnosOrdenados.map((al, idx) => {
        const row = [String(idx + 1), al.nombre];
        datos.forEach(({ estudiantes }) => {
          const est = estudiantes.find(e => e.dni === al.dni);
          const b1 = est?.bimestres?.[1]?.nota || '';
          const b2 = est?.bimestres?.[2]?.nota || '';
          const b3 = est?.bimestres?.[3]?.nota || '';
          const b4 = est?.bimestres?.[4]?.nota || '';
          const pf = calcularPromedioFinal(b1, b2, b3, b4);
          const notaMostrar = pf || b4 || b3 || b2 || b1;
          row.push(notaMostrar ? (primerCiclo ? textoConceptual(notaMostrar) : notaMostrar) : '—');
        });
        return row;
      });

      // ── Página 1: Áreas Curriculares (+ Convivencia) ──
      const curriculares = getMateriasDocente(grado).filter(m =>
        [...areas.curriculares, ...areas.convivencia].some(a => a.nombre === m.nombre)
      );
      const snapsCurr = await Promise.all(
        curriculares.map(m => getDoc(doc_ref(db, 'calificaciones', safeKey(`${m.nombre}_${grado}`))))
      );
      const datosCurr = curriculares.map((m, i) => ({
        nombre: m.nombre,
        estudiantes: snapsCurr[i].exists() ? (snapsCurr[i].data().estudiantes || []) : []
      }));

      if (!primerPagina) pdfDoc.addPage();
      primerPagina = false;
      encabezado('Áreas Curriculares — Promedios Finales', grado);
      const headCurr = [['#', 'Alumno/a', ...curriculares.map(m => abreviarMateria(m.nombre))]];
      autoTable(pdfDoc, {
        startY: 32, head: headCurr, body: buildBody(datosCurr),
        styles: { font: 'helvetica', fontSize: primerCiclo ? 6.5 : 9, cellPadding: 2.5, halign: 'center', lineColor: [200,200,200], lineWidth: 0.2 },
        headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 8 }, 1: { halign: 'left', cellWidth: primerCiclo ? 42 : 52 } },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
      });
      agregarFirma(pdfDoc.lastAutoTable.finalY + 10, grado);

      // ── Página 2: Áreas Especiales ──
      const especiales = areas.especiales;
      const snapsEsp = await Promise.all(
        especiales.map(m => getDoc(doc_ref(db, 'calificaciones', safeKey(`${m.nombre}_${grado}`))))
      );
      const datosEsp = especiales.map((m, i) => ({
        nombre: m.nombre,
        estudiantes: snapsEsp[i].exists() ? (snapsEsp[i].data().estudiantes || []) : []
      }));

      pdfDoc.addPage();
      encabezado('Áreas Especiales — Promedios Finales', grado);
      const headEsp = [['#', 'Alumno/a', ...datosEsp.map(d => abreviarMateria(d.nombre))]];
      autoTable(pdfDoc, {
        startY: 32, head: headEsp, body: buildBody(datosEsp),
        styles: { font: 'helvetica', fontSize: primerCiclo ? 6 : 8, cellPadding: primerCiclo ? 2 : 3, halign: 'center', lineColor: [200,200,200], lineWidth: 0.2 },
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold', minCellHeight: 14, fontSize: primerCiclo ? 6 : 7 },
        columnStyles: { 0: { cellWidth: 8 }, 1: { halign: 'left', cellWidth: primerCiclo ? 42 : 52 } },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
      });
      agregarFirma(pdfDoc.lastAutoTable.finalY + 10, grado);

      // ── Página 3: Talleres (solo si includeTalleres) ──
      if (includeTalleres) {
        const talleres = areas.talleres;
        const snapsTall = await Promise.all(
          talleres.map(m => getDoc(doc_ref(db, 'calificaciones', safeKey(`${m.nombre}_${grado}`))))
        );
        const datosTall = talleres.map((m, i) => ({
          nombre: m.nombre,
          estudiantes: snapsTall[i].exists() ? (snapsTall[i].data().estudiantes || []) : []
        }));
        pdfDoc.addPage();
        encabezado('Talleres — Promedios Finales', grado);
        const headTall = [['#', 'Alumno/a', ...datosTall.map(d => abreviarMateria(d.nombre))]];
        autoTable(pdfDoc, {
          startY: 32, head: headTall, body: buildBody(datosTall),
          styles: { font: 'helvetica', fontSize: primerCiclo ? 6 : 8, cellPadding: primerCiclo ? 2 : 3, halign: 'center', lineColor: [200,200,200], lineWidth: 0.2 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', minCellHeight: 14, fontSize: primerCiclo ? 6 : 7 },
          columnStyles: { 0: { cellWidth: 8 }, 1: { halign: 'left', cellWidth: primerCiclo ? 42 : 52 } },
          alternateRowStyles: { fillColor: [236, 253, 245] },
          tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
        });
        agregarFirma(pdfDoc.lastAutoTable.finalY + 10, grado);
      }

      if (gradosDocente.indexOf(grado) < gradosDocente.length - 1) pdfDoc.addPage();
    }

    const nombreArchivo = esAdmin
      ? `PDF_Unificado_Direccion_${hoy.replace(/\//g,'-')}.pdf`
      : `PDF_Unificado_${nombreDocente.replace(/[^\w]/g,'_')}_${hoy.replace(/\//g,'-')}.pdf`;
    pdfDoc.save(nombreArchivo);
    return true;
  } catch(err) {
    console.error('Error PDF unificado:', err);
    return false;
  }
}

// COMPONENTE: Chip de criterio con renombrado inline
// ════════════════════════════════════════════════════════
function CriterioChip({ nombre, bloqueado, onEliminar, onRenombrar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nombre);
  const inputRef = useRef(null);

  useEffect(() => { if (editando) inputRef.current?.focus(); }, [editando]);
  useEffect(() => { setTexto(nombre); }, [nombre]);

  const confirmar = () => {
    setEditando(false);
    onRenombrar(texto);
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bloqueado ? '#f8fafc' : '#fff', border: '1.5px solid', borderColor: 'var(--border)', borderRadius: 6, padding: '3px 8px' }}>
      {editando ? (
        <input ref={inputRef} type="text" value={texto}
          onChange={e => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setTexto(nombre); setEditando(false); } }}
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', background: '#fff', border: '1px solid var(--indigo)', borderRadius: 4, padding: '0 4px', outline: 'none', width: 100, fontFamily: 'Inter,sans-serif' }} />
      ) : (
        <span style={{ fontSize: 11, fontWeight: 600, color: bloqueado ? 'var(--muted)' : 'var(--text)' }}>{nombre}</span>
      )}
      {!bloqueado && !editando && (
        <button onClick={() => setEditando(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', marginLeft: 2 }} title="Renombrar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      )}
      {!bloqueado && (
        <button onClick={onEliminar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', display: 'flex' }}><X size={11} /></button>
      )}
    </div>
  );
}

function DocenteACargo({ materia, grado, todosUsuarios }) {
  const docente = todosUsuarios.find(u =>
    (u.rol === 'docente_grado' && (u.gradosAsignados?.includes(grado) || u.gradoAsignado === grado)) ||
    (u.rol === 'area_especial' && u.materiasAsignadas?.some(ma => ma.nombre === materia?.nombre && ma.grados?.includes(grado)))
  );
  if (!docente) return null;
  return (
    <div className="inline-flex items-center gap-2 bg-purple-50 border-2 border-purple-100 px-4 py-2 rounded-xl">
      <span className="text-purple-600">👤</span>
      <span className="text-sm font-bold text-gray-800">Docente a cargo: <span className="text-purple-700">{docente.nombre}</span></span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function SistemaCalificaciones() {
  const { modal, showAlert, showConfirm, showConfirmYesNo, showPrompt, closeModal } = useModal();

  const [pantalla, setPantalla] = useState('cargando');
  const [usuario, setUsuario] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [materia, setMateria] = useState(null);
  const [grado, setGrado] = useState('1°A');
  const [estudiantes, setEstudiantes] = useState({});
  const [alumnosGlobales, setAlumnosGlobales] = useState({});
  const [criteriosPorBimestre, setCriteriosPorBimestre] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [docenteNombre, setDocenteNombre] = useState({ actual: '', guardado: '' });
  const [bimestresBlockeados, setBimestresBlockeados] = useState({ 1: false, 2: false, 3: false, 4: false });
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);
  const [pdfGenerando, setPdfGenerando] = useState(false);
  const [pdfUnificadoGenerando, setPdfUnificadoGenerando] = useState(false);
  const [showEscala, setShowEscala] = useState(false);

  // Login con email real
  const [loginForm, setLoginForm] = useState({ email: '', pass: '', verPass: false, recordarme: false });
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [recuperarEmail, setRecuperarEmail] = useState('');
  const [recuperarCargando, setRecuperarCargando] = useState(false);
  const [loginCargando, setLoginCargando] = useState(false);

  // Cargar email guardado si el usuario lo había marcado
  useEffect(() => {
    const emailGuardado = localStorage.getItem('recordar-email');
    if (emailGuardado) setLoginForm(prev => ({ ...prev, email: emailGuardado, recordarme: true }));
  }, []);

  // Registro con email real
  const [registro, setRegistro] = useState({
    show: false,
    data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] }
  });
  const [registroCargando, setRegistroCargando] = useState(false);

  const [solicitudes, setSolicitudes] = useState([]);
  const [showModalSolicitudes, setShowModalSolicitudes] = useState(false);
  const [alumnoForm, setAlumnoForm] = useState({ nombre: '', dni: '', sexo: 'V', editando: null });
  const [busquedaDNI, setBusquedaDNI] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [modalCerrarSesion, setModalCerrarSesion] = useState(false);
  const [bajas, setBajas] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [showModalMensajes, setShowModalMensajes] = useState(false);
  const [showPerfil, setShowPerfil] = useState(false);
  const [showFechasBimestre, setShowFechasBimestre] = useState(false);
  const [menuAcciones, setMenuAcciones] = useState(false);
  const [showRegistroMods, setShowRegistroMods] = useState(false);
  const [showInasistencias, setShowInasistencias] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const [inasistenciasNoVistas, setInasistenciasNoVistas] = useState(0);
  const [showAvisos, setShowAvisos] = useState(false);
  const [docenteEditando, setDocenteEditando] = useState(null);
  const [docenteEntregas, setDocenteEntregas] = useState(null);
  const [docenteActividad, setDocenteActividad] = useState(null);
  const [notifsBimestre, setNotifsBimestre] = useState([]);
  const [showNotifsBimestre, setShowNotifsBimestre] = useState(false);

  useEffect(() => {
    if (!authUser || !usuario || usuario.rol === 'administrador') return;
    const unsub = onSnapshot(collection(db, 'avisos'), snap => {
      setAvisos(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    });
    return () => unsub();
  }, [authUser?.uid, usuario?.rol]);

  // Inasistencias no vistas — solo admin
  useEffect(() => {
    if (!authUser || !usuario || usuario.rol !== 'administrador') return;
    const unsub = onSnapshot(
      query(collection(db, 'inasistencias'), where('visto', '==', false)),
      snap => setInasistenciasNoVistas(snap.size)
    );
    return () => unsub();
  }, [authUser?.uid, usuario?.rol]);

  // Limpiar búsqueda al cambiar de grado
  useEffect(() => {
    setBusquedaDNI('');
    setResultadoBusqueda(null);
  }, [grado]);

  const inactividadTimeout = useRef(null);

  const cerrarSesion = useCallback(async () => {
    await signOut(auth);
    setUsuario(null); setAuthUser(null); setPantalla('login'); setModalCerrarSesion(false);
    if (inactividadTimeout.current) clearTimeout(inactividadTimeout.current);
    // Limpiar contraseña al cerrar sesión; mantener email solo si recordarme está guardado
    const emailGuardado = localStorage.getItem('recordar-email');
    setLoginForm({ email: emailGuardado || '', pass: '', verPass: false, recordarme: !!emailGuardado });
  }, []);

  const resetInactividad = useCallback(() => {
    if (inactividadTimeout.current) clearTimeout(inactividadTimeout.current);
    inactividadTimeout.current = setTimeout(cerrarSesion, 10 * 60 * 1000);
  }, [cerrarSesion]);

  // ── Auth state ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setAuthUser(firebaseUser);
        const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
        if (snap.exists()) {
          setUsuario(snap.data());
          setPantalla('inicio');
          resetInactividad();
        } else {
          await signOut(auth);
          setPantalla('login');
        }
      } else {
        setAuthUser(null); setUsuario(null); setPantalla('login');
      }
    });
    const eventos = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    eventos.forEach(e => window.addEventListener(e, resetInactividad));
    return () => {
      unsub();
      eventos.forEach(e => window.removeEventListener(e, resetInactividad));
      if (inactividadTimeout.current) clearTimeout(inactividadTimeout.current);
    };
  }, [resetInactividad]);

  // ── Solicitudes pendientes ──
  const [todosUsuarios, setTodosUsuarios] = useState([]);

  useEffect(() => {
    if (!authUser || !usuario) return;
    // Admin: carga solicitudes y todos los usuarios
    // Docentes: solo carga lista de usuarios activos (para ver docente a cargo en especiales)
    const unsub = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
      const activos = lista.filter(u => u.activo !== false && u.rol !== 'administrador');
      setTodosUsuarios(activos);
      if (usuario.rol === 'administrador') {
        setSolicitudes(lista.filter(u => u.activo === false));
      }
    });
    return () => unsub();
  }, [authUser?.uid, usuario?.rol]);

  // ── Alumnos globales ──
  useEffect(() => {
    if (!authUser) return;
    const unsub = onSnapshot(doc(db, 'datos', 'alumnosGlobales'), (snap) => {
      setAlumnosGlobales(snap.exists() ? snap.data() : {});
    });
    return () => unsub();
  }, [authUser]);

  // ── Bajas ──
  useEffect(() => {
    if (!authUser) return;
    const unsub = onSnapshot(doc(db, 'datos', 'bajas'), (snap) => {
      setBajas(snap.exists() ? (snap.data().lista || []) : []);
    });
    return () => unsub();
  }, [authUser]);

  // ── Notificaciones de bimestres completados (solo admin) ──
  useEffect(() => {
    if (!authUser || !usuario || usuario.rol !== 'administrador') return;
    const unsub = onSnapshot(collection(db, 'notificacionesBimestre'), snap => {
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifsBimestre(todas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    });
    return () => unsub();
  }, [authUser?.uid, usuario?.rol]);
  useEffect(() => {
    if (!authUser || !usuario) return;
    const unsub = onSnapshot(collection(db, 'mensajes'), (snap) => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (usuario.rol === 'administrador') {
        setMensajes(todos);
      } else {
        setMensajes(todos.filter(m => m.destinatarioUid === authUser.uid || m.destinatarioUid === 'todos'));
      }
    });
    return () => unsub();
  }, [authUser?.uid, usuario?.rol]);

  // ── Calificaciones ──
  useEffect(() => {
    if (!authUser || !materia) return;
    const key = safeKey(`${materia.nombre}_${grado}`);
    // Inicializar como undefined para que el sync espere los datos reales
    setEstudiantes(prev => ({ ...prev, [`${materia.nombre}-${grado}`]: undefined }));
    const unsub = onSnapshot(doc(db, 'calificaciones', key), (snap) => {
      const data = snap.exists() ? snap.data() : { estudiantes: [] };
      setEstudiantes(prev => ({ ...prev, [`${materia.nombre}-${grado}`]: data.estudiantes || [] }));
    });
    return () => unsub();
  }, [authUser, materia, grado]);

  // ── Sincronizar alumnos ──
  useEffect(() => {
    if (!materia || !alumnosGlobales[grado]) return;
    const key = `${materia.nombre}-${grado}`;
    const alumnosDelGrado = alumnosGlobales[grado] || [];
    const estudiantesActuales = estudiantes[key];
    // Si aún no cargaron los datos de Firestore, no sincronizar
    if (estudiantesActuales === undefined) return;
    const estudiantesActualizados = alumnosDelGrado.map(alumno => {
      const existente = estudiantesActuales.find(e => e.dni === alumno.dni);
      if (existente) return asegurarEstructuraEstudiante(existente);
      return {
        id: `${alumno.dni}_${Date.now()}`, nombre: alumno.nombre, dni: alumno.dni,
        bimestres: {
          1: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'', observacion:'' },
          2: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'', observacion:'' },
          3: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'', observacion:'' },
          4: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'', observacion:'' },
        }
      };
    });
    if (JSON.stringify(estudiantesActuales) !== JSON.stringify(estudiantesActualizados)) {
      setDoc(doc(db, 'calificaciones', safeKey(`${materia.nombre}_${grado}`)), { estudiantes: estudiantesActualizados }, { merge: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grado, materia, alumnosGlobales, estudiantes]);

  // ── Cargar configuración (criterios, candados, docente) — siempre que cambie materia o grado ──
  useEffect(() => {
    if (!materia) return;
    let cancelado = false;
    const cargarConfig = async () => {
      // Limpiar inmediatamente para que no queden criterios de la materia anterior
      setCriteriosPorBimestre({ 1: [], 2: [], 3: [], 4: [] });
      setBimestresBlockeados({ 1: false, 2: false, 3: false, 4: false });
      setDocenteNombre({ actual: '', guardado: '' });
      const snap = await getDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)));
      if (cancelado) return; // navegó a otra materia antes de que resolviera
      if (snap.exists()) {
        const d = snap.data();
        setDocenteNombre({ actual: '', guardado: d.docente || '' });
        setCriteriosPorBimestre(d.criterios || { 1: [], 2: [], 3: [], 4: [] });
        setBimestresBlockeados(d.bimestresBlockeados || { 1: false, 2: false, 3: false, 4: false });
      }
      // Bloqueo automático si pasó 07/08/2026
      if (authUser && usuario?.rol !== 'administrador') {
        const ahora = new Date();
        const LIMITE = new Date('2026-08-07T23:59:59');
        if (ahora > LIMITE) {
          const currentSnap = await getDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)));
          const currentData = currentSnap.exists() ? currentSnap.data() : {};
          const bloq = currentData.bimestresBlockeados || { 1: false, 2: false, 3: false, 4: false };
          if (!bloq[1] || !bloq[2]) {
            const nuevoBloq = { ...bloq, 1: true, 2: true };
            await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { bimestresBlockeados: nuevoBloq }, { merge: true });
            if (!cancelado) setBimestresBlockeados(nuevoBloq);
          }
        }
      }
    };
    cargarConfig();
    return () => { cancelado = true; };
  }, [grado, materia]);

  // ════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════

  const handleLogin = async () => {
    if (!loginForm.email.trim() || !loginForm.pass.trim()) {
      await showAlert('Ingresá tu correo y contraseña.', 'warning'); return;
    }
    setLoginCargando(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, loginForm.email.trim(), loginForm.pass);
      const userDoc = await getDoc(doc(db, 'usuarios', userCred.user.uid));
      const userData = userDoc.data();
      if (!userData.activo && userData.rol !== 'administrador') {
        await signOut(auth);
        await showAlert('Tu cuenta aún no fue aprobada por el Administrador.', 'info', 'Cuenta pendiente');
        return;
      }
      // Guardar o limpiar email según "recordarme"
      if (loginForm.recordarme) {
        localStorage.setItem('recordar-email', loginForm.email.trim());
      } else {
        localStorage.removeItem('recordar-email');
      }
      // No resetear el form aquí — Firebase Auth dispara onAuthStateChanged que cambia la pantalla
    } catch {
      await showAlert('Correo o contraseña incorrectos.', 'error', 'Acceso denegado');
    } finally {
      setLoginCargando(false);
    }
  };

  const handleRegistro = async () => {
    const d = registro.data;
    if (!d.nombre.trim() || !d.email.trim() || !d.password.trim()) {
      await showAlert('Completá todos los campos.', 'warning'); return;
    }
    if (!d.email.includes('@')) {
      await showAlert('Ingresá un correo electrónico válido.', 'warning'); return;
    }
    if (d.password.length < 6) {
      await showAlert('La contraseña debe tener al menos 6 caracteres.', 'warning'); return;
    }
    // ── Validación de grado/materia obligatoria ──
    if (d.rol === 'docente_grado') {
      const gradosElegidos = d.gradosAsignados?.length > 0 ? d.gradosAsignados : [d.gradoAsignado].filter(Boolean);
      if (gradosElegidos.length === 0) {
        await showAlert('Debés seleccionar al menos un grado antes de registrarte.', 'warning', '⚠️ Grado requerido'); return;
      }
      if (!d.materiasAsignadas || d.materiasAsignadas.length === 0) {
        await showAlert('Debés seleccionar al menos una materia antes de registrarte.', 'warning', '⚠️ Materia requerida'); return;
      }
    }
    if (d.rol === 'area_especial') {
      if (!d.materiasAsignadas || d.materiasAsignadas.length === 0) {
        await showAlert('Debés seleccionar al menos una materia antes de registrarte.', 'warning', '⚠️ Materia requerida'); return;
      }
      const tieneGrados = d.materiasAsignadas.some(ma => ma.grados && ma.grados.length > 0);
      if (!tieneGrados) {
        await showAlert('Debés asignar al menos un grado a alguna de tus materias antes de registrarte.', 'warning', '⚠️ Grado requerido'); return;
      }
    }
    // ── Validación de duplicados (solo si hay sesión activa) ──
    if (auth.currentUser) {
      try {
        const snaps = await getDocs(collection(db, 'usuarios'));
        const todosUsuarios = snaps.docs.map(snap => snap.data());

        if (d.rol === 'docente_grado') {
          const gradosElegidos = d.gradosAsignados?.length > 0 ? d.gradosAsignados : [d.gradoAsignado].filter(Boolean);
          if (gradosElegidos.length === 0) {
            await showAlert('Seleccioná al menos un grado.', 'warning'); return;
          }
          for (const g of gradosElegidos) {
            const gradoOcupado = todosUsuarios.find(u =>
              u.rol === 'docente_grado' &&
              (u.gradosAsignados?.includes(g) || u.gradoAsignado === g)
            );
            if (gradoOcupado) {
              await showAlert(
                `Atención: Ya existe una docente de grado asignada a ${gradoLabel(g)} (${gradoOcupado.nombre}). Por favor, verificá tus datos o consultá en Dirección.`,
                'warning', '⚠️ Grado ya asignado'
              );
              return;
            }
          }
        } else if (d.rol === 'area_especial') {
          for (const ma of d.materiasAsignadas) {
            if (!ma.grados || ma.grados.length === 0) continue;
            const conflicto = todosUsuarios.find(u =>
              u.rol === 'area_especial' &&
              u.materiasAsignadas?.some(um =>
                um.nombre === ma.nombre && um.grados?.some(g => ma.grados.includes(g))
              )
            );
            if (conflicto) {
              const gradosConflicto = (conflicto.materiasAsignadas?.find(um => um.nombre === ma.nombre)?.grados || [])
                .filter(g => ma.grados.includes(g));
              await showAlert(
                `Atención: Ya existe un/a docente a cargo de "${ma.nombre}" en ${gradosConflicto.map(gradoLabel).join(', ')} (${conflicto.nombre}). Por favor, verificá tus datos o consultá en Dirección.`,
                'warning', '⚠️ Asignación duplicada'
              );
              return;
            }
          }
        }
      } catch (e) { console.warn('Validación duplicados falló:', e); }
    }

    setRegistroCargando(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, d.email.trim(), d.password);
      const gradosAsig = d.rol === 'docente_grado'
        ? (d.gradosAsignados?.length > 0 ? d.gradosAsignados : [d.gradoAsignado].filter(Boolean))
        : null;
      const perfil = {
        uid: cred.user.uid, nombre: d.nombre.trim(), email: d.email.trim(),
        rol: d.rol,
        gradoAsignado: gradosAsig ? gradosAsig[0] : null,
        gradosAsignados: gradosAsig,
        materiasAsignadas: d.materiasAsignadas, fechaCreacion: new Date().toISOString(), activo: false
      };
      await setDoc(doc(db, 'usuarios', cred.user.uid), perfil);
      await signOut(auth);
      setRegistro({ show: false, data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', gradosAsignados: [], materiasAsignadas: [] } });
      await showAlert('Registro enviado. Esperá a que el Administrador apruebe tu cuenta para poder ingresar.', 'success', '¡Recibido!');
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        await showAlert('Ya existe una cuenta con ese correo.', 'error', 'Correo duplicado');
      } else {
        await showAlert('Error al registrar: ' + err.message, 'error');
      }
    } finally {
      setRegistroCargando(false);
    }
  };

  const aprobarDocente = async (uid) => {
    try {
      await updateDoc(doc(db, 'usuarios', uid), { activo: true });
    } catch (error) { console.error('Error al aprobar:', error); }
  };

  const [volverAGestion, setVolverAGestion] = useState(false);
  const [origenGestion, setOrigenGestion] = useState({ tab: 'grado' });

  const abrirMateria = (m, gradoForzado = null) => {
    setMateria(m);
    const gradosAsig = getGradosParaMateria(m.nombre);
    setGrado(gradoForzado || gradosAsig[0] || '1°A');
    if (!gradoForzado) setVolverAGestion(false); // solo resetea si es navegación normal
    setPantalla('materia');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const agregarAlumno = async () => {
    if (!alumnoForm.nombre.trim() || !alumnoForm.dni.trim()) {
      await showAlert('Completá el nombre y el DNI del alumno.', 'warning'); return;
    }
    const gradoActual = usuario?.rol === 'docente_grado' ? (usuario.gradosAsignados?.[0] || usuario.gradoAsignado) : grado;
    const nuevos = { ...alumnosGlobales };
    if (!nuevos[gradoActual]) nuevos[gradoActual] = [];
    if (alumnoForm.editando) {
      const dniOriginal = alumnoForm.editando.dni;
      const nuevoNombre = alumnoForm.nombre.trim();
      const nuevoDni = alumnoForm.dni.trim();
      const nuevoSexo = alumnoForm.sexo || 'V';

      // 1. Actualizar en alumnosGlobales
      const idx = nuevos[gradoActual].findIndex(a => a.dni === dniOriginal);
      if (idx !== -1) nuevos[gradoActual][idx] = { nombre: nuevoNombre, dni: nuevoDni, sexo: nuevoSexo };
      await setDoc(doc(db, 'datos', 'alumnosGlobales'), nuevos);

      // 2. Propagar cambio de nombre/dni a todas las calificaciones del grado
      const todasMaterias = [...areas.curriculares, ...areas.convivencia, ...areas.especiales, ...areas.talleres];
      await Promise.all(todasMaterias.map(async (m) => {
        const key = safeKey(`${m.nombre}_${gradoActual}`);
        const snap = await getDoc(doc(db, 'calificaciones', key));
        if (!snap.exists()) return;
        const data = snap.data();
        const estudiantes = data.estudiantes || [];
        const idxEst = estudiantes.findIndex(e => e.dni === dniOriginal);
        if (idxEst === -1) return;
        const nuevosEst = [...estudiantes];
        nuevosEst[idxEst] = { ...nuevosEst[idxEst], nombre: nuevoNombre, dni: nuevoDni, sexo: nuevoSexo };
        await setDoc(doc(db, 'calificaciones', key), { ...data, estudiantes: nuevosEst });
      }));

    } else {
      if (nuevos[gradoActual].some(a => a.dni === alumnoForm.dni.trim())) {
        await showAlert('Ya existe un alumno con ese DNI en este grado.', 'warning'); return;
      }
      nuevos[gradoActual].push({ nombre: alumnoForm.nombre.trim(), dni: alumnoForm.dni.trim(), sexo: alumnoForm.sexo || 'V' });
      await setDoc(doc(db, 'datos', 'alumnosGlobales'), nuevos);
    }
    setAlumnoForm({ nombre: '', dni: '', sexo: 'V', editando: null });
  };

  const eliminarAlumno = async (alumno) => {
    const gradoActual = usuario?.rol === 'docente_grado' ? (usuario.gradosAsignados?.[0] || usuario.gradoAsignado) : grado;
    const motivo = await showPrompt(
      `Ingresá el motivo de la baja de "${alumno.nombre}":`,
      'Ej: Cambio de escuela, Abandono, Expulsión...',
      '📋 Registrar baja'
    );
    if (motivo === null) return; // canceló
    const ok = await showConfirm(
      `¿Confirmás la baja de "${alumno.nombre}"? Sus calificaciones se eliminarán de TODAS las materias del grado.`,
      'Confirmar baja'
    );
    if (!ok) return;
    // Guardar registro de baja en Firestore
    const registroBaja = {
      nombre: alumno.nombre,
      dni: alumno.dni,
      grado: gradoActual,
      motivo: motivo.trim() || 'Sin especificar',
      fecha: new Date().toLocaleDateString('es-AR'),
      fechaISO: new Date().toISOString(),
    };
    const bajasSnap = await getDoc(doc(db, 'datos', 'bajas'));
    const bajasActuales = bajasSnap.exists() ? (bajasSnap.data().lista || []) : [];
    await setDoc(doc(db, 'datos', 'bajas'), { lista: [...bajasActuales, registroBaja] });
    // Eliminar de la lista activa
    await setDoc(doc(db, 'datos', 'alumnosGlobales'), {
      ...alumnosGlobales, [gradoActual]: (alumnosGlobales[gradoActual] || []).filter(a => a.dni !== alumno.dni)
    });
  };

  const eliminarRegistroBaja = async (baja) => {
    const ok = await showConfirm(`¿Eliminás el registro de baja de "${baja.nombre}"?`, 'Eliminar registro');
    if (!ok) return;
    const nuevaLista = bajas.filter(b => !(b.dni === baja.dni && b.fechaISO === baja.fechaISO));
    await setDoc(doc(db, 'datos', 'bajas'), { lista: nuevaLista });
  };

  const buscarAlumnoPorDNI = async () => {
    if (!busquedaDNI.trim()) return;
    const termino = busquedaDNI.trim().toLowerCase();
    let resultados = [];
    Object.entries(alumnosGlobales).forEach(([g, alumnos]) => {
      alumnos.forEach(alum => {
        if (alum.nombre.toLowerCase().includes(termino) || alum.dni.includes(termino)) {
          resultados.push({ ...alum, grado: g });
        }
      });
    });
    if (resultados.length > 0) {
      const asignaturas = [...areas.curriculares, ...areas.especiales, ...areas.talleres].map(m => m.nombre);
      setResultadoBusqueda({ ...resultados[0], asignaturas, totalEncontrados: resultados.length });
    } else {
      setResultadoBusqueda(null);
      await showAlert(`No se encontró ningún alumno con ese nombre o DNI.`, 'warning', 'Sin resultados');
    }
  };

  const showToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const actualizarCampo = (id, bimestre, campo, valor) => {
    if (bimestresBlockeados[bimestre]) return;
    const key = `${materia.nombre}-${grado}`;
    const fsKey = safeKey(`${materia.nombre}_${grado}`);
    setEstudiantes(prev => {
      const nuevos = { ...prev };
      const lista = (nuevos[key] || []).map(est => {
        if (est.id !== id) return est;
        const valorAnterior = est.bimestres?.[bimestre]?.[campo] || '';
        const nuevoBim = { ...est.bimestres[bimestre], [campo]: valor };
        if (campo.startsWith('n')) {
          const notas = ['n1','n2','n3','n4','n5'].map(k => parseFloat(nuevoBim[k])).filter(n => !isNaN(n) && n > 0);
          nuevoBim.nota = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : '';
        }
        // Registrar cambio si hay diferencia real
        if (valor !== valorAnterior && campo.startsWith('n') && (valor || valorAnterior)) {
          const criterioIdx = parseInt(campo.replace('n','')) - 1;
          const criterioNombre = criteriosPorBimestre[bimestre]?.[criterioIdx] || campo;
          setDoc(doc(collection(db, 'logs')), {
            docente: usuario?.nombre || '—',
            alumno: est.nombre,
            materia: materia.nombre,
            grado,
            bimestre,
            criterio: criterioNombre,
            antes: valorAnterior || '(vacío)',
            despues: valor || '(vacío)',
            fecha: new Date().toISOString(),
            fechaCorta: new Date().toLocaleDateString('es-AR'),
            hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          });
        }
        return { ...est, bimestres: { ...est.bimestres, [bimestre]: nuevoBim } };
      });
      nuevos[key] = lista;
      setDoc(doc(db, 'calificaciones', fsKey), { estudiantes: lista }, { merge: true })
        .then(() => showToast());
      return nuevos;
    });
  };

  const actualizarObservacion = (id, bimestre, texto) => {
    if (bimestresBlockeados[bimestre]) return;
    const key = `${materia.nombre}-${grado}`;
    const fsKey = safeKey(`${materia.nombre}_${grado}`);
    setEstudiantes(prev => {
      const nuevos = { ...prev };
      const lista = (nuevos[key] || []).map(est => {
        if (est.id !== id) return est;
        return { ...est, bimestres: { ...est.bimestres, [bimestre]: { ...est.bimestres[bimestre], observacion: texto } } };
      });
      nuevos[key] = lista;
      setDoc(doc(db, 'calificaciones', fsKey), { estudiantes: lista }, { merge: true })
        .then(() => showToast());
      return nuevos;
    });
  };

  // ── BLOQUEO AUTOMÁTICO 07/08/2026 23:59 ──
  const FECHA_LIMITE_CARGA = new Date('2026-08-07T23:59:59');
  const aplicarBloqueoAutomatico = React.useCallback(async (gradoActual, materiaActual) => {
    if (!authUser || usuario?.rol === 'administrador') return;
    const ahora = new Date();
    if (ahora <= FECHA_LIMITE_CARGA) return;
    // Pasó la fecha límite — bloquear bimestres 1 y 2 si no están bloqueados
    const ref2 = doc(db, 'bimestresBlockeados', `${authUser.uid}_${gradoActual}_${materiaActual}`);
    const snap = await getDoc(ref2);
    const data = snap.exists() ? snap.data() : {};
    const cambios = {};
    if (!data['1']) cambios['1'] = true;
    if (!data['2']) cambios['2'] = true;
    if (Object.keys(cambios).length > 0) {
      await setDoc(ref2, { ...data, ...cambios }, { merge: true });
    }
  }, [authUser, usuario, db]);

  const toggleBloquearBimestre = async (bim) => {
    const bloqueando = !bimestresBlockeados[bim];

    // Si está bloqueando (marcando completo), validar notas
    if (bloqueando) {
      const crits = criteriosPorBimestre[bim] || [];
      if (crits.length === 0) {
        await showAlert(`No podés marcar este bimestre como completo porque no hay criterios de evaluación cargados.`, 'warning', '⚠️ Sin criterios');
        return;
      }
      // Verificar que todos los alumnos tengan todos los criterios completados
      const alumnosSinNota = estActuales.filter(est => {
        return crits.some((_, ci) => {
          const campo = `n${ci + 1}`;
          const val = est.bimestres?.[bim]?.[campo];
          return !val || val === '';
        });
      });
      if (alumnosSinNota.length > 0) {
        await showAlert(
          `No podés marcar este bimestre como completo porque hay ${alumnosSinNota.length} alumno${alumnosSinNota.length > 1 ? 's' : ''} sin nota:\n\n${alumnosSinNota.slice(0, 5).map(a => `• ${a.nombre}`).join('\n')}${alumnosSinNota.length > 5 ? `\n• ...y ${alumnosSinNota.length - 5} más` : ''}`,
          'warning', '⚠️ Notas incompletas'
        );
        return;
      }
    }

    const nuevo = { ...bimestresBlockeados, [bim]: bloqueando };
    setBimestresBlockeados(nuevo);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { bimestresBlockeados: nuevo }, { merge: true });
    if (bloqueando) {
      const nombreDoc = usuario?.nombre || '—';
      await setDoc(doc(collection(db, 'notificacionesBimestre')), {
        mensaje: `✅ ${nombreDoc} marcó como completo el ${bim}° Bimestre de ${materia.nombre} · ${gradoLabel(grado)}`,
        docente: nombreDoc,
        materia: materia.nombre,
        grado: gradoLabel(grado),
        bimestre: bim,
        fecha: new Date().toISOString(),
        fechaCorta: new Date().toLocaleDateString('es-AR'),
        leida: false,
      });
    }
  };

  const agregarCriterio = async (bimestre) => {
    const c = await showPrompt(`Nombre del criterio para el ${bimestre}° Bimestre:`, 'Ej: Evaluación escrita, Concepto...', 'Nuevo criterio');
    if (!c?.trim()) return;
    if (c.trim().length > 25) {
      await showAlert(
        `El criterio "${c.trim()}" tiene ${c.trim().length} caracteres. El máximo es 25 para una visualización prolija.`,
        'warning', '⚠️ Criterio muy largo'
      );
      return;
    }
    const nuevos = { ...criteriosPorBimestre, [bimestre]: [...(criteriosPorBimestre[bimestre] || []), c.trim()] };
    setCriteriosPorBimestre(nuevos);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { criterios: nuevos }, { merge: true });
  };

  const renombrarCriterio = async (bimestre, indexCrit, nuevoNombre) => {
    if (!nuevoNombre.trim() || nuevoNombre.trim() === criteriosPorBimestre[bimestre][indexCrit]) return;
    const nuevos = { ...criteriosPorBimestre };
    nuevos[bimestre] = [...nuevos[bimestre]];
    nuevos[bimestre][indexCrit] = nuevoNombre.trim();
    setCriteriosPorBimestre(nuevos);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { criterios: nuevos }, { merge: true });
  };

  const eliminarCriterio = async (bimestre, c) => {
    const ok = await showConfirm(`¿Eliminás el criterio "${c}" del ${bimestre}° Bimestre?`, 'Eliminar criterio');
    if (!ok) return;
    const idxElim = criteriosPorBimestre[bimestre].indexOf(c);
    const nuevosCrit = { ...criteriosPorBimestre, [bimestre]: criteriosPorBimestre[bimestre].filter(x => x !== c) };
    setCriteriosPorBimestre(nuevosCrit);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { criterios: nuevosCrit }, { merge: true });
    // Limpiar la nota del criterio eliminado y reordenar las restantes en todos los estudiantes
    if (idxElim >= 0) {
      const key = `${materia.nombre}-${grado}`;
      const fsKey = safeKey(`${materia.nombre}_${grado}`);
      const campoElim = `n${idxElim + 1}`;
      const totalCrits = criteriosPorBimestre[bimestre].length; // antes de eliminar
      setEstudiantes(prev => {
        const nuevos = { ...prev };
        const lista = (nuevos[key] || []).map(est => {
          const bim = { ...est.bimestres[bimestre] };
          // Desplazar notas: eliminar la posición idxElim y compactar
          for (let i = idxElim; i < totalCrits - 1; i++) {
            bim[`n${i + 1}`] = bim[`n${i + 2}`] || '';
          }
          bim[`n${totalCrits}`] = ''; // limpiar la última
          // Recalcular promedio
          const notas = Array.from({ length: totalCrits - 1 }, (_, i) => parseFloat(bim[`n${i + 1}`])).filter(n => !isNaN(n) && n > 0);
          bim.nota = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : '';
          return { ...est, bimestres: { ...est.bimestres, [bimestre]: bim } };
        });
        nuevos[key] = lista;
        setDoc(doc(db, 'calificaciones', fsKey), { estudiantes: lista }, { merge: true });
        return nuevos;
      });
    }
  };

  const guardarDocente = async () => {
    if (!docenteNombre.actual.trim()) { await showAlert('Ingresá el nombre del docente antes de guardar.', 'warning'); return; }
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { docente: docenteNombre.actual.trim() }, { merge: true });
    setDocenteNombre({ actual: '', guardado: docenteNombre.actual.trim() });
    await showAlert('Guardado correctamente.', 'success', 'Guardado');
  };

  // ── Getters de roles ──
  const getMateriasDisponibles = () => {
    if (!usuario) return [];
    if (usuario.rol === 'administrador') return [...areas.curriculares, ...areas.convivencia, ...areas.especiales, ...areas.talleres];
    if (usuario.rol === 'docente_grado') return areas.curriculares.filter(m => usuario.materiasAsignadas.includes(m.nombre));
    if (usuario.rol === 'area_especial') return [...areas.especiales, ...areas.talleres].filter(m => usuario.materiasAsignadas.some(ma => ma.nombre === m.nombre));
    return [];
  };

  const getGradosParaMateria = (materiaNombre) => {
    if (!usuario) return [];
    if (usuario.rol === 'administrador') return grados;
    if (usuario.rol === 'docente_grado') {
      // Soporta tanto gradosAsignados (array) como gradoAsignado (legacy)
      return usuario.gradosAsignados?.length > 0 ? usuario.gradosAsignados : [usuario.gradoAsignado].filter(Boolean);
    }
    if (usuario.rol === 'area_especial') {
      const ma = usuario.materiasAsignadas.find(ma => ma.nombre === materiaNombre);
      return ma ? ma.grados : [];
    }
    return [];
  };

  const materiasRegistro = registro.data.rol === 'docente_grado' ? areas.curriculares : [...areas.especiales, ...areas.talleres];
  const estActualesRaw = estudiantes[`${materia?.nombre}-${grado}`] || [];
  const alumnosDelGradoActual = alumnosGlobales[grado] || [];
  const estActuales = estActualesRaw.map(e => ({
    ...e,
    sexo: e.sexo || alumnosDelGradoActual.find(a => a.dni === e.dni)?.sexo || 'V'
  }));
  const [busquedaAlumno, setBusquedaAlumno] = useState('');
  const gradoActivoDocente = usuario?.rol === 'docente_grado'
    ? (usuario.gradosAsignados?.length > 0 ? usuario.gradosAsignados[0] : usuario.gradoAsignado)
    : grado;
  const gradoParaAlumnos = usuario?.rol === 'docente_grado' ? gradoActivoDocente : grado;
  const alumnosGr = alumnosGlobales[gradoParaAlumnos] || [];
  const puedeGestionarAlumnos = ['docente_grado', 'administrador'].includes(usuario?.rol);
  const puedeGestionarUsuarios = usuario?.rol === 'administrador';

  const toggleMateriaRegistro = (mNombre) => {
    const d = registro.data;
    if (d.rol === 'docente_grado') {
      setRegistro({ ...registro, data: { ...d, materiasAsignadas: d.materiasAsignadas.includes(mNombre) ? d.materiasAsignadas.filter(x => x !== mNombre) : [...d.materiasAsignadas, mNombre] } });
    } else {
      setRegistro({ ...registro, data: { ...d, materiasAsignadas: d.materiasAsignadas.some(ma => ma.nombre === mNombre) ? d.materiasAsignadas.filter(ma => ma.nombre !== mNombre) : [...d.materiasAsignadas, { nombre: mNombre, grados: [] }] } });
    }
  };

  const toggleGradoRegistro = (mNombre, g) => {
    const d = registro.data;
    setRegistro({ ...registro, data: { ...d, materiasAsignadas: d.materiasAsignadas.map(ma => {
      if (ma.nombre !== mNombre) return ma;
      return { ...ma, grados: ma.grados.includes(g) ? ma.grados.filter(x => x !== g) : [...ma.grados, g] };
    })}});
  };

  const rolLabel = (u) => {
    if (!u) return '';
    if (u.rol === 'docente_grado') {
      const gs = u.gradosAsignados?.length > 0 ? u.gradosAsignados : [u.gradoAsignado].filter(Boolean);
      return `Docente de Grado • ${gs.map(gradoLabel).join(', ')}`;
    }
    if (u.rol === 'area_especial') return 'Docente Área Especial';
    return 'Directora';
  };

  const nombreMostrado = (u) => {
    if (!u) return '';
    if (u.rol === 'administrador') return 'Raquel Noemí Maciszonek';
    return u.nombre;
  };

  // ── Modales internos ──
  const ModalCerrarSesion = () => (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="bg-red-50 px-6 py-4 flex items-center gap-3"><span className="text-2xl">🚪</span><h3 className="text-lg font-bold text-red-700">Cerrar sesión</h3></div>
        <div className="px-6 py-5"><p className="text-gray-700">¿Confirmás que querés cerrar la sesión actual?</p></div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button onClick={() => setModalCerrarSesion(false)} className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cancelar</button>
          <button onClick={cerrarSesion} className="px-5 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-all">Cerrar Sesión</button>
        </div>
      </div>
    </div>
  );

  const ModalSolicitudes = () => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-700 text-lg">🔔 Solicitudes Pendientes ({solicitudes.length})</h3>
          <button onClick={() => setShowModalSolicitudes(false)} className="text-slate-400 hover:text-slate-600 rounded-full p-1 transition-all"><X size={24} /></button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {solicitudes.length === 0 ? (
            <div className="text-center py-12"><span className="text-5xl mb-3 block">✅</span><p className="text-slate-500 font-semibold">No hay solicitudes pendientes</p></div>
          ) : (
            solicitudes.map((sol) => (
              <div key={sol.uid} className="flex flex-col p-4 border-2 border-slate-200 rounded-xl mb-3 bg-slate-50 hover:border-purple-300 transition-all">
                <div className="mb-3">
                  <p className="font-bold text-slate-800 text-lg">{sol.nombre}</p>
                  <p className="text-sm text-slate-600">📧 {sol.email}</p>
                  <p className="text-sm text-slate-600">👤 Rol: {sol.rol.replace('_', ' ').toUpperCase()}</p>
                  {sol.gradoAsignado && <p className="text-sm text-slate-600">📚 Grado(s): {(sol.gradosAsignados?.length > 0 ? sol.gradosAsignados : [sol.gradoAsignado]).map(gradoLabel).join(', ')}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    await aprobarDocente(sol.uid);
                    const nuevas = solicitudes.filter(s => s.uid !== sol.uid);
                    setSolicitudes(nuevas);
                    if (nuevas.length === 0) setShowModalSolicitudes(false);
                  }}
                    className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">
                    ✅ Aprobar
                  </button>
                  <button onClick={async () => {
                    setShowModalSolicitudes(false);
                    const ok = await showConfirm(`¿Rechazás el registro de "${sol.nombre}"? Se eliminará su cuenta.`, 'Rechazar registro');
                    if (!ok) { setShowModalSolicitudes(true); return; }
                    try {
                      await deleteDoc(doc(db, 'usuarios', sol.uid));
                      const nuevas = solicitudes.filter(s => s.uid !== sol.uid);
                      setSolicitudes(nuevas);
                      if (nuevas.length > 0) setShowModalSolicitudes(true);
                    } catch (e) { console.error(e); setShowModalSolicitudes(true); }
                  }}
                    className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">
                    ❌ Rechazar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t bg-slate-50">
          <button onClick={() => setShowModalSolicitudes(false)} className="w-full py-2 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-xl font-semibold transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════
  // RENDERS POR PANTALLA
  // ════════════════════════════════════════════════════════

  if (pantalla === 'cargando') return (
    <><style>{globalStyles}</style><Spinner texto="Verificando sesión..." /></>
  );

  if (pantalla === 'login') {
    // ── REGISTRO (pantalla completa, 2 paneles) ──
    if (registro.show) return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full flex" style={{ background: 'var(--navy)' }}>
          {/* Panel izq — info */}
          <div style={{ width: '38%', background: 'var(--navy)', display: 'flex', flexDirection: 'column', padding: '48px 40px', gap: 20, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', marginBottom: 8 }}>¿Cómo funciona?</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.7 }}>
                  Tu solicitud queda pendiente hasta que la directora la apruebe. Una vez confirmada, podés ingresar con tu correo y contraseña.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Completá tus datos personales y elegí tu rol',
                  'Seleccioná tus materias y grados a cargo',
                  'La directora revisa y aprueba tu solicitud',
                  'Ingresás con tu correo y contraseña',
                ].map((txt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', fontWeight: 500, lineHeight: 1.5 }}>{txt}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 'var(--r)', padding: '12px 16px' }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 500, lineHeight: 1.6 }}>
                  ℹ️ Si ya tenés cuenta y olvidaste tu contraseña, volvé al login y usá la opción de recuperación por email.
                </p>
              </div>
            </div>
            <button onClick={() => setRegistro({ show: false, data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] } })}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,.25)', borderRadius: 'var(--r)', padding: '7px 14px', color: 'rgba(255,255,255,.6)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'Inter,sans-serif', alignSelf: 'flex-start' }}>
              ← Volver al login
            </button>
          </div>
          {/* Panel der — formulario */}
          <div style={{ width: '62%', background: '#fff', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 680, padding: '40px 48px' }} className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif', marginBottom: 4 }}>Solicitar acceso</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Completá el formulario. La directora aprobará tu solicitud.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Datos personales */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nombre completo</label>
                    <input type="text" value={registro.data.nombre} placeholder="Apellido, Nombre(s)"
                      onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, nombre: e.target.value } }))}
                      onBlur={e => setRegistro(r => ({ ...r, data: { ...r.data, nombre: capitalizarNombre(e.target.value) } }))}
                      className="n-field-input" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Correo electrónico</label>
                    <input type="email" value={registro.data.email} placeholder="tu@correo.com"
                      onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, email: e.target.value } }))}
                      className="n-field-input" />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contraseña</label>
                  <input type="password" value={registro.data.password} placeholder="Mínimo 6 caracteres"
                    onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, password: e.target.value } }))}
                    className="n-field-input" />
                </div>
                {/* Rol */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rol en la institución</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[{val:'docente_grado',lbl:'Docente de Grado'},{val:'area_especial',lbl:'Docente de Área Especial'}].map(({val,lbl}) => (
                      <div key={val} onClick={() => setRegistro(r => ({ ...r, data: { ...r.data, rol: val, materiasAsignadas: [] } }))}
                        style={{ border: '1.5px solid', borderColor: registro.data.rol === val ? 'var(--indigo)' : 'var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', cursor: 'pointer', background: registro.data.rol === val ? 'var(--violet-lt)' : '#fff', transition: 'all .15s' }}>
                        <strong style={{ fontSize: 13, fontWeight: 700, color: registro.data.rol === val ? 'var(--indigo)' : 'var(--text)', display: 'block' }}>{lbl}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Materias */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {registro.data.rol === 'docente_grado' ? 'Asignaturas curriculares a cargo' : 'Área(s) especial(es) que dictás'}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                    {materiasRegistro.map(m => {
                      const checked = registro.data.rol === 'docente_grado'
                        ? registro.data.materiasAsignadas.includes(m.nombre)
                        : registro.data.materiasAsignadas.some(ma => ma.nombre === m.nombre);
                      return (
                        <label key={m.nombre} onClick={() => toggleMateriaRegistro(m.nombre)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid', borderColor: checked ? 'var(--navy)' : 'var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', background: checked ? 'var(--navy-lt)' : '#fff', transition: 'all .15s' }}>
                          <input type="checkbox" checked={checked} onChange={() => {}} style={{ accentColor: 'var(--navy)', width: 14, height: 14, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: checked ? 'var(--navy)' : 'var(--text)', fontWeight: checked ? 700 : 500 }}>{m.icon} {m.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {/* Grados para docente de grado */}
                {registro.data.rol === 'docente_grado' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grados a cargo</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
                      {grados.map(g => {
                        const sel = (registro.data.gradosAsignados || [registro.data.gradoAsignado]).includes(g);
                        return (
                          <button key={g} type="button"
                            onClick={() => {
                              const actual = registro.data.gradosAsignados || [registro.data.gradoAsignado].filter(Boolean);
                              const nuevo = actual.includes(g) ? actual.filter(x => x !== g) : [...actual, g];
                              setRegistro(r => ({ ...r, data: { ...r.data, gradosAsignados: nuevo } }));
                            }}
                            style={{ padding: '6px 4px', border: '1.5px solid', borderColor: sel ? 'var(--navy)' : 'var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: sel ? 'var(--navy)' : '#fff', color: sel ? '#fff' : 'var(--muted)', fontFamily: 'Inter,sans-serif', transition: 'all .15s' }}>
                            {gradoLabel(g)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Grados por materia para especial */}
                {registro.data.rol === 'area_especial' && registro.data.materiasAsignadas.length > 0 && (
                  <div style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
                    <p style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grados por materia</p>
                    {registro.data.materiasAsignadas.map(ma => (
                      <div key={ma.nombre} style={{ marginBottom: 14 }}>
                        <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8, fontSize: 13 }}>{ma.nombre}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
                          {grados.map(g => (
                            <button key={g} type="button" onClick={() => toggleGradoRegistro(ma.nombre, g)}
                              style={{ padding: '6px 4px', border: '1.5px solid', borderColor: ma.grados.includes(g) ? 'var(--navy)' : 'var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: ma.grados.includes(g) ? 'var(--navy)' : '#fff', color: ma.grados.includes(g) ? '#fff' : 'var(--muted)', fontFamily: 'Inter,sans-serif' }}>
                              {gradoLabel(g)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Botones */}
                <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                  <button onClick={() => setRegistro({ show: false, data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] } })}
                    style={{ flex: 1, padding: '11px', borderRadius: 'var(--r)', background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--slate)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    ← Cancelar
                  </button>
                  <button onClick={handleRegistro} disabled={registroCargando} className="btn-primary"
                    style={{ flex: 2, padding: '11px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, opacity: registroCargando ? 0.6 : 1, cursor: registroCargando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif' }}>
                    {registroCargando ? 'Enviando solicitud...' : 'Enviar solicitud de acceso'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );

    // ── LOGIN ──
    return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full flex" style={{ background: 'var(--navy)' }}>
        {/* Panel izquierdo — marca */}
        <div style={{ width: '40%', background: 'var(--navy)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '52px 48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
            <img
              src="https://i.postimg.cc/5ycyH91P/upscalemedia-transformed.jpg"
              alt="Escuela Provincial N° 185"
              style={{ width: 240, height: 240, objectFit: 'cover', borderRadius: 'var(--r-lg)', border: '3px solid rgba(255,255,255,.2)', boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}
              onError={e => { e.target.style.display='none'; }}
            />
            <div>
              <h1 style={{ fontSize: 21, fontWeight: 800, color: '#fff', lineHeight: 1.5, fontFamily: 'Outfit,sans-serif', marginBottom: 12, letterSpacing: '0.01em' }}>Escuela Provincial<br/>N° 185 "Juan Areco"</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.7, marginBottom: 14 }}>Santiago del Estero 150<br/>Oberá, Misiones</p>
              <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,.2)', margin: '0 auto 14px' }}></div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', fontWeight: 600, marginBottom: 6 }}>Sistema de Calificaciones</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', fontWeight: 700, letterSpacing: '0.08em' }}>CICLO LECTIVO 2026</p>
            </div>
          </div>
          <div></div>
        </div>
        {/* Panel derecho — formulario */}
        <div style={{ width: '60%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, padding: '52px 48px' }} className="fade-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif', marginBottom: 6 }}>Bienvenido/a</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 28 }}>Ingresá tus credenciales para acceder al sistema.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Correo electrónico</label>
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} size={16} />
                  <input type="email" value={loginForm.email}
                    onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="tu@correo.com"
                    className="n-field-input" style={{ paddingLeft: 38 }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} size={16} />
                  <input type={loginForm.verPass ? 'text' : 'password'} value={loginForm.pass}
                    onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="••••••••"
                    className="n-field-input" style={{ paddingLeft: 38, paddingRight: 38 }} />
                  <button onClick={() => setLoginForm({ ...loginForm, verPass: !loginForm.verPass })}
                    style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                    {loginForm.verPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: -4 }}>
                <div onClick={() => setLoginForm(f => ({ ...f, recordarme: !f.recordarme }))}
                  style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid', borderColor: loginForm.recordarme ? 'var(--navy)' : 'var(--border)', background: loginForm.recordarme ? 'var(--navy)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {loginForm.recordarme && <svg width="10" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{ fontSize: 13, color: 'var(--slate)', fontWeight: 500 }}>Recordarme en este dispositivo</span>
              </label>
              <button onClick={handleLogin} disabled={loginCargando} className="btn-primary"
                style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: '12px 20px', fontSize: 14, fontWeight: 700, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loginCargando ? 0.6 : 1, cursor: loginCargando ? 'not-allowed' : 'pointer' }}>
                {loginCargando
                  ? <div style={{ width: 22, height: 22, border: '3px solid rgba(255,255,255,0.4)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : 'Ingresar al sistema'}
              </button>
              <button onClick={() => setMostrarRecuperar(true)}
                style={{ fontSize: 13, color: 'var(--indigo)', fontWeight: 600, textAlign: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                ¿Olvidaste tu contraseña?
              </button>
              <button onClick={() => setRegistro({ ...registro, show: true })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', fontWeight: 500, textAlign: 'center', width: '100%', padding: '4px' }}>
                ¿No tenés cuenta? <span style={{ color: 'var(--indigo)', fontWeight: 600 }}>Registrate y solicitá el acceso</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {mostrarRecuperar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', boxShadow: '0 20px 60px rgba(0,0,0,.2)', width: '100%', maxWidth: 400, overflow: 'hidden', animation: 'modalEntrada 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--navy)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif' }}>🔑 Recuperar contraseña</h3>
              <button onClick={() => { setMostrarRecuperar(false); setRecuperarEmail(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.6 }}>
                Ingresá tu correo electrónico y te enviaremos un link para restablecer tu contraseña. El link expira en 1 hora.
              </p>
              <input type="email" value={recuperarEmail} onChange={e => setRecuperarEmail(e.target.value)}
                placeholder="Tu correo electrónico" className="n-field-input"
                onKeyDown={e => e.key === 'Enter' && !recuperarCargando && handleRecuperar()} autoFocus />
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={async () => {
                  if (!recuperarEmail.trim()) return;
                  setRecuperarCargando(true);
                  try {
                    const emailFirebase = recuperarEmail.trim().includes('@') ? recuperarEmail.trim() : `${recuperarEmail.trim()}@ep185.edu.ar`;
                    await sendPasswordResetEmail(auth, emailFirebase);
                    setMostrarRecuperar(false); setRecuperarEmail('');
                    await showAlert(`✅ Enviamos el link de recuperación a ${emailFirebase}. Revisá tu bandeja de entrada y también spam. El link expira en 1 hora.`, 'success', 'Email enviado');
                  } catch(e) {
                    await showAlert('No encontramos una cuenta con ese correo. Verificá que sea el correo con el que te registraste.', 'error', 'Error');
                  } finally { setRecuperarCargando(false); }
                }}
                disabled={!recuperarEmail.trim() || recuperarCargando} className="btn-primary"
                style={{ width: '100%', padding: '11px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, opacity: (!recuperarEmail.trim() || recuperarCargando) ? 0.5 : 1, cursor: (!recuperarEmail.trim() || recuperarCargando) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {recuperarCargando ? 'Enviando...' : 'Enviar correo de recuperación'}
              </button>
              <button onClick={() => { setMostrarRecuperar(false); setRecuperarEmail(''); }}
                style={{ width: '100%', padding: '9px', borderRadius: 'var(--r)', background: '#f1f5f9', color: 'var(--slate)', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  }



  if (pantalla === 'administracion') {
    const gradoActual = usuario?.rol === 'docente_grado' ? (usuario.gradosAsignados?.[0] || usuario.gradoAsignado) : grado;
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full" style={{ background: '#e2e8f0' }}>
          {/* Topbar */}
          <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30, boxShadow: 'var(--sh)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { setVolverAGestion(false); setPantalla('inicio'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <Home size={14} /> Inicio
              </button>
              {volverAGestion && usuario?.rol === 'administrador' && (
                <button onClick={() => { setVolverAGestion(false); setPantalla('gestion_usuarios'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid #bbf7d0', background: 'var(--green-lt)', color: 'var(--green)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  ← Gestión de Docentes
                </button>
              )}
              <span style={{ width: 1, height: 16, background: 'var(--border)', display: 'inline-block' }}></span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>👥 Gestión de Alumnos</span>
            </div>
            <button onClick={() => setModalCerrarSesion(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid #fecaca', background: 'var(--red-lt)', color: 'var(--red)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <LogOut size={14} /> Salir
            </button>
          </div>

          <div style={{ padding: '24px 28px', maxWidth: '100%' }} className="fade-in">
            {/* Aviso */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--amber-lt)', border: '1.5px solid #fcd34d', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', lineHeight: 1.5 }}>Exclusivo para docentes de grado. Los alumnos cargados acá aparecerán en <strong>todas las materias</strong> del grado automáticamente.</p>
            </div>

            {/* Selector grado (admin) */}
            {usuario?.rol !== 'docente_grado' && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seleccioná el grado:</p>
                <ChipsGrado lista={grados} seleccionado={grado} onChange={setGrado} />
              </div>
            )}

            {/* Formulario agregar/editar alumno */}
            <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif', marginBottom: 16 }}>
                {alumnoForm.editando ? '✏️ Editar alumno' : '➕ Agregar alumno'} <span style={{ color: 'var(--indigo)', fontWeight: 600 }}>· {gradoLabel(gradoActual)}</span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <input type="text" value={alumnoForm.nombre}
                  onChange={e => setAlumnoForm({ ...alumnoForm, nombre: e.target.value })}
                  onBlur={e => setAlumnoForm(f => ({ ...f, nombre: capitalizarNombre(e.target.value) }))}
                  placeholder="Ej: García, María José"
                  style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', color: 'var(--text)' }} />
                <input type="text" value={alumnoForm.dni}
                  onChange={e => setAlumnoForm({ ...alumnoForm, dni: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && agregarAlumno()}
                  placeholder="D.N.I N°..."
                  style={{ width: 160, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', color: 'var(--text)' }} />
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: '#f8fafc', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>Sexo:</span>
                  {['V', 'M'].map(s => (
                    <button key={s} type="button" onClick={() => setAlumnoForm({ ...alumnoForm, sexo: s })}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: alumnoForm.sexo === s ? (s === 'V' ? '#3b82f6' : '#ec4899') : 'transparent', color: alumnoForm.sexo === s ? '#fff' : 'var(--muted)' }}>
                      {s === 'V' ? '♂ V' : '♀ M'}
                    </button>
                  ))}
                </div>
                <button onClick={agregarAlumno} className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Plus size={16} /> {alumnoForm.editando ? 'Actualizar' : 'Agregar'}
                </button>
                {alumnoForm.editando && (
                  <button onClick={() => setAlumnoForm({ nombre: '', dni: '', sexo: 'V', editando: null })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 'var(--r)', background: '#f1f5f9', color: 'var(--slate)', border: '1.5px solid var(--border)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    <X size={14} /> Cancelar
                  </button>
                )}
              </div>
            </div>

            {/* Buscador */}
            <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px', marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>🔍 Buscar alumno</h3>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)' }} size={16} />
                <input type="text" value={busquedaDNI}
                  onChange={e => { setBusquedaDNI(e.target.value); setResultadoBusqueda(null); }}
                  placeholder="Nombre(s) o D.N.I N°..."
                  style={{ width: '100%', paddingLeft: 36, paddingRight: 36, padding: '10px 14px 10px 36px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', color: 'var(--text)' }} />
                {busquedaDNI && (
                  <button onClick={() => { setBusquedaDNI(''); setResultadoBusqueda(null); }}
                    style={{ position: 'absolute', right: 10, top: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                    <X size={15} />
                  </button>
                )}
              </div>
              {busquedaDNI.trim().length > 0 && (() => {
                const termino = busquedaDNI.trim().toLowerCase();
                const alumnosDelGrado = alumnosGlobales[gradoActual] || [];
                const coincidencias = [...alumnosDelGrado].filter(a =>
                  a.nombre.toLowerCase().includes(termino) || a.dni.includes(termino)
                ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
                if (coincidencias.length === 0) return (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                    Sin resultados en {gradoLabel(gradoActual)}
                  </div>
                );
                return (
                  <div style={{ marginTop: 8, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', boxShadow: 'var(--sh)' }}>
                    {coincidencias.map((a, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{a.nombre}</p>
                          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>DNI: {a.dni} · {gradoLabel(gradoActual)}</p>
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: '8px 14px', background: 'var(--navy-lt)', fontSize: 12, color: 'var(--navy)', fontWeight: 700 }}>
                      {coincidencias.length} resultado{coincidencias.length !== 1 ? 's' : ''} en {gradoLabel(gradoActual)}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Lista de alumnos */}
            <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', background: 'var(--navy-lt)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>Lista · {gradoLabel(gradoActual)}</h3>
                <span style={{ background: 'var(--blue-lt)', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, fontSize: 12, fontWeight: 700, padding: '3px 12px' }}>
                  {alumnosGr.length} alumnos{alumnosGr.length > 0 ? ` (${alumnosGr.filter(a => (a.sexo||'V')==='V').length}V / ${alumnosGr.filter(a => a.sexo==='M').length}M)` : ''}
                </span>
              </div>
              {alumnosGr.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>No hay alumnos registrados</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="tabla-header">
                      {['#','Nombre completo','D.N.I N°','Sexo','Acciones'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Nombre completo' ? 'left' : 'center', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.9)', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...alumnosGr].sort((a, b) => {
                      if ((a.sexo || 'V') !== (b.sexo || 'V')) return (a.sexo || 'V') === 'V' ? -1 : 1;
                      return a.nombre.localeCompare(b.nombre, 'es');
                    }).map((a, i) => (
                      <tr key={i} className="tabla-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{a.nombre}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>{a.dni}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: (a.sexo||'V')==='V' ? '#dbeafe' : '#fce7f3', color: (a.sexo||'V')==='V' ? '#1d4ed8' : '#be185d' }}>
                            {(a.sexo || 'V') === 'V' ? '♂ V' : '♀ M'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => { setAlumnoForm({ nombre: a.nombre, dni: a.dni, sexo: a.sexo || 'V', editando: a }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              <Save size={13} /> Editar
                            </button>
                            <button onClick={() => eliminarAlumno(a)}
                              className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--red-lt)', color: 'var(--red)', border: '1.5px solid #fecaca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              <Trash2 size={13} /> Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Registro de Bajas */}
            {bajas.filter(b => b.grado === gradoActual).length > 0 && (
              <div style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', background: 'var(--red-lt)', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--red)', fontFamily: 'Outfit,sans-serif' }}>📋 Registro de Bajas · {gradoLabel(gradoActual)}</h3>
                  <span style={{ background: '#fff', color: 'var(--red)', border: '1px solid #fecaca', borderRadius: 20, fontSize: 12, fontWeight: 700, padding: '3px 12px' }}>{bajas.filter(b => b.grado === gradoActual).length} baja(s)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fee2e2' }}>
                      {['Nombre completo','D.N.I N°','Motivo','Fecha','Acción'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bajas.filter(b => b.grado === gradoActual).map((b, i) => (
                      <tr key={i} className="tabla-row" style={{ borderBottom: '1px solid #fee2e2' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)', textAlign: 'center', fontSize: 13 }}>{b.nombre}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>{b.dni}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 13, color: 'var(--slate)' }}>{b.motivo}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>{b.fecha}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button onClick={() => eliminarRegistroBaja(b)} className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--red-lt)', color: 'var(--red)', border: '1.5px solid #fecaca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {modalCerrarSesion && <ModalCerrarSesion />}
      </>
    );
  }

  if (pantalla === 'gestion_usuarios') {
    return (
      <>
      <GestionUsuarios db={db} globalStyles={globalStyles} modal={modal} closeModal={closeModal}
        showConfirm={showConfirm} showAlert={showAlert}
        onInicio={() => setPantalla('inicio')} onCerrarSesion={() => setModalCerrarSesion(true)}
        onEditarDocente={(u) => { setDocenteEditando(u); setPantalla('editar_docente'); }}
        onVerEntregas={(u) => { setDocenteEntregas(u); setPantalla('entregas_docente'); }}
        onVerAlumnos={(g, tab) => { setGrado(g); setVolverAGestion(true); setOrigenGestion({ tab: tab || 'grado' }); setPantalla('administracion'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
        onVerCalificaciones={(g, m, tab) => {
          const materiaObj = [...areas.curriculares, ...areas.especiales, ...areas.talleres].find(a => a.nombre === m);
          if (materiaObj) { setVolverAGestion(true); setOrigenGestion({ tab: tab || 'grado' }); abrirMateria(materiaObj, g); }
        }}
        onVerActividad={(u) => setDocenteActividad(u)}
        onAbrirMensajes={() => setShowModalMensajes(true)}
        onAbrirBimestres={() => setShowNotifsBimestre(true)}
        onAbrirModificaciones={() => setShowRegistroMods(true)}
        onAbrirRecordatorio={() => setShowFechasBimestre(true)}
        onAbrirSolicitudes={() => setShowModalSolicitudes(true)}
        onAbrirInasistencias={() => setShowInasistencias(true)}
        rolLabel={rolLabel} modalCerrarSesion={modalCerrarSesion} initialTab={origenGestion?.tab || 'grado'}
        ModalCerrarSesion={ModalCerrarSesion} ModalRenderer={ModalRenderer} TopBar={TopBar} Badge={Badge} />
      {docenteActividad && (
        <ModalActividadDocente
          db={db} docente={docenteActividad} alumnosGlobales={alumnosGlobales}
          onClose={() => setDocenteActividad(null)} />
      )}
      {showModalMensajes && (
        <ModalMensajes db={db} usuario={usuario} authUser={authUser}
          mensajes={mensajes} nombreMostrado={nombreMostrado}
          onClose={() => setShowModalMensajes(false)} showConfirm={showConfirm} />
      )}
      {showNotifsBimestre && (
        <ModalNotifsBimestre db={db} notifs={notifsBimestre} onClose={() => setShowNotifsBimestre(false)} />
      )}
      {showRegistroMods && (
        <ModalRegistroModificaciones db={db} onClose={() => setShowRegistroMods(false)} />
      )}
      {showFechasBimestre && (
        <ModalFechasBimestre db={db} usuario={usuario} mensajes={mensajes} onClose={() => setShowFechasBimestre(false)} />
      )}
      {showModalSolicitudes && <ModalSolicitudes />}
      {modalCerrarSesion && <ModalCerrarSesion />}
      {showInasistencias && (
        <ModalInasistencias
          db={db} usuario={usuario} authUser={authUser}
          showAlert={showAlert} showConfirm={showConfirm}
          onClose={() => setShowInasistencias(false)} />
      )}
    </>
    );
  }

  if (pantalla === 'entregas_docente' && docenteEntregas) {
    return (
      <EntregasDocente
        db={db} globalStyles={globalStyles} modal={modal} closeModal={closeModal}
        showAlert={showAlert} docente={docenteEntregas}
        onVolver={() => { setDocenteEntregas(null); setPantalla('gestion_usuarios'); }}
        onCerrarSesion={() => setModalCerrarSesion(true)}
        ModalCerrarSesion={ModalCerrarSesion} ModalRenderer={ModalRenderer} TopBar={TopBar}
        modalCerrarSesion={modalCerrarSesion}
      />
    );
  }

  if (pantalla === 'editar_docente' && docenteEditando) {
    return (
      <EditarDocente
        db={db} globalStyles={globalStyles} modal={modal} closeModal={closeModal}
        showAlert={showAlert} docente={docenteEditando}
        onVolver={() => { setDocenteEditando(null); setPantalla('gestion_usuarios'); }}
        onCerrarSesion={() => setModalCerrarSesion(true)}
        ModalCerrarSesion={ModalCerrarSesion} ModalRenderer={ModalRenderer} TopBar={TopBar}
        modalCerrarSesion={modalCerrarSesion}
      />
    );
  }

  if (pantalla === 'inicio') {
    const materiasDisp = getMateriasDisponibles();
    const curricularesFilt = areas.curriculares.filter(m => materiasDisp.some(md => md.nombre === m.nombre));
    const especielesFilt = areas.especiales.filter(m => materiasDisp.some(md => md.nombre === m.nombre));
    const talleresFilt = areas.talleres.filter(m => materiasDisp.some(md => md.nombre === m.nombre));
    const isAdmin = usuario?.rol === 'administrador';
    const isDocGrado = usuario?.rol === 'docente_grado';
    const noLeidos = mensajes.filter(m => !m.leidoPor?.[authUser?.uid]).length;
    const avisosNoLeidos = avisos.filter(a => !a.leidoPor?.[authUser?.uid]).length;
    const notifsNoLeidas = notifsBimestre.filter(n => !n.leida).length;
    const solicitudesCount = solicitudes.length;
    const badgeAdmin = notifsNoLeidas + solicitudesCount + inasistenciasNoVistas;
    // Saludo por hora
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
    // Bimestre activo
    const hoy = new Date();
    const bimestresConfig = [
      { n:1, desde: new Date('2026-03-02'), hasta: new Date('2026-05-08') },
      { n:2, desde: new Date('2026-05-11'), hasta: new Date('2026-07-31') },
      { n:3, desde: new Date('2026-08-03'), hasta: new Date('2026-10-09') },
      { n:4, desde: new Date('2026-10-12'), hasta: new Date('2026-12-04') },
    ];
    const bimActivo = bimestresConfig.find(b => hoy >= b.desde && hoy <= b.hasta);
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full" style={{ background: '#e2e8f0' }}>
          {/* TOPBAR */}
          <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30, boxShadow: 'var(--sh)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Esc. Prov. N° 185 "Juan Areco"</span>
              <span style={{ width: 1, height: 16, background: 'var(--border)', display: 'inline-block' }}></span>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Sistema de Calificaciones</span>
            </div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {isAdmin ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setMenuAcciones(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                      ⚙️ Acciones
                      {badgeAdmin > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{badgeAdmin}</span>}
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{menuAcciones ? '▲' : '▼'}</span>
                    </button>
                    {menuAcciones && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuAcciones(false)} />
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 50, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-md)', overflow: 'hidden', minWidth: 220, animation: 'fadeIn 0.15s ease-out' }}>
                          {[
                            { icon: '✉️', label: 'Mensajes', action: () => { setMenuAcciones(false); setShowModalMensajes(true); } },
                            { icon: '✅', label: 'Bimestres completados', action: () => { setMenuAcciones(false); setShowNotifsBimestre(true); }, badge: notifsNoLeidas },
                            { icon: '📢', label: 'Enviar recordatorio', action: () => { setMenuAcciones(false); setShowFechasBimestre(true); } },
                            { icon: '🔔', label: 'Solicitudes', action: () => { setMenuAcciones(false); setShowModalSolicitudes(true); }, badge: solicitudesCount },
                            { icon: '📋', label: 'Registro de Modificaciones', action: () => { setMenuAcciones(false); setShowRegistroMods(true); } },
                          { icon: '📋', label: 'Inasistencias docentes', action: () => { setMenuAcciones(false); setShowInasistencias(true); }, badge: inasistenciasNoVistas },
                          ].map(({icon, label, action, badge}) => (
                            <button key={label} onClick={action}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #f8fafc', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter,sans-serif' }}
                              onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                              onMouseLeave={e => e.currentTarget.style.background='none'}>
                              <span style={{ fontSize: 16 }}>{icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{label}</span>
                              {badge > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{badge}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setShowModalMensajes(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    ✉️ Mensajes {noLeidos > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{noLeidos}</span>}
                  </button>
                  <button onClick={() => setShowAvisos(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    🔔 Avisos {avisosNoLeidos > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{avisosNoLeidos}</span>}
                  </button>
                  <button onClick={() => setShowFechasBimestre(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    📅 Bimestres
                  </button>
                  <button onClick={() => setShowInasistencias(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    📋 Inasistencias
                  </button>
                  <button onClick={() => setShowPerfil(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    👤 Mi perfil
                  </button>
                </>
              )}
              <button onClick={() => setModalCerrarSesion(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid #fecaca', background: 'var(--red-lt)', color: 'var(--red)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                <LogOut size={14} /> Cerrar sesión
              </button>
            </div>
          </div>

          {/* CONTENIDO */}
          <div style={{ padding: '28px 28px', maxWidth: '100%' }} className="fade-in">
            {/* WELCOME BAR */}
            <div style={{ background: 'var(--navy)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, color: '#fff', fontFamily: 'Outfit,sans-serif' }}>{saludo}, {usuario?.rol === 'administrador' ? 'Raquel Noemí' : (usuario?.nombre?.split(',')[1]?.trim() || usuario?.nombre || 'Docente')}</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>{usuario?.rol === 'administrador' ? 'Directora' : rolLabel(usuario)}</p>
                {isDocGrado && <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 5, fontStyle: 'italic' }}>A continuación se listan tus espacios curriculares asignados para el ciclo lectivo 2026.</p>}
              </div>
              {bimActivo && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '6px 20px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{bimActivo.n}° Bimestre · cierra {bimActivo.hasta.toLocaleDateString('es-AR',{day:'2-digit',month:'long'})}</span>}
            </div>

            {/* SELECTOR DE GRADO para docentes con múltiples grados */}
            {isDocGrado && (usuario?.gradosAsignados?.length > 1) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--navy-lt)', border: '1px solid var(--border)', marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginRight: 4 }}>Grado activo:</p>
                <ChipsGrado lista={usuario.gradosAsignados} seleccionado={grado} onChange={setGrado} />
              </div>
            )}

            {/* RECORDATORIO BIMESTRE */}
            {(() => {
              const rec = getRecordatorioBimestre();
              if (!rec) return null;
              return (
                <div style={{ marginBottom: 20, background: 'var(--amber-lt)', border: '1.5px solid #fcd34d', borderRadius: 'var(--r)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>⏰</span>
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--amber)', fontSize: 13 }}>
                      {rec.diff === 0 ? `⚠️ ¡Hoy cierra el ${rec.bim}° Bimestre!` : `⚠️ El ${rec.bim}° Bimestre cierra en ${rec.diff} día${rec.diff > 1 ? 's' : ''}`}
                    </p>
                    <p style={{ fontSize: 11, color: '#92400e', fontWeight: 600, marginTop: 2 }}>Fecha de cierre: {rec.cierre} — Completá las notas a tiempo.</p>
                  </div>
                </div>
              );
            })()}

            {/* BOTONES DE GESTIÓN (admin/docente grado) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {puedeGestionarAlumnos && (
                <button onClick={() => { setVolverAGestion(false); setPantalla('administracion'); }}
                  className="btn-primary" style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>👥 Gestión de Alumnos</button>
              )}
              {puedeGestionarUsuarios && (
                <button onClick={() => setPantalla('gestion_usuarios')}
                  className="btn-primary" style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>👤 Gestión de Docentes</button>
              )}
              {isDocGrado && (
                <button onClick={() => setPantalla('notas_especiales')}
                  className="btn-primary" style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--slate)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>📋 Áreas Especiales</button>
              )}
              {isDocGrado && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button
                    disabled={pdfUnificadoGenerando}
                    onClick={async () => {
                      const incTalleres = await showConfirmYesNo('¿Incluir Talleres en el PDF?', '📄 PDF Unificado');
                      setPdfUnificadoGenerando(true);
                      try { await generarPDFUnificado({ usuario, alumnosGlobales, db, includeTalleres: !!incTalleres }); }
                      finally { setPdfUnificadoGenerando(false); }
                    }}
                    className="btn-primary" style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--green-lt)', color: 'var(--green)', border: '1.5px solid #bbf7d0', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: pdfUnificadoGenerando ? 0.6 : 1 }}>
                    <FileDown size={14} /> {pdfUnificadoGenerando ? 'Generando...' : 'PDF Unificado'}
                  </button>
                  <InfoPDFUnificado />
                </div>
              )}
              {isAdmin && (
                <button
                  disabled={pdfUnificadoGenerando}
                  onClick={async () => {
                    const incTalleres = await showConfirmYesNo('¿Incluir Talleres en el PDF?', '📄 PDF Dirección');
                    setPdfUnificadoGenerando(true);
                    try { await generarPDFUnificado({ usuario, alumnosGlobales, db, includeTalleres: !!incTalleres }); }
                    finally { setPdfUnificadoGenerando(false); }
                  }}
                  className="btn-primary" style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--green-lt)', color: 'var(--green)', border: '1.5px solid #bbf7d0', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: pdfUnificadoGenerando ? 0.6 : 1 }}>
                  <FileDown size={14} /> {pdfUnificadoGenerando ? 'Generando...' : 'PDF Dirección'}
                </button>
              )}
            </div>

            {/* CURRICULARES */}
            {curricularesFilt.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 14, fontFamily: 'Outfit,sans-serif' }}>Áreas Curriculares</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(curricularesFilt.length, 5)}, 1fr)`, gap: 10 }}>
                  {curricularesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia" style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 68, height: 68, borderRadius: 14, background: 'var(--violet-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{m.icon}</div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, textAlign: 'center' }}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CONVIVENCIA */}
            {(isDocGrado || isAdmin) && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 14, fontFamily: 'Outfit,sans-serif' }}>Convivencia</p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {areas.convivencia.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia" style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '26px 52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 68, height: 68, borderRadius: 14, background: 'var(--amber-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{m.icon}</div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ESPECIALES */}
            {especielesFilt.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 14, fontFamily: 'Outfit,sans-serif' }}>Áreas Especiales</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(especielesFilt.length, 4)}, 1fr)`, gap: 10 }}>
                  {especielesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia" style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 68, height: 68, borderRadius: 14, background: 'var(--blue-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{m.icon}</div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, textAlign: 'center' }}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TALLERES */}
            {talleresFilt.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 14, fontFamily: 'Outfit,sans-serif' }}>Talleres</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(talleresFilt.length, 4)}, 1fr)`, gap: 10 }}>
                  {talleresFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia" style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 68, height: 68, borderRadius: 14, background: 'var(--green-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{m.icon}</div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, textAlign: 'center' }}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {curricularesFilt.length === 0 && especielesFilt.length === 0 && talleresFilt.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                <p style={{ fontSize: 48, marginBottom: 12 }}>📭</p>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>No tenés materias asignadas</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Contactá al administrador del sistema</p>
              </div>
            )}
          </div>
        </div>
        {showModalSolicitudes && <ModalSolicitudes />}
        {modalCerrarSesion && <ModalCerrarSesion />}
        {showModalMensajes && (
          <ModalMensajes
            db={db} usuario={usuario} authUser={authUser}
            mensajes={mensajes} nombreMostrado={nombreMostrado}
            onClose={() => setShowModalMensajes(false)}
            showConfirm={showConfirm}
          />
        )}
        {showPerfil && (
          <ModalPerfil
            db={db} usuario={usuario} authUser={authUser}
            showAlert={showAlert}
            onClose={() => setShowPerfil(false)}
            onActualizar={(nuevosDatos) => setUsuario(prev => ({ ...prev, ...nuevosDatos }))}
          />
        )}
        {showNotifsBimestre && (
          <ModalNotifsBimestre
            db={db} notifs={notifsBimestre}
            onClose={() => setShowNotifsBimestre(false)} />
        )}
        {showFechasBimestre && (
          <ModalFechasBimestre
            db={db} usuario={usuario} mensajes={mensajes}
            onClose={() => setShowFechasBimestre(false)} />
        )}
        {showAvisos && (
          <ModalAvisos
            db={db} avisos={avisos} authUser={authUser}
            onClose={() => setShowAvisos(false)} />
        )}
        {showRegistroMods && (
          <ModalRegistroModificaciones
            db={db} onClose={() => setShowRegistroMods(false)} />
        )}
        {showInasistencias && (
          <ModalInasistencias
            db={db} usuario={usuario} authUser={authUser}
            showAlert={showAlert} showConfirm={showConfirm}
            onClose={() => setShowInasistencias(false)} />
        )}
      </>
    );
  }


  // ════════════════════════════════════════════════════════
  // PANTALLA: NOTAS ÁREAS ESPECIALES (solo lectura, para maestras de grado)
  // ════════════════════════════════════════════════════════
  if (pantalla === 'notas_especiales') {
    return (
      <NotasEspeciales
        db={db} globalStyles={globalStyles} modal={modal} closeModal={closeModal}
        usuario={usuario} alumnosGlobales={alumnosGlobales} todosUsuarios={todosUsuarios}
        onInicio={() => setPantalla('inicio')} onCerrarSesion={() => setModalCerrarSesion(true)}
        modalCerrarSesion={modalCerrarSesion} ModalCerrarSesion={ModalCerrarSesion}
        ModalRenderer={ModalRenderer} TopBar={TopBar} Badge={Badge} ChipsGrado={ChipsGrado}
      />
    );
  }

  // ════════════════════════════════════════════════════════
  // PANTALLA: MATERIA
  // ════════════════════════════════════════════════════════
  const gradosDisp = getGradosParaMateria(materia?.nombre || '');
  const soloLectura = usuario?.rol === 'administrador';
  const sinCriterios = !!materia?.sinCriterios;
  // Para Convivencia: inyectar un criterio automático invisible
  const criteriosPorBimestreEfectivo = sinCriterios
    ? { 1: ['Convivencia'], 2: ['Convivencia'], 3: ['Convivencia'], 4: ['Convivencia'] }
    : criteriosPorBimestre;
  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full" style={{ background: '#e2e8f0' }}>
        {/* TOPBAR MATERIA */}
        <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30, boxShadow: 'var(--sh)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => { setVolverAGestion(false); setPantalla('inicio'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              <Home size={14} /> Inicio
            </button>
            <span style={{ width: 1, height: 16, background: 'var(--border)', display: 'inline-block' }}></span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{materia.nombre}</span>
            <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'var(--violet-lt)', color: 'var(--violet)' }}>{gradoLabel(grado)}</span>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {usuario?.rol !== 'administrador' && (
              <button
                disabled={pdfGenerando || estActuales.length === 0}
                onClick={() => {
                  setPdfGenerando(true);
                  try {
                    const ok = generarPDF({ materia, grado, estActuales, criteriosPorBimestre, usuario });
                    if (!ok) alert('No se pudo generar el PDF. Verificá la consola para más detalles.');
                  } finally {
                    setPdfGenerando(false);
                  }
                }}
                className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, opacity: (pdfGenerando || estActuales.length === 0) ? 0.5 : 1, cursor: (pdfGenerando || estActuales.length === 0) ? 'not-allowed' : 'pointer' }}>
                <FileDown size={14} /> {pdfGenerando ? 'Generando...' : 'PDF Individual'}
              </button>
            )}
            {usuario?.rol === 'administrador' && (
              <button
                disabled={pdfUnificadoGenerando}
                onClick={async () => {
                  const incTalleres = await showConfirmYesNo('¿Incluir Talleres en el PDF?', '📄 PDF Dirección');
                  setPdfUnificadoGenerando(true);
                  try { await generarPDFUnificado({ usuario, alumnosGlobales, db, includeTalleres: !!incTalleres }); }
                  finally { setPdfUnificadoGenerando(false); }
                }}
                className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, opacity: pdfUnificadoGenerando ? 0.5 : 1 }}>
                <FileDown size={14} /> {pdfUnificadoGenerando ? 'Generando...' : 'PDF Dirección'}
              </button>
            )}
            {esPrimerCiclo(grado) && (
              <button onClick={() => setShowEscala(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                📊 Escala
              </button>
            )}
            <button onClick={() => setModalCerrarSesion(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid #fecaca', background: 'var(--red-lt)', color: 'var(--red)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              <LogOut size={15} /> Salir
            </button>
          </div>
        </div>
        <div className="w-full fade-in" style={{ padding: '0 0 32px 0' }}>
          {/* HEADER MATERIA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: 'var(--violet-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{materia.icon}</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>{materia.nombre}</h3>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{gradoLabel(grado)} · {estActuales.length} estudiantes</p>
            </div>
            {usuario?.rol !== 'administrador' && (nombreMostrado(usuario) || docenteNombre.guardado) && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--violet-lt)', border: '1px solid #ddd6fe', borderRadius: 6, padding: '5px 11px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet)' }}>👤 {nombreMostrado(usuario) || docenteNombre.guardado}</span>
              </div>
            )}
          </div>
          {/* Botón volver */}
          {volverAGestion && usuario?.rol === 'administrador' && (
            <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
              <button onClick={() => { setVolverAGestion(false); setPantalla('gestion_usuarios'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--green-lt)', color: 'var(--green)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                ← Volver a Gestión de Docentes
              </button>
            </div>
          )}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--navy-lt)' }}>
            {gradosDisp.length > 1 && <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Seleccioná el grado correspondiente a tu asignatura</p>}
            <ChipsGrado lista={gradosDisp} seleccionado={grado} onChange={setGrado} />
          </div>
          {!sinCriterios && (
          <div style={{ margin: '0 0 0 0', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>Criterios de Evaluación</h3>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>Etiquetas para calificaciones por bimestre</p>
            </div>
            <div style={{ background: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: 'var(--red)', fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', lineHeight: 1.5 }}>
                <strong>Recordatorio:</strong> Los criterios deben referir a aspectos <strong>académicos</strong> de la asignatura (evaluación escrita, trabajo práctico, exposición oral, etc.). Cuestiones como <strong>comportamiento, conducta o actitud</strong> corresponden al Régimen de Convivencia y <strong>no deben incluirse</strong> como criterios de calificación.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[1, 2, 3, 4].map(bim => (
                <div key={bim} style={{ background: bimestresBlockeados[bim] ? '#f0fdf4' : '#f8fafc', border: '1.5px solid', borderColor: bimestresBlockeados[bim] ? '#86efac' : 'var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{bim}° Bimestre</h4>
                      {bimestresBlockeados[bim] && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--green-lt)', padding: '1px 7px', borderRadius: 20 }}>✅ Completo</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {usuario?.rol !== 'administrador' && !bimestresBlockeados[bim] && (
                        <button onClick={() => agregarCriterio(bim)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                          <Plus size={12} /> Agregar
                        </button>
                      )}
                      {usuario?.rol !== 'administrador' && (
                        <button onClick={() => toggleBloquearBimestre(bim)}
                          title={bimestresBlockeados[bim] ? 'Reabrir bimestre' : 'Marcar completo'}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', background: bimestresBlockeados[bim] ? 'var(--green-lt)' : '#f1f5f9', color: bimestresBlockeados[bim] ? 'var(--green)' : 'var(--slate)', border: '1.5px solid', borderColor: bimestresBlockeados[bim] ? '#86efac' : 'var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                          {bimestresBlockeados[bim] ? <LockIcon size={12} /> : <Unlock size={12} />}
                          {bimestresBlockeados[bim] ? 'Completo' : '✓ Marcar'}
                        </button>
                      )}
                    </div>
                  </div>
                  {criteriosPorBimestre[bim]?.length === 0 ? (
                    <p style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Sin criterios aún.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {criteriosPorBimestre[bim].map((c, i) => (
                        <CriterioChip key={i} nombre={c} bloqueado={!!bimestresBlockeados[bim] || usuario?.rol === 'administrador'}
                          onEliminar={() => eliminarCriterio(bim, c)}
                          onRenombrar={(nuevoNombre) => renombrarCriterio(bim, i, nuevoNombre)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}
          {sinCriterios && (
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--amber-lt)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>🏫 <strong>Convivencia</strong> — Registrá una nota directa por bimestre para cada alumno. Esta sección refleja el desempeño en convivencia escolar, actitud y comportamiento, de forma separada a las áreas curriculares.</p>
            </div>
          )}
          {estActuales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📋</div><p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>No hay estudiantes registrados</p><p style={{ fontSize: 13, marginTop: 4 }}>Los docentes de grado deben cargar alumnos en Gestión de Alumnos</p></div>
          ) : (
            <>
              {/* Barra búsqueda */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 24px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  type="text" value={busquedaAlumno}
                  onChange={e => setBusquedaAlumno(e.target.value)}
                  placeholder="Buscar alumno por nombre o DNI..."
                  style={{ flex: 1, maxWidth: 320, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', color: 'var(--text)' }} />
                {busquedaAlumno && <button onClick={() => setBusquedaAlumno('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={13} /></button>}
              </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    <th style={{ padding: '10px 11px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.9)', width: 30 }}>#</th>
                    <th style={{ padding: '9px 11px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', minWidth: 155 }}>Estudiante</th>
                    <th style={{ padding: '9px 11px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', minWidth: 90 }}>D.N.I.</th>
                    {[1, 2].map(b => {
                      const completo = estActuales.length > 0 && estActuales.every(e => e.bimestres?.[b]?.nota);
                      return (
                        <th key={b} style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>
                          {b}° Bimestre {completo && <span title="Todos con nota">✅</span>}
                        </th>
                      );
                    })}
                    <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', minWidth: 70, borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>1° Cuat.</th>
                    {[3, 4].map(b => {
                      const completo = estActuales.length > 0 && estActuales.every(e => e.bimestres?.[b]?.nota);
                      return (
                        <th key={b} style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>
                          {b}° Bimestre {completo && <span title="Todos con nota">✅</span>}
                        </th>
                      );
                    })}
                    <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', minWidth: 70, borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>2° Cuat.</th>
                    <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#3b1d8a', minWidth: 80, borderLeft: 'var(--bim-sep)' }}>Final</th>
                  </tr>
                </thead>
                <tbody>
                  {[...estActuales]
                    .filter(e => !busquedaAlumno || e.nombre.toLowerCase().includes(busquedaAlumno.toLowerCase()) || e.dni?.includes(busquedaAlumno))
                    .sort((a, b) => {
                    if ((a.sexo || 'V') !== (b.sexo || 'V')) return (a.sexo || 'V') === 'V' ? -1 : 1;
                    return a.nombre.localeCompare(b.nombre, 'es');
                  }).map((e, i) => {
                    const b1 = e.bimestres?.[1]?.nota || '';
                    const b2 = e.bimestres?.[2]?.nota || '';
                    const b3 = e.bimestres?.[3]?.nota || '';
                    const b4 = e.bimestres?.[4]?.nota || '';
                    const c1 = calcularCuatrimestre(b1, b2);
                    const c2 = calcularCuatrimestre(b3, b4);
                    const promFinal = calcularPromedioFinal(b1, b2, b3, b4);
                    const pf = parseFloat(promFinal);
                    const primerCiclo = esPrimerCiclo(grado);
                    const pfColor = isNaN(pf) ? 'bg-purple-600' : pf >= 7 ? 'bg-green-600' : pf >= 4 ? 'bg-amber-500' : 'bg-red-600';
                    const CeldaBimestre = ({ bim }) => {
                      const crits = criteriosPorBimestreEfectivo[bim] || [];
                      const bloqueado = bimestresBlockeados[bim];
                      const notaBim = e.bimestres?.[bim]?.nota || '';
                      return (
                        <td style={{ padding: '8px 11px', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)', minWidth: crits.length > 0 ? `${crits.length * 100 + 70}px` : '120px', background: bloqueado ? '#fef2f2' : 'inherit' }}>
                          {bloqueado && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>🔒</div>}
                          <div className="flex gap-1.5 items-end justify-center flex-wrap">
                            {crits.length === 0 ? (
                              <span className="text-xs font-bold text-gray-500 italic bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">Sin criterios</span>
                            ) : (
                              crits.map((crit, idx) => {
                                const campo = `n${idx + 1}`;
                                const val = e.bimestres?.[bim]?.[campo] ?? '';
                                const mostrar = primerCiclo && val !== '' ? abrevConceptual(val) : (val || '');
                                return (
                                  <div key={idx} className="flex flex-col items-center gap-0.5">
                                    {!sinCriterios && (
                                      <span className="text-center font-bold text-gray-800 leading-snug"
                                        style={{ fontSize: '10px', width: '90px', overflowWrap: 'break-word', wordBreak: 'break-word', hyphens: 'auto' }}>
                                        {crit}
                                      </span>
                                    )}
                                    {bloqueado || soloLectura ? (
                                      <div className="nota-input flex items-center justify-center font-black"
                                        style={{ fontSize: primerCiclo ? '9px' : '12px', backgroundColor: colorNota(val)?.bg || '', color: colorNota(val)?.text || '#374151' }}>
                                        {mostrar || '—'}
                                      </div>
                                    ) : (
                                      <NotaInput value={val} onCommit={v => actualizarCampo(e.id, bim, campo, v)} title={crit} primerCiclo={primerCiclo} />
                                    )}
                                  </div>
                                );
                              })
                            )}
                            {crits.length > 0 && (
                              <div className="flex flex-col items-center gap-0.5 ml-1">
                                <span className="text-[11px] font-bold text-purple-500">Prom.</span>
                                <div className="flex items-center justify-center font-black rounded-lg border-2"
                                  style={{ minWidth: '44px', height: '36px', fontSize: primerCiclo && notaBim ? '9px' : '13px', padding: '2px 4px', textAlign: 'center', backgroundColor: colorNota(notaBim)?.bg || '#f3f0ff', color: colorNota(notaBim)?.text || '#6b21a8', borderColor: colorNota(notaBim)?.bg || '#e9d5ff' }}>
                                  {notaBim ? (primerCiclo ? abrevConceptual(notaBim) : notaBim) : '-'}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    };
                    return (
                      <tr key={e.id} className="tabla-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 11px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '9px 11px', fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{e.nombre}</td>
                        <td style={{ padding: '9px 11px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>{e.dni || '-'}</td>
                        <CeldaBimestre bim={1} />
                        <CeldaBimestre bim={2} />
                        <td style={{ padding: '8px 11px', textAlign: 'center', background: '#eef2ff', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, height: 27, borderRadius: 5, fontSize: primerCiclo && c1 ? 9 : 12, fontWeight: 700, background: colorNota(c1)?.bg || '#eef2ff', color: colorNota(c1)?.text || 'var(--indigo)', border: '1.5px solid', borderColor: colorNota(c1)?.bg || '#c7d2fe' }}>
                            {c1 ? (primerCiclo ? textoConceptual(c1) : c1) : '—'}
                          </span>
                        </td>
                        <CeldaBimestre bim={3} />
                        <CeldaBimestre bim={4} />
                        <td style={{ padding: '8px 11px', textAlign: 'center', background: '#eef2ff', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, height: 27, borderRadius: 5, fontSize: primerCiclo && c2 ? 9 : 12, fontWeight: 700, background: colorNota(c2)?.bg || '#eef2ff', color: colorNota(c2)?.text || 'var(--indigo)', border: '1.5px solid', borderColor: colorNota(c2)?.bg || '#c7d2fe' }}>
                            {c2 ? (primerCiclo ? textoConceptual(c2) : c2) : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 11px', textAlign: 'center', borderLeft: 'var(--bim-sep)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, height: 27, borderRadius: 5, fontSize: primerCiclo && promFinal ? 9 : 13, fontWeight: 800, background: 'var(--violet)', color: '#fff', border: '1.5px solid var(--violet)' }}>
                            {promFinal ? (primerCiclo ? textoConceptual(promFinal) : promFinal) : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
          <div style={{ padding: '10px 24px', textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600, borderTop: '1px solid var(--border)', background: '#f8fafc' }}>
            ☁️ Los datos se sincronizan automáticamente con Firebase · {estActuales.length} estudiante(s) en {gradoLabel(grado)}
          </div>

          {/* ── Observaciones generales ── */}
          {(() => {
            if (estActuales.length === 0) return null;
            const datos = [1,2,3,4].map(bim => {
              const conNota = estActuales.filter(e => e.bimestres?.[bim]?.nota);
              const aprobados = conNota.filter(e => parseFloat(e.bimestres[bim].nota) >= 6).length;
              const desaprobados = conNota.filter(e => parseFloat(e.bimestres[bim].nota) < 6).length;
              return { bim, aprobados, desaprobados, total: conNota.length };
            }).filter(d => d.total > 0);
            if (datos.length === 0) return null;
            const maxVal = Math.max(...datos.flatMap(d => [d.aprobados, d.desaprobados]), 1);
            const barH = 80;
            return (
              <div style={{ margin: '0', padding: '20px 24px', borderTop: '1px solid var(--border)', background: '#fafbfc' }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, fontFamily: 'Outfit,sans-serif' }}>📊 Aprobados / Desaprobados por Bimestre</h3>
                <div className="flex items-end gap-6 justify-center">
                  {datos.map(d => (
                    <div key={d.bim} className="flex flex-col items-center gap-1">
                      <div className="flex items-end gap-1" style={{ height: `${barH + 20}px` }}>
                        <div className="flex flex-col items-center justify-end">
                          <span className="text-xs font-black text-green-700 mb-0.5">{d.aprobados}</span>
                          <div className="w-8 rounded-t-lg bg-green-400" style={{ height: `${Math.max(4, (d.aprobados / maxVal) * barH)}px` }} />
                        </div>
                        <div className="flex flex-col items-center justify-end">
                          <span className="text-xs font-black text-red-600 mb-0.5">{d.desaprobados}</span>
                          <div className="w-8 rounded-t-lg bg-red-400" style={{ height: `${Math.max(4, (d.desaprobados / maxVal) * barH)}px` }} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gray-500">{d.bim}° Bim.</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-2 ml-4 self-center">
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-400" /><span className="text-xs font-semibold text-gray-600">Aprobados (≥6)</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-400" /><span className="text-xs font-semibold text-gray-600">Desaprobados (&lt;6)</span></div>
                  </div>
                </div>
              </div>
            );
          })()}
          {estActuales.length > 0 && (
            <ObservacionesGenerales
              materia={materia}
              grado={grado}
              db={db}
              showToast={showToast}
              bimestresBlockeados={bimestresBlockeados}
            />
          )}
        </div>
      </div>
      <Toast visible={toastVisible} />
      {showModalSolicitudes && <ModalSolicitudes />}
      {modalCerrarSesion && <ModalCerrarSesion />}
      {showEscala && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'modalEntrada 0.2s ease-out' }}>
            <div className="bg-violet-50 px-6 py-4 flex items-center justify-between border-b">
              <h3 className="text-lg font-bold text-violet-800">📊 Escala Conceptual — 1°, 2° y 3° Grado</h3>
              <button onClick={() => setShowEscala(false)} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-500 mb-4 font-semibold">Las notas numéricas en el primer ciclo se expresan con la siguiente equivalencia:</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-violet-100">
                    <th className="p-2 pl-3 text-left font-bold text-violet-800 rounded-tl-lg">Nota</th>
                    <th className="p-2 pl-4 text-left font-bold text-violet-800">Abrev.</th>
                    <th className="p-2 pl-4 text-left font-bold text-violet-800 rounded-tr-lg">Calificación conceptual</th>
                  </tr>
                </thead>
                <tbody>
                  {escalaConceptual.map((e, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-violet-50'}>
                      <td className="p-2 font-bold text-gray-700">{e.min === e.max ? e.min : `${e.min} - ${e.max}`}</td>
                      <td className="p-2 font-black text-violet-700">{e.abrev}</td>
                      <td className="p-2 font-semibold text-gray-800">{e.texto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setShowEscala(false)}
                className="w-full py-2.5 rounded-xl bg-violet-500 text-white font-bold hover:bg-violet-600 transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Registro de Modificaciones (admin)
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Inasistencias
// ════════════════════════════════════════════════════════
function ModalInasistencias({ db, usuario, authUser, onClose, showAlert, showConfirm }) {
  const [tab, setTab] = useState('nueva');
  const [form, setForm] = useState({ asunto: '', desde: '', hasta: '', observacion: '' });
  const [archivos, setArchivos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [inasistencias, setInasistencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const fileInputRef = useRef(null);
  const isAdmin = usuario?.rol === 'administrador';

  useEffect(() => {
    const q = isAdmin
      ? query(collection(db, 'inasistencias'), orderBy('fecha', 'desc'))
      : query(collection(db, 'inasistencias'), where('uid', '==', authUser?.uid), orderBy('fecha', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setInasistencias(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargando(false);
    });
    return () => unsub();
  }, [db, authUser, isAdmin]);

  // Marcar como vista cuando admin abre una
  const marcarVista = async (inas) => {
    if (!isAdmin || inas.visto) return;
    try { await updateDoc(doc(db, 'inasistencias', inas.id), { visto: true }); } catch(e) {}
  };

  const handleArchivos = (e) => {
    const files = Array.from(e.target.files || []);
    const validos = files.filter(f => ['image/jpeg','image/png','image/jpg','application/pdf'].includes(f.type));
    if (validos.length !== files.length) showAlert('Solo se aceptan imágenes (JPG/PNG) y PDFs.', 'error');
    setArchivos(prev => [...prev, ...validos].slice(0, 5)); // max 5 archivos
  };

  const quitarArchivo = (idx) => setArchivos(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!form.asunto.trim()) return showAlert('El asunto es obligatorio.', 'error');
    if (!form.desde || !form.hasta) return showAlert('Las fechas son obligatorias.', 'error');
    if (new Date(form.desde) > new Date(form.hasta)) return showAlert('La fecha de inicio no puede ser posterior al fin.', 'error');
    setSubiendo(true);
    try {
      const storage = getStorage();
      const timestamp = Date.now();
      const archivosSubidos = [];
      for (const archivo of archivos) {
        const storageRef = ref(storage, `inasistencias/${authUser.uid}/${timestamp}_${archivo.name}`);
        await uploadBytes(storageRef, archivo);
        const url = await getDownloadURL(storageRef);
        archivosSubidos.push({ nombre: archivo.name, url, tipo: archivo.type });
      }
      await setDoc(doc(collection(db, 'inasistencias')), {
        uid: authUser.uid,
        nombreDocente: usuario.nombre,
        asunto: form.asunto.trim(),
        desde: form.desde,
        hasta: form.hasta,
        observacion: form.observacion.trim(),
        archivos: archivosSubidos,
        fecha: new Date().toISOString(),
        visto: false,
      });
      setForm({ asunto: '', desde: '', hasta: '', observacion: '' });
      setArchivos([]);
      setTab('historial');
      await showAlert('✅ Inasistencia enviada correctamente a dirección.', 'success', 'Enviado');
    } catch(e) {
      await showAlert('Error al enviar. Verificá tu conexión e intentá de nuevo.', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  const noVistas = inasistencias.filter(i => !i.visto).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', boxShadow: '0 24px 64px rgba(0,0,0,.2)', width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'modalEntrada 0.2s ease-out' }}>
        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif' }}>
            📋 {isAdmin ? 'Inasistencias docentes' : 'Mis inasistencias'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)' }}><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#f8fafc', flexShrink: 0 }}>
          {(isAdmin ? [['historial', '📋 Todas las inasistencias']] : [['nueva', '➕ Nueva inasistencia'], ['historial', '📋 Mis inasistencias']]).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); if (key === 'historial' && isAdmin) inasistencias.filter(i => !i.visto).forEach(i => marcarVista(i)); }}
              style={{ padding: '11px 20px', fontWeight: 700, fontSize: 14, border: 'none', borderBottom: tab === key ? '2px solid var(--navy)' : '2px solid transparent', background: 'none', color: tab === key ? 'var(--navy)' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter,sans-serif' }}>
              {label}
              {key === 'historial' && noVistas > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{noVistas}</span>}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

          {/* ── TAB NUEVA ── */}
          {tab === 'nueva' && !isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Asunto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Asunto *</label>
                <input type="text" value={form.asunto} placeholder="Ej: Licencia por enfermedad común, Licencia Art. 11..."
                  onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))}
                  className="n-field-input" />
              </div>
              {/* Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Desde *</label>
                  <input type="date" value={form.desde} onChange={e => setForm(f => ({ ...f, desde: e.target.value }))} className="n-field-input" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hasta *</label>
                  <input type="date" value={form.hasta} onChange={e => setForm(f => ({ ...f, hasta: e.target.value }))} className="n-field-input" />
                </div>
              </div>
              {/* Observación */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Observación (opcional)</label>
                <textarea value={form.observacion} placeholder="Podés agregar detalles adicionales aquí..."
                  onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
                  rows={3}
                  style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 15, fontFamily: 'Inter,sans-serif', color: 'var(--text)', outline: 'none', resize: 'vertical', transition: 'border-color .15s' }}
                  onFocus={e => e.target.style.borderColor='var(--indigo)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'} />
              </div>
              {/* Archivos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Archivos adjuntos (JPG, PNG, PDF — máx. 5)</label>
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: '24px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', transition: 'border-color .15s, background .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--navy)'; e.currentTarget.style.background='var(--navy-lt)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='#f8fafc'; }}>
                  <Upload size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate)', marginBottom: 4 }}>Hacé clic para adjuntar archivos</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>O arrastrá y soltá acá · JPG, PNG, PDF</p>
                  <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleArchivos} style={{ display: 'none' }} />
                </div>
                {archivos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {archivos.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--navy-lt)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                        <FileText size={16} style={{ color: 'var(--navy)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => quitarArchivo(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Botón enviar */}
              <button onClick={handleSubmit} disabled={subiendo} className="btn-primary"
                style={{ padding: '12px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: subiendo ? 0.6 : 1, cursor: subiendo ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif' }}>
                {subiendo
                  ? <><div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,.4)', borderTop: '3px solid #fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> Enviando...</>
                  : <><Paperclip size={17} /> Enviar inasistencia a dirección</>}
              </button>
            </div>
          )}

          {/* ── TAB HISTORIAL ── */}
          {tab === 'historial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cargando ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                  <div style={{ width: 36, height: 36, border: '4px solid var(--border)', borderTop: '4px solid var(--navy)', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 14 }}>Cargando...</p>
                </div>
              ) : inasistencias.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>📋</p>
                  <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                    {isAdmin ? 'No hay inasistencias cargadas aún' : 'Todavía no cargaste ninguna inasistencia'}
                  </p>
                </div>
              ) : (
                inasistencias.map((inas, i) => (
                  <div key={inas.id}
                    onClick={() => marcarVista(inas)}
                    style={{ border: '1.5px solid', borderColor: (!inas.visto && isAdmin) ? '#fcd34d' : 'var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', background: (!inas.visto && isAdmin) ? '#fefce8' : '#fff', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow='var(--sh)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        {isAdmin && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>{inas.nombreDocente}</p>}
                        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{inas.asunto}</p>
                        <p style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3 }}>
                          📅 {new Date(inas.desde + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          {inas.hasta !== inas.desde && <> → {new Date(inas.hasta + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</>}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                          {new Date(inas.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        {isAdmin
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: inas.visto ? 'var(--green-lt)' : 'var(--amber-lt)', color: inas.visto ? 'var(--green)' : 'var(--amber)' }}>
                              {inas.visto ? '✓ Vista' : '⏳ Sin revisar'}
                            </span>
                          : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: inas.visto ? 'var(--green-lt)' : 'var(--blue-lt)', color: inas.visto ? 'var(--green)' : '#1d4ed8' }}>
                              {inas.visto ? '✓ Revisada por dirección' : '📨 Enviada'}
                            </span>}
                      </div>
                    </div>
                    {inas.observacion && (
                      <p style={{ fontSize: 13, color: 'var(--slate)', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 11px', marginBottom: 10, lineHeight: 1.5 }}>
                        {inas.observacion}
                      </p>
                    )}
                    {inas.archivos?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {inas.archivos.map((a, j) => (
                          <a key={j} href={a.url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 6, background: 'var(--navy-lt)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--navy)', textDecoration: 'none', transition: 'background .15s' }}
                            onMouseEnter={e => e.currentTarget.style.background='#d4e4f7'}
                            onMouseLeave={e => e.currentTarget.style.background='var(--navy-lt)'}>
                            {a.tipo === 'application/pdf' ? <FileText size={14} /> : <Paperclip size={14} />}
                            {a.nombre}
                            <Download size={13} style={{ color: 'var(--muted)' }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalRegistroModificaciones({ db, onClose }) {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroDocente, setFiltroDocente] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'logs'),
      orderBy('fecha', 'desc'),
      limit(150)
    );
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargando(false);
    });
    return () => unsub();
  }, [db]);

  const docentes = [...new Set(logs.map(l => l.docente))].sort();
  const logsFiltrados = filtroDocente ? logs.filter(l => l.docente === filtroDocente) : logs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b"
          style={{ background: 'linear-gradient(135deg, #ea580c, #dc2626)' }}>
          <div>
            <h3 className="text-lg font-bold text-white">📋 Registro de Modificaciones</h3>
            <p className="text-xs text-orange-100 font-semibold">Últimas 150 modificaciones de notas</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>

        <div className="px-5 py-3 border-b bg-gray-50">
          <select value={filtroDocente} onChange={e => setFiltroDocente(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 bg-white">
            <option value="">Todos los docentes</option>
            {docentes.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {cargando ? (
            <div className="p-10 text-center text-gray-400 font-bold">⏳ Cargando registros...</div>
          ) : logsFiltrados.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p className="font-bold">Sin modificaciones registradas aún</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logsFiltrados.map(log => (
                <div key={log.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-800">
                        {log.docente}
                        <span className="text-gray-400 font-semibold"> modificó la nota de </span>
                        <span className="text-purple-700">{log.alumno}</span>
                      </p>
                      <p className="text-xs font-semibold text-gray-600 mt-0.5">
                        {log.materia} · {gradoLabel(log.grado)} · {log.bimestre}° Bimestre
                        {log.criterio && log.criterio !== 'n1' && ` · ${log.criterio}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-200">{log.antes}</span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className="text-xs font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-lg border border-green-200">{log.despues}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-gray-500">{log.fechaCorta}</p>
                      <p className="text-xs font-bold text-gray-400">{log.hora}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-gray-50">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Avisos de Dirección (docentes)
// ════════════════════════════════════════════════════════
function ModalAvisos({ db, avisos, authUser, onClose }) {
  useEffect(() => {
    // Marcar todos como leídos al abrir
    avisos.filter(a => !a.leidoPor?.[authUser?.uid]).forEach(async a => {
      await updateDoc(doc(db, 'avisos', a.id), { [`leidoPor.${authUser.uid}`]: true });
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b"
          style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
          <h3 className="text-lg font-bold text-white">🔔 Avisos de Dirección</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          {avisos.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p className="font-bold">Sin avisos por ahora</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {avisos.map(a => (
                <div key={a.id} className={`rounded-xl p-4 border-2 ${a.leidoPor?.[authUser?.uid] ? 'bg-gray-50 border-gray-100' : 'bg-amber-50 border-amber-200'}`}>
                  <p className="text-xs font-bold text-amber-700 mb-1">📅 {a.fechaCorta} · Dirección</p>
                  <p className="text-sm font-semibold text-gray-800 leading-relaxed">{a.texto}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Fechas Bimestres / Enviar Recordatorio
// ════════════════════════════════════════════════════════
function ModalFechasBimestre({ db, usuario, onClose }) {
  const esAdmin = usuario?.rol === 'administrador';
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const getBimestreActivo = () => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    return CIERRES_BIMESTRE.find(b => hoy >= b.inicio && hoy <= b.cierre) || null;
  };

  const enviarRecordatorio = async () => {
    const bim = getBimestreActivo();
    const mensaje = bim
      ? `📅 Estimados colegas: les recordamos que el ${bim.bim}° Bimestre finaliza el ${bim.cierreStr}. Les solicitamos cumplimentar en tiempo y forma con la carga de calificaciones y documentación correspondiente. Recuerden que cada alumno debe contar con un MÍNIMO de 3 (tres) notas registradas por bimestre. Saludos, Dirección — Escuela Provincial N° 185 "Juan Areco".`
      : `📅 Estimados colegas: les recordamos que deben mantener al día la carga de calificaciones y documentación correspondiente. Saludos, Dirección.`;
    setEnviando(true);
    try {
      await setDoc(doc(db, 'avisos', 'recordatorio_bimestre'), {
        texto: mensaje,
        fecha: new Date().toISOString(),
        fechaCorta: new Date().toLocaleDateString('es-AR'),
        leidoPor: {},
      });
      setEnviado(true);
      setTimeout(() => { setEnviado(false); onClose(); }, 1800);
    } finally {
      setEnviando(false);
    }
  };

  const colores = ['#6d28d9','#2563eb','#059669','#d97706'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b"
          style={{ background: 'linear-gradient(135deg, #6d28d9, #4c1d95)' }}>
          <h3 className="text-lg font-bold text-white">📅 Bimestres Ciclo Lectivo 2026</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>
        <div className="px-6 py-5">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #6d28d9, #4c1d95)' }}>
                <th className="py-3 px-4 text-left text-xs font-bold text-white">Bimestre</th>
                <th className="py-3 px-3 text-center text-xs font-bold text-white border-l border-purple-400">Inicio</th>
                <th className="py-3 px-3 text-center text-xs font-bold text-white border-l border-purple-400">Cierre</th>
                <th className="py-3 px-4 text-center text-xs font-bold text-white border-l border-purple-400" style={{ minWidth: 80 }}>Días</th>
              </tr>
            </thead>
            <tbody>
              {CIERRES_BIMESTRE.map((b, i) => {
                const hoy = new Date(); hoy.setHours(0,0,0,0);
                const activo = hoy >= b.inicio && hoy <= b.cierre;
                return (
                  <tr key={b.bim} className={activo ? 'bg-indigo-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td className="py-4 px-4" style={{ borderRight: '1px solid #e5e7eb' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colores[i] }} />
                        <span className="font-bold text-gray-800">{b.bim}° Bimestre</span>
                        {activo && <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">En curso</span>}
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center font-semibold text-gray-600" style={{ borderRight: '1px solid #e5e7eb' }}>
                      {b.inicioStr}
                    </td>
                    <td className="py-4 px-3 text-center font-bold" style={{ color: colores[i], borderRight: '1px solid #e5e7eb' }}>
                      {b.cierreStr}
                    </td>
                    <td className="py-4 px-4 text-center font-black text-gray-700 text-base" style={{ minWidth: 80 }}>
                      {b.dias}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50" style={{ borderTop: '2px solid #e5e7eb' }}>
                <td className="py-4 px-4" style={{ borderRight: '1px solid #e5e7eb' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
                    <span className="font-semibold text-gray-600 text-sm">Fortalecimiento de trayectorias, evaluación y promoción</span>
                  </div>
                </td>
                <td className="py-4 px-3 text-center font-semibold text-gray-500" style={{ borderRight: '1px solid #e5e7eb' }}>07/12/2026</td>
                <td className="py-4 px-3 text-center font-bold text-gray-500" style={{ borderRight: '1px solid #e5e7eb' }}>17/12/2026</td>
                <td className="py-4 px-4 text-center font-black text-gray-600 text-base" style={{ minWidth: 80 }}>8</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 text-center mt-3 font-semibold">Total: 190 días lectivos</p>
        </div>
        <div className="px-6 pb-5 flex flex-col gap-2">
          {esAdmin && (
            <button onClick={enviarRecordatorio} disabled={enviando || enviado}
              className="w-full py-2.5 rounded-xl font-bold text-white transition-all disabled:opacity-60"
              style={{ background: enviado ? '#059669' : 'linear-gradient(135deg, #6d28d9, #4c1d95)' }}>
              {enviado ? '✅ ¡Recordatorio enviado!' : enviando ? 'Enviando...' : '📢 Enviar recordatorio a todos los docentes'}
            </button>
          )}
          <button onClick={onClose}
            className="w-full py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-all">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Notificaciones Bimestres Completados
// ════════════════════════════════════════════════════════
function ModalNotifsBimestre({ db, notifs, onClose }) {
  const noLeidas = notifs.filter(n => !n.leida).length;

  const marcarTodasLeidas = async () => {
    const batch = notifs.filter(n => !n.leida);
    await Promise.all(batch.map(n => updateDoc(doc(db, 'notificacionesBimestre', n.id), { leida: true })));
  };

  const eliminarNotif = async (id) => {
    await deleteDoc(doc(db, 'notificacionesBimestre', id));
  };

  // Marcar como leídas al abrir
  useEffect(() => { if (noLeidas > 0) marcarTodasLeidas(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="bg-green-50 px-6 py-4 flex items-center justify-between border-b">
          <h3 className="text-lg font-bold text-green-800">✅ Bimestres Completados</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p className="font-bold">Sin notificaciones aún</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {notifs.map(n => (
                <div key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border ${n.leida ? 'bg-gray-50 border-gray-100' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{n.mensaje}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.fechaCorta}</p>
                  </div>
                  <button onClick={() => eliminarNotif(n.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal de Perfil (edición propia del docente)
// ════════════════════════════════════════════════════════
function ModalPerfil({ db, usuario, authUser, showAlert, onClose, onActualizar }) {
  const [nombre, setNombre] = useState(usuario?.nombre || '');
  const [gradosAsignados, setGradosAsignados] = useState(
    usuario?.gradosAsignados?.length > 0 ? usuario.gradosAsignados : [usuario?.gradoAsignado].filter(Boolean)
  );
  const [materiasAsignadas, setMateriasAsignadas] = useState(usuario?.materiasAsignadas || []);
  const [guardando, setGuardando] = useState(false);

  const toggleGradoPerfil = (g) => {
    setGradosAsignados(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const toggleGradoEspecialPerfil = (mNombre, g) => {
    setMateriasAsignadas(prev => prev.map(ma =>
      ma.nombre !== mNombre ? ma : {
        ...ma,
        grados: ma.grados.includes(g) ? ma.grados.filter(x => x !== g) : [...ma.grados, g]
      }
    ));
  };

  const guardar = async () => {
    if (!nombre.trim()) { await showAlert('El nombre no puede estar vacío.', 'warning'); return; }
    if (usuario.rol === 'docente_grado' && gradosAsignados.length === 0) {
      await showAlert('Seleccioná al menos un grado.', 'warning'); return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: capitalizarNombre(nombre),
        ...(usuario.rol === 'docente_grado' && {
          gradosAsignados,
          gradoAsignado: gradosAsignados[0] || usuario.gradoAsignado,
          materiasAsignadas,
        }),
        ...(usuario.rol === 'area_especial' && { materiasAsignadas }),
      };
      await updateDoc(doc(db, 'usuarios', authUser.uid), datos);
      onActualizar(datos);
      setGuardando(false);
      onClose();
      await showAlert('Tu perfil fue actualizado correctamente.', 'success', '✅ Guardado');
    } catch (e) {
      setGuardando(false);
      await showAlert('Error al guardar. Intentá de nuevo.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="bg-purple-50 px-6 py-4 flex items-center justify-between border-b">
          <h3 className="text-lg font-bold text-purple-800">👤 Mi Perfil</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Apellido y nombre(s)</label>
            <input type="text" value={nombre}
              onChange={e => setNombre(e.target.value)}
              onBlur={e => setNombre(capitalizarNombre(e.target.value))}
              placeholder="Ej: García, María José"
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold focus:outline-none focus:border-purple-500" />
          </div>
          {/* Email — solo lectura */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Correo electrónico</label>
            <div className="w-full px-4 py-2.5 border-2 border-gray-100 rounded-xl text-gray-400 font-semibold bg-gray-50 text-sm">
              {usuario?.email} <span className="text-xs">(no editable)</span>
            </div>
          </div>
          {/* Grados — docente de grado */}
          {usuario?.rol === 'docente_grado' && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Grados a cargo</label>
              <div className="border-2 border-gray-100 rounded-xl p-3">
                <div className="grid grid-cols-4 gap-1">
                  {grados.map(g => (
                    <label key={g} className="flex items-center gap-1 text-xs text-gray-700 font-semibold hover:bg-gray-50 rounded p-1 cursor-pointer">
                      <input type="checkbox" className="accent-purple-600"
                        checked={gradosAsignados.includes(g)}
                        onChange={() => toggleGradoPerfil(g)} />
                      {gradoLabel(g)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Materias asignadas</label>
                <div className="border-2 border-gray-100 rounded-xl p-3 space-y-1">
                  {areas.curriculares.map(m => (
                    <label key={m.nombre} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input type="checkbox" className="accent-purple-600 w-4 h-4"
                        checked={materiasAsignadas?.includes(m.nombre) || false}
                        onChange={() => setMateriasAsignadas(prev =>
                          prev.includes(m.nombre) ? prev.filter(x => x !== m.nombre) : [...prev, m.nombre]
                        )} />
                      <span className="text-sm text-gray-800 font-semibold">{m.icon} {m.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Grados por materia — área especial */}
          {usuario?.rol === 'area_especial' && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Materia asignada</label>
              <div className="mb-3 bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <span className="text-sm font-bold text-gray-700">{materiasAsignadas.map(ma => ma.nombre || ma).join(', ')}</span>
                <span className="text-xs text-gray-400 ml-auto">(solo la directora puede modificarla)</span>
              </div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Grados a cargo</label>
              {materiasAsignadas.map(ma => (
                <div key={ma.nombre} className="mb-4 border-2 border-gray-100 rounded-xl p-3">
                  <div className="grid grid-cols-4 gap-1">
                    {grados.map(g => (
                      <label key={g} className="flex items-center gap-1 text-xs text-gray-700 font-semibold hover:bg-gray-50 rounded p-1 cursor-pointer">
                        <input type="checkbox" className="accent-purple-600"
                          checked={ma.grados?.includes(g) || false}
                          onChange={() => toggleGradoEspecialPerfil(ma.nombre, g)} />
                        {gradoLabel(g)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end border-t pt-4">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="px-5 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-600 transition-all disabled:opacity-60">
            {guardando ? 'Guardando...' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Info PDF Unificado
// ════════════════════════════════════════════════════════
function InfoPDFUnificado() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="w-7 h-7 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-600 font-black text-base flex items-center justify-center transition-all border-2 border-indigo-200"
        title="¿Qué es el PDF Unificado?">
        ℹ️
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-white border-2 border-indigo-100 rounded-2xl shadow-xl p-4 w-68"
            style={{ animation: 'fadeIn 0.15s ease-out', minWidth: '260px' }}>
            <p className="font-black text-gray-800 text-sm mb-3">📄 ¿Qué incluye el PDF Unificado?</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-purple-50 rounded-xl p-2">
                <span className="text-purple-600 font-black text-xs mt-0.5">Pág. 1</span>
                <p className="text-xs text-gray-700 font-semibold">Promedios finales de todas las <strong>áreas curriculares</strong> (Lengua, Matemática, Cs. Sociales, etc.)</p>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-2">
                <span className="text-amber-600 font-black text-xs mt-0.5">Pág. 2</span>
                <p className="text-xs text-gray-700 font-semibold">Promedios finales de <strong>áreas especiales y talleres</strong> (Ed. Física, Inglés, Informática, etc.)</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 italic text-center">💡 Ideal para el boletín — menos hojas para imprimir.</p>
            <button onClick={() => setOpen(false)}
              className="mt-3 w-full py-1.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-all">
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Popup "Visto por"
// ════════════════════════════════════════════════════════
function VistoPopup({ uids, getNombre }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const btnRef = useRef(null);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setAbove(rect.top > 200);
    }
    setOpen(v => !v);
  };

  return (
    <div className="relative inline-block" ref={btnRef}>
      <button onClick={handleOpen}
        className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-all">
        👁️ {uids.length} visto(s)
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute ${above ? 'bottom-full mb-2' : 'top-full mt-2'} left-0 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl p-3 min-w-52 max-w-72`}
            style={{ animation: 'fadeIn 0.15s ease-out' }}>
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">👁️ Visto por:</p>
            {uids.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin lecturas aún</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {uids.map(uid => (
                  <span key={uid} className="text-xs bg-gray-50 text-gray-700 px-2 py-1 rounded-lg font-semibold border border-gray-100">{getNombre(uid)}</span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal de Mensajes
// ════════════════════════════════════════════════════════
function ModalMensajes({ db, usuario, authUser, mensajes, nombreMostrado, onClose, showConfirm }) {
  const esAdmin = usuario?.rol === 'administrador';
  const [destinatario, setDestinatario] = useState('todos');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [docentes, setDocentes] = useState([]);
  const [vista, setVista] = useState(esAdmin ? 'redactar' : 'bandeja');

  useEffect(() => {
    if (!esAdmin) return;
    const unsub = onSnapshot(collection(db, 'usuarios'), snap => {
      setDocentes(snap.docs.map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => u.rol !== 'administrador' && u.activo));
    });
    return () => unsub();
  }, [db, esAdmin]);

  const enviarMensaje = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const destinatarioNombre = destinatario === 'todos'
        ? 'Todos los docentes'
        : docentes.find(d => d.uid === destinatario)?.nombre || '—';
      await setDoc(doc(collection(db, 'mensajes')), {
        texto: texto.trim(),
        remitenteUid: authUser.uid,
        remitenteNombre: 'Raquel Noemí Maciszonek',
        destinatarioUid: destinatario,
        destinatarioNombre,
        fecha: new Date().toISOString(),
        fechaCorta: new Date().toLocaleDateString('es-AR'),
        leidoPor: {},
        confirmadoPor: {},
      });
      setTexto('');
      setVista('enviados');
    } finally {
      setEnviando(false);
    }
  };

  const confirmarRecibido = async (msg) => {
    await updateDoc(doc(db, 'mensajes', msg.id), {
      [`leidoPor.${authUser.uid}`]: true,
      [`confirmadoPor.${authUser.uid}`]: true,
    });
  };

  const eliminarMensaje = async (msg) => {
    const ok = await showConfirm(`¿Eliminás el mensaje "${msg.texto.substring(0,40)}..."?`, 'Eliminar mensaje');
    if (!ok) return;
    await deleteDoc(doc(db, 'mensajes', msg.id));
  };

  // Marcar como leído al abrir
  useEffect(() => {
    if (!authUser || esAdmin) return;
    mensajes.forEach(async (m) => {
      if (!m.leidoPor?.[authUser.uid]) {
        await updateDoc(doc(db, 'mensajes', m.id), {
          [`leidoPor.${authUser.uid}`]: true,
        });
      }
    });
  }, [mensajes, authUser, esAdmin, db]);

  const mensajesDocente = mensajes.filter(m =>
    m.destinatarioUid === authUser?.uid || m.destinatarioUid === 'todos'
  );
  const mensajesEnviados = mensajes.filter(m => m.remitenteUid === authUser?.uid);
  const confirmaciones = mensajesEnviados.map(m => ({
    ...m,
    cantConfirmados: Object.keys(m.confirmadoPor || {}).length,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="bg-blue-50 px-6 py-4 flex items-center justify-between border-b">
          <h3 className="text-lg font-bold text-blue-800">✉️ Mensajes</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>

        {/* Tabs */}
        {esAdmin ? (
          <div className="flex border-b">
            {[['redactar','✏️ Redactar'],['enviados','📤 Enviados']].map(([key,label]) => (
              <button key={key} onClick={() => setVista(key)}
                className={`flex-1 py-2.5 text-sm font-bold transition-colors ${vista === key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 font-semibold">
            Mensajes de la Dirección
          </div>
        )}

        <div className="max-h-[65vh] overflow-y-auto">
          {/* Admin: Redactar */}
          {esAdmin && vista === 'redactar' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Destinatario</label>
                <select value={destinatario} onChange={e => setDestinatario(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold bg-white focus:outline-none focus:border-blue-400">
                  <option value="todos">📢 Todos los docentes</option>
                  {docentes.map(d => (
                    <option key={d.uid} value={d.uid}>{d.nombre} — {d.rol === 'docente_grado' ? (d.gradosAsignados?.length > 0 ? d.gradosAsignados.map(gradoLabel).join(', ') : gradoLabel(d.gradoAsignado)) : 'Área Especial'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Mensaje</label>
                <textarea rows={5} value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder="Escribí tu mensaje acá..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold resize-none focus:outline-none focus:border-blue-400" />
              </div>
              <button onClick={enviarMensaje} disabled={!texto.trim() || enviando}
                className="btn-primary w-full py-3 rounded-xl bg-blue-500 text-white font-bold shadow disabled:opacity-50">
                {enviando ? 'Enviando...' : '📨 Enviar mensaje'}
              </button>
            </div>
          )}

          {/* Admin: Enviados con confirmaciones */}
          {esAdmin && vista === 'enviados' && (
            <div className="p-4 space-y-3">
              {mensajesEnviados.length === 0 ? (
                <div className="text-center py-10 text-gray-400"><p className="text-4xl mb-2">📭</p><p className="font-bold">No hay mensajes enviados</p></div>
              ) : (
                [...mensajesEnviados].reverse().map(m => {
                  const leidoUids = Object.keys(m.leidoPor || {});
                  const confirmadoUids = Object.keys(m.confirmadoPor || {});
                  const getNombre = (uid) => docentes.find(d => d.uid === uid)?.nombre || uid;
                  return (
                  <div key={m.id} className="border-2 border-gray-100 rounded-xl p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-bold text-blue-600">Para: {m.destinatarioNombre}</p>
                        <p className="text-xs text-gray-400 font-semibold">{m.fechaCorta}</p>
                      </div>
                      <button onClick={() => eliminarMensaje(m)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
                    </div>
                    <p className="text-sm text-gray-800 font-semibold leading-relaxed mb-3">{m.texto}</p>
                    <div className="flex gap-2 mb-3">
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">✅ {confirmadoUids.length} confirmado(s)</span>
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">👁️ {leidoUids.length} visto(s)</span>
                    </div>
                    {leidoUids.length > 0 && (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 uppercase tracking-wide">👁️ Visto por</div>
                        <table className="w-full">
                          <tbody>
                            {leidoUids.map((uid, idx) => (
                              <tr key={uid} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-1.5 text-xs font-semibold text-gray-700">{idx + 1}. {getNombre(uid)}</td>
                                <td className="px-3 py-1.5 text-xs text-right">
                                  {confirmadoUids.includes(uid)
                                    ? <span className="text-green-600 font-bold">✅ Confirmó</span>
                                    : <span className="text-gray-400">Visto</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* Docente: Bandeja de entrada */}
          {!esAdmin && (
            <div className="p-4 space-y-3">
              {mensajesDocente.length === 0 ? (
                <div className="text-center py-10 text-gray-400"><p className="text-4xl mb-2">📭</p><p className="font-bold">No tenés mensajes</p></div>
              ) : (
                [...mensajesDocente].reverse().map(m => {
                  const confirmado = m.confirmadoPor?.[authUser?.uid];
                  return (
                    <div key={m.id} className={`border-2 rounded-xl p-4 ${confirmado ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-bold text-blue-700">De: {m.remitenteNombre} · Directora</p>
                        <p className="text-xs text-gray-400 font-semibold">{m.fechaCorta}</p>
                      </div>
                      <p className="text-sm text-gray-800 font-semibold leading-relaxed mb-3">{m.texto}</p>
                      {confirmado ? (
                        <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-lg">✅ Confirmado</span>
                      ) : (
                        <button onClick={() => confirmarRecibido(m)}
                          className="btn-primary text-xs font-bold bg-blue-500 text-white px-4 py-1.5 rounded-lg shadow">
                          ✅ Confirmar recibido
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Observaciones Generales por materia/grado
// ════════════════════════════════════════════════════════
function ObservacionesGenerales({ materia, grado, db, showToast, bimestresBlockeados }) {
  const fsKey = safeKey(`${materia.nombre}_${grado}`);
  const [texto, setTexto] = useState('');
  const [cargado, setCargado] = useState(false);
  const [ultimaMod, setUltimaMod] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    setCargado(false);
    getDoc(doc(db, 'observaciones', fsKey)).then(snap => {
      setTexto(snap.exists() ? (snap.data().texto || '') : '');
      setUltimaMod(snap.exists() ? (snap.data().ultimaMod || '') : '');
      setCargado(true);
    });
  }, [fsKey, db]);

  const handleChange = (ev) => {
    const val = ev.target.value;
    setTexto(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const ahora = new Date().toLocaleString('es-AR');
      await setDoc(doc(db, 'observaciones', fsKey), { texto: val, ultimaMod: ahora }, { merge: true });
      setUltimaMod(ahora);
      if (showToast) showToast();
    }, 800);
  };

  if (!cargado) return null;
  return (
    <div className="mt-8 bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
      <h3 className="text-lg font-extrabold text-gray-800 mb-1">📝 Observaciones Generales</h3>
      <p className="text-sm text-gray-500 mb-4">Espacio para asentar novedades, situaciones grupales o cualquier anotación relevante del grupo.</p>
      <textarea
        rows={5}
        placeholder="Ej: El grupo muestra buena predisposición. Varios alumnos requieren refuerzo en escritura. Se realizó recuperatorio el 10/11..."
        className="w-full text-sm p-3 border-2 border-slate-200 rounded-xl resize-y focus:outline-none focus:border-purple-400 bg-white transition-colors"
        value={texto}
        onChange={handleChange}
      />
      <div className="flex justify-between items-center mt-1">
        <p className="text-xs text-gray-400 font-semibold">☁️ Se guarda automáticamente</p>
        {ultimaMod && <p className="text-xs text-gray-400 font-semibold">Última modificación: {ultimaMod}</p>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Entregas Docente (pantalla completa, solo admin)
// ════════════════════════════════════════════════════════
const ESTRUCTURA_ENTREGAS = {
  planificaciones: {
    label: 'Planificaciones',
    color: '#3b82f6',
    cols: ['Diagnóstico', 'Inf. diagnóstico', 'Anual', '1° Bimestre', '2° Bimestre', '3° Bimestre', '4° Bimestre']
  },
  seguimiento: {
    label: 'Seguimiento Pedagógico',
    color: '#8b5cf6',
    cols: ['1° Bimestre', '2° Bimestre', '3° Bimestre', '4° Bimestre']
  },
  libretas: {
    label: 'Presentación de Libretas',
    color: '#f59e0b',
    cols: ['1° Bimestre', '2° Bimestre', '3° Bimestre', '4° Bimestre']
  },
  registros: {
    label: 'Registros',
    color: '#10b981',
    cols: ['Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Cierre']
  }
};

function EntregasDocente({ db, globalStyles, modal, closeModal, showAlert, docente, onVolver, onCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, modalCerrarSesion }) {
  const [entregas, setEntregas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [filasExtra, setFilasExtra] = useState({});

  useEffect(() => {
    getDoc(doc(db, 'entregas', docente.uid)).then(snap => {
      const data = snap.exists() ? snap.data() : {};
      setEntregas(data);
      // Restaurar filas extra guardadas
      if (data.__filasExtra) setFilasExtra(data.__filasExtra);
      setCargando(false);
    });
  }, [db, docente.uid]);

  const actualizarCelda = async (key, valor) => {
    const nuevas = { ...entregas };
    if (!valor.trim()) { delete nuevas[key]; } else { nuevas[key] = valor; }
    setEntregas(nuevas);
    setGuardando(true);
    await setDoc(doc(db, 'entregas', docente.uid), nuevas);
    setGuardando(false);
  };

  const agregarFila = async (grupoKey) => {
    const actual = filasExtra[grupoKey] || 0;
    const nuevasFilas = { ...filasExtra, [grupoKey]: actual + 1 };
    setFilasExtra(nuevasFilas);
    const nuevasEntregas = { ...entregas, __filasExtra: nuevasFilas };
    setEntregas(nuevasEntregas);
    await setDoc(doc(db, 'entregas', docente.uid), nuevasEntregas);
  };

  const eliminarFila = async (grupoKey, filaIdx) => {
    // Limpiar datos de esa fila
    const nuevasEntregas = { ...entregas };
    Object.keys(nuevasEntregas).forEach(k => {
      if (k.includes(`_f${filaIdx}__`) && k.startsWith(grupoKey)) delete nuevasEntregas[k];
    });
    // Reducir contador
    const actual = filasExtra[grupoKey] || 0;
    const nuevasFilas = { ...filasExtra, [grupoKey]: Math.max(0, actual - 1) };
    setFilasExtra(nuevasFilas);
    nuevasEntregas.__filasExtra = nuevasFilas;
    setEntregas(nuevasEntregas);
    setGuardando(true);
    await setDoc(doc(db, 'entregas', docente.uid), nuevasEntregas);
    setGuardando(false);
  };

  const gradosDocente = docente.rol === 'docente_grado'
    ? (docente.gradosAsignados?.length > 0 ? docente.gradosAsignados : [docente.gradoAsignado].filter(Boolean))
    : [];

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
      <div className="text-white text-xl font-bold">Cargando...</div>
    </div>
  );

  const CeldaEditable = ({ keyStr }) => {
    const [local, setLocal] = useState(entregas[keyStr] || '');
    useEffect(() => { setLocal(entregas[keyStr] || ''); }, [keyStr, entregas[keyStr]]);
    return (
      <td className="border border-gray-300 p-0">
        <input
          type="text"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => actualizarCelda(keyStr, local)}
          placeholder="—"
          className={`w-full text-center font-bold py-1.5 px-1 outline-none transition-all ${local ? 'bg-green-50 text-green-700' : 'bg-white text-gray-300'}`}
          style={{ minWidth: '64px', fontSize: '12px', lineHeight: '1.3' }}
        />
      </td>
    );
  };

  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full p-4 md:p-6" style={{ background: '#e2e8f0' }}>
        <div className="max-w-full mx-auto bg-white rounded-2xl shadow-md p-4 fade-in" style={{ border: '1px solid var(--border)' }}>
          <TopBar titulo="📋 Documentaciones presentadas por Grados/Áreas - 2026" onInicio={onVolver} onCerrarSesion={onCerrarSesion} />

          <div className="mt-4 mb-4 flex flex-wrap items-center gap-4">
            <div>
              <p className="text-lg font-black text-gray-800">{docente.nombre}</p>
              <p className="text-sm text-purple-600 font-semibold">
                {docente.rol === 'docente_grado'
                  ? `Docente de Grado • ${gradosDocente.map(g => gradoLabel(g)).join(', ')}`
                  : `Área Especial • ${docente.materiasAsignadas?.map(ma => ma.nombre || ma).join(', ')}`}
              </p>
            </div>
            {guardando && <span className="text-xs font-bold text-purple-500 bg-purple-50 px-3 py-1 rounded-lg">Guardando ☁️</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse text-sm" style={{ minWidth: '1100px', width: '100%' }}>
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-100 p-2 text-center font-bold text-gray-700" style={{ minWidth: '90px' }}>Grado</th>
                  <th className="border border-gray-300 bg-gray-100 p-2 text-center font-bold text-gray-700" style={{ minWidth: '140px' }}>Docente</th>
                  {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { label, cols, color }]) => (
                    <th key={sec} colSpan={cols.length}
                      className="border border-gray-300 p-2 text-center font-bold text-white"
                      style={{ background: color, fontSize: '12px' }}>
                      {label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-gray-300 bg-gray-50 p-1"></th>
                  <th className="border border-gray-300 bg-gray-50 p-1"></th>
                  {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { cols, color }]) =>
                    cols.map(col => (
                      <th key={`${sec}-${col}`}
                        className="border border-gray-300 p-1 text-center font-bold"
                        style={{ color, background: `${color}18`, minWidth: '64px', fontSize: '11px' }}>
                        {col}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {docente.rol === 'docente_grado' ? (
                  gradosDocente.flatMap((g, gi) => {
                    const grupoKey = g;
                    const filasBase = [0, 1];
                    const extras = filasExtra[grupoKey] || 0;
                    const todasFilas = [...filasBase, ...Array.from({ length: extras }, (_, i) => 2 + i)];
                    return todasFilas.map(fila => (
                      <tr key={`${g}-${fila}`} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {fila === 0 ? (
                          <>
                            <td className="border border-gray-300 p-2 font-bold text-gray-700 text-sm text-center" rowSpan={todasFilas.length}>{gradoLabel(g)}</td>
                            <td className="border border-gray-300 p-2 text-gray-600 text-xs font-semibold text-center" rowSpan={todasFilas.length}>{docente.nombre}</td>
                          </>
                        ) : null}
                        {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { cols }], si) =>
                          cols.map((col, ci) => {
                            const keyStr = fila === 0 ? `${g}__${sec}__${col}` : `${g}_f${fila}__${sec}__${col}`;
                            const isFirst = si === 0 && ci === 0;
                            return (
                              <td key={keyStr} className="border border-gray-300 p-0 relative">
                                {isFirst && fila >= 2 && (
                                  <button onClick={() => eliminarFila(grupoKey, fila)}
                                    className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 text-red-400 hover:text-red-600 font-black text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center shadow border border-red-200">×</button>
                                )}
                                <input
                                  type="text"
                                  value={entregas[keyStr] || ''}
                                  onChange={e => { const v = e.target.value; setEntregas(prev => ({ ...prev, [keyStr]: v })); }}
                                  onBlur={e => actualizarCelda(keyStr, e.target.value)}
                                  placeholder="—"
                                  className={`w-full text-center font-bold py-1.5 px-1 outline-none transition-all ${entregas[keyStr] ? 'bg-green-50 text-green-700' : 'bg-white text-gray-300'}`}
                                  style={{ minWidth: '64px', fontSize: '12px', lineHeight: '1.3' }}
                                />
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ));
                  })
                ) : (
                  (docente.materiasAsignadas || []).flatMap((ma, mai) => {
                    const grupoKey = `esp${mai}`;
                    const filasBase = [0, 1];
                    const extras = filasExtra[grupoKey] || 0;
                    const todasFilas = [...filasBase, ...Array.from({ length: extras }, (_, i) => 2 + i)];
                    return todasFilas.map(fila => (
                      <tr key={`${mai}-${fila}`} className={mai % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {fila === 0 ? (
                          <>
                            <td className="border border-gray-300 p-2 font-bold text-gray-700 text-sm text-center" rowSpan={todasFilas.length}>
                              <div>{ma.nombre || ma}</div>
                              {ma.grados?.length > 0 && (
                                <div className="text-xs text-purple-600 font-semibold mt-1">{ma.grados.map(g => gradoLabel(g)).join(', ')}</div>
                              )}
                            </td>
                            <td className="border border-gray-300 p-2 text-gray-600 text-xs font-semibold text-center" rowSpan={todasFilas.length}>{docente.nombre}</td>
                          </>
                        ) : null}
                        {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { cols }], si) =>
                          cols.map((col, ci) => {
                            const keyStr = fila === 0 ? `especial__${sec}__${col}` : `${grupoKey}_f${fila}__${sec}__${col}`;
                            const isFirst = si === 0 && ci === 0;
                            return (
                              <td key={keyStr} className="border border-gray-300 p-0 relative">
                                {isFirst && fila >= 2 && (
                                  <button onClick={() => eliminarFila(grupoKey, fila)}
                                    className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 text-red-400 hover:text-red-600 font-black text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center shadow border border-red-200">×</button>
                                )}
                                <input
                                  type="text"
                                  value={entregas[keyStr] || ''}
                                  onChange={e => { const v = e.target.value; setEntregas(prev => ({ ...prev, [keyStr]: v })); }}
                                  onBlur={e => actualizarCelda(keyStr, e.target.value)}
                                  placeholder="—"
                                  className={`w-full text-center font-bold py-1.5 px-1 outline-none transition-all ${entregas[keyStr] ? 'bg-green-50 text-green-700' : 'bg-white text-gray-300'}`}
                                  style={{ minWidth: '64px', fontSize: '12px', lineHeight: '1.3' }}
                                />
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ));
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-400 font-semibold">💡 Escribí la fecha en cada celda y se guarda automáticamente al salir del campo</p>
            <div className="flex items-center gap-2">
              {docente.rol === 'docente_grado' && gradosDocente.length === 1 && (
                <button onClick={() => agregarFila(gradosDocente[0])}
                  className="px-4 py-2 rounded-xl bg-green-100 text-green-800 font-bold text-sm hover:bg-green-200 transition-all flex items-center gap-1 border-2 border-green-200">
                  ＋ Agregar fila
                </button>
              )}
              {docente.rol === 'docente_grado' && gradosDocente.length > 1 && (
                <select defaultValue="" onChange={e => { if (e.target.value) { agregarFila(e.target.value); e.target.value = ''; }}}
                  className="px-3 py-2 rounded-xl bg-green-100 text-green-800 font-bold text-sm border-2 border-green-200 cursor-pointer">
                  <option value="">＋ Agregar fila a...</option>
                  {gradosDocente.map(g => <option key={g} value={g}>{gradoLabel(g)}</option>)}
                </select>
              )}
              {docente.rol === 'area_especial' && (docente.materiasAsignadas || []).length === 1 && (
                <button onClick={() => agregarFila('esp0')}
                  className="px-4 py-2 rounded-xl bg-green-100 text-green-800 font-bold text-sm hover:bg-green-200 transition-all flex items-center gap-1 border-2 border-green-200">
                  ＋ Agregar fila
                </button>
              )}
              {docente.rol === 'area_especial' && (docente.materiasAsignadas || []).length > 1 && (
                <select defaultValue="" onChange={e => { if (e.target.value !== '') { agregarFila(`esp${e.target.value}`); e.target.value = ''; }}}
                  className="px-3 py-2 rounded-xl bg-green-100 text-green-800 font-bold text-sm border-2 border-green-200 cursor-pointer">
                  <option value="">＋ Agregar fila a...</option>
                  {(docente.materiasAsignadas || []).map((ma, i) => <option key={i} value={i}>{ma.nombre || ma}</option>)}
                </select>
              )}
              <button onClick={onVolver}
                className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition-all">
                ← Volver
              </button>
            </div>
          </div>
        </div>
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE SEPARADO: Editar Docente (pantalla completa)
// ════════════════════════════════════════════════════════
function EditarDocente({ db, globalStyles, modal, closeModal, showAlert, docente, onVolver, onCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, modalCerrarSesion }) {
  const [datos, setDatos] = useState({ ...docente });
  const [guardando, setGuardando] = useState(false);

  const toggleGrado = (g) => {
    const actual = datos.gradosAsignados?.length > 0 ? datos.gradosAsignados : [datos.gradoAsignado].filter(Boolean);
    const nuevo = actual.includes(g) ? actual.filter(x => x !== g) : [...actual, g];
    setDatos(prev => ({ ...prev, gradosAsignados: nuevo, gradoAsignado: nuevo[0] || '' }));
  };

  const toggleMateria = (nombre) => {
    setDatos(prev => ({
      ...prev,
      materiasAsignadas: prev.materiasAsignadas?.includes(nombre)
        ? prev.materiasAsignadas.filter(x => x !== nombre)
        : [...(prev.materiasAsignadas || []), nombre]
    }));
  };

  const toggleGradoEspecial = (mNombre, g) => {
    setDatos(prev => ({
      ...prev,
      materiasAsignadas: prev.materiasAsignadas.map(ma =>
        ma.nombre !== mNombre ? ma : {
          ...ma,
          grados: ma.grados.includes(g) ? ma.grados.filter(x => x !== g) : [...ma.grados, g]
        }
      )
    }));
  };

  const guardar = async () => {
    if (!datos.nombre?.trim()) { await showAlert('El nombre no puede estar vacío.', 'warning'); return; }
    if (datos.rol === 'docente_grado') {
      const gs = datos.gradosAsignados?.length > 0 ? datos.gradosAsignados : [datos.gradoAsignado].filter(Boolean);
      if (gs.length === 0) { await showAlert('Seleccioná al menos un grado.', 'warning'); return; }
    }
    setGuardando(true);
    try {
      const gradosAsig = datos.rol === 'docente_grado'
        ? (datos.gradosAsignados?.length > 0 ? datos.gradosAsignados : [datos.gradoAsignado].filter(Boolean))
        : null;
      await updateDoc(doc(db, 'usuarios', datos.uid), {
        nombre: capitalizarNombre(datos.nombre),
        gradoAsignado: gradosAsig ? gradosAsig[0] : null,
        gradosAsignados: gradosAsig,
        materiasAsignadas: datos.materiasAsignadas,
      });
      await showAlert('Docente actualizado correctamente.', 'success', '✅ Guardado');
      onVolver();
    } catch (e) {
      await showAlert('Error al guardar. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const gradosActuales = datos.gradosAsignados?.length > 0 ? datos.gradosAsignados : [datos.gradoAsignado].filter(Boolean);

  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full p-4 md:p-8" style={{ background: '#e2e8f0' }}>
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md p-6 md:p-10 fade-in" style={{ border: '1px solid var(--border)' }}>
          <TopBar titulo="✏️ Editar Docente" onInicio={onVolver} onCerrarSesion={onCerrarSesion} />

          <div className="mt-6 space-y-6">
            {/* Nombre */}
            <div className="bg-gray-50 rounded-2xl p-5 border-2 border-gray-100">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Apellido y nombre(s)</label>
              <input type="text"
                value={datos.nombre || ''}
                onChange={e => setDatos(prev => ({ ...prev, nombre: e.target.value }))}
                onBlur={e => setDatos(prev => ({ ...prev, nombre: capitalizarNombre(e.target.value) }))}
                placeholder="Apellido y nombre(s)..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold focus:outline-none focus:border-green-500 bg-white text-base" />
            </div>

            {/* Email — solo lectura */}
            <div className="bg-gray-50 rounded-2xl p-5 border-2 border-gray-100">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Correo electrónico</label>
              <div className="px-4 py-3 bg-gray-100 rounded-xl text-gray-500 font-semibold text-sm">
                {datos.email} <span className="text-xs text-gray-400">(no editable)</span>
              </div>
            </div>

            {/* Grados — docente de grado */}
            {datos.rol === 'docente_grado' && (
              <div className="bg-gray-50 rounded-2xl p-5 border-2 border-gray-100">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">Grados a cargo</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {grados.map(g => (
                    <label key={g} className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer border-2 transition-all font-semibold text-sm ${gradosActuales.includes(g) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'}`}>
                      <input type="checkbox" className="accent-green-600"
                        checked={gradosActuales.includes(g)}
                        onChange={() => toggleGrado(g)} />
                      {gradoLabel(g)}
                    </label>
                  ))}
                </div>
                <div className="mt-5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">Materias asignadas</label>
                  <div className="grid grid-cols-2 gap-2">
                    {areas.curriculares.map(m => (
                      <label key={m.nombre} className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border-2 transition-all ${datos.materiasAsignadas?.includes(m.nombre) ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200 hover:border-green-300'}`}>
                        <input type="checkbox" className="accent-green-600 w-4 h-4"
                          checked={datos.materiasAsignadas?.includes(m.nombre) || false}
                          onChange={() => toggleMateria(m.nombre)} />
                        <span className="text-sm text-gray-800 font-semibold">{m.icon} {m.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Grados por materia — área especial */}
            {datos.rol === 'area_especial' && (
              <div className="bg-gray-50 rounded-2xl p-5 border-2 border-gray-100">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">Materia(s) asignada(s)</label>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[...areas.especiales, ...areas.talleres].map(m => {
                    const activa = datos.materiasAsignadas?.some(ma => (ma.nombre || ma) === m.nombre);
                    return (
                      <label key={m.nombre} className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border-2 transition-all ${activa ? 'bg-green-50 border-green-400' : 'bg-white border-gray-200 hover:border-green-300'}`}>
                        <input type="checkbox" className="accent-green-600 w-4 h-4"
                          checked={activa}
                          onChange={() => {
                            setDatos(prev => {
                              const actual = prev.materiasAsignadas || [];
                              if (activa) {
                                return { ...prev, materiasAsignadas: actual.filter(ma => (ma.nombre || ma) !== m.nombre) };
                              } else {
                                // Heredar grados de la primera materia existente
                                const gradosHeredados = actual.length > 0 ? (actual[0].grados || []) : [];
                                return { ...prev, materiasAsignadas: [...actual, { nombre: m.nombre, grados: gradosHeredados }] };
                              }
                            });
                          }} />
                        <span className="text-sm text-gray-800 font-semibold">{m.icon} {m.nombre}</span>
                      </label>
                    );
                  })}
                </div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">Grados por materia</label>
                {datos.materiasAsignadas?.map(ma => (
                  <div key={ma.nombre || ma} className="mb-4 bg-white border-2 border-gray-200 rounded-xl p-4">
                    <p className="font-bold text-gray-800 text-sm mb-3">{ma.nombre || ma}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {grados.map(g => (
                        <label key={g} className={`flex items-center gap-1 p-2 rounded-lg cursor-pointer border-2 transition-all text-xs font-semibold ${ma.grados?.includes(g) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-green-300'}`}>
                          <input type="checkbox" className="accent-green-600"
                            checked={ma.grados?.includes(g) || false}
                            onChange={() => toggleGradoEspecial(ma.nombre || ma, g)} />
                          {gradoLabel(g)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={onVolver}
                className="px-6 py-3 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition-all">
                ← Volver
              </button>
              <button onClick={guardar} disabled={guardando}
                className="px-6 py-3 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 transition-all shadow disabled:opacity-60">
                {guardando ? 'Guardando...' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Chip de grado con dropdown para admin
// ════════════════════════════════════════════════════════
function ChipGradoAdmin({ grado, materia, tabActiva, onVerAlumnos, onVerCalificaciones }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--navy-lt)', color: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
        {gradoLabel(grado)} <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-md)', overflow: 'hidden', minWidth: 160, animation: 'fadeIn 0.1s ease-out' }}>
          <button onClick={() => { setOpen(false); onVerAlumnos(grado, tabActiva); }}
            style={{ width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--navy-lt)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}>
            👥 Ver alumnos
          </button>
          <button onClick={() => { setOpen(false); onVerCalificaciones(grado, materia, tabActiva); }}
            style={{ width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--violet-lt)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}>
            📊 Ver calificaciones
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: Modal Actividad Docente (para admin)
// ════════════════════════════════════════════════════════
function ModalActividadDocente({ db, docente, alumnosGlobales, onClose }) {
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState([]);
  const [expandidos, setExpandidos] = useState({});

  const toggleExpandido = (key) => setExpandidos(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const cargar = async () => {
      const gradosMaterias = docente.rol === 'docente_grado'
        ? (docente.gradosAsignados?.length > 0 ? docente.gradosAsignados : [docente.gradoAsignado].filter(Boolean))
            .flatMap(g => areas.curriculares.map(m => ({ grado: g, materia: m.nombre })))
        : (docente.materiasAsignadas || []).flatMap(ma =>
            (ma.grados || []).map(g => ({ grado: g, materia: ma.nombre || ma }))
          );

      const hoyLocal = new Date(); hoyLocal.setHours(0,0,0,0);
      const bimAct = CIERRES_BIMESTRE.find(b => hoyLocal >= b.inicio && hoyLocal <= b.cierre);

      const resultados = await Promise.all(
        gradosMaterias.map(async ({ grado, materia }) => {
          const [snapCal, snapConf] = await Promise.all([
            getDoc(doc(db, 'calificaciones', safeKey(`${materia}_${grado}`))),
            getDoc(doc(db, 'configuracion', safeKey(`${materia}_${grado}`))),
          ]);
          const estudiantes = snapCal.exists() ? (snapCal.data().estudiantes || []) : [];
          const criteriosPorBim = snapConf.exists() ? (snapConf.data().criterios || {}) : {};
          const totalAlumnos = (alumnosGlobales[grado] || []).length;

          const bimestresData = {};
          [1,2,3,4].forEach(bim => {
            const crits = criteriosPorBim[bim] || [];
            if (crits.length === 0) return;
            const critDetalles = crits.map((crit, ci) => {
              const campo = `n${ci + 1}`;
              const conNota = estudiantes.filter(e => {
                const v = e.bimestres?.[bim]?.[campo];
                return v && v !== '';
              }).length;
              return { nombre: crit, conNota, total: totalAlumnos };
            });
            const alumnosConPromedio = estudiantes.filter(e => e.bimestres?.[bim]?.nota).length;
            const sinNota = totalAlumnos - alumnosConPromedio;
            const tieneAlgunaNota = critDetalles.some(c => c.conNota > 0);
            if (!tieneAlgunaNota) return;
            bimestresData[bim] = { crits: critDetalles, alumnosConPromedio, sinNota, total: totalAlumnos };
          });

          const totalNotas = Object.values(bimestresData).reduce((a, b) => a + b.alumnosConPromedio, 0);
          return { grado, materia, totalAlumnos, bimestresData, totalNotas };
        })
      );

      const filtrados = resultados.filter(r => r.totalAlumnos > 0 && Object.keys(r.bimestresData).length > 0);
      setResumen(filtrados);
      if (filtrados.length > 0) setExpandidos({ [`${filtrados[0].materia}_${filtrados[0].grado}`]: true });
      setCargando(false);
    };
    cargar();
  }, [db, docente]);

  const totalNotasGlobal = resumen.reduce((a, r) => a + r.totalNotas, 0);
  const hoyLocal = new Date(); hoyLocal.setHours(0,0,0,0);
  const bimActivo = CIERRES_BIMESTRE.find(b => hoyLocal >= b.inicio && hoyLocal <= b.cierre);
  const pctGlobal = bimActivo
    ? Math.round((resumen.reduce((a, r) => a + (r.bimestresData[bimActivo.bim]?.alumnosConPromedio || 0), 0) /
        Math.max(1, resumen.reduce((a, r) => a + r.totalAlumnos, 0))) * 100)
    : 0;
  const asignaturaDocente = docente.rol === 'area_especial'
    ? (docente.materiasAsignadas?.[0]?.nombre || docente.materiasAsignadas?.[0] || '') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ animation: 'modalEntrada 0.2s ease-out' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
          <div>
            <h3 className="text-lg font-bold text-white">📊 Actividad de {docente.nombre}</h3>
            <p className="text-xs text-amber-100 font-semibold">
              {docente.rol === 'docente_grado' ? 'Docente de Grado' : `Área Especial${asignaturaDocente ? ` — ${asignaturaDocente}` : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>
        {cargando ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-gray-500 font-bold">Cargando actividad...</p>
            <p className="text-xs text-gray-400 mt-1">Esto puede tardar unos segundos</p>
          </div>
        ) : resumen.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="font-bold">Sin notas cargadas aún</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b bg-amber-50">
              <div className="bg-white rounded-xl p-3 text-center border-2 border-amber-100">
                <p className="text-2xl font-black text-amber-600">{totalNotasGlobal}</p>
                <p className="text-xs font-bold text-gray-500">Promedios cargados</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border-2 border-amber-100">
                <p className="text-2xl font-black text-amber-600">{resumen.length}</p>
                <p className="text-xs font-bold text-gray-500">Grados activos</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border-2 border-amber-100">
                <p className="text-2xl font-black" style={{ color: pctGlobal >= 75 ? '#16a34a' : pctGlobal >= 40 ? '#d97706' : '#dc2626' }}>
                  {bimActivo ? `${pctGlobal}%` : '—'}
                </p>
                <p className="text-xs font-bold text-gray-500">{bimActivo ? `Completitud ${bimActivo.bim}° Bim.` : 'Sin bimestre activo'}</p>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {resumen.map((r) => {
                const key = `${r.materia}_${r.grado}`;
                const abierto = expandidos[key];
                return (
                  <div key={key}>
                    <button onClick={() => toggleExpandido(key)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-black text-gray-800">{r.materia}</span>
                        <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{gradoLabel(r.grado)}</span>
                        <span className="text-xs font-bold text-gray-500">{r.totalNotas} promedio{r.totalNotas !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-gray-400 text-xs flex-shrink-0">{abierto ? '▲' : '▼'}</span>
                    </button>
                    {abierto && (
                      <div className="px-5 pb-4 space-y-3">
                        {Object.entries(r.bimestresData).map(([bim, data]) => (
                          <div key={bim} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs font-black text-gray-700 mb-2">{bim}° Bimestre</p>
                            <div className="space-y-1.5">
                              {data.crits.map((crit, ci) => (
                                <div key={ci} className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-gray-600 w-48 flex-shrink-0">• {crit.nombre}</span>
                                  <div className="w-20 bg-gray-200 rounded-full h-1.5 flex-shrink-0">
                                    <div className="h-1.5 rounded-full"
                                      style={{ width: `${Math.round((crit.conNota / crit.total) * 100)}%`, backgroundColor: crit.conNota === crit.total ? '#16a34a' : crit.conNota === 0 ? '#dc2626' : '#d97706' }} />
                                  </div>
                                  <span className={`text-xs font-black w-10 text-right flex-shrink-0 ${crit.conNota === crit.total ? 'text-green-600' : crit.conNota === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                                    {crit.conNota}/{crit.total}
                                  </span>
                                </div>
                              ))}
                              {data.sinNota > 0 && (
                                <p className="text-xs font-bold text-red-500 mt-1.5">❌ {data.sinNota} alumno{data.sinNota !== 1 ? 's' : ''} sin promedio de bimestre</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="px-5 py-3 border-t bg-gray-50">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
function GestionUsuarios({ db, globalStyles, modal, closeModal, showConfirm, showAlert, onInicio, onCerrarSesion, onEditarDocente, onVerEntregas, onVerAlumnos, onVerCalificaciones, onVerActividad, onAbrirMensajes, onAbrirBimestres, onAbrirModificaciones, onAbrirRecordatorio, onAbrirSolicitudes, onAbrirInasistencias, rolLabel, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge, initialTab }) {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [tabActiva, setTabActiva] = useState(initialTab || 'grado');
  const [seccion, setSeccion] = useState('docentes');
  const [inasistenciasNoVistasGU, setInasistenciasNoVistasGU] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'inasistencias'), where('visto', '==', false)),
      snap => setInasistenciasNoVistasGU(snap.size)
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.rol !== 'administrador'));
    });
    return () => unsub();
  }, [db]);

  const eliminarUsuario = async (u) => {
    const ok = await showConfirm(`¿Eliminás al docente "${u.nombre}" (${u.email})? Esta acción no se puede deshacer.`, 'Eliminar docente');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'usuarios', u.uid));
      await showAlert(`El docente "${u.nombre}" fue eliminado correctamente.`, 'success', 'Docente eliminado');
    } catch (error) {
      await showAlert('Hubo un error al eliminar el docente. Intentá de nuevo.', 'error');
    }
  };

  const ordenarUsuarios = (lista) => {
    return [...lista].sort((a, b) => {
      if (a.rol === 'docente_grado' && b.rol !== 'docente_grado') return -1;
      if (a.rol !== 'docente_grado' && b.rol === 'docente_grado') return 1;
      if (a.rol === 'docente_grado' && b.rol === 'docente_grado') {
        return (a.gradoAsignado || '').localeCompare(b.gradoAsignado || '', 'es', { numeric: true });
      }
      const mA = a.materiasAsignadas?.[0]?.nombre || a.materiasAsignadas?.[0] || '';
      const mB = b.materiasAsignadas?.[0]?.nombre || b.materiasAsignadas?.[0] || '';
      return mA.localeCompare(mB, 'es');
    });
  };

  const usuariosFiltrados = ordenarUsuarios(
    busqueda.trim() === '' ? usuarios : usuarios.filter(u =>
      u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.email?.toLowerCase().includes(busqueda.toLowerCase())
    )
  ).filter(u => tabActiva === 'grado' ? u.rol === 'docente_grado' : u.rol === 'area_especial');

  const navItems = [
    { key: 'docentes', icon: '👥', label: 'Docentes', sub: 'gestion' },
    { key: 'alumnos', icon: '📋', label: 'Alumnos', sub: 'gestion', action: () => onVerAlumnos('1°A', 'grado') },
  ];

  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full flex" style={{ background: '#e2e8f0' }}>
        {/* SIDEBAR */}
        <div style={{ width: 220, background: 'var(--navy)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
          <div style={{ padding: '20px 18px 12px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.9)', fontFamily: 'Outfit,sans-serif' }}>Panel de Dirección</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Raquel Noemí Maciszonek</p>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginBottom: 8 }}></div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,.3)', padding: '12px 18px 5px', textTransform: 'uppercase' }}>Gestión</p>
          {[
            { key: 'docentes', icon: '👥', label: 'Docentes' },
            { key: 'alumnos', icon: '📋', label: 'Alumnos', onClick: () => { onVerAlumnos('1°A', 'grado'); } },
          ].map(item => (
            <button key={item.key} onClick={item.onClick || (() => setSeccion(item.key))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: seccion === item.key ? 'rgba(255,255,255,.1)' : 'none', border: 'none', borderLeft: `3px solid ${seccion === item.key ? '#818cf8' : 'transparent'}`, cursor: 'pointer', color: seccion === item.key ? '#fff' : 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', textAlign: 'left' }}>
              {item.icon} {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', margin: '8px 0' }}></div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,.3)', padding: '8px 18px 5px', textTransform: 'uppercase' }}>Sistema</p>
          {[
            { icon: '✅', label: 'Bimestres completados', action: onAbrirBimestres },
            { icon: '📋', label: 'Modificaciones', action: onAbrirModificaciones },
            { icon: '✉️', label: 'Mensajes', action: onAbrirMensajes },
            { icon: '📢', label: 'Enviar recordatorio', action: onAbrirRecordatorio },
            { icon: '📋', label: 'Inasistencias', action: onAbrirInasistencias, badge: inasistenciasNoVistasGU },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: 'none', border: 'none', borderLeft: '3px solid transparent', cursor: 'pointer', color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', textAlign: 'left', transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color='#fff'}
              onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,.65)'}>
              {item.icon} {item.label}
              {item.badge > 0 && <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{item.badge}</span>}
            </button>
          ))}
          <div style={{ marginTop: 'auto', padding: '16px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <button onClick={onInicio}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,.08)', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', marginBottom: 8 }}>
              <Home size={14} /> Inicio
            </button>
            <button onClick={onCerrarSesion}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r)', background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.3)', color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Topbar */}
          <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '13px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20, boxShadow: 'var(--sh)' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>Gestión de Docentes</h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} size={14} />
                <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar docente..."
                  style={{ paddingLeft: 30, paddingRight: busqueda ? 28 : 12, padding: '9px 12px 9px 30px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', color: 'var(--text)', width: 220 }} />
                {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={13} /></button>}
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 28px' }} className="fade-in">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[['grado','🏫 Docentes de Grado'],['especial','🎨 Áreas Especiales']].map(([key, label]) => (
                <button key={key} onClick={() => setTabActiva(key)}
                  style={{ padding: '9px 20px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, border: '1.5px solid', borderColor: tabActiva === key ? 'var(--navy)' : 'var(--border)', background: tabActiva === key ? 'var(--navy)' : '#fff', color: tabActiva === key ? '#fff' : 'var(--slate)', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  {label}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid #bbf7d0', borderRadius: 20, fontSize: 12, fontWeight: 700, padding: '3px 14px' }}>
                {usuariosFiltrados.length} {busqueda ? 'resultado(s)' : 'docentes'}
              </span>
            </div>

            {/* Lista de docentes */}
            {usuariosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{busqueda ? '🔍' : '👤'}</div>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{busqueda ? `Sin resultados para "${busqueda}"` : 'No hay docentes registrados'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {usuariosFiltrados.map((u, i) => {
                  const inicial = (u.nombre || '?').charAt(0).toUpperCase();
                  const avatarColors = [
                    { bg: 'var(--violet-lt)', color: 'var(--violet)' },
                    { bg: 'var(--green-lt)', color: 'var(--green)' },
                    { bg: 'var(--amber-lt)', color: 'var(--amber)' },
                    { bg: 'var(--blue-lt)', color: '#1d4ed8' },
                  ];
                  const ac = avatarColors[i % 4];
                  const grados = u.gradosAsignados?.length > 0 ? u.gradosAsignados : [u.gradoAsignado].filter(Boolean);
                  return (
                    <div key={u.uid || i}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '13px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', transition: 'box-shadow .15s' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow='var(--sh)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                      {/* Avatar */}
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: ac.bg, color: ac.color, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'Outfit,sans-serif' }}>
                        {inicial}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{u.nombre}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                          {u.rol === 'docente_grado'
                            ? grados.map((g, j) => (
                                <div key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <ChipGradoAdmin grado={g} materia={u.materiasAsignadas?.[0] || ''}
                                    tabActiva={tabActiva} onVerAlumnos={onVerAlumnos} onVerCalificaciones={onVerCalificaciones} />
                                </div>
                              ))
                            : u.materiasAsignadas?.map((ma, j) => (
                                <span key={j} style={{ background: 'var(--amber-lt)', color: 'var(--amber)', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{ma.nombre}</span>
                              ))
                          }
                        </div>
                      </div>
                      {/* Estado */}
                      <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                        {u.activo
                          ? <span style={{ background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid #bbf7d0', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 10px' }}>✓ Activo</span>
                          : <span style={{ background: 'var(--amber-lt)', color: 'var(--amber)', border: '1px solid #fde68a', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 10px' }}>⏳ Pendiente</span>}
                      </div>
                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'center' }}>
                        <button onClick={() => onEditarDocente({ ...u })} className="btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--navy)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => onVerActividad({ ...u })} className="btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--amber-lt)', color: 'var(--amber)', border: '1.5px solid #fde68a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          📊 Actividad
                        </button>
                        <button onClick={() => onVerEntregas({ ...u })} className="btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--violet-lt)', color: 'var(--violet)', border: '1.5px solid #ddd6fe', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          📁 Entregas
                        </button>
                        <button onClick={() => eliminarUsuario(u)} className="btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r)', background: 'var(--red-lt)', color: 'var(--red)', border: '1.5px solid #fecaca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}


// ════════════════════════════════════════════════════════
// COMPONENTE: Calificaciones de Áreas Especiales (solo lectura para docentes de grado)
// ════════════════════════════════════════════════════════
function NotasEspeciales({ db, globalStyles, modal, closeModal, usuario, alumnosGlobales, todosUsuarios, onInicio, onCerrarSesion, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge, ChipsGrado }) {
  const gradosDisp = usuario?.gradosAsignados?.length > 0
    ? usuario.gradosAsignados
    : [usuario?.gradoAsignado].filter(Boolean);
  const [gradoSel, setGradoSel] = useState(gradosDisp[0] || '');
  const [materiasSel, setMateriasSel] = useState(null);
  const [calificaciones, setCalificaciones] = useState([]);
  const [configuracion, setConfiguracion] = useState({ criterios: { 1: [], 2: [], 3: [], 4: [] }, docente: '' });
  const [cargando, setCargando] = useState(false);

  const todasLasEspeciales = [
    { nombre: 'Educación Artística: Plástica', color1: '#fa709a', color2: '#fee140', icon: '🎨' },
    { nombre: 'Educación Física', color1: '#30cfd0', color2: '#330867', icon: '⚽' },
    { nombre: 'Informática', color1: '#a18cd1', color2: '#fbc2eb', icon: '💻' },
    { nombre: 'Lengua Extranjera: Inglés', color1: '#ff9a56', color2: '#ff6a88', icon: '🗣️' },
    { nombre: 'Educación Artística: Música', color1: '#c471f5', color2: '#fa71cd', icon: '🎵' },
    { nombre: 'Tecnología', color1: '#ff6b6b', color2: '#ee5a6f', icon: '🔧' },
    { nombre: 'Lengua Extranjera: Portugués', color1: '#4facfe', color2: '#00f2fe', icon: '📚' },
    { nombre: 'Laboratorio', color1: '#00c6ff', color2: '#0072ff', icon: '🧪' },
    { nombre: 'Taller de Ajedrez', color1: '#1a1a2e', color2: '#16213e', icon: '♟️' },
    { nombre: 'Taller de Música', color1: '#6d28d9', color2: '#4c1d95', icon: '🎼' },
    { nombre: 'Taller de Plástica', color1: '#be185d', color2: '#9d174d', icon: '🖌️' },
    { nombre: 'Taller de Danza', color1: '#ec4899', color2: '#be123c', icon: '💃' },
  ];

  const safeKeyLocal = (str) => str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ°]/g, '_');

  const cargarMateria = async (m) => {
    setMateriasSel(m);
    setCargando(true);
    try {
      const fsKey = safeKeyLocal(`${m.nombre}_${gradoSel}`);
      const [snapCal, snapConf] = await Promise.all([
        getDoc(doc(db, 'calificaciones', fsKey)),
        getDoc(doc(db, 'configuracion', fsKey)),
      ]);
      setCalificaciones(snapCal.exists() ? (snapCal.data().estudiantes || []) : []);
      setConfiguracion(snapConf.exists()
        ? { criterios: snapConf.data().criterios || { 1: [], 2: [], 3: [], 4: [] }, docente: snapConf.data().docente || '' }
        : { criterios: { 1: [], 2: [], 3: [], 4: [] }, docente: '' });
    } finally {
      setCargando(false);
    }
  };

  const calcCuat = (b1, b2) => { const n1 = parseFloat(b1), n2 = parseFloat(b2); return isNaN(n1) || isNaN(n2) ? '-' : ((n1 + n2) / 2).toFixed(2); };
  const calcFinal = (b1, b2, b3, b4) => {
    const vals = [b1, b2, b3, b4].map(parseFloat).filter(n => !isNaN(n));
    if (vals.length < 4) return '-';
    const c1 = (vals[0] + vals[1]) / 2; const c2 = (vals[2] + vals[3]) / 2;
    return ((vals[0] + vals[1] + vals[2] + vals[3] + c1 + c2) / 6).toFixed(2);
  };

  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full" style={{ background: '#e2e8f0' }}>
        {/* Topbar */}
        <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30, boxShadow: 'var(--sh)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onInicio}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Home size={14} /> Inicio
            </button>
            {materiasSel && (
              <button onClick={() => setMateriasSel(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--slate)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                ← Áreas
              </button>
            )}
            <span style={{ width: 1, height: 16, background: 'var(--border)', display: 'inline-block' }}></span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>
              📋 Calificaciones de Áreas Especiales
              {materiasSel && <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 13 }}> · {materiasSel.nombre}</span>}
            </span>
          </div>
          <button onClick={onCerrarSesion}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 'var(--r)', border: '1.5px solid #fecaca', background: 'var(--red-lt)', color: 'var(--red)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <LogOut size={14} /> Salir
          </button>
        </div>

        <div style={{ padding: '20px 24px' }} className="fade-in">
          {/* Banner solo lectura */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 'var(--r)', padding: '11px 16px', marginBottom: 16 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>👁️</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', lineHeight: 1.5 }}>
              Vista de <strong>solo lectura</strong>. Consultá las notas cargadas por los docentes especiales en tu grado (<strong>{gradoLabel(gradoSel)}</strong>) para completar los boletines.
            </p>
          </div>

          {/* Selector de grado */}
          {gradosDisp.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--navy-lt)', border: '1px solid var(--border)', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginRight: 6 }}>Grado:</p>
              <ChipsGrado lista={gradosDisp} seleccionado={gradoSel} onChange={(g) => { setGradoSel(g); setMateriasSel(null); }} />
            </div>
          )}

          {!materiasSel ? (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 12 }}>Seleccioná el área o taller:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {todasLasEspeciales.map(m => (
                  <button key={m.nombre} onClick={() => cargarMateria(m)}
                    className="card-materia"
                    style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                    <div style={{ width: 68, height: 68, borderRadius: 14, background: 'var(--navy-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{m.icon}</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, textAlign: 'center' }}>{m.nombre}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Header materia */}
              <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--navy-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>{materiasSel.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit,sans-serif' }}>{materiasSel.nombre}</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{gradoLabel(gradoSel)} · {calificaciones.length} estudiantes</p>
                  </div>
                  {(() => {
                    const docenteACargo = (todosUsuarios || []).find(u =>
                      u.rol === 'area_especial' &&
                      u.materiasAsignadas?.some(ma => (ma.nombre || ma) === materiasSel.nombre && ma.grados?.includes(gradoSel))
                    );
                    const nombreCargo = docenteACargo?.nombre || configuracion?.docente;
                    return nombreCargo ? (
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--violet-lt)', border: '1px solid #ddd6fe', borderRadius: 6, padding: '5px 11px' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)' }}>👤 {nombreCargo}</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                {cargando ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>⏳</p>
                    <p style={{ fontWeight: 600 }}>Cargando...</p>
                  </div>
                ) : calificaciones.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    <p style={{ fontSize: 40, marginBottom: 12 }}>📭</p>
                    <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Sin calificaciones cargadas aún</p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>El/la docente de {materiasSel.nombre} todavía no registró notas para {gradoLabel(gradoSel)}.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <td colspan="2" style={{ background: 'var(--navy)', padding: '4px' }}></td>
                          <td colspan="2" style={{ background: '#2a4a73', padding: '4px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.75)', textAlign: 'center', letterSpacing: '0.07em', textTransform: 'uppercase', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>1° BIMESTRE</td>
                          <td colspan="2" style={{ background: '#2a4a73', padding: '4px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.75)', textAlign: 'center', letterSpacing: '0.07em', textTransform: 'uppercase', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>2° BIMESTRE</td>
                          <td style={{ background: '#2e3a8a', padding: '4px', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}></td>
                          <td colspan="2" style={{ background: '#2a4a73', padding: '4px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.75)', textAlign: 'center', letterSpacing: '0.07em', textTransform: 'uppercase', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>3° BIMESTRE</td>
                          <td colspan="2" style={{ background: '#2a4a73', padding: '4px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.75)', textAlign: 'center', letterSpacing: '0.07em', textTransform: 'uppercase', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>4° BIMESTRE</td>
                          <td style={{ background: '#2e3a8a', padding: '4px', borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}></td>
                          <td style={{ background: '#3b1d8a', padding: '4px', borderLeft: 'var(--bim-sep)' }}></td>
                        </tr>
                        <tr style={{ background: 'var(--navy)' }}>
                          <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.9)', minWidth: 155 }}>Estudiante</th>
                          <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.9)', minWidth: 90 }}>D.N.I.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)' }}>Nota</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', borderRight: 'var(--bim-sep)' }}>Prom.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)' }}>Nota</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', borderRight: 'var(--bim-sep)' }}>Prom.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', minWidth: 70, borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>1° Cuat.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)' }}>Nota</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', borderRight: 'var(--bim-sep)' }}>Prom.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', borderLeft: 'var(--bim-sep)' }}>Nota</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', borderRight: 'var(--bim-sep)' }}>Prom.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#2e3a8a', minWidth: 70, borderLeft: 'var(--bim-sep)', borderRight: 'var(--bim-sep)' }}>2° Cuat.</th>
                          <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', background: '#3b1d8a', minWidth: 75, borderLeft: 'var(--bim-sep)' }}>Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calificaciones.map((e, i) => {
                          const b1 = e.bimestres?.[1]?.nota || '';
                          const b2 = e.bimestres?.[2]?.nota || '';
                          const b3 = e.bimestres?.[3]?.nota || '';
                          const b4 = e.bimestres?.[4]?.nota || '';
                          const c1 = calcCuat(b1, b2);
                          const c2 = calcCuat(b3, b4);
                          const pf = calcFinal(b1, b2, b3, b4);
                          const primerCiclo = esPrimerCiclo(gradoSel);
                          const fmtNota = (v) => v ? (primerCiclo ? abrevConceptual(v) : v) : '—';
                          const fmtTexto = (v) => v && v !== '-' ? (primerCiclo ? textoConceptual(v) : v) : '—';

                          const CeldaNota = ({ val, isCuat, isFinal }) => {
                            const col = colorNota(val);
                            const bg = isFinal ? 'var(--violet)' : isCuat ? '#eef2ff' : (col?.bg || '#f8fafc');
                            const color = isFinal ? '#fff' : isCuat ? 'var(--indigo)' : (col?.text || '#94a3b8');
                            const border = isFinal ? 'var(--violet)' : isCuat ? '#c7d2fe' : (col?.bg || '#e2e8f0');
                            return (
                              <td style={{ padding: '8px 11px', textAlign: 'center', borderLeft: isCuat || isFinal ? 'var(--bim-sep)' : undefined, borderRight: isCuat ? 'var(--bim-sep)' : undefined }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 42, height: 27, borderRadius: 5, fontSize: primerCiclo && val && val !== '-' ? 9 : 12, fontWeight: 700, background: bg, color, border: `1.5px solid ${border}` }}>
                                  {isCuat || isFinal ? fmtTexto(val) : fmtNota(val)}
                                </span>
                              </td>
                            );
                          };

                          return (
                            <tr key={e.id || i} className="tabla-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{e.nombre}</td>
                              <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)' }}>{e.dni || '-'}</td>
                              <CeldaNota val={b1} />
                              <CeldaNota val={b1} isCuat={true} />
                              <CeldaNota val={b2} />
                              <CeldaNota val={b2} isCuat={true} />
                              <CeldaNota val={c1} isCuat={true} />
                              <CeldaNota val={b3} />
                              <CeldaNota val={b3} isCuat={true} />
                              <CeldaNota val={b4} />
                              <CeldaNota val={b4} isCuat={true} />
                              <CeldaNota val={c2} isCuat={true} />
                              <CeldaNota val={pf} isFinal={true} />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}
