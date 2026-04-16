import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Save, Plus, Trash2, LogOut, Lock, Eye, EyeOff, Search, X, Mail } from 'lucide-react';
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
  onSnapshot
} from 'firebase/firestore';
 
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
  ]
};
 
const grados = ['1°A','1°B','1°C','1°D','1°E','2°A','2°B','2°C','2°D','2°E','3°A','3°B','3°C','3°D','3°E','4°A','4°B','4°C','4°D','4°E','5°A','5°B','5°C','5°D','5°E','6°A','6°B','6°C','6°D','6°E','7°A','7°B','7°C','7°D','7°E'];
 
// ─── UTILIDADES ─────────────────────────────────────────────────────────────
const asegurarEstructuraEstudiante = (estudiante) => {
  const bimestres = { ...estudiante.bimestres || {} };
  for (let i = 1; i <= 4; i++) {
    if (!bimestres[i]) bimestres[i] = { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'' };
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
@keyframes spin { to { transform: rotate(360deg); } }
.fade-in { animation: fadeIn 0.3s ease-out both; }
.card-materia { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.card-materia:hover { transform: translateY(-4px) scale(1.03); box-shadow: 0 20px 40px rgba(0,0,0,0.18); }
.btn-primary { transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); filter: brightness(1.05); }
.btn-primary:active { transform: translateY(0); }
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 0.5; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
::-webkit-scrollbar-thumb { background: #c4b5fd; border-radius: 3px; }
.nota-input { width: 38px; height: 32px; padding: 2px; border: 2px solid #ddd6fe; border-radius: 6px; text-align: center; font-size: 12px; font-weight: 700; color: #374151; background: #faf5ff; transition: border-color 0.15s, background 0.15s; }
.nota-input:focus { outline: none; border-color: #7c3aed; background: #fff; }
.tabla-header { background: linear-gradient(135deg, #7c3aed, #9333ea); color: white; }
.chip-grado { transition: all 0.15s ease; }
.chip-grado:hover { transform: scale(1.05); }
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
          {g}
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
 
  // Login con email real
  const [loginForm, setLoginForm] = useState({ email: '', pass: '', verPass: false });
  const [loginCargando, setLoginCargando] = useState(false);
 
  // Registro con email real
  const [registro, setRegistro] = useState({
    show: false,
    data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] }
  });
  const [registroCargando, setRegistroCargando] = useState(false);
 
  const [solicitudes, setSolicitudes] = useState([]);
  const [showModalSolicitudes, setShowModalSolicitudes] = useState(false);
  const [alumnoForm, setAlumnoForm] = useState({ nombre: '', dni: '', editando: null });
  const [busquedaDNI, setBusquedaDNI] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [modalCerrarSesion, setModalCerrarSesion] = useState(false);
 
  const inactividadTimeout = useRef(null);
 
  const cerrarSesion = useCallback(async () => {
    await signOut(auth);
    setUsuario(null); setAuthUser(null); setPantalla('login'); setModalCerrarSesion(false);
    if (inactividadTimeout.current) clearTimeout(inactividadTimeout.current);
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
 
  // ── Calificaciones ──
  useEffect(() => {
    if (!authUser || !materia) return;
    const key = safeKey(`${materia.nombre}_${grado}`);
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
    const estudiantesActuales = estudiantes[key] || [];
    const estudiantesActualizados = alumnosDelGrado.map(alumno => {
      const existente = estudiantesActuales.find(e => e.dni === alumno.dni);
      if (existente) return asegurarEstructuraEstudiante(existente);
      return {
        id: `${alumno.dni}_${Date.now()}`, nombre: alumno.nombre, dni: alumno.dni,
        bimestres: {
          1: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'' },
          2: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'' },
          3: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'' },
          4: { n1:'', n2:'', n3:'', n4:'', n5:'', nota:'', criteriosTexto:'' },
        }
      };
    });
    if (JSON.stringify(estudiantesActuales) !== JSON.stringify(estudiantesActualizados)) {
      setDoc(doc(db, 'calificaciones', safeKey(`${materia.nombre}_${grado}`)), { estudiantes: estudiantesActualizados }, { merge: true });
    }
    const cargarConfig = async () => {
      const snap = await getDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)));
      if (snap.exists()) {
        const d = snap.data();
        setDocenteNombre({ actual: '', guardado: d.docente || '' });
        setCriteriosPorBimestre(d.criterios || { 1: [], 2: [], 3: [], 4: [] });
      } else {
        setDocenteNombre({ actual: '', guardado: '' });
        setCriteriosPorBimestre({ 1: [], 2: [], 3: [], 4: [] });
      }
    };
    cargarConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grado, materia, alumnosGlobales]);
 
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
      setLoginForm({ email: '', pass: '', verPass: false });
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
    setRegistroCargando(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, d.email.trim(), d.password);
      const perfil = {
        uid: cred.user.uid, nombre: d.nombre.trim(), email: d.email.trim(),
        rol: d.rol, gradoAsignado: d.rol === 'docente_grado' ? d.gradoAsignado : null,
        materiasAsignadas: d.materiasAsignadas, fechaCreacion: new Date().toISOString(), activo: false
      };
      await setDoc(doc(db, 'usuarios', cred.user.uid), perfil);
      await signOut(auth); // Desloguear hasta aprobación
      setRegistro({ show: false, data: { nombre: '', email: '', password: '', rol: 'docente_grado', gradoAsignado: '1°A', materiasAsignadas: [] } });
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
      await showAlert('Docente aprobado con éxito.', 'success');
    } catch (error) { console.error('Error al aprobar:', error); }
  };
 
  const abrirMateria = (m) => {
    setMateria(m);
    const gradosAsig = getGradosParaMateria(m.nombre);
    setGrado(gradosAsig[0] || '1°A');
    setPantalla('materia');
  };
 
  const agregarAlumno = async () => {
    if (!alumnoForm.nombre.trim() || !alumnoForm.dni.trim()) {
      await showAlert('Completá el nombre y el DNI del alumno.', 'warning'); return;
    }
    const gradoActual = usuario?.rol === 'docente_grado' ? usuario.gradoAsignado : grado;
    const nuevos = { ...alumnosGlobales };
    if (!nuevos[gradoActual]) nuevos[gradoActual] = [];
    if (alumnoForm.editando) {
      const idx = nuevos[gradoActual].findIndex(a => a.dni === alumnoForm.editando.dni);
      if (idx !== -1) nuevos[gradoActual][idx] = { nombre: alumnoForm.nombre.trim(), dni: alumnoForm.dni.trim() };
    } else {
      if (nuevos[gradoActual].some(a => a.dni === alumnoForm.dni.trim())) {
        await showAlert('Ya existe un alumno con ese DNI en este grado.', 'warning'); return;
      }
      nuevos[gradoActual].push({ nombre: alumnoForm.nombre.trim(), dni: alumnoForm.dni.trim() });
    }
    await setDoc(doc(db, 'datos', 'alumnosGlobales'), nuevos);
    setAlumnoForm({ nombre: '', dni: '', editando: null });
  };
 
  const eliminarAlumno = async (alumno) => {
    const gradoActual = usuario?.rol === 'docente_grado' ? usuario.gradoAsignado : grado;
    const ok = await showConfirm(`¿Eliminás a "${alumno.nombre}"? Se borrarán sus calificaciones en TODAS las materias del grado.`, 'Eliminar alumno');
    if (!ok) return;
    await setDoc(doc(db, 'datos', 'alumnosGlobales'), {
      ...alumnosGlobales, [gradoActual]: (alumnosGlobales[gradoActual] || []).filter(a => a.dni !== alumno.dni)
    });
  };
 
  const buscarAlumnoPorDNI = async () => {
    if (!busquedaDNI.trim()) return;
    let encontrado = null, gradoEncontrado = null;
    Object.entries(alumnosGlobales).forEach(([g, alumnos]) => {
      const alum = alumnos.find(a => a.dni === busquedaDNI.trim());
      if (alum) { encontrado = alum; gradoEncontrado = g; }
    });
    if (encontrado) {
      setResultadoBusqueda({ ...encontrado, grado: gradoEncontrado, asignaturas: [...areas.curriculares, ...areas.especiales].map(m => m.nombre) });
    } else {
      setResultadoBusqueda(null);
      await showAlert(`No se encontró ningún alumno con DNI "${busquedaDNI}".`, 'warning', 'Sin resultados');
    }
  };
 
  const actualizarCampo = (id, bimestre, campo, valor) => {
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
      setDoc(doc(db, 'calificaciones', fsKey), { estudiantes: lista }, { merge: true });
      return nuevos;
    });
  };
 
  const agregarCriterio = async (bimestre) => {
    const c = await showPrompt(`Nombre del criterio para el ${bimestre}° Bimestre:`, 'Ej: Evaluación escrita, Concepto...', 'Nuevo criterio');
    if (!c?.trim()) return;
    const nuevos = { ...criteriosPorBimestre, [bimestre]: [...(criteriosPorBimestre[bimestre] || []), c.trim()] };
    setCriteriosPorBimestre(nuevos);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { criterios: nuevos }, { merge: true });
  };
 
  const eliminarCriterio = async (bimestre, c) => {
    const ok = await showConfirm(`¿Eliminás el criterio "${c}" del ${bimestre}° Bimestre?`, 'Eliminar criterio');
    if (!ok) return;
    const nuevosCrit = { ...criteriosPorBimestre, [bimestre]: criteriosPorBimestre[bimestre].filter(x => x !== c) };
    setCriteriosPorBimestre(nuevosCrit);
    await setDoc(doc(db, 'configuracion', safeKey(`${materia.nombre}_${grado}`)), { criterios: nuevosCrit }, { merge: true });
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
    if (usuario.rol === 'administrador') return [...areas.curriculares, ...areas.especiales];
    if (usuario.rol === 'docente_grado') return areas.curriculares.filter(m => usuario.materiasAsignadas.includes(m.nombre));
    if (usuario.rol === 'area_especial') return areas.especiales.filter(m => usuario.materiasAsignadas.some(ma => ma.nombre === m.nombre));
    return [];
  };
 
  const getGradosParaMateria = (materiaNombre) => {
    if (!usuario) return [];
    if (usuario.rol === 'administrador') return grados;
    if (usuario.rol === 'docente_grado') return [usuario.gradoAsignado];
    if (usuario.rol === 'area_especial') {
      const ma = usuario.materiasAsignadas.find(ma => ma.nombre === materiaNombre);
      return ma ? ma.grados : [];
    }
    return [];
  };
 
  const materiasRegistro = registro.data.rol === 'docente_grado' ? areas.curriculares : areas.especiales;
  const estActuales = estudiantes[`${materia?.nombre}-${grado}`] || [];
  const alumnosGr = alumnosGlobales[usuario?.rol === 'docente_grado' ? usuario.gradoAsignado : grado] || [];
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
    if (u.rol === 'docente_grado') return `Docente de Grado • ${u.gradoAsignado}`;
    if (u.rol === 'area_especial') return 'Docente Área Especial';
    return 'Administrador';
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
                  {sol.gradoAsignado && <p className="text-sm text-slate-600">📚 Grado: {sol.gradoAsignado}</p>}
                </div>
                <button onClick={async () => { await aprobarDocente(sol.uid); setSolicitudes(prev => prev.filter(s => s.uid !== sol.uid)); }}
                  className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">
                  ✅ Aprobar Registro
                </button>
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
            <div className="text-6xl mb-3">🏫</div>
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
                    placeholder="Correo electrónico"
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input type={loginForm.verPass ? 'text' : 'password'} value={loginForm.pass}
                    onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="Contraseña"
                    className="w-full pl-10 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                  <button onClick={() => setLoginForm({ ...loginForm, verPass: !loginForm.verPass })}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                    {loginForm.verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
                  { val: registro.data.nombre,   key: 'nombre',   ph: 'Nombre completo',                      type: 'text' },
                  { val: registro.data.email,    key: 'email',    ph: 'Correo electrónico (Gmail u otro)',     type: 'email' },
                  { val: registro.data.password, key: 'password', ph: 'Contraseña (mín. 6 caracteres)',        type: 'password' },
                ].map(({ val, key, ph, type }) => (
                  <input key={key} type={type} value={val} placeholder={ph}
                    onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, [key]: e.target.value } }))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold" />
                ))}
                <select value={registro.data.rol}
                  onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, rol: e.target.value, materiasAsignadas: [] } }))}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold bg-white focus:outline-none focus:border-purple-500">
                  <option value="docente_grado">Docente de Grado</option>
                  <option value="area_especial">Docente Área Especial</option>
                </select>
                {registro.data.rol === 'docente_grado' && (
                  <select value={registro.data.gradoAsignado}
                    onChange={e => setRegistro(r => ({ ...r, data: { ...r.data, gradoAsignado: e.target.value } }))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-800 font-semibold bg-white focus:outline-none focus:border-purple-500">
                    {grados.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
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
                              <input type="checkbox" checked={ma.grados.includes(g)} onChange={() => toggleGradoRegistro(ma.nombre, g)} className="accent-purple-600" /> {g}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setRegistro({ ...registro, show: false })} className="flex-1 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 transition-all">Cancelar</button>
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
    const gradoActual = usuario?.rol === 'docente_grado' ? usuario.gradoAsignado : grado;
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full p-2 md:p-4" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div className="w-[95%] max-w-none mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
            <TopBar titulo="👥 Gestión de Alumnos" onInicio={() => setPantalla('inicio')} onCerrarSesion={() => setModalCerrarSesion(true)} />
            <div className="mb-6 flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4">
              <span className="text-xl mt-0.5">⚠️</span>
              <p className="text-amber-800 font-semibold text-sm leading-relaxed">Exclusivo para docentes de grado. Los alumnos cargados acá aparecerán en <strong>todas las materias</strong> del grado automáticamente.</p>
            </div>
            {usuario?.rol !== 'docente_grado' && (
              <div className="mb-6">
                <p className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Seleccioná el grado:</p>
                <ChipsGrado lista={grados} seleccionado={grado} onChange={setGrado} />
              </div>
            )}
            <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
              <h3 className="text-lg font-extrabold text-gray-800 mb-4">{alumnoForm.editando ? '✏️ Editar alumno' : '➕ Agregar alumno'} <span className="text-blue-600">• {gradoActual}</span></h3>
              <div className="flex flex-wrap gap-3">
                <input type="text" value={alumnoForm.nombre} onChange={e => setAlumnoForm({ ...alumnoForm, nombre: e.target.value })} placeholder="Apellido y nombre(s)..."
                  className="flex-1 min-w-48 px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-gray-800 font-semibold" />
                <input type="text" value={alumnoForm.dni} onChange={e => setAlumnoForm({ ...alumnoForm, dni: e.target.value })} onKeyDown={e => e.key === 'Enter' && agregarAlumno()} placeholder="D.N.I N°..."
                  className="w-44 px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 text-gray-800 font-semibold" />
                <button onClick={agregarAlumno} className="btn-primary flex items-center gap-2 bg-green-500 text-white px-6 py-2.5 rounded-xl font-bold shadow"><Plus size={18} /> {alumnoForm.editando ? 'Actualizar' : 'Agregar'}</button>
                {alumnoForm.editando && <button onClick={() => setAlumnoForm({ nombre: '', dni: '', editando: null })} className="flex items-center gap-1 bg-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-400 transition-all"><X size={16} /> Cancelar</button>}
              </div>
            </div>
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-2xl p-5">
              <h3 className="text-lg font-extrabold text-gray-800 mb-3">🔍 Buscar alumno por DNI</h3>
              <div className="flex gap-3">
                <input type="text" value={busquedaDNI} onChange={e => setBusquedaDNI(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarAlumnoPorDNI()} placeholder="D.N.I N°..."
                  className="flex-1 px-4 py-2.5 border-2 border-green-300 rounded-xl focus:outline-none focus:border-green-500 text-gray-800 font-semibold" />
                <button onClick={buscarAlumnoPorDNI} className="btn-primary flex items-center gap-2 bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow"><Search size={18} /> Buscar</button>
              </div>
              {resultadoBusqueda && (
                <div className="mt-4 bg-white border-2 border-green-300 rounded-xl p-4 fade-in">
                  <p className="font-bold text-gray-800 text-lg">{resultadoBusqueda.nombre}</p>
                  <p className="text-sm text-gray-600 mt-1"><Badge color="blue">Grado: {resultadoBusqueda.grado}</Badge></p>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed"><strong>Asignaturas:</strong> {resultadoBusqueda.asignaturas.join(' · ')}</p>
                </div>
              )}
            </div>
            <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b-2 border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-800">Lista · {gradoActual}</h3>
                <Badge color="blue">{alumnosGr.length} alumnos</Badge>
              </div>
              {alumnosGr.length === 0 ? (
                <div className="text-center py-14 text-gray-400"><div className="text-5xl mb-3">📋</div><p className="font-bold text-lg">No hay alumnos registrados</p></div>
              ) : (
                <table className="w-full">
                  <thead><tr className="tabla-header"><th className="p-3 text-left font-bold text-sm">#</th><th className="p-3 text-left font-bold text-sm">Nombre completo</th><th className="p-3 text-center font-bold text-sm">D.N.I N°</th><th className="p-3 text-center font-bold text-sm">Acciones</th></tr></thead>
                  <tbody>
                    {alumnosGr.map((a, i) => (
                      <tr key={i} className={`border-b border-gray-100 hover:bg-purple-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="p-3 text-gray-400 font-bold text-sm">{i + 1}</td>
                        <td className="p-3 font-bold text-gray-800">{a.nombre}</td>
                        <td className="p-3 text-center"><Badge>{a.dni}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => { setAlumnoForm({ nombre: a.nombre, dni: a.dni, editando: a }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-primary flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Save size={14} /> Editar</button>
                            <button onClick={() => eliminarAlumno(a)} className="btn-primary flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold"><Trash2 size={14} /> Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
        rolLabel={rolLabel} modalCerrarSesion={modalCerrarSesion}
        ModalCerrarSesion={ModalCerrarSesion} ModalRenderer={ModalRenderer} TopBar={TopBar} Badge={Badge} />
    );
  }
 
  if (pantalla === 'inicio') {
    const materiasDisp = getMateriasDisponibles();
    const curricularesFilt = areas.curriculares.filter(m => materiasDisp.some(md => md.nombre === m.nombre));
    const especielesFilt = areas.especiales.filter(m => materiasDisp.some(md => md.nombre === m.nombre));
    return (
      <>
        <style>{globalStyles}</style>
        <ModalRenderer modal={modal} closeModal={closeModal} />
        <div className="min-h-screen w-full p-4 md:p-8" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div className="w-full max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
            <div className="overflow-hidden mb-8 rounded-2xl py-3" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              <div className="animate-marquee whitespace-nowrap">
                {[1, 2, 3].map(i => <span key={i} className="text-white text-xl md:text-2xl font-extrabold mx-10">🏫 Escuela Provincial N° 185 --- "Juan Areco" --- Ciclo Lectivo 2026</span>)}
              </div>
            </div>
            <div className="relative text-center mb-8">
              {usuario?.rol === 'administrador' && (
                <button onClick={() => setShowModalSolicitudes(true)}
                  className="absolute top-0 right-0 flex items-center gap-2 bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 transition-all px-4 py-2 rounded-2xl" title="Solicitudes pendientes">
                  <span className="text-xl">🔔</span>
                  {solicitudes.length > 0
                    ? <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{solicitudes.length}</span>
                    : <span className="text-xs font-bold text-purple-600">Solicitudes</span>}
                </button>
              )}
              <h1 className="text-3xl md:text-4xl font-black text-gray-800 mb-4">¡Bienvenidos Colegas! 👋</h1>
              <div className="inline-flex items-center gap-3 bg-purple-50 border-2 border-purple-100 px-6 py-3 rounded-2xl mb-4">
                <div className="text-left">
                  <p className="font-extrabold text-gray-800 text-lg">{usuario?.nombre}</p>
                  <p className="text-sm text-purple-600 font-semibold">{rolLabel(usuario)}</p>
                </div>
              </div>
              <div>
                <button onClick={() => setModalCerrarSesion(true)} className="btn-primary inline-flex items-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold shadow">
                  <LogOut size={18} /> Cerrar Sesión
                </button>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {puedeGestionarAlumnos && (
                <button onClick={() => setPantalla('administracion')} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>👥 Gestión de Alumnos</button>
              )}
              {puedeGestionarUsuarios && (
                <button onClick={() => setPantalla('gestion_usuarios')} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>👤 Gestión de Usuarios</button>
              )}
              {usuario?.rol === 'docente_grado' && (
                <button onClick={() => setPantalla('notas_especiales')} className="btn-primary text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-xl inline-flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>📋 Notas Áreas Especiales</button>
              )}
            </div>
            {curricularesFilt.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center uppercase tracking-wide">📚 Áreas Curriculares</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {curricularesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)} className="card-materia rounded-2xl p-6 text-white flex flex-col items-center gap-3 shadow-lg" style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})` }}>
                      <span className="text-5xl">{m.icon}</span>
                      <span className="text-sm font-extrabold text-center leading-tight">{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {curricularesFilt.length > 0 && especielesFilt.length > 0 && <div className="border-t-4 border-purple-100 my-8" />}
            {especielesFilt.length > 0 && (
              <div>
                <h3 className="text-xl font-extrabold text-gray-700 mb-4 text-center uppercase tracking-wide">🎨 Áreas Especiales</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {especielesFilt.map(m => (
                    <button key={m.nombre} onClick={() => abrirMateria(m)} className="card-materia rounded-2xl p-6 text-white flex flex-col items-center gap-3 shadow-lg" style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})` }}>
                      <span className="text-5xl">{m.icon}</span>
                      <span className="text-sm font-extrabold text-center leading-tight">{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {curricularesFilt.length === 0 && especielesFilt.length === 0 && (
              <div className="text-center py-10 text-gray-400"><p className="text-5xl mb-3">📭</p><p className="font-bold text-lg">No tenés materias asignadas</p><p className="text-sm">Contactá al administrador del sistema</p></div>
            )}
          </div>
        </div>
        {showModalSolicitudes && <ModalSolicitudes />}
        {modalCerrarSesion && <ModalCerrarSesion />}
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
                <button onClick={() => setPantalla('inicio')} className="btn-primary flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow"><Home size={16} /> Inicio</button>
                <button onClick={() => setModalCerrarSesion(true)} className="btn-primary flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow"><LogOut size={16} /> Salir</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-48">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Docente(s) a cargo</label>
                <input type="text" value={docenteNombre.actual} onChange={e => setDocenteNombre({ ...docenteNombre, actual: e.target.value })} placeholder="Apellido y Nombre(s)..."
                  className="px-4 py-2.5 border-2 border-purple-200 rounded-xl focus:outline-none focus:border-purple-500 text-gray-800 font-semibold w-72" />
              </div>
              <button onClick={guardarDocente} className="btn-primary flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl font-bold shadow"><Save size={16} /> Guardar</button>
            </div>
            {docenteNombre.guardado && (
              <div className="inline-flex items-center gap-2 bg-purple-50 border-2 border-purple-100 px-4 py-2 rounded-xl">
                <span className="text-purple-600">👤</span>
                <span className="text-sm font-bold text-gray-800">Docente: <span className="text-purple-700">{docenteNombre.guardado}</span></span>
              </div>
            )}
          </div>
          <div className="mb-6 bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-5">
            {gradosDisp.length > 1 && <p className="text-indigo-700 font-bold text-sm mb-3 text-center">📋 Seleccioná el grado correspondiente a tu asignatura</p>}
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Grado y división</p>
            <ChipsGrado lista={gradosDisp} seleccionado={grado} onChange={setGrado} />
          </div>
          <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
            <h3 className="text-lg font-extrabold text-gray-800 mb-1">📝 Criterios de Evaluación por Bimestre</h3>
            <p className="text-sm text-gray-600 mb-4">Etiquetas para cada nota (n1, n2...). Ej: <em>Evaluación escrita, Concepto, Trabajo áulico...</em></p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(bim => (
                <div key={bim} className="bg-white border-2 border-amber-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-extrabold text-gray-700">{bim}° Bimestre</h4>
                    <button onClick={() => agregarCriterio(bim)} className="btn-primary flex items-center gap-1 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow"><Plus size={14} /> Agregar</button>
                  </div>
                  {criteriosPorBimestre[bim]?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Sin criterios aún.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {criteriosPorBimestre[bim].map((c, i) => (
                        <div key={i} className="flex items-center gap-1 bg-amber-50 border border-amber-300 px-3 py-1 rounded-lg">
                          <span className="text-xs font-bold text-gray-700">{c}</span>
                          <button onClick={() => eliminarCriterio(bim, c)} className="text-red-400 hover:text-red-600 transition-colors ml-1"><X size={12} /></button>
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
                    <th className="p-3 text-left text-sm font-bold min-w-40">Estudiante</th>
                    <th className="p-3 text-center text-sm font-bold">D.N.I</th>
                    {[1, 2].map(b => (
                      <th key={b} className="p-2 text-center text-sm font-bold">
                        <div>{b}° Bimestre</div>
                      </th>
                    ))}
                    <th className="p-3 text-center text-sm font-bold bg-purple-800 min-w-16">1° Cuat.</th>
                    {[3, 4].map(b => (
                      <th key={b} className="p-2 text-center text-sm font-bold">
                        <div>{b}° Bimestre</div>
                      </th>
                    ))}
                    <th className="p-3 text-center text-sm font-bold bg-purple-800 min-w-16">2° Cuat.</th>
                    <th className="p-3 text-center text-sm font-bold bg-indigo-900 min-w-20">Prom. Final</th>
                  </tr>
                </thead>
                <tbody>
                  {estActuales.map((e, i) => {
                    const b1 = e.bimestres?.[1]?.nota || '';
                    const b2 = e.bimestres?.[2]?.nota || '';
                    const b3 = e.bimestres?.[3]?.nota || '';
                    const b4 = e.bimestres?.[4]?.nota || '';
                    const c1 = calcularCuatrimestre(b1, b2);
                    const c2 = calcularCuatrimestre(b3, b4);
                    const promFinal = calcularPromedioFinal(b1, b2, b3, b4);
                    const pf = parseFloat(promFinal);
                    const pfColor = isNaN(pf) ? 'bg-purple-600' : pf >= 7 ? 'bg-green-600' : pf >= 4 ? 'bg-amber-500' : 'bg-red-600';
                    const CeldaBimestre = ({ bim }) => {
                      const crits = criteriosPorBimestre[bim] || [];
                      return (
                        <td className="p-2 border-r border-gray-100" style={{ minWidth: crits.length > 0 ? `${crits.length * 80 + 60}px` : '120px' }}>
                          <div className="flex gap-1.5 items-end justify-center flex-wrap">
                            {crits.length === 0 ? (
                              <span className="text-gray-300 text-xs italic">Sin criterios</span>
                            ) : (
                              crits.map((crit, idx) => {
                                const campo = `n${idx + 1}`;
                                const val = e.bimestres?.[bim]?.[campo] || '';
                                return (
                                  <div key={idx} className="flex flex-col items-center gap-0.5">
                                    <span className="text-center text-[9px] font-bold text-gray-500 leading-tight px-0.5"
                                      style={{ maxWidth: '64px', wordBreak: 'break-word' }}>
                                      {crit}
                                    </span>
                                    <input type="number" min="1" max="10" step="0.1"
                                      className="nota-input"
                                      title={crit}
                                      value={val}
                                      onChange={ev => actualizarCampo(e.id, bim, campo, ev.target.value)} />
                                  </div>
                                );
                              })
                            )}
                            {/* Promedio del bimestre */}
                            {crits.length > 0 && (
                              <div className="flex flex-col items-center gap-0.5 ml-1">
                                <span className="text-[9px] font-bold text-purple-500">Prom.</span>
                                <div className="flex items-center justify-center w-10 h-8 bg-purple-100 text-purple-800 font-black rounded-lg text-xs border-2 border-purple-200">
                                  {e.bimestres?.[bim]?.nota || '-'}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    };
                    return (
                      <tr key={e.id} className={`border-b border-gray-100 hover:bg-purple-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="p-3 font-bold text-gray-800 text-sm">{e.nombre}</td>
                        <td className="p-3 text-center"><Badge>{e.dni || '-'}</Badge></td>
                        <CeldaBimestre bim={1} />
                        <CeldaBimestre bim={2} />
                        <td className="p-3 text-center bg-purple-50"><span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">{c1 || '-'}</span></td>
                        <CeldaBimestre bim={3} />
                        <CeldaBimestre bim={4} />
                        <td className="p-3 text-center bg-purple-50"><span className="inline-block bg-purple-200 text-purple-900 px-3 py-1.5 rounded-lg font-black text-sm">{c2 || '-'}</span></td>
                        <td className="p-3 text-center"><span className={`inline-block text-white px-4 py-2 rounded-xl font-black text-base shadow ${pfColor}`}>{promFinal || '-'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 text-center text-xs text-gray-400 font-semibold">
            ☁️ Los datos se sincronizan automáticamente con Firebase · {estActuales.length} estudiante(s) en {grado}
          </div>
        </div>
      </div>
      {showModalSolicitudes && <ModalSolicitudes />}
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}
 
// ════════════════════════════════════════════════════════
// COMPONENTE SEPARADO: Gestión de Usuarios
// ════════════════════════════════════════════════════════
function GestionUsuarios({ db, globalStyles, modal, closeModal, showConfirm, showAlert, onInicio, onCerrarSesion, rolLabel, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge }) {
  const [usuarios, setUsuarios] = useState([]);
 
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.rol !== 'administrador'));
    });
    return () => unsub();
  }, [db]);
 
  const eliminarUsuario = async (u) => {
    const ok = await showConfirm(
      `¿Eliminás al usuario "${u.nombre}" (${u.email})? Esta acción no se puede deshacer.`,
      'Eliminar usuario'
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'usuarios', u.uid));
      await showAlert(`El usuario "${u.nombre}" fue eliminado correctamente.`, 'success', 'Usuario eliminado');
    } catch (error) {
      console.error('Error al eliminar:', error);
      await showAlert('Hubo un error al eliminar el usuario. Intentá de nuevo.', 'error');
    }
  };
 
  return (
    <>
      <style>{globalStyles}</style>
      <ModalRenderer modal={modal} closeModal={closeModal} />
      <div className="min-h-screen w-full p-4 md:p-8" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
        <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 fade-in">
          <TopBar titulo="👤 Gestión de Usuarios" onInicio={onInicio} onCerrarSesion={onCerrarSesion} />
          <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b-2 border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-gray-800">Usuarios registrados</h3>
              <Badge color="green">{usuarios.length} usuarios</Badge>
            </div>
            {usuarios.length === 0 ? (
              <div className="text-center py-14 text-gray-400"><div className="text-5xl mb-3">👤</div><p className="font-bold text-lg">No hay usuarios registrados</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white' }}>
                      {['Nombre', 'Correo', 'Rol', 'Grado / Materias', 'Estado', 'Creado', 'Acción'].map(h => (
                        <th key={h} className="p-3 text-left font-bold text-sm">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u, i) => (
                      <tr key={u.uid || i} className={`border-b border-gray-100 hover:bg-green-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="p-3 font-bold text-gray-800">{u.nombre}</td>
                        <td className="p-3 text-xs text-gray-600 font-semibold">{u.email}</td>
                        <td className="p-3 text-sm text-gray-600 font-semibold">{rolLabel(u)}</td>
                        <td className="p-3 text-xs text-gray-500 font-semibold max-w-xs">
                          {u.rol === 'docente_grado' ? u.materiasAsignadas.join(', ') || 'Sin materias'
                            : u.rol === 'area_especial' ? u.materiasAsignadas.map(ma => `${ma.nombre}: ${ma.grados.join(', ')}`).join(' | ')
                            : '-'}
                        </td>
                        <td className="p-3">{u.activo ? <Badge color="green">Activo</Badge> : <Badge color="red">Pendiente</Badge>}</td>
                        <td className="p-3 text-xs text-gray-400 font-semibold">{new Date(u.fechaCreacion).toLocaleDateString('es-AR')}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => eliminarUsuario(u)}
                            className="btn-primary flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow"
                            title="Eliminar usuario">
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
      </div>
      {modalCerrarSesion && <ModalCerrarSesion />}
    </>
  );
}
 
// ════════════════════════════════════════════════════════
// COMPONENTE: Notas Áreas Especiales (solo lectura para docentes de grado)
// ════════════════════════════════════════════════════════
function NotasEspeciales({ db, globalStyles, modal, closeModal, usuario, alumnosGlobales, onInicio, onCerrarSesion, modalCerrarSesion, ModalCerrarSesion, ModalRenderer, TopBar, Badge, ChipsGrado }) {
  const gradoPropio = usuario?.gradoAsignado || '';
  // Maestras de grado pueden ver solo su grado asignado
  const gradosDisp = gradoPropio ? [gradoPropio] : [];
  const [gradoSel, setGradoSel] = useState(gradoPropio);
  const [materiasSel, setMateriasSel] = useState(null); // { nombre, color1, color2, icon }
  const [calificaciones, setCalificaciones] = useState([]);
  const [configuracion, setConfiguracion] = useState({ criterios: { 1: [], 2: [], 3: [], 4: [] }, docente: '' });
  const [cargando, setCargando] = useState(false);
 
  const areasEspeciales = [
    { nombre: 'Educación Artística: Plástica', color1: '#fa709a', color2: '#fee140', icon: '🎨' },
    { nombre: 'Educación Física', color1: '#30cfd0', color2: '#330867', icon: '⚽' },
    { nombre: 'Informática', color1: '#a18cd1', color2: '#fbc2eb', icon: '💻' },
    { nombre: 'Lengua Extranjera: Inglés', color1: '#ff9a56', color2: '#ff6a88', icon: '🗣️' },
    { nombre: 'Educación Artística: Música', color1: '#c471f5', color2: '#fa71cd', icon: '🎵' },
    { nombre: 'Tecnología', color1: '#ff6b6b', color2: '#ee5a6f', icon: '🔧' },
    { nombre: 'Lengua Extranjera: Portugués', color1: '#4facfe', color2: '#00f2fe', icon: '📚' },
    { nombre: 'Laboratorio', color1: '#00c6ff', color2: '#0072ff', icon: '🧪' },
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
          <TopBar titulo="📋 Notas Áreas Especiales" onInicio={onInicio} onCerrarSesion={onCerrarSesion} />
 
          <div className="mb-5 flex items-start gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4">
            <span className="text-xl mt-0.5">👁️</span>
            <p className="text-amber-800 font-semibold text-sm leading-relaxed">
              Vista de <strong>solo lectura</strong>. Aquí podés consultar las notas que cargaron los docentes de áreas especiales en tu grado (<strong>{gradoSel}</strong>) para confeccionar las libretas.
            </p>
          </div>
 
          {/* Selector de materia especial */}
          {!materiasSel ? (
            <>
              <p className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wide">Seleccioná el área especial:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {areasEspeciales.map(m => (
                  <button key={m.nombre} onClick={() => cargarMateria(m)}
                    className="card-materia rounded-2xl p-5 text-white flex flex-col items-center gap-2 shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${m.color1}, ${m.color2})` }}>
                    <span className="text-4xl">{m.icon}</span>
                    <span className="text-xs font-extrabold text-center leading-tight">{m.nombre}</span>
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
                  <Badge color="purple">{gradoSel}</Badge>
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
                  <p className="text-sm">El/la docente de {materiasSel.nombre} todavía no registró notas para {gradoSel}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border-2 border-gray-100">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="tabla-header">
                        <th className="p-3 text-left text-sm font-bold min-w-40">Estudiante</th>
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
                          const crits = configuracion.criterios[bim] || [];
                          return (
                            <td className="p-2 border-r border-gray-100">
                              <div className="flex gap-1.5 items-end justify-center flex-wrap">
                                {crits.length === 0 ? (
                                  <span className="text-gray-300 text-xs">-</span>
                                ) : (
                                  crits.map((crit, idx) => {
                                    const val = e.bimestres?.[bim]?.[`n${idx + 1}`] || '-';
                                    const num = parseFloat(val);
                                    const color = isNaN(num) ? 'bg-gray-100 text-gray-400' : num >= 7 ? 'bg-green-100 text-green-800' : num >= 4 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
                                    return (
                                      <div key={idx} className="flex flex-col items-center gap-0.5">
                                        <span className="text-center text-[9px] font-bold text-gray-500 leading-tight px-0.5"
                                          style={{ maxWidth: '60px', wordBreak: 'break-word' }}>{crit}</span>
                                        <div className={`w-10 h-8 flex items-center justify-center rounded-lg font-black text-xs border-2 border-gray-200 ${color}`}>
                                          {val}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                                {crits.length > 0 && (
                                  <div className="flex flex-col items-center gap-0.5 ml-1">
                                    <span className="text-[9px] font-bold text-purple-500">Prom.</span>
                                    <div className="w-10 h-8 flex items-center justify-center bg-purple-100 text-purple-800 font-black rounded-lg text-xs border-2 border-purple-200">
                                      {e.bimestres?.[bim]?.nota || '-'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        };
 
                        return (
                          <tr key={e.id || i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                            <td className="p-3 font-bold text-gray-800 text-sm">{e.nombre}</td>
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