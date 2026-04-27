import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Save, Plus, Trash2, LogOut, Lock, Eye, EyeOff, Search, X, Mail, CheckCircle, Lock as LockIcon, Unlock, FileDown } from 'lucide-react';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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
  where
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── DATOS ESTÁTICOS ────────────────────────────────────────────────────────
const areas = {
  curriculares: [
    { nombre: 'Lengua y Literatura', color1: '#667eea', color2: '#764ba2', icon: '📖' },
    { nombre: 'Matemática', color1: '#f093fb', color2: '#f5576c', icon: '🔢' },
    { nombre: 'Ciencias Sociales', color1: '#4facfe', color2: '#00f2fe', icon: '🌍' },
    { nombre: 'Ciencias Naturales', color1: '#43e97b', color2: '#38f9d7', icon: '🌿' },
    { nombre: 'Formación Ética y Ciudadana', color1: '#ff6b9d', color2: '#c471ed', icon: '⚖️' },
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
  return escalaConceptual.find(e => n >= e.min && n <= e.max) || null;
};

const abrevConceptual = (nota) => {
  const c = getConceptual(nota);
  return c ? c.abrev : (nota || '');
};

const textoConceptual = (nota) => {
  const c = getConceptual(nota);
  return c ? `${c.texto} (${Math.round(parseFloat(nota))})` : (nota || '');
};

// ─── SISTEMA DE MODALES ──────────────────────────────────────────────────────
function useModal() {
  const [modal, setModal] = useState(null);
  const showAlert = useCallback((mensaje, tipo = 'info', titulo = null) =>
    new Promise(resolve => setModal({ tipo: 'alert', mensaje, tipo_icono: tipo, titulo, resolve })), []);
  const showConfirm = useCallback((mensaje, titulo = '¿Está seguro?') =>
    new Promise(resolve => setModal({ tipo: 'confirm', mensaje, titulo, resolve })), []);
  const showPrompt = useCallback((mensaje, placeholder = '', titulo = null) =>
    new Promise(resolve => setModal({ tipo: 'prompt', mensaje, placeholder, titulo, resolve })), []);
  const closeModal = useCallback((valor = null) => {
    setModal(prev => { if (prev?.resolve) prev.resolve(valor); return null; });
  }, []);
  return { modal, showAlert, showConfirm, showPrompt, closeModal };
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ animation: 'modalEntrada 0.2s ease-out' }}>
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
html, body, #root { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 100% !important; overflow-x: hidden; }
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
* { font-family: 'Nunito', sans-serif; box-sizing: border-box; }
@keyframes marquee { 0% { transform: translateX(0%) } 100% { transform: translateX(-33.33%) } }
.animate-marquee { display: inline-block; animation: marquee 22s linear infinite; }
@keyframes modalEntrada { from { opacity: 0; transform: scale(0.92) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.95); } }
.fade-in { animation: fadeIn 0.3s ease-out both; }
.card-materia { transition: transform 0.2s ease, box-shadow 0.2s ease; animation: fadeInUp 0.4s ease-out both; }
.card-materia:hover { transform: translateY(-4px) scale(1.03); box-shadow: 0 20px 40px rgba(0,0,0,0.18); }
.card-materia:nth-child(1) { animation-delay: 0.03s; }
.card-materia:nth-child(2) { animation-delay: 0.07s; }
.card-materia:nth-child(3) { animation-delay: 0.11s; }
.card-materia:nth-child(4) { animation-delay: 0.15s; }
.card-materia:nth-child(5) { animation-delay: 0.19s; }
.card-materia:nth-child(6) { animation-delay: 0.23s; }
.card-materia:nth-child(7) { animation-delay: 0.27s; }
.card-materia:nth-child(8) { animation-delay: 0.31s; }
.btn-primary { transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); filter: brightness(1.05); }
.btn-primary:active { transform: translateY(0); }
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 0.5; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
::-webkit-scrollbar-thumb { background: #c4b5fd; border-radius: 3px; }
.nota-input { width: 44px; height: 36px; padding: 2px; border: 2px solid #ddd6fe; border-radius: 6px; text-align: center; font-size: 13px; font-weight: 700; color: #374151; background: #faf5ff; transition: border-color 0.15s, background 0.15s; }
.nota-input:focus { outline: none; border-color: #7c3aed; background: #fff; }
.tabla-header { background: linear-gradient(135deg, #7c3aed, #9333ea); color: white; }
.tabla-row { transition: background-color 0.18s ease; }
.chip-grado { transition: all 0.15s ease; }
.chip-grado:hover { transform: scale(1.05); }
.toast-visible { animation: toastIn 0.25s ease-out both; }
`;

// ─── SUBCOMPONENTES ──────────────────────────────────────────────────────────
function TopBar({ titulo, onInicio, onCerrarSesion }) {
  return (
    <div className="flex justify-between items-center mb-6 pb-5 border-b-2 border-gray-100">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-800">{titulo}</h2>
      <div className="flex gap-2">
        <button onClick={onInicio} className="btn-primary flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow">
          <Home size={16} /> Inicio
        </button>
        <button onClick={onCerrarSesion} className="btn-primary flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow">
          <LogOut size={16} /> Salir
        </button>
      </div>
    </div>
  );
}

function ChipsGrado({ lista, seleccionado, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lista.map(g => (
        <button key={g} onClick={() => onChange(g)}
          className={`chip-grado px-4 py-2 rounded-xl font-bold text-sm ${seleccionado === g ? 'bg-purple-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-700'}`}>
          {gradoLabel(g)}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, color = 'purple' }) {
  const colores = { purple: 'bg-purple-100 text-purple-800', blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-800' };
  return <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${colores[color]}`}>{children}</span>;
}

function Spinner({ texto = 'Cargando...' }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-12 flex flex-col items-center gap-4">
        <div style={{ width: 48, height: 48, border: '5px solid #e9d5ff', borderTop: '5px solid #7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p className="font-bold text-gray-600">{texto}</p>
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
    if (/^(\d{0,2}([.,]\d{0,1})?)?$/.test(v)) {
      setLocal(v.replace(',', '.'));
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(local);
    if (!isNaN(n) && local !== '') {
      const clamped = Math.min(10, Math.max(1, Math.round(n * 2) / 2));
      const final = clamped % 1 === 0 ? String(clamped) : clamped.toFixed(1);
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
          style={{ borderRadius: 0, borderTop: '1px solid #ddd6fe', borderBottom: '1px solid #ddd6fe', fontSize: '9px', color: '#6d28d9', background: '#f5f3ff' }}
        >
          {abrevConceptual(local)}
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text" inputMode="decimal" className="nota-input"
          style={{ borderRadius: 0, borderTop: '1px solid #ddd6fe', borderBottom: '1px solid #ddd6fe' }}
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
    const fmt = (v) => v ? (primerCiclo ? textoConceptual(v) : v) : '—';
    return [e.nombre, fmt(b1), fmt(b2), fmt(c1raw), fmt(b3), fmt(b4), fmt(c2raw), fmt(pfraw)];
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

// ─── PDF UNIFICADO (docente de grado) ───────────────────────────────────────
async function generarPDFUnificado({ usuario, alumnosGlobales, db }) {
  const doc_ref = doc; // alias para no confundir con jsPDF doc
  try {
    const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdfDoc.internal.pageSize.getWidth();
    const hoy = new Date().toLocaleDateString('es-AR');
    const nombreDocente = usuario?.nombre || '—';
    const gradosDocente = usuario?.gradosAsignados?.length > 0
      ? usuario.gradosAsignados
      : [usuario?.gradoAsignado].filter(Boolean);
    const firmaX = pageW - 75;

    const encabezado = (titulo) => {
      pdfDoc.setFillColor(124, 58, 237);
      pdfDoc.rect(0, 0, pageW, 28, 'F');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Escuela Provincial N° 185 — "Juan Areco"', pageW / 2, 9, { align: 'center' });
      pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text(`${titulo}   |   Grado: ${gradosDocente.map(gradoLabel).join(', ')}   |   Docente: ${nombreDocente}`, pageW / 2, 17, { align: 'center' });
      pdfDoc.text(`Fecha: ${hoy}`, pageW / 2, 23, { align: 'center' });
    };

    const agregarFirma = (finalY) => {
      pdfDoc.setTextColor(60,60,60); pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.line(firmaX, finalY + 4, firmaX + 65, finalY + 4);
      pdfDoc.text(nombreDocente, firmaX + 32, finalY + 9, { align: 'center' });
      pdfDoc.text(`Docente de Grado ${gradosDocente.map(gradoLabel).join(', ')}`, firmaX + 32, finalY + 14, { align: 'center' });
      pdfDoc.text(hoy, firmaX + 32, finalY + 19, { align: 'center' });
    };

    // Reunir todos los alumnos de todos los grados del docente
    const todosAlumnos = gradosDocente.flatMap(g => (alumnosGlobales[g] || []).map(a => ({ ...a, grado: g })));
    const alumnosUnicos = todosAlumnos.filter((a, i, arr) => arr.findIndex(x => x.dni === a.dni) === i);
    const alumnosOrdenados = [...alumnosUnicos].sort((a, b) => {
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
        const primerCiclo = esPrimerCiclo(al.grado);
        row.push(pf ? (primerCiclo ? textoConceptual(pf) : pf) : '—');
      });
      return row;
    });

    const abreviarMateria = (nombre) => {
      const abrevs = {
        'Ciencias Sociales': 'Cs. Sociales',
        'Ciencias Naturales': 'Cs. Naturales',
        'Formación Ética y Ciudadana': 'Form. Ética',
        'Lengua y Literatura': 'Lengua y Lit.',
      };
      if (abrevs[nombre]) return abrevs[nombre];
      return nombre.length > 14 ? nombre.substring(0, 14) + '.' : nombre;
    };

    // ── PÁGINA 1: Áreas Curriculares ──
    const curriculares = areas.curriculares;
    const snapsCurr = await Promise.all(
      curriculares.flatMap(m => gradosDocente.map(g => getDoc(doc_ref(db, 'calificaciones', safeKey(`${m.nombre}_${g}`)))))
    );
    const datosCurr = curriculares.map((m, mi) => ({
      nombre: m.nombre,
      estudiantes: gradosDocente.flatMap((g, gi) => {
        const snap = snapsCurr[mi * gradosDocente.length + gi];
        return snap.exists() ? (snap.data().estudiantes || []) : [];
      })
    }));

    encabezado('Áreas Curriculares — Promedios Finales');
    const headCurr = [['#', 'Alumno/a', ...curriculares.map(m => abreviarMateria(m.nombre))]];
    autoTable(pdfDoc, {
      startY: 32, head: headCurr, body: buildBody(datosCurr),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, halign: 'center', lineColor: [200,200,200], lineWidth: 0.2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 10 }, 1: { halign: 'left', cellWidth: 52 } },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
    });
    agregarFirma(pdfDoc.lastAutoTable.finalY + 10);

    // ── PÁGINA 2: Áreas Especiales ──
    pdfDoc.addPage();
    const especiales = [...areas.especiales, ...areas.talleres];
    const snapsEsp = await Promise.all(
      especiales.flatMap(m => gradosDocente.map(g => getDoc(doc_ref(db, 'calificaciones', safeKey(`${m.nombre}_${g}`)))))
    );
    const datosEsp = especiales.map((m, mi) => ({
      nombre: m.nombre,
      estudiantes: gradosDocente.flatMap((g, gi) => {
        const snap = snapsEsp[mi * gradosDocente.length + gi];
        return snap.exists() ? (snap.data().estudiantes || []) : [];
      })
    })).filter(d => d.estudiantes.some(e => {
      const pf = calcularPromedioFinal(e.bimestres?.[1]?.nota||'', e.bimestres?.[2]?.nota||'', e.bimestres?.[3]?.nota||'', e.bimestres?.[4]?.nota||'');
      return !!pf;
    }));

    encabezado('Áreas Especiales y Talleres — Promedios Finales');
    if (datosEsp.length === 0) {
      pdfDoc.setFontSize(10); pdfDoc.setTextColor(150,150,150);
      pdfDoc.text('Sin calificaciones de áreas especiales cargadas.', pageW / 2, 50, { align: 'center' });
    } else {
      const headEsp = [['#', 'Alumno/a', ...datosEsp.map(d => abreviarMateria(d.nombre))]];
      autoTable(pdfDoc, {
        startY: 32, head: headEsp, body: buildBody(datosEsp),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, halign: 'center', lineColor: [200,200,200], lineWidth: 0.2 },
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 10 }, 1: { halign: 'left', cellWidth: 52 } },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        tableLineColor: [180, 180, 180], tableLineWidth: 0.3,
      });
      agregarFirma(pdfDoc.lastAutoTable.finalY + 10);
    }

    pdfDoc.save(`PDF_Unificado_${nombreDocente.replace(/[^\w]/g,'_')}_${hoy.replace(/\//g,'-')}.pdf`);
    return true;
  } catch(err) {
    console.error('Error PDF unificado:', err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function SistemaCalificaciones() {
  const { modal, showAlert, showConfirm, showPrompt, closeModal } = useModal();

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
  const [docenteEditando, setDocenteEditando] = useState(null);
  const [docenteEntregas, setDocenteEntregas] = useState(null);
  const [notifsBimestre, setNotifsBimestre] = useState([]);
  const [showNotifsBimestre, setShowNotifsBimestre] = useState(false);

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
  useEffect(() => {
    if (!authUser || usuario?.rol !== 'administrador') return;
    const unsub = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const lista = snapshot.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.activo === false);
      setSolicitudes(lista);
    });
    return () => unsub();
  }, [authUser, usuario]);

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
  }, [authUser, usuario]);
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
  }, [authUser, usuario]);

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
      const idx = nuevos[gradoActual].findIndex(a => a.dni === alumnoForm.editando.dni);
      if (idx !== -1) nuevos[gradoActual][idx] = { nombre: alumnoForm.nombre.trim(), dni: alumnoForm.dni.trim(), sexo: alumnoForm.sexo || 'V' };
    } else {
      if (nuevos[gradoActual].some(a => a.dni === alumnoForm.dni.trim())) {
        await showAlert('Ya existe un alumno con ese DNI en este grado.', 'warning'); return;
      }
      nuevos[gradoActual].push({ nombre: alumnoForm.nombre.trim(), dni: alumnoForm.dni.trim(), sexo: alumnoForm.sexo || 'V' });
    }
    await setDoc(doc(db, 'datos', 'alumnosGlobales'), nuevos);
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
    if (bimestresBlockeados[bimestre]) return; // bloqueado
    const key = `${materia.nombre}-${grado}`;
    const fsKey = safeKey(`${materia.nombre}_${grado}`);
    setEstudiantes(prev => {
      const nuevos = { ...prev };
      const lista = (nuevos[key] || []).map(est => {
        if (est.id !== id) return est;
        const nuevoBim = { ...est.bimestres[bimestre], [campo]: valor };
        if (campo.startsWith('n')) {
          const notas = ['n1','n2','n3','n4','n5'].map(k => parseFloat(nuevoBim[k])).filter(n => !isNaN(n) && n > 0);
          nuevoBim.nota = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : '';
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

  const toggleBloquearBimestre = async (bim) => {
    const bloqueando = !bimestresBlockeados[bim];
    const nuevo = { ...bimestresBlockeados, [bim]: bloqueando };
    setBimestresBlockeados(nuevo);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { bimestresBlockeados: nuevo }, { merge: true });
    // Si está completando (bloqueando), disparar notificación a la directora
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
    if (usuario.rol === 'administrador') return [...areas.curriculares, ...areas.especiales, ...areas.talleres];
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

  if (pantalla === 'login') return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)' }}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 w-full max-w-md fade-in">
          <div className="text-center mb-8">
            <img
              src="https://scontent.fres2-1.fna.fbcdn.net/v/t39.30808-6/250838744_105881078567433_8505050702522636894_n.jpg?_nc_cat=106&ccb=1-7&_nc_sid=1d70fc&_nc_ohc=odhG9vvlZ94Q7kNvwFg11cz&_nc_oc=AdoR60NWvlmixckn9Q40Z4EAjLLrCFdN7Wes1sdww8aLuzWH-RWGYpwGRy_SLr3Vdic&_nc_zt=23&_nc_ht=scontent.fres2-1.fna&_nc_gid=LL7-rYWA7g6YQcnaJa-mSg&_nc_ss=7a389&oh=00_Af36MpLFP7VChoP1o1NJZENNKHd_sG5yZyslLcEdBJwScQ&oe=69E8C653"
              alt="Escuela Provincial N° 185"
              className="mx-auto mb-3 rounded-2xl shadow-md"
              style={{ width: 190, height: 150, objectFit: 'cover' }}
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }}
            />
            <div className="text-6xl mb-3" style={{ display: 'none' }}>🏫</div>
            <h1 className="text-2xl font-extrabold text-gray-800 leading-tight">Escuela Provincial N° 185</h1>
            <h2 className="text-xl font-bold text-purple-700 mb-1">"Juan Areco"</h2>
            <p className="text-sm text-gray-500 font-semibold tracking-wide uppercase">Sistema de Calificaciones · 2026</p>
          </div>
          {!registro.show ? (
            <>
              <h3 className="text-xl font-extrabold text-gray-700 mb-5 text-center">Iniciar Sesión</h3>
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input type="email" value={loginForm.email}
                    onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder={loginForm.recordarme ? '' : 'Correo electrónico'}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input type={loginForm.verPass ? 'text' : 'password'} value={loginForm.pass}
                    onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder={loginForm.recordarme ? '' : 'Contraseña'}
                    className="w-full pl-10 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                  <button onClick={() => setLoginForm({ ...loginForm, verPass: !loginForm.verPass })}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                    {loginForm.verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {/* Recordarme */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div onClick={() => setLoginForm(f => ({ ...f, recordarme: !f.recordarme }))}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${loginForm.recordarme ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>
                    {loginForm.recordarme && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span className="text-sm text-gray-600 font-semibold">Recordarme</span>
                </label>
                <button onClick={handleLogin} disabled={loginCargando}
                  className="btn-primary w-full py-3 rounded-xl font-extrabold text-white text-lg shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}>
                  {loginCargando
                    ? <div style={{ width: 24, height: 24, border: '3px solid rgba(255,255,255,0.4)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : 'Ingresar →'}
                </button>
              </div>
              <button onClick={() => setRegistro({ ...registro, show: true })}
                className="btn-primary w-full mt-4 py-2.5 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 transition-all">
                + Registrar nuevo usuario
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center">Registrar Usuario</h3>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {[
                  { val: registro.data.nombre,   key: 'nombre',   ph: 'Ej: García, María José',               type: 'text' },
                  { val: registro.data.email,    key: 'email',    ph: 'Correo electrónico (Gmail u otro)',     type: 'email' },
                  { val: registro.data.password, key: 'password', ph: 'Contraseña (mín. 6 caracteres)',        type: 'password' },
                ].map(({ val, key, ph, type }) => (
                  <input key={key} type={type} value={val} placeholder={ph}
                    onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, [key]: e.target.value } }))}
                    onBlur={key === 'nombre' ? e => setRegistro(r => ({ ...r, data: { ...r.data, nombre: capitalizarNombre(e.target.value) } })) : undefined}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                ))}
                <select value={registro.data.rol}
                  onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, rol: e.target.value, materiasAsignadas: [] } }))}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold bg-white focus:outline-none focus:border-purple-500">
                  <option value="docente_grado">Docente de Grado</option>
                  <option value="area_especial">Docente Área Especial</option>
                </select>
                {registro.data.rol === 'docente_grado' && (
                  <div className="border-2 border-purple-200 rounded-xl p-3 bg-purple-50">
                    <p className="font-bold text-purple-800 mb-3 text-sm uppercase tracking-wide">Grados a cargo</p>
                    <div className="grid grid-cols-4 gap-1">
                      {grados.map(g => (
                        <label key={g} className="flex items-center gap-1 text-xs text-gray-700 font-semibold hover:bg-white rounded p-1 cursor-pointer">
                          <input type="checkbox"
                            checked={(registro.data.gradosAsignados || [registro.data.gradoAsignado]).includes(g)}
                            onChange={() => {
                              const actual = registro.data.gradosAsignados || [registro.data.gradoAsignado].filter(Boolean);
                              const nuevo = actual.includes(g) ? actual.filter(x => x !== g) : [...actual, g];
                              setRegistro(r => ({ ...r, data: { ...r.data, gradosAsignados: nuevo } }));
                            }}
                            className="accent-purple-600" /> {gradoLabel(g)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-2 border-gray-200 rounded-xl p-3">
                  <p className="font-bold text-gray-700 mb-2 text-sm uppercase tracking-wide">Materias asignadas</p>
                  {materiasRegistro.map(m => (
                    <label key={m.nombre} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input type="checkbox"
                        checked={registro.data.rol === 'docente_grado' ? registro.data.materiasAsignadas.includes(m.nombre) : registro.data.materiasAsignadas.some(ma => ma.nombre === m.nombre)}
                        onChange={() => toggleMateriaRegistro(m.nombre)} className="accent-purple-600 w-4 h-4" />
                      <span className="text-sm text-gray-800 font-semibold">{m.icon} {m.nombre}</span>
                    </label>
                  ))}
                </div>
                {registro.data.rol === 'area_especial' && registro.data.materiasAsignadas.length > 0 && (
                  <div className="border-2 border-purple-200 rounded-xl p-3 bg-purple-50">
                    <p className="font-bold text-purple-800 mb-3 text-sm uppercase tracking-wide">Grados por materia</p>
                    {registro.data.materiasAsignadas.map(ma => (
                      <div key={ma.nombre} className="mb-3">
                        <p className="font-bold text-gray-800 mb-1 text-sm">{ma.nombre}</p>
                        <div className="grid grid-cols-4 gap-1">
                          {grados.map(g => (
                            <label key={g} className="flex items-center gap-1 text-xs text-gray-700 font-semibold hover:bg-white rounded p-1 cursor-pointer">
                              <input type="checkbox" checked={ma.grados.includes(g)} onChange={() => toggleGradoRegistro(ma.nombre, g)} className="accent-purple-600" /> {gradoLabel(g)}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setRegistro({ show: false, data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] } })} className="flex-1 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition-all">Cancelar</button>
                <button onClick={handleRegistro} disabled={registroCargando}
                  className="btn-primary flex-1 py-2.5 rounded-xl text-white font-bold shadow disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}>
                  {registroCargando ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (pantalla === 'administracion') {
    const gradoActual = usuario?.rol === 'docente_grado' ? (usuario.gradosAsignados?.[0] || usuario.gradoAsignado) : grado;
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full p-2 md:p-4" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div className="w-[95%] max-w-none mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
            <TopBar titulo="👥 Gestión de Alumnos" onInicio={() => { setVolverAGestion(false); setPantalla('inicio'); }} onCerrarSesion={() => setModalCerrarSesion(true)} />
            <div className="mb-4 flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4">
              <span className="text-xl mt-0.5">⚠️</span>
              <p className="text-amber-800 font-semibold text-sm leading-relaxed">Exclusivo para docentes de grado. Los alumnos cargados acá aparecerán en <strong>todas las materias</strong> del grado automáticamente.</p>
            </div>
            {volverAGestion && usuario?.rol === 'administrador' && (
              <button onClick={() => { setVolverAGestion(false); setPantalla('gestion_usuarios'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                className="mb-4 self-start flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-800 px-4 py-2 rounded-xl font-bold text-sm border-2 border-green-200 transition-all">
                ← Volver a Gestión de Docentes
              </button>
            )}
            {usuario?.rol !== 'docente_grado' && (
              <div className="mb-6">
                <p className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Seleccioná el grado:</p>
                <ChipsGrado lista={grados} seleccionado={grado} onChange={setGrado} />
              </div>
            )}
            <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
              <h3 className="text-lg font-extrabold text-gray-800 mb-4">{alumnoForm.editando ? '✏️ Editar alumno' : '➕ Agregar alumno'} <span className="text-blue-600">• {gradoLabel(gradoActual)}</span></h3>
              <div className="flex flex-wrap gap-3">
                <input type="text" value={alumnoForm.nombre} onChange={e => setAlumnoForm({ ...alumnoForm, nombre: e.target.value })}
                  onBlur={e => setAlumnoForm(f => ({ ...f, nombre: capitalizarNombre(e.target.value) }))}
                  placeholder="Ej: García, María José"
                  className="flex-1 min-w-48 px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-gray-800 font-semibold" />
                <input type="text" value={alumnoForm.dni} onChange={e => setAlumnoForm({ ...alumnoForm, dni: e.target.value })} onKeyDown={e => e.key === 'Enter' && agregarAlumno()} placeholder="D.N.I N°..."
                  className="w-44 px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-gray-800 font-semibold" />
                <div className="flex gap-1 items-center bg-white border-2 border-blue-300 rounded-xl px-3 py-1">
                  <span className="text-xs font-bold text-gray-500 mr-1">Sexo:</span>
                  {['V', 'M'].map(s => (
                    <button key={s} type="button"
                      onClick={() => setAlumnoForm({ ...alumnoForm, sexo: s })}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-all ${alumnoForm.sexo === s ? (s === 'V' ? 'bg-blue-500 text-white' : 'bg-pink-500 text-white') : 'text-gray-500 hover:bg-gray-100'}`}>
                      {s === 'V' ? '♂ V' : '♀ M'}
                    </button>
                  ))}
                </div>
                <button onClick={agregarAlumno} className="btn-primary flex items-center gap-2 bg-green-500 text-white px-6 py-2.5 rounded-xl font-bold shadow"><Plus size={18} /> {alumnoForm.editando ? 'Actualizar' : 'Agregar'}</button>
                {alumnoForm.editando && <button onClick={() => setAlumnoForm({ nombre: '', dni: '', sexo: 'V', editando: null })} className="flex items-center gap-1 bg-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-400 transition-all"><X size={16} /> Cancelar</button>}
              </div>
            </div>
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-2xl p-5">
              <h3 className="text-lg font-extrabold text-gray-800 mb-3">🔍 Buscar alumno</h3>
              <div className="relative">
                <input
                  type="text"
                  value={busquedaDNI}
                  onChange={e => { setBusquedaDNI(e.target.value); setResultadoBusqueda(null); }}
                  placeholder="Nombre(s) o D.N.I N°..."
                  className="w-full px-4 py-2.5 border-2 border-green-300 rounded-xl focus:outline-none focus:border-green-500 text-gray-800 font-semibold pr-10"
                />
                {busquedaDNI && (
                  <button onClick={() => { setBusquedaDNI(''); setResultadoBusqueda(null); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    <X size={16} />
                  </button>
                )}
              </div>
              {/* Resultados predictivos */}
              {busquedaDNI.trim().length > 0 && (() => {
                const termino = busquedaDNI.trim().toLowerCase();
                const alumnosDelGrado = alumnosGlobales[gradoActual] || [];
                const coincidencias = [...alumnosDelGrado].filter(a =>
                  a.nombre.toLowerCase().includes(termino) || a.dni.includes(termino)
                ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
                if (coincidencias.length === 0) return (
                  <div className="mt-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-400 font-semibold">
                    Sin resultados en {gradoLabel(gradoActual)}
                  </div>
                );
                return (
                  <div className="mt-2 bg-white border-2 border-green-200 rounded-xl overflow-hidden shadow-sm">
                    {coincidencias.map((a, idx) => (
                      <div key={idx}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-green-50 transition-colors">
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{a.nombre}</p>
                          <p className="text-xs text-gray-500 font-semibold">DNI: {a.dni} · {gradoLabel(gradoActual)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-2 bg-green-50 text-xs text-green-700 font-bold">
                      {coincidencias.length} resultado{coincidencias.length !== 1 ? 's' : ''} en {gradoLabel(gradoActual)}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b-2 border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-800">Lista · {gradoLabel(gradoActual)}</h3>
                <Badge color="blue">
                  {alumnosGr.length} alumnos{alumnosGr.length > 0 ? ` (${alumnosGr.filter(a => (a.sexo||'V')==='V').length}V / ${alumnosGr.filter(a => a.sexo==='M').length}M)` : ''}
                </Badge>
              </div>
              {alumnosGr.length === 0 ? (
                <div className="text-center py-14 text-gray-400"><div className="text-5xl mb-3">📋</div><p className="font-bold text-lg">No hay alumnos registrados</p></div>
              ) : (
                <table className="w-full">
                  <thead><tr className="tabla-header"><th className="p-3 text-center font-bold text-sm">#</th><th className="p-3 text-left font-bold text-sm">Nombre completo</th><th className="p-3 text-center font-bold text-sm">D.N.I N°</th><th className="p-3 text-center font-bold text-sm">Sexo</th><th className="p-3 text-center font-bold text-sm">Acciones</th></tr></thead>
                  <tbody>
                    {[...alumnosGr].sort((a, b) => {
                      if ((a.sexo || 'V') !== (b.sexo || 'V')) return (a.sexo || 'V') === 'V' ? -1 : 1;
                      return a.nombre.localeCompare(b.nombre, 'es');
                    }).map((a, i) => (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-purple-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="p-3 text-gray-400 font-bold text-sm">{i + 1}</td>
                        <td className="p-3 font-bold text-gray-800 text-left">{a.nombre}</td>
                        <td className="p-3 text-center"><Badge>{a.dni}</Badge></td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${(a.sexo || 'V') === 'V' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                            {(a.sexo || 'V') === 'V' ? '♂ V' : '♀ M'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => { setAlumnoForm({ nombre: a.nombre, dni: a.dni, sexo: a.sexo || 'V', editando: a }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-primary flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Save size={14} /> Editar</button>
                            <button onClick={() => eliminarAlumno(a)} className="btn-primary flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Trash2 size={14} /> Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* ── Registro de Bajas ── */}
            {bajas.filter(b => b.grado === gradoActual).length > 0 && (
              <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-red-100 border-b-2 border-red-200 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-red-800">📋 Registro de Bajas · {gradoLabel(gradoActual)}</h3>
                  <Badge color="red">{bajas.filter(b => b.grado === gradoActual).length} baja(s)</Badge>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-red-200">
                      <th className="p-3 text-center font-bold text-sm text-red-900">Nombre completo</th>
                      <th className="p-3 text-center font-bold text-sm text-red-900">D.N.I N°</th>
                      <th className="p-3 text-center font-bold text-sm text-red-900">Motivo</th>
                      <th className="p-3 text-center font-bold text-sm text-red-900">Fecha</th>
                      <th className="p-3 text-center font-bold text-sm text-red-900">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bajas.filter(b => b.grado === gradoActual).map((b, i) => (
                      <tr key={i} className={`border-b border-red-100 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50'}`}>
                        <td className="p-3 font-bold text-gray-800 text-center">{b.nombre}</td>
                        <td className="p-3 text-center"><Badge color="red">{b.dni}</Badge></td>
                        <td className="p-3 text-center text-sm text-gray-700 font-semibold">{b.motivo}</td>
                        <td className="p-3 text-center text-sm text-gray-500 font-semibold">{b.fecha}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => eliminarRegistroBaja(b)}
                            className="btn-primary flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold mx-auto">
                            <Trash2 size={14} /> Eliminar
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
        rolLabel={rolLabel} modalCerrarSesion={modalCerrarSesion} initialTab={origenGestion?.tab || 'grado'}
        ModalCerrarSesion={ModalCerrarSesion} ModalRenderer={ModalRenderer} TopBar={TopBar} Badge={Badge} />
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
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full p-4 md:p-8" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div className="w-full max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
            <div className="overflow-hidden mb-8 rounded-2xl py-3" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              <div className="animate-marquee whitespace-nowrap">
                {[1, 2, 3].map(i => <span key={i} className="text-white text-xl md:text-2xl font-extrabold mx-10">🏫 Escuela Provincial N° 185 "Juan Areco" — Oberá, Misiones — Ciclo Lectivo 2026</span>)}
              </div>
            </div>
            <div className="relative text-center mb-8">
              {usuario?.rol === 'administrador' && (
                <div className="absolute top-0 right-0 flex flex-col gap-2 items-end">
                  <button onClick={() => setShowModalMensajes(true)}
                    className="flex items-center gap-2 bg-blue-50 border-2 border-blue-200 hover:bg-blue-100 transition-all px-4 py-2 rounded-2xl" title="Mensajes">
                    <span className="text-xl">✉️</span>
                    <span className="text-xs font-bold text-blue-600">Mensajes</span>
                  </button>
                  <button onClick={() => setShowNotifsBimestre(true)}
                    className="flex items-center gap-2 bg-green-50 border-2 border-green-200 hover:bg-green-100 transition-all px-4 py-2 rounded-2xl" title="Bimestres completados">
                    <span className="text-xl">✅</span>
                    {notifsBimestre.filter(n => !n.leida).length > 0
                      ? <span className="bg-green-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{notifsBimestre.filter(n => !n.leida).length}</span>
                      : <span className="text-xs font-bold text-green-600">Bimestres</span>}
                  </button>
                  <button onClick={() => setShowModalSolicitudes(true)}
                    className="flex items-center gap-2 bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 transition-all px-4 py-2 rounded-2xl" title="Solicitudes pendientes">
                    <span className="text-xl">🔔</span>
                    {solicitudes.length > 0
                      ? <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{solicitudes.length}</span>
                      : <span className="text-xs font-bold text-purple-600">Solicitudes</span>}
                  </button>
                </div>
              )}
              {usuario?.rol !== 'administrador' && (() => {
                const noLeidos = mensajes.filter(m => !m.leidoPor?.[authUser?.uid]).length;
                return (
                  <button onClick={() => setShowModalMensajes(true)}
                    className="absolute top-0 right-0 flex items-center gap-2 bg-blue-50 border-2 border-blue-200 hover:bg-blue-100 transition-all px-4 py-2 rounded-2xl" title="Mensajes">
                    <span className="text-xl">✉️</span>
                    {noLeidos > 0
                      ? <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{noLeidos}</span>
                      : <span className="text-xs font-bold text-blue-600">Mensajes</span>}
                  </button>
                );
              })()}
              <h1 className="text-3xl md:text-4xl font-black text-gray-800 mb-4">¡Bienvenidos Colegas! 👋</h1>
              <div className="inline-flex items-center gap-3 bg-purple-50 border-2 border-purple-100 px-6 py-3 rounded-2xl mb-4">
                <div className="text-left">
                  <p className="font-extrabold text-gray-800 text-lg">{nombreMostrado(usuario)}</p>
                  <p className="text-sm text-purple-600 font-semibold">{rolLabel(usuario)}</p>
                </div>
                {usuario?.rol !== 'administrador' && (
                  <button onClick={() => setShowPerfil(true)}
                    className="btn-primary flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all">
                    ✏️ Mi perfil
                  </button>
                )}
              </div>
              <div>
                <button onClick={() => setModalCerrarSesion(true)} className="btn-primary inline-flex items-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold shadow">
                  <LogOut size={18} /> Cerrar Sesión
                </button>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {puedeGestionarAlumnos && (
                <button onClick={() => { setVolverAGestion(false); setPantalla('administracion'); }} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>👥 Gestión de Alumnos</button>
              )}
              {puedeGestionarUsuarios && (
                <button onClick={() => setPantalla('gestion_usuarios')} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>👤 Gestión de Docentes</button>
              )}
              {usuario?.rol === 'docente_grado' && (
                <button onClick={() => setPantalla('notas_especiales')} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>📋 Calificaciones de Áreas Especiales</button>
              )}
            </div>
            {curricularesFilt.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center uppercase tracking-wide">📚 Áreas Curriculares</h3>
                <div className={`grid gap-4 justify-center ${
                  curricularesFilt.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
                  curricularesFilt.length === 2 ? 'grid-cols-2 max-w-sm mx-auto' :
                  curricularesFilt.length === 3 ? 'grid-cols-3 max-w-lg mx-auto' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
                }`}>
                  {curricularesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia rounded-2xl text-white flex flex-col items-center gap-3 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})`, padding: curricularesFilt.length <= 3 ? '2.5rem 1.5rem' : '1.5rem' }}>
                      <span className={curricularesFilt.length <= 3 ? 'text-7xl' : 'text-5xl'}>{m.icon}</span>
                      <span className={`font-extrabold text-center leading-tight ${curricularesFilt.length <= 3 ? 'text-base' : 'text-sm'}`}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {curricularesFilt.length > 0 && especielesFilt.length > 0 && <div className="border-t-4 border-purple-100 my-8" />}
            {especielesFilt.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center uppercase tracking-wide">🎨 Áreas Especiales</h3>
                <div className={`grid gap-4 justify-center ${
                  especielesFilt.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
                  especielesFilt.length === 2 ? 'grid-cols-2 max-w-sm mx-auto' :
                  especielesFilt.length === 3 ? 'grid-cols-3 max-w-lg mx-auto' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}>
                  {especielesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia rounded-2xl text-white flex flex-col items-center gap-3 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})`, padding: especielesFilt.length <= 3 ? '2.5rem 1.5rem' : '1.5rem' }}>
                      <span className={especielesFilt.length <= 3 ? 'text-7xl' : 'text-5xl'}>{m.icon}</span>
                      <span className={`font-extrabold text-center leading-tight ${especielesFilt.length <= 3 ? 'text-base' : 'text-sm'}`}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {talleresFilt.length > 0 && <div className="border-t-4 border-purple-100 my-8" />}
            {talleresFilt.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center uppercase tracking-wide">🏆 Talleres</h3>
                <div className={`grid gap-4 justify-center ${
                  talleresFilt.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
                  talleresFilt.length === 2 ? 'grid-cols-2 max-w-sm mx-auto' :
                  talleresFilt.length === 3 ? 'grid-cols-3 max-w-lg mx-auto' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {talleresFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)}
                      className="card-materia rounded-2xl text-white flex flex-col items-center gap-3 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})`, padding: talleresFilt.length <= 3 ? '2.5rem 1.5rem' : '1.5rem' }}>
                      <span className={talleresFilt.length <= 3 ? 'text-7xl' : 'text-5xl'}>{m.icon}</span>
                      <span className={`font-extrabold text-center leading-tight ${talleresFilt.length <= 3 ? 'text-base' : 'text-sm'}`}>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {curricularesFilt.length === 0 && especielesFilt.length === 0 && talleresFilt.length === 0 && (
              <div className="text-center py-10 text-gray-400"><p className="text-5xl mb-3">📭</p><p className="font-bold text-lg">No tenés materias asignadas</p><p className="text-sm">Contactá al administrador del sistema</p></div>
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
        usuario={usuario} alumnosGlobales={alumnosGlobales}
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
  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full p-4 md:p-6" style={{ background: `linear-gradient(135deg, ${materia.color1}, ${materia.color2})` }}>
        <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl p-5 md:p-8 fade-in">
          <div className="flex flex-col gap-4 mb-6 pb-5 border-b-2 border-gray-100">
            <div className="flex justify-between items-start">
              <h2 className="text-2xl md:text-3xl font-black text-gray-800 flex items-center gap-3">
                <span className="text-4xl">{materia.icon}</span>{materia.nombre}
              </h2>
              <div className="flex flex-col gap-2">
                <button onClick={() => { setVolverAGestion(false); setPantalla('inicio'); }} className="btn-primary flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow"><Home size={16} /> Inicio</button>
                <button onClick={() => setModalCerrarSesion(true)} className="btn-primary flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow"><LogOut size={16} /> Salir</button>
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
                    className="btn-primary flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow disabled:opacity-50">
                    <FileDown size={16} /> {pdfGenerando ? 'Generando...' : 'Descargar PDF'}
                  </button>
                )}
                {usuario?.rol === 'docente_grado' && (
                  <div className="flex items-center gap-1">
                    <button
                      disabled={pdfUnificadoGenerando}
                      onClick={async () => {
                        setPdfUnificadoGenerando(true);
                        try { await generarPDFUnificado({ usuario, alumnosGlobales, db }); }
                        finally { setPdfUnificadoGenerando(false); }
                      }}
                      className="btn-primary flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-xl font-bold text-sm shadow disabled:opacity-50 flex-1">
                      <FileDown size={16} /> {pdfUnificadoGenerando ? 'Generando...' : 'PDF Unificado'}
                    </button>
                    <InfoPDFUnificado />
                  </div>
                )}
                {esPrimerCiclo(grado) && (
                  <button onClick={() => setShowEscala(true)}
                    className="btn-primary flex items-center gap-2 bg-violet-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow">
                    📊 Escala
                  </button>
                )}
              </div>
            </div>
            {usuario?.rol !== 'administrador' && (nombreMostrado(usuario) || docenteNombre.guardado) && (
              <div className="inline-flex items-center gap-2 bg-purple-50 border-2 border-purple-100 px-4 py-2 rounded-xl">
                <span className="text-purple-600">👤</span>
                <span className="text-sm font-bold text-gray-800">Docente a cargo: <span className="text-purple-700">{nombreMostrado(usuario) || docenteNombre.guardado}</span></span>
              </div>
            )}
          </div>
          {/* Botón volver — debajo del título, arriba del selector de grados */}
          {volverAGestion && usuario?.rol === 'administrador' && (
            <button onClick={() => { setVolverAGestion(false); setPantalla('gestion_usuarios'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
              className="mb-4 self-start flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-800 px-4 py-2 rounded-xl font-bold text-sm border-2 border-green-200 transition-all">
              ← Volver a Gestión de Docentes
            </button>
          )}
          <div className="mb-6 bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-5">
            {gradosDisp.length > 1 && <p className="text-indigo-700 font-bold text-sm mb-3 text-center">📋 Seleccioná el grado correspondiente a tu asignatura</p>}
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Grado y división</p>
            <ChipsGrado lista={gradosDisp} seleccionado={grado} onChange={setGrado} />
          </div>
          <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
            <h3 className="text-lg font-extrabold text-gray-800 mb-1">📝 Criterios de Evaluación por Bimestre</h3>
            <p className="text-sm text-gray-600 mb-4">Etiquetas para calificaciones (consideradas en cada bimestre). Ej: <em>Evaluación escrita, concepto, trabajo áulico, trabajo práctico, etc...</em></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(bim => (
                <div key={bim} className={`bg-white border-2 rounded-xl p-4 ${bimestresBlockeados[bim] ? 'border-red-200 bg-red-50' : 'border-amber-100'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-gray-700">{bim}° Bimestre</h4>
                      {bimestresBlockeados[bim] && <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✅ Completo</span>}
                    </div>
                    <div className="flex gap-2">
                      {usuario?.rol !== 'administrador' && !bimestresBlockeados[bim] && (
                        <button onClick={() => agregarCriterio(bim)} className="btn-primary flex items-center gap-1 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow"><Plus size={14} /> Agregar</button>
                      )}
                      {usuario?.rol !== 'administrador' && (
                        <button
                          onClick={() => toggleBloquearBimestre(bim)}
                          title={bimestresBlockeados[bim] ? 'Reabrir bimestre' : 'Marcar bimestre como completo'}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shadow transition-colors ${bimestresBlockeados[bim] ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
                          {bimestresBlockeados[bim] ? <LockIcon size={13} /> : <Unlock size={13} />}
                          {bimestresBlockeados[bim] ? 'Completo' : '✓ Completo'}
                        </button>
                      )}
                    </div>
                  </div>
                  {criteriosPorBimestre[bim]?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Sin criterios aún.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {criteriosPorBimestre[bim].map((c, i) => (
                        <div key={i} className="flex items-center gap-1 bg-amber-50 border border-amber-300 px-3 py-1 rounded-lg">
                          <span className="text-xs font-bold text-gray-700">{c}</span>
                          {usuario?.rol !== 'administrador' && !bimestresBlockeados[bim] && (
                            <button onClick={() => eliminarCriterio(bim, c)} className="text-red-400 hover:text-red-600 transition-colors ml-1"><X size={12} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {estActuales.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-3">📋</div><p className="font-bold text-xl text-gray-600">No hay estudiantes registrados</p><p className="text-sm mt-1">Los docentes de grado deben cargar alumnos en Gestión de Alumnos</p></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="tabla-header">
                    <th className="p-3 text-center text-sm font-bold w-10">#</th>
                    <th className="p-3 text-left text-sm font-bold min-w-40 pl-4">Estudiante</th>
                    <th className="p-3 text-center text-sm font-bold">D.N.I</th>
                    {[1, 2].map(b => {
                      const completo = estActuales.length > 0 && estActuales.every(e => e.bimestres?.[b]?.nota);
                      return (
                        <th key={b} className="p-2 text-center text-sm font-bold">
                          <div className="flex items-center justify-center gap-1">
                            {b}° Bimestre {completo && <span title="Todos con nota">✅</span>}
                          </div>
                        </th>
                      );
                    })}
                    <th className="p-3 text-center text-sm font-bold bg-purple-800 min-w-16">1° Cuat.</th>
                    {[3, 4].map(b => {
                      const completo = estActuales.length > 0 && estActuales.every(e => e.bimestres?.[b]?.nota);
                      return (
                        <th key={b} className="p-2 text-center text-sm font-bold">
                          <div className="flex items-center justify-center gap-1">
                            {b}° Bimestre {completo && <span title="Todos con nota">✅</span>}
                          </div>
                        </th>
                      );
                    })}
                    <th className="p-3 text-center text-sm font-bold bg-purple-800 min-w-16">2° Cuat.</th>
                    <th className="p-3 text-center text-sm font-bold bg-indigo-900 min-w-20">Prom. Final</th>
                  </tr>
                </thead>
                <tbody>
                  {[...estActuales].sort((a, b) => {
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
                      const crits = criteriosPorBimestre[bim] || [];
                      const bloqueado = bimestresBlockeados[bim];
                      const notaBim = e.bimestres?.[bim]?.nota || '';
                      return (
                        <td className={`p-2 border-r border-gray-100 ${bloqueado ? 'bg-red-50' : ''}`} style={{ minWidth: crits.length > 0 ? `${crits.length * 100 + 70}px` : '120px' }}>
                          {bloqueado && <div className="text-center text-xs text-red-400 font-bold mb-1">🔒</div>}
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
                                    <span className="text-center font-bold text-gray-800 leading-snug"
                                      style={{ fontSize: '10px', width: '90px', overflowWrap: 'break-word', wordBreak: 'break-word', hyphens: 'auto' }}>
                                      {crit}
                                    </span>
                                    {bloqueado || soloLectura ? (
                                      <div className="nota-input flex items-center justify-center font-black text-gray-600" style={{ fontSize: primerCiclo ? '9px' : '12px' }}>{mostrar || '—'}</div>
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
                                <div className="flex items-center justify-center bg-purple-100 text-purple-800 font-black rounded-lg border-2 border-purple-200"
                                  style={{ minWidth: '40px', height: '32px', fontSize: primerCiclo && notaBim ? '9px' : '12px', padding: '2px 4px', textAlign: 'center' }}>
                                  {notaBim ? (primerCiclo ? abrevConceptual(notaBim) : notaBim) : '-'}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    };
                    return (
                      <tr key={e.id} className={`tabla-row border-b border-gray-100 hover:bg-purple-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="p-3 text-center text-gray-400 font-bold text-sm">{i + 1}</td>
                        <td className="p-3 font-bold text-gray-800 text-sm text-left pl-4">{e.nombre}</td>
                        <td className="p-3 text-center"><Badge>{e.dni || '-'}</Badge></td>
                        <CeldaBimestre bim={1} />
                        <CeldaBimestre bim={2} />
                        <td className="p-3 text-center bg-purple-50">
                          <span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">
                            {c1 ? (primerCiclo ? textoConceptual(c1) : c1) : '-'}
                          </span>
                        </td>
                        <CeldaBimestre bim={3} />
                        <CeldaBimestre bim={4} />
                        <td className="p-3 text-center bg-purple-50">
                          <span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">
                            {c2 ? (primerCiclo ? textoConceptual(c2) : c2) : '-'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-white px-4 py-2 rounded-xl font-black shadow ${pfColor}`}
                            style={{ fontSize: primerCiclo && promFinal ? '11px' : '16px' }}>
                            {promFinal ? (primerCiclo ? textoConceptual(promFinal) : promFinal) : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 text-center text-xs text-gray-400 font-semibold">
            ☁️ Los datos se sincronizan automáticamente con Firebase · {estActuales.length} estudiante(s) en {gradoLabel(grado)}
          </div>

          {/* ── Observaciones generales ── */}
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
      await showAlert('Tu perfil fue actualizado correctamente.', 'success', '✅ Guardado');
      onClose();
    } catch (e) {
      await showAlert('Error al guardar. Intentá de nuevo.', 'error');
    } finally {
      setGuardando(false);
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
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Grados por materia</label>
              {materiasAsignadas.map(ma => (
                <div key={ma.nombre} className="mb-4 border-2 border-gray-100 rounded-xl p-3">
                  <p className="font-bold text-gray-800 text-sm mb-2">{ma.nombre}</p>
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
    cols: ['Diagnóstico', 'Inf. diagnóstico', 'Anual', '1° bimestre', '2° bimestre', '3° bimestre', '4° bimestre']
  },
  seguimiento: {
    label: 'Seguimiento Pedagógico',
    color: '#8b5cf6',
    cols: ['1° bimestre', '2° bimestre', '3° bimestre', '4° bimestre']
  },
  libretas: {
    label: 'Presentación de Libretas',
    color: '#f59e0b',
    cols: ['1° bim.', '2° bim.', '3° bim.', '4° bim.']
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

  useEffect(() => {
    getDoc(doc(db, 'entregas', docente.uid)).then(snap => {
      setEntregas(snap.exists() ? snap.data() : {});
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

  const gradosDocente = docente.rol === 'docente_grado'
    ? (docente.gradosAsignados?.length > 0 ? docente.gradosAsignados : [docente.gradoAsignado].filter(Boolean))
    : [];

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}>
      <div className="text-white text-xl font-bold">Cargando...</div>
    </div>
  );

  const CeldaEditable = ({ keyStr }) => {
    const [local, setLocal] = useState(entregas[keyStr] || '');
    useEffect(() => { setLocal(entregas[keyStr] || ''); }, [keyStr]);
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
      <div className="min-h-screen w-full p-4 md:p-6" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}>
        <div className="max-w-full mx-auto bg-white rounded-3xl shadow-2xl p-4 fade-in">
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
                  <th className="border border-gray-300 bg-gray-100 p-2 text-left font-bold text-gray-700" style={{ minWidth: '90px' }}>Grado</th>
                  <th className="border border-gray-300 bg-gray-100 p-2 text-left font-bold text-gray-700" style={{ minWidth: '140px' }}>Docente</th>
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
                  gradosDocente.map((g, gi) => (
                    <tr key={g} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 p-2 font-bold text-gray-700 text-sm">{gradoLabel(g)}</td>
                      <td className="border border-gray-300 p-2 text-gray-600 text-xs font-semibold">{docente.nombre}</td>
                      {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { cols }]) =>
                        cols.map(col => <CeldaEditable key={`${g}__${sec}__${col}`} keyStr={`${g}__${sec}__${col}`} />)
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="border border-gray-300 p-2 font-bold text-gray-700 text-sm">
                      {docente.materiasAsignadas?.map(ma => ma.nombre || ma).join(', ')}
                    </td>
                    <td className="border border-gray-300 p-2 text-gray-600 text-xs font-semibold">{docente.nombre}</td>
                    {Object.entries(ESTRUCTURA_ENTREGAS).map(([sec, { cols }]) =>
                      cols.map(col => <CeldaEditable key={`especial__${sec}__${col}`} keyStr={`especial__${sec}__${col}`} />)
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-semibold">💡 Escribí la fecha en cada celda y se guarda automáticamente al salir del campo</p>
            <button onClick={onVolver}
              className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition-all">
              ← Volver
            </button>
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
      <div className="min-h-screen w-full p-4 md:p-8" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
        <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
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
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-3">Grados por materia</label>
                {datos.materiasAsignadas?.map(ma => (
                  <div key={ma.nombre} className="mb-4 bg-white border-2 border-gray-200 rounded-xl p-4">
                    <p className="font-bold text-gray-800 text-sm mb-3">{ma.nombre}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {grados.map(g => (
                        <label key={g} className={`flex items-center gap-1 p-2 rounded-lg cursor-pointer border-2 transition-all text-xs font-semibold ${ma.grados?.includes(g) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-green-300'}`}>
                          <input type="checkbox" className="accent-green-600"
                            checked={ma.grados?.includes(g) || false}
                            onChange={() => toggleGradoEspecial(ma.nombre, g)} />
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
      <button
        onClick={() => setOpen(v => !v)}
        className="bg-gray-100 hover:bg-indigo-100 text-gray-700 hover:text-indigo-700 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-0.5 border border-gray-200 hover:border-indigo-300">
        {gradoLabel(grado)} <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: '160px', animation: 'fadeIn 0.1s ease-out' }}>
          <button onClick={() => { setOpen(false); onVerAlumnos(grado, tabActiva); }}
            className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors">
            👥 Ver alumnos
          </button>
          <button onClick={() => { setOpen(false); onVerCalificaciones(grado, materia, tabActiva); }}
            className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 transition-colors border-t border-gray-100">
            📊 Ver calificaciones
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE SEPARADO: Gestión de Docentes
// ════════════════════════════════════════════════════════
function GestionUsuarios({ db, globalStyles, modal, closeModal, showConfirm, showAlert, onInicio, onCerrarSesion, onEditarDocente, onVerEntregas, onVerAlumnos, onVerCalificaciones, rolLabel, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge, initialTab }) {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.rol !== 'administrador'));
    });
    return () => unsub();
  }, [db]);

  const eliminarUsuario = async (u) => {
    const ok = await showConfirm(
      `¿Eliminás al docente "${u.nombre}" (${u.email})? Esta acción no se puede deshacer.`,
      'Eliminar docente'
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'usuarios', u.uid));
      await showAlert(`El docente "${u.nombre}" fue eliminado correctamente.`, 'success', 'Docente eliminado');
    } catch (error) {
      console.error('Error al eliminar:', error);
      await showAlert('Hubo un error al eliminar el docente. Intentá de nuevo.', 'error');
    }
  };

  const ordenarUsuarios = (lista) => {
    return [...lista].sort((a, b) => {
      // Docentes de grado primero, luego especiales
      if (a.rol === 'docente_grado' && b.rol !== 'docente_grado') return -1;
      if (a.rol !== 'docente_grado' && b.rol === 'docente_grado') return 1;
      // Dentro de docentes de grado: por grado (1°A, 1°B... 7°E)
      if (a.rol === 'docente_grado' && b.rol === 'docente_grado') {
        return (a.gradoAsignado || '').localeCompare(b.gradoAsignado || '', 'es', { numeric: true });
      }
      // Dentro de especiales: por nombre de primera materia asignada
      // Dentro de especiales: alfabéticamente por nombre de la primera materia asignada
      const mA = a.materiasAsignadas?.[0]?.nombre || a.materiasAsignadas?.[0] || '';
      const mB = b.materiasAsignadas?.[0]?.nombre || b.materiasAsignadas?.[0] || '';
      return mA.localeCompare(mB, 'es');
    });
  };

  const [tabActiva, setTabActiva] = useState(initialTab || 'grado');

  const usuariosFiltrados = ordenarUsuarios(
    busqueda.trim() === ''
      ? usuarios
      : usuarios.filter(u =>
          u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
          u.email?.toLowerCase().includes(busqueda.toLowerCase())
        )
  ).filter(u => tabActiva === 'grado' ? u.rol === 'docente_grado' : u.rol === 'area_especial');

  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full p-4 md:p-8" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
        <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
          <TopBar titulo="👤 Gestión de Docentes" onInicio={onInicio} onCerrarSesion={onCerrarSesion} />



          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {[['grado','🏫 Docentes de Grado'],['especial','🎨 Áreas Especiales']].map(([key, label]) => (
              <button key={key} onClick={() => setTabActiva(key)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${tabActiva === key ? 'bg-green-500 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Buscador predictivo */}
          <div className="mb-6 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar docente..."
              className="w-full pl-11 pr-10 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-green-400 text-gray-800 font-semibold text-sm"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b-2 border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-gray-800">Docentes registrados</h3>
              <Badge color="green">{usuariosFiltrados.length} {busqueda ? 'resultado(s)' : 'docentes'}</Badge>
            </div>
            {usuariosFiltrados.length === 0 ? (
              <div className="text-center py-14 text-gray-400">
                <div className="text-5xl mb-3">{busqueda ? '🔍' : '👤'}</div>
                <p className="font-bold text-lg">{busqueda ? `Sin resultados para "${busqueda}"` : 'No hay docentes registrados'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white' }}>
                      {['Nombre', 'Correo', 'Rol', 'Grado(s) / Materia(s)', 'Estado', 'Creado', 'Acciones'].map(h => (
                        <th key={h} className="p-4 text-center font-bold text-sm tracking-wide align-middle">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosFiltrados.map((u, i) => (
                      <tr key={u.uid || i} className={`border-b border-gray-100 hover:bg-green-50 transition-all duration-150 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                        <td className="p-4 align-top text-center">
                          <div className="font-extrabold text-gray-800 text-sm">{u.nombre}</div>
                        </td>
                        <td className="p-4 align-top text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-semibold bg-gray-100 px-2 py-1 rounded-lg">
                            📧 {u.email}
                          </span>
                        </td>
                        <td className="p-4 align-top text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${u.rol === 'administrador' ? 'bg-purple-100 text-purple-800' : u.rol === 'docente_grado' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                            {rolLabel(u)}
                          </span>
                        </td>
                        <td className="p-4 align-top text-center text-xs text-gray-600 max-w-xs">
                          {u.rol === 'docente_grado'
                            ? (() => {
                                const gs = u.gradosAsignados?.length > 0 ? u.gradosAsignados : [u.gradoAsignado].filter(Boolean);
                                return (
                                  <div className="flex flex-col gap-1.5 items-center">
                                    <div className="flex flex-wrap gap-1 justify-center">
                                      {gs.map((g, j) => (
                                        <ChipGradoAdmin key={j} grado={g} materia={u.materiasAsignadas?.[0] || ''}
                                          tabActiva={tabActiva}
                                          onVerAlumnos={onVerAlumnos}
                                          onVerCalificaciones={onVerCalificaciones} />
                                      ))}
                                    </div>
                                    {u.materiasAsignadas?.length > 0 && (
                                      <div className="flex flex-col gap-0.5 items-center mt-1">
                                        {u.materiasAsignadas.map((m, i) => <span key={i} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold inline-block text-[10px]">{m}</span>)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            : u.rol === 'area_especial'
                            ? (u.materiasAsignadas?.length > 0
                              ? <div className="flex flex-col gap-1.5 items-center">
                                  {u.materiasAsignadas.map((ma, i) => (
                                    <div key={i} className="text-center">
                                      <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-bold inline-block">{ma.nombre}</span>
                                      {ma.grados?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5 justify-center">
                                          {ma.grados.map((g, j) => (
                                            <ChipGradoAdmin key={j} grado={g} materia={ma.nombre}
                                              tabActiva={tabActiva}
                                              onVerAlumnos={onVerAlumnos}
                                              onVerCalificaciones={onVerCalificaciones} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              : <span className="text-gray-400 italic">Sin materias</span>)
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="p-4 align-top text-center">{u.activo ? <Badge color="green">✓ Activo</Badge> : <Badge color="red">⏳ Pendiente</Badge>}</td>
                        <td className="p-4 align-top text-center text-xs text-gray-400 font-semibold whitespace-nowrap">{new Date(u.fechaCreacion).toLocaleDateString('es-AR')}</td>
                        <td className="p-4 align-top text-center">
                          <div className="flex flex-col gap-2 items-center">
                            <button
                              onClick={() => onEditarDocente({ ...u })}
                              className="btn-primary flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow w-full justify-center">
                              <Save size={14} /> Editar
                            </button>
                            <button
                              onClick={() => eliminarUsuario(u)}
                              className="btn-primary flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow w-full justify-center">
                              <Trash2 size={14} /> Eliminar
                            </button>
                            <button
                              onClick={() => onVerEntregas({ ...u })}
                              className="btn-primary flex items-center gap-1 bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow w-full justify-center">
                              📋 Entregas
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
function NotasEspeciales({ db, globalStyles, modal, closeModal, usuario, alumnosGlobales, onInicio, onCerrarSesion, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge, ChipsGrado }) {
  const gradoPropio = usuario?.gradoAsignado || '';
  const gradosDisp = gradoPropio ? [gradoPropio] : [];
  const [gradoSel, setGradoSel] = useState(gradoPropio);
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
      <div className="min-h-screen w-full p-2 md:p-6" style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}>
        <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl p-5 md:p-8 fade-in">
          <TopBar titulo="📋 Calificaciones de Áreas Especiales" onInicio={onInicio} onCerrarSesion={onCerrarSesion} />

          <div className="mb-5 flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4">
            <span className="text-xl mt-0.5">👁️</span>
            <p className="text-amber-800 font-semibold text-sm leading-relaxed">
              Vista de <strong>solo lectura</strong>. Acá podés consultar las notas que cargaron los docentes de áreas especiales y talleres en tu grado (<strong>{gradoLabel(gradoSel)}</strong>) para completar los boletines de calificaciones de los alumnos.
            </p>
          </div>

          {!materiasSel ? (
            <>
              <p className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wide">Seleccioná el área o taller:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                {todasLasEspeciales.map(m => (
                  <button key={m.nombre} onClick={() => cargarMateria(m)}
                    className="card-materia rounded-2xl p-7 text-white flex flex-col items-center gap-3 shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})` }}>
                    <span className="text-5xl">{m.icon}</span>
                    <span className="text-sm font-extrabold text-center leading-tight">{m.nombre}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Header materia seleccionada */}
              <div className="flex items-center gap-3 mb-5 pb-4 border-b-2 border-gray-100">
                <button onClick={() => setMateriasSel(null)}
                  className="btn-primary flex items-center gap-1 bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-bold text-sm">
                  ← Volver
                </button>
                <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                  <span className="text-3xl">{materiasSel.icon}</span> {materiasSel.nombre}
                  <Badge color="purple">{gradoLabel(gradoSel)}</Badge>
                </h3>
                {configuracion.docente && (
                  <span className="text-sm text-gray-500 font-semibold">· Docente: <strong>{configuracion.docente}</strong></span>
                )}
              </div>

              {cargando ? (
                <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-3">⏳</p><p className="font-bold">Cargando...</p></div>
              ) : calificaciones.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-5xl mb-3">📭</p>
                  <p className="font-bold text-lg">Sin calificaciones cargadas aún</p>
                  <p className="text-sm">El/la docente de {materiasSel.nombre} todavía no registró notas para {gradoLabel(gradoSel)}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="tabla-header">
                        <th className="p-3 text-left text-sm font-bold min-w-40 pl-4">Estudiante</th>
                        <th className="p-3 text-center text-sm font-bold">D.N.I</th>
                        {[1, 2].map(b => <th key={b} className="p-2 text-center text-sm font-bold">{b}° Bimestre</th>)}
                        <th className="p-3 text-center text-sm font-bold bg-purple-800">1° Cuat.</th>
                        {[3, 4].map(b => <th key={b} className="p-2 text-center text-sm font-bold">{b}° Bimestre</th>)}
                        <th className="p-3 text-center text-sm font-bold bg-purple-800">2° Cuat.</th>
                        <th className="p-3 text-center text-sm font-bold bg-indigo-900">Prom. Final</th>
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
                        const pfNum = parseFloat(pf);
                        const pfColor = isNaN(pfNum) ? 'bg-purple-600' : pfNum >= 7 ? 'bg-green-600' : pfNum >= 4 ? 'bg-amber-500' : 'bg-red-600';

                        const CeldaLectura = ({ bim }) => {
                          const notaBim = e.bimestres?.[bim]?.nota || '';
                          const num = parseFloat(notaBim);
                          const color = isNaN(num) || notaBim === ''
                            ? 'bg-gray-100 text-gray-400 border-gray-200'
                            : num >= 7 ? 'bg-green-100 text-green-800 border-green-300'
                            : num >= 4 ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-red-100 text-red-800 border-red-300';
                          return (
                            <td className="p-3 border-r border-gray-100 text-center">
                              <div className={`inline-flex items-center justify-center w-16 h-10 rounded-xl font-black text-base border-2 ${color}`}>
                                {notaBim || '—'}
                              </div>
                            </td>
                          );
                        };

                        return (
                          <tr key={e.id || i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                            <td className="p-3 font-bold text-gray-800 text-sm text-left pl-4">{e.nombre}</td>
                            <td className="p-3 text-center"><Badge>{e.dni || '-'}</Badge></td>
                            <CeldaLectura bim={1} />
                            <CeldaLectura bim={2} />
                            <td className="p-3 text-center bg-purple-50">
                              <span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">{c1}</span>
                            </td>
                            <CeldaLectura bim={3} />
                            <CeldaLectura bim={4} />
                            <td className="p-3 text-center bg-purple-50">
                              <span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">{c2}</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-block text-white px-4 py-2 rounded-xl font-black text-base shadow ${pfColor}`}>{pf}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}
