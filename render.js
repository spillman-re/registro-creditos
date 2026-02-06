// --- CONFIGURACIÓN DE CONEXIÓN ---
const SUPABASE_URL = 'https://cvwkjtwwewxpjoftcdwu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2d2tqdHd3ZXd4cGpvZnRjZHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTM3OTQsImV4cCI6MjA4NTk2OTc5NH0.K93vrrerStJjOeXkqdKwV_2qSDTLSB4gVyT_9oHV7cY';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * --- VARIABLES DE ESTADO GLOBAL ---
 */
let clienteSeleccionadoId = null;
let deudaSeleccionadaId = null;
let saldoActualDeuda = 0;
let tasaCambio = 36.65; // Valor por defecto

/**
 * --- UTILIDADES DE INTERFAZ Y CONVERSIÓN ---
 */

function mostrarToast(mensaje, color = 'bg-primary') {
    const contenedor = document.getElementById('toastContainer');
    const id = Date.now();
    const html = `
        <div id="${id}" class="toast align-items-center text-white ${color} border-0 show">
            <div class="d-flex"><div class="toast-body">${mensaje}</div></div>
        </div>`;
    contenedor.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { const el = document.getElementById(id); if(el) el.remove(); }, 3000);
}

// Formateadores de moneda
const fC$ = (m) => `C$ ${parseFloat(m).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const fUS = (m) => `$ ${(parseFloat(m) / tasaCambio).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

/**
 * --- GESTIÓN DE CLIENTES ---
 */

async function actualizarListaClientes(filtro = '') {    
    const { data: clientes, error } = await _supabase
        .from('clientes')
        .select(`*, deudas(saldo_pendiente)`)
        .ilike('nombre', `%${filtro}%`)
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    const panel = document.getElementById('panelDeudas');
    
    if (clientes.length === 0) {
        panel.innerHTML = `
            <div class="text-center py-5 opacity-50">
                <div class="mb-3" style="font-size: 3rem;">👤</div>
                <h5 class="fw-light">No hay clientes registrados aún.</h5>
            </div>`;
        return;
    }

    panel.innerHTML = clientes.map(c => {
        const saldo_total = c.deudas.reduce((acc, d) => acc + parseFloat(d.saldo_pendiente), 0);
        const iniciales = c.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const esDeudor = saldo_total > 0;

        return `
        <div class="card card-cliente-moderna shadow-sm mb-3" onclick="verDetalle(${c.id})">
            <div class="status-indicator ${esDeudor ? 'status-deuda' : 'status-limpio'}"></div>
            <div class="card-body p-3">
                <div class="row align-items-center">
                    <div class="col-auto">
                        <div class="cliente-avatar">${iniciales}</div>
                    </div>
                    <div class="col">
                        <h5 class="mb-0 fw-bold text-dark">${c.nombre}</h5>
                        <small class="text-muted">📞 ${c.telefono || 'Sin número'}</small>
                    </div>
                    <div class="col-auto text-end">
                        <div class="saldo-pill ${!esDeudor ? 'limpio' : ''}">
                            <div class="fw-bold">${fC$(saldo_total)}</div>
                            <div style="font-size: 0.7rem; opacity: 0.8;">${fUS(saldo_total)}</div>
                        </div>
                    </div>
                    <div class="col-auto ps-0">
                        <div class="text-primary fs-4">›</div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
    document.getElementById('seccionReportes').style.display = 'flex';
}

document.getElementById('btnGuardarCliente').addEventListener('click', async () => {
    const nombre = document.getElementById('nuevoNombre').value;
    const telefono = document.getElementById('nuevoTelefono').value;

    if (!nombre) return mostrarToast('El nombre es obligatorio', 'bg-danger');

    const { error } = await _supabase.from('clientes').insert([{ nombre, telefono }]);
    
    if (!error) {
        mostrarToast('Cliente guardado con éxito', 'bg-success');
        document.getElementById('nuevoNombre').value = '';
        document.getElementById('nuevoTelefono').value = '';
        bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente')).hide();
        actualizarListaClientes(); 
    }
});

function abrirModalEditar(nombre, telefono) {
    document.getElementById('editNombre').value = nombre;
    document.getElementById('editTelefono').value = telefono;
    new bootstrap.Modal(document.getElementById('modalEditarCliente')).show();
}

document.getElementById('btnActualizarCliente').addEventListener('click', async () => {
    const nombre = document.getElementById('editNombre').value;
    const telefono = document.getElementById('editTelefono').value;
    
    const { error } = await _supabase
        .from('clientes')
        .update({ nombre, telefono })
        .eq('id', clienteSeleccionadoId);

    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalEditarCliente')).hide();
        mostrarToast('Cliente actualizado', 'bg-success');
        verDetalle(clienteSeleccionadoId);
    }
});

function confirmarEliminarCliente() {
    bootstrap.Modal.getInstance(document.getElementById('modalEditarCliente')).hide();
    new bootstrap.Modal(document.getElementById('modalConfirmarEliminar')).show();
}

async function ejecutarEliminacion() {
    const { error } = await _supabase.from('clientes').delete().eq('id', clienteSeleccionadoId);
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalConfirmarEliminar')).hide();
        mostrarToast('Cliente eliminado permanentemente', 'bg-danger');
        actualizarListaClientes();
    }
}

/**
 * --- GESTIÓN DE DEUDAS ---
 */

async function verDetalle(clienteId) {
    document.getElementById('seccionReportes').style.display = 'none';
    clienteSeleccionadoId = clienteId;
    const { data: cliente } = await _supabase.from('clientes').select('*').eq('id', clienteId).single();
    const { data: deudas } = await _supabase.from('deudas').select('*').eq('cliente_id', clienteId).order('id', { ascending: false });

    const panel = document.getElementById('panelDeudas');
    const iniciales = cliente.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    let html = `
        <div class="cliente-activo-header shadow-sm">
            <button class="btn-volver" onclick="actualizarListaClientes()" title="Volver a la lista">
                <span class="text-primary fw-bold">←</span>
            </button>
            <div class="cliente-avatar me-3" style="width: 45px; height: 45px; font-size: 1rem;">${iniciales}</div>
            <div class="flex-grow-1">
                <h4 class="mb-0 fw-bold text-dark">${cliente.nombre}</h4>
                <small class="text-muted">📞 ${cliente.telefono || 'Sin número'}</small>
                <button class="btn btn-sm btn-link p-0 text-primary text-decoration-none ms-2" onclick="abrirModalEditar('${cliente.nombre}', '${cliente.telefono}')">Editar</button>
            </div>
            <button class="btn btn-primary btn-nuevo-cliente py-2 px-3" onclick="abrirModalDeuda()">+ Deuda</button>
        </div>
        <div class="row">`;

    if (deudas.length === 0) {
        html += `<div class="col-12 text-center py-5"><h5 class="text-muted fw-light">Sin deudas registradas.</h5></div>`;
    } else {
        deudas.forEach(d => {
            const sPendiente = parseFloat(d.saldo_pendiente);
            const mTotal = parseFloat(d.monto_total);
            const porcentajePagado = ((mTotal - sPendiente) / mTotal) * 100;
            const colorTextoSaldo = sPendiente > 0 ? 'text-danger' : 'text-success';
            const descSegura = d.descripcion ? d.descripcion.replace(/['"\\`]/g, '').replace(/\n/g, ' ') : ''; 

            html += `
            <div class="col-md-6 mb-4">
                <div class="card card-deuda-moderna shadow-sm">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <span class="badge-categoria text-uppercase">${d.categoria}</span>
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm text-primary p-0 fw-bold" onclick="verHistorialAbonos(${d.id})"><small>🕒 Historial</small></button>
                                <button class="btn btn-sm text-secondary p-0" onclick="abrirModalEditarDeuda('${d.id}', '${descSegura}', ${mTotal})"><small>✏️ Editar</small></button>
                            </div>
                        </div>
                        <p class="text-muted small mb-3" style="min-height: 40px;">${d.descripcion || 'Sin descripción'}</p>
                        <div class="mb-2 d-flex justify-content-between align-items-end">
                            <div>
                                <small class="text-muted d-block mb-1">Saldo Pendiente</small>
                                <span class="monto-principal ${colorTextoSaldo}">${fC$(sPendiente)}</span>
                                <div class="text-muted" style="font-size: 0.8rem;">${fUS(sPendiente)}</div>
                            </div>
                            <div class="text-end"><small class="text-muted d-block">Total: ${fC$(mTotal)}</small></div>
                        </div>
                        <div class="progress mb-4"><div class="progress-bar bg-success" style="width: ${porcentajePagado}%"></div></div>
                        <div class="d-grid">
                            <button class="btn btn-success" onclick="abrirAbono(${d.id}, ${sPendiente})" ${sPendiente <= 0 ? 'disabled' : ''}>
                                ${sPendiente <= 0 ? '✅ Pagado' : 'Registrar Abono'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        });
    }
    panel.innerHTML = html + `</div>`;
}

function abrirModalDeuda() {
    if (clienteSeleccionadoId) {
        document.getElementById('deudaClienteId').value = clienteSeleccionadoId;
        new bootstrap.Modal(document.getElementById('modalNuevaDeuda')).show();
    }
}

document.getElementById('btnGuardarDeuda').onclick = async () => {
    let montoRaw = parseFloat(document.getElementById('deudaMonto').value);
    const moneda = document.getElementById('monedaDeuda').value;
    
    // Si es dólar, convertimos a córdobas para la DB
    const montoFinal = moneda === "USD" ? montoRaw * tasaCambio : montoRaw;

    if (!montoFinal || montoFinal <= 0) return mostrarToast('Monto inválido', 'bg-danger');

    const deuda = {
        cliente_id: clienteSeleccionadoId,
        categoria: document.getElementById('deudaCategoria').value,
        descripcion: document.getElementById('deudaDescripcion').value,
        monto_total: montoFinal,
        saldo_pendiente: montoFinal
    };

    const { error } = await _supabase.from('deudas').insert([deuda]);
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalNuevaDeuda')).hide();
        verDetalle(clienteSeleccionadoId);
        mostrarToast('Deuda guardada en C$', 'bg-success');
        cargarReportes();
    }
};

function abrirModalEditarDeuda(id, concepto, monto) {
    deudaSeleccionadaId = id;
    document.getElementById('editDeudaConcepto').value = concepto;
    document.getElementById('editDeudaMonto').value = monto;
    new bootstrap.Modal(document.getElementById('modalEditarDeuda')).show();
}

document.getElementById('btnActualizarDeuda').addEventListener('click', async () => {
    const { error } = await _supabase.from('deudas').update({ descripcion: document.getElementById('editDeudaConcepto').value }).eq('id', deudaSeleccionadaId);
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalEditarDeuda')).hide();
        verDetalle(clienteSeleccionadoId); 
    }
});

async function ejecutarEliminacionDeuda() {
    const { error } = await _supabase.from('deudas').delete().eq('id', deudaSeleccionadaId);
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalConfirmarEliminarDeuda')).hide();
        verDetalle(clienteSeleccionadoId);
    }
}

/**
 * --- GESTIÓN DE ABONOS (UNIFICADA) ---
 */

function abrirAbono(id, saldo) {
    deudaSeleccionadaId = id;
    saldoActualDeuda = parseFloat(saldo);
    
    // Limpiar campos y mostrar saldo dual en el modal
    document.getElementById('abonoMonto').value = '';
    document.getElementById('calcAbono').innerText = '';
    document.getElementById('monedaAbono').value = 'COR'; // Reset a Córdobas
    
    document.getElementById('txtSaldoActual').innerHTML = `
        ${fC$(saldo)}<br>
        <small class="text-muted">${fUS(saldo)}</small>
    `;
    new bootstrap.Modal(document.getElementById('modalAbono')).show();
}

// Función para el cálculo visual mientras escribes
function configurarConvertidorAbono() {
    const input = document.getElementById('abonoMonto');
    const selector = document.getElementById('monedaAbono');
    const feedback = document.getElementById('calcAbono');

    const calcular = () => {
        const valor = parseFloat(input.value) || 0;
        if (selector.value === "USD") {
            feedback.innerText = `Equivale a: C$ ${(valor * tasaCambio).toFixed(2)}`;
        } else {
            feedback.innerText = "";
        }
    };
    input.addEventListener('input', calcular);
    selector.addEventListener('change', calcular);
}

// ÚNICO EVENTO DE GUARDADO (Elimina cualquier otro .onclick o .addEventListener previo)
document.getElementById('btnGuardarAbono').onclick = async function() {
    const inputMonto = document.getElementById('abonoMonto');
    const montoRaw = parseFloat(inputMonto.value);
    const moneda = document.getElementById('monedaAbono').value;

    if (!montoRaw || montoRaw <= 0) {
        return mostrarToast('Ingrese un monto válido', 'bg-danger');
    }

    // Convertimos a córdobas solo si es necesario
    const montoFinalCordobas = moneda === "USD" ? montoRaw * tasaCambio : montoRaw;

    // Validación de saldo (con pequeño margen de redondeo)
    if (montoFinalCordobas > (saldoActualDeuda + 0.1)) {
        return mostrarToast('El abono excede el saldo pendiente', 'bg-danger');
    }

    // 1. Registrar el abono en la base de datos
    const { error: errorAbono } = await _supabase
        .from('abonos')
        .insert([{ 
            deuda_id: deudaSeleccionadaId, 
            monto: montoFinalCordobas // Siempre guardamos en C$ para la contabilidad
        }]);

    if (!errorAbono) {
        // 2. Llamar a la función SQL de Supabase para restar
        const { error: errorRPC } = await _supabase.rpc('registrar_pago', { 
            p_deuda_id: deudaSeleccionadaId, 
            p_monto: montoFinalCordobas 
        });

        if (!errorRPC) {
            bootstrap.Modal.getInstance(document.getElementById('modalAbono')).hide();
            verDetalle(clienteSeleccionadoId);
            mostrarToast(`Abono de ${moneda === 'USD' ? '$'+montoRaw : 'C$'+montoRaw} guardado`, 'bg-success');
            cargarReportes();
        }
    } else {
        mostrarToast('Error al registrar abono', 'bg-danger');
    }
};

async function verHistorialAbonos(deudaId) {
    const { data: abonos } = await _supabase.from('abonos').select('*').eq('deuda_id', deudaId).order('id', { ascending: false });
    const lista = document.getElementById('listaAbonos');
    if (!abonos || abonos.length === 0) {
        lista.innerHTML = `<p class="text-center opacity-25">Sin abonos.</p>`;
    } else {
        lista.innerHTML = abonos.map(a => `
            <div class="timeline-item">
                <div class="abono-card-mini shadow-sm d-flex justify-content-between">
                    <div><small class="text-muted d-block">Pago</small><b>${new Date(a.fecha).toLocaleDateString()}</b></div>
                    <div class="text-end text-success fw-bold">${fC$(a.monto)}<br><small style="font-size:0.7rem">${fUS(a.monto)}</small></div>
                </div>
            </div>`).join('');
    }
    new bootstrap.Modal(document.getElementById('modalHistorialAbonos')).show();
}

/**
 * --- EVENTOS E INICIALIZACIÓN ---
 */

document.getElementById('busquedaCliente').addEventListener('input', (e) => actualizarListaClientes(e.target.value));

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Intentar cargar tasa desde la base de datos
    const { data: config, error } = await _supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', 'tasa_cambio')
        .single();

    if (config) {
        tasaCambio = parseFloat(config.valor);
        // ACTUALIZACIÓN VISUAL: Buscamos el elemento en el HTML y le ponemos el valor real
        const elTasa = document.getElementById('txtTasaActual');
        if (elTasa) {
            elTasa.innerText = tasaCambio.toFixed(2);
        }
    } else {
        console.log("No se encontró tasa en DB, usando valor por defecto.");
    }

    // 2. Cargar la lista de clientes (ahora usará la tasaCambio real)
    cargarReportes(); 
    actualizarListaClientes();
});

// Función global para actualizar tasa
window.cambiarTasa = async (nueva) => {
    const nuevaTasaNum = parseFloat(nueva);
    if (isNaN(nuevaTasaNum)) return;

    // 1. Actualizamos la variable local para que los cálculos sean instantáneos
    tasaCambio = nuevaTasaNum;

    // 2. Guardamos en Supabase (Usamos upsert para insertar o actualizar)
    const { error } = await _supabase
        .from('configuracion')
        .upsert({ clave: 'tasa_cambio', valor: nuevaTasaNum }, { onConflict: 'clave' });

    if (error) {
        console.error("Error guardando tasa:", error);
        mostrarToast("Error al guardar en nube", "bg-danger");
    } else {
        // 3. Refrescamos la interfaz
        actualizarListaClientes();
        
        // Actualizamos el texto en el index si existe
        const elTasa = document.getElementById('txtTasaActual');
        if (elTasa) elTasa.innerText = nuevaTasaNum.toFixed(2);
        
        mostrarToast(`Tasa guardada: ${nuevaTasaNum}`, "bg-info");
    }
};

// Función para mostrar la conversión en tiempo real mientras escribes
function configurarConvertidor(inputId, monedaId, feedbackId) {
    const input = document.getElementById(inputId);
    const selector = document.getElementById(monedaId);
    const feedback = document.getElementById(feedbackId);

    const calcular = () => {
        const valor = parseFloat(input.value) || 0;
        if (selector.value === "USD") {
            const conversion = valor * tasaCambio;
            feedback.innerText = `Equivale a: C$ ${conversion.toFixed(2)}`;
        } else {
            feedback.innerText = "";
        }
    };

    input.addEventListener('input', calcular);
    selector.addEventListener('change', calcular);
}

// Inicializar convertidores al cargar
document.addEventListener('DOMContentLoaded', () => {
    configurarConvertidor('deudaMonto', 'monedaDeuda', 'calcDeuda');
    configurarConvertidor('abonoMonto', 'monedaAbono', 'calcAbono');
});

/**
 * --- SISTEMA DE REPORTES ---
 */
async function cargarReportes() {
    // 1. Obtener todas las deudas activas
    const { data: deudas, error } = await _supabase
        .from('deudas')
        .select(`categoria, saldo_pendiente, clientes(nombre)`)
        .gt('saldo_pendiente', 0);

    if (error) return console.error(error);

    // Cálculos
    let totalC$ = 0;
    let porCategoria = {};
    let porCliente = {};

    deudas.forEach(d => {
        const saldo = parseFloat(d.saldo_pendiente);
        totalC$ += saldo;

        // Sumar por categoría
        porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + saldo;

        // Sumar por cliente
        const nombre = d.clientes.nombre;
        porCliente[nombre] = (porCliente[nombre] || 0) + saldo;
    });

    // RENDERIZAR TOTAL
    document.getElementById('reporteTotal').innerText = fC$(totalC$);
    document.getElementById('reporteTotalUSD').innerText = `(${fUS(totalC$)})`;

    // RENDERIZAR CATEGORÍAS
    const listaCat = document.getElementById('listaCategorias');
    listaCat.innerHTML = Object.entries(porCategoria)
        .sort((a, b) => b[1] - a[1]) // De mayor a menor
        .map(([cat, monto]) => `
            <div class="d-flex justify-content-between mb-1">
                <span>${cat}</span>
                <span class="fw-bold text-dark">${fC$(monto)}</span>
            </div>
        `).join('');

    // RENDERIZAR TOP 3 CLIENTES
    const listaTop = document.getElementById('listaTopClientes');
    listaTop.innerHTML = Object.entries(porCliente)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3) // Solo los primeros 3
        .map(([nombre, monto], index) => `
            <div class="d-flex align-items-center mb-2">
                <div class="badge bg-primary-subtle text-primary me-2">${index + 1}</div>
                <div class="flex-grow-1 small fw-bold text-truncate">${nombre}</div>
                <div class="small text-danger fw-bold">${fC$(monto)}</div>
            </div>
        `).join('');
}