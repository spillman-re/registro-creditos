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
    setTimeout(() => { const el = document.getElementById(id); if (el) el.remove(); }, 3000);
}

// Formateadores de moneda
const fC$ = (m) => `C$ ${parseFloat(m).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fUS = (m) => `$ ${(parseFloat(m) / tasaCambio).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

        return `
    <div class="card card-cliente-moderna shadow-sm mb-2" onclick="verDetalle(${c.id})">
        <div class="status-indicator ${saldo_total > 0 ? 'status-deuda' : 'status-limpio'}"></div>
        <div class="card-body">
            <div class="fila-cliente">
                <div class="col-auto">
                    <div class="cliente-avatar" style="width: 40px; height: 40px; font-size: 0.9rem;">${iniciales}</div>
                </div>
                
                <div class="info-principal">
                    <h5 class="nombre-cliente fw-bold text-dark">${c.nombre}</h5>
                    <small class="text-muted">📞 ${c.telefono || '---'}</small>
                </div>
                
                <div class="contenedor-saldo">
                    <div class="saldo-pill ${saldo_total <= 0 ? 'limpio' : ''}" style="padding: 4px 8px;">
                        <div class="fw-bold" style="font-size: 0.9rem;">${fC$(saldo_total)}</div>
                        <div style="font-size: 0.65rem; opacity: 0.8;">${fUS(saldo_total)}</div>
                    </div>
                </div>

                <div class="col-auto ps-1">
                    <span class="text-primary" style="opacity: 0.5;">›</span>
                </div>
            </div>
        </div>
    </div>`;
    }).join('');
    document.getElementById('seccionReportes').style.display = 'flex';
}

// Agregar un cliente
document.getElementById('btnGuardarCliente').onclick = async function () {
    const btn = this;
    const textoOriginal = 'Guardar Cliente'; // Definimos el texto manual para evitar errores

    const nombre = document.getElementById('nuevoNombre').value.trim();
    const telefono = document.getElementById('nuevoTelefono').value.trim();

    if (!nombre) return mostrarToast('El nombre es obligatorio', 'bg-danger');

    // Bloqueo y Spinner
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Guardando...`;

    try {
        const { error } = await _supabase.from('clientes').insert([{ nombre, telefono }]);
        if (error) throw error;

        mostrarToast('Cliente guardado', 'bg-success');
        
        // Limpiar y cerrar
        document.getElementById('nuevoNombre').value = '';
        document.getElementById('nuevoTelefono').value = '';
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente'));
        if (modalInstance) modalInstance.hide();

        await actualizarListaClientes();

    } catch (err) {
        console.error('Error:', err);
        mostrarToast('Error al guardar', 'bg-danger');
    } finally {
        // ESTO ES LO QUE FALTABA: Reactivar siempre al final
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
};

// Editar un cliente
function abrirModalEditar(nombre, telefono) {
    document.getElementById('editNombre').value = nombre;
    document.getElementById('editTelefono').value = telefono;
    new bootstrap.Modal(document.getElementById('modalEditarCliente')).show();
}

document.getElementById('btnActualizarCliente').onclick = async function () {
    const btn = this;
    const textoOriginal = btn.innerHTML;

    const nombre = document.getElementById('editNombre').value.trim();
    const telefono = document.getElementById('editTelefono').value.trim();

    if (!nombre) {
        return mostrarToast('El nombre no puede estar vacío', 'bg-danger');
    }

    // Bloqueo y Spinner
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Actualizando...`;

    try {
        const { error } = await _supabase
            .from('clientes')
            .update({ nombre, telefono })
            .eq('id', clienteSeleccionadoId);

        if (error) throw error;

        // ÉXITO
        const modalEl = document.getElementById('modalEditarCliente');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        mostrarToast('Datos del cliente actualizados', 'bg-success');

        await verDetalle(clienteSeleccionadoId);
        await actualizarListaClientes();

    } catch (err) {
        console.error('Error al actualizar cliente:', err);
        mostrarToast('Error al actualizar datos', 'bg-danger');
    } finally {
        // EL ARREGLO ESTÁ AQUÍ: 
        // Pase lo que pase (éxito o error), el botón vuelve a su estado original
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
};

// Eliminar un cliente

function confirmarEliminarCliente() {
    bootstrap.Modal.getInstance(document.getElementById('modalEditarCliente')).hide();
    new bootstrap.Modal(document.getElementById('modalConfirmarEliminar')).show();
}

async function ejecutarEliminacion(btn) {
    const boton = btn || document.getElementById('btnConfirmarEliminarCliente');
    if (!boton) return;

    const textoOriginal = boton.innerHTML;

    // 1. Bloqueo y Spinner
    boton.disabled = true;
    boton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Eliminando todo...`;

    try {
        // 2. Paso A: Obtener IDs de todas las deudas del cliente para borrar sus abonos
        const { data: deudas } = await _supabase
            .from('deudas')
            .select('id')
            .eq('cliente_id', clienteSeleccionadoId);

        if (deudas && deudas.length > 0) {
            const idsDeudas = deudas.map(d => d.id);

            // Borrar todos los abonos relacionados a esas deudas
            await _supabase
                .from('abonos')
                .delete()
                .in('deuda_id', idsDeudas);

            // Borrar todas las deudas del cliente
            await _supabase
                .from('deudas')
                .delete()
                .eq('cliente_id', clienteSeleccionadoId);
        }

        // 3. Paso B: Finalmente borrar al cliente
        const { error } = await _supabase
            .from('clientes')
            .delete()
            .eq('id', clienteSeleccionadoId);

        if (error) throw error;

        // ÉXITO
        const modalEl = document.getElementById('modalConfirmarEliminar');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        mostrarToast('Cliente y todo su historial eliminados', 'bg-danger');

        // Volver a la interfaz principal
        await actualizarListaClientes();        

    } catch (err) {
        console.error('Error al eliminar todo:', err);
        mostrarToast('Error al eliminar los datos', 'bg-dark');
    } finally {
        // REESTABLECER EL BOTÓN SIEMPRE
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
        
        // Refrescar reportes generales
        cargarReportes();
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

    const totalGeneralCliente = deudas.reduce((acc, d) => acc + parseFloat(d.saldo_pendiente || 0), 0);
    const colorTotal = totalGeneralCliente > 0 ? 'text-danger' : 'text-success';

    const tieneTelefono = cliente.telefono && cliente.telefono.trim() !== "";
    const nombreEscapado = cliente.nombre.replace(/'/g, "\\'");
    const deudasJSON = JSON.stringify(deudas).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    let html = `
        <div class="cliente-activo-header shadow-sm d-flex align-items-center p-3 bg-white mb-4 flex-wrap justify-content-center justify-content-md-between" style="border-radius: 15px;">
            
            <div class="d-flex align-items-center flex-grow-1" style="min-width: 200px;">
                <button class="btn-volver border-0 bg-transparent me-2 p-0" onclick="actualizarListaClientes()" title="Volver a la lista">
                    <span class="text-primary fw-bold" style="font-size: 1.5rem;">←</span>
                </button>
                
                <div class="cliente-avatar me-3 d-none d-md-flex" style="width: 50px; height: 50px; font-size: 1.1rem; align-items: center; justify-content: center; background: #e9ecef; border-radius: 50%; font-weight: bold;">
                    ${iniciales}
                </div>
                
                <div class="flex-grow-1">
                    <h4 class="mb-0 fw-bold text-dark" style="font-size: clamp(1.1rem, 4vw, 1.25rem);">${cliente.nombre}</h4>
                    <div class="d-flex align-items-center flex-wrap gap-2">
                        <small class="text-muted">📞 ${cliente.telefono || 'Sin número'}</small>
                        <button class="btn btn-sm btn-link p-0 text-primary text-decoration-none" onclick="abrirModalEditar('${nombreEscapado}', '${cliente.telefono || ''}')">Editar</button>
                        
                        ${tieneTelefono ? `
                            <button class="btn btn-sm btn-success d-flex align-items-center gap-1 py-0 px-2 shadow-sm" 
                                style="font-size: 0.75rem; border-radius: 20px; height: 22px; background-color: #25D366; border: none;"
                                onclick='enviarRecordatorioWhatsApp("${nombreEscapado}", "${cliente.telefono}", ${deudasJSON})'>
                                <span>WhatsApp</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="d-flex align-items-center gap-4 mt-2 mt-md-0 px-2">
                <div class="text-end">
                    <small class="text-muted d-block fw-bold" style="font-size: 0.7rem; text-transform: uppercase;">Saldo Total</small>
                    <span class="${colorTotal} fw-bold h4 mb-0">${fC$(totalGeneralCliente)}</span>
                </div>

                <button class="btn btn-primary btn-nuevo-cliente py-2 px-3 fw-bold shadow-sm" style="border-radius: 10px;" onclick="abrirModalDeuda()">+ Deuda</button>
            </div>
        </div>
        <div class="row m-0">`;

    // ... (El resto del forEach de las deudas se mantiene igual)
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
            <div class="col-12 col-md-6 mb-4">
                <div class="card card-deuda-moderna shadow-sm border-0" style="border-radius: 15px;">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <span class="badge bg-light text-primary text-uppercase p-2" style="font-size: 0.7rem;">${d.categoria}</span>
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm text-primary p-0 fw-bold" onclick="verHistorialAbonos(${d.id})"><small>🕒 Historial</small></button>
                                <button class="btn btn-sm text-secondary p-0" onclick="abrirModalEditarDeuda('${d.id}', '${descSegura}', ${mTotal}, ${sPendiente})"><small>✏️ Editar</small></button>
                            </div>
                        </div>
                        <p class="text-muted small mb-3" style="min-height: 40px;">${d.descripcion || 'Sin descripción'}</p>
                        <div class="mb-2 d-flex justify-content-between align-items-end">
                            <div>
                                <small class="text-muted d-block mb-1">Saldo Pendiente</small>
                                <span class="h4 fw-bold ${colorTextoSaldo}">${fC$(sPendiente)}</span>
                                <div class="text-muted" style="font-size: 0.8rem;">${fUS(sPendiente)}</div>
                            </div>
                            <div class="text-end"><small class="text-muted d-block">Total inicial: ${fC$(mTotal)}</small></div>
                        </div>
                        <div class="progress mb-4" style="height: 8px; border-radius: 10px;">
                            <div class="progress-bar bg-success" style="width: ${porcentajePagado}%"></div>
                        </div>
                        <div class="d-grid">
                            <button class="btn ${sPendiente <= 0 ? 'btn-outline-success' : 'btn-success'} py-2 fw-bold" 
                                onclick="abrirAbono(${d.id}, ${sPendiente})" ${sPendiente <= 0 ? 'disabled' : ''}>
                                ${sPendiente <= 0 ? '✅ TOTALMENTE PAGADO' : 'REGISTRAR ABONO'}
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

document.getElementById('btnGuardarDeuda').onclick = async function () {
    const btn = this; 
    const textoOriginal = btn.innerHTML;

    // 1. Obtener valores
    let montoRaw = parseFloat(document.getElementById('deudaMonto').value);
    const moneda = document.getElementById('monedaDeuda').value;
    const categoria = document.getElementById('deudaCategoria').value;
    const descripcion = document.getElementById('deudaDescripcion').value;

    // 2. Validación rápida antes de bloquear
    const montoFinal = moneda === "USD" ? montoRaw * tasaCambio : montoRaw;
    if (!montoFinal || montoFinal <= 0) {
        return mostrarToast('Monto inválido', 'bg-danger');
    }

    // 3. Bloquear botón y mostrar Spinner
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...`;

    try {
        const deuda = {
            cliente_id: clienteSeleccionadoId,
            categoria: categoria,
            descripcion: descripcion,
            monto_total: montoFinal,
            saldo_pendiente: montoFinal
        };

        const { error } = await _supabase.from('deudas').insert([deuda]);

        if (error) throw error;

        // ÉXITO
        const modalEl = document.getElementById('modalNuevaDeuda');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        mostrarToast('Deuda guardada en C$', 'bg-success');
        
        // Refrescar datos
        await verDetalle(clienteSeleccionadoId);
        await cargarReportes();

    } catch (err) {
        console.error('Error al guardar deuda:', err);
        mostrarToast('Error al conectar con la base de datos', 'bg-danger');
    } finally {
        // ESTO ES LO IMPORTANTE:
        // Pase lo que pase (error o éxito), el botón recupera su estado.
        // Así, la próxima vez que abras el modal, el botón estará listo.
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
};

function abrirModalEditarDeuda(id, concepto, monto) {
    deudaSeleccionadaId = id;
    document.getElementById('editDeudaConcepto').value = concepto;
    document.getElementById('editDeudaMonto').value = monto;
    new bootstrap.Modal(document.getElementById('modalEditarDeuda')).show();
}

document.getElementById('btnActualizarDeuda').onclick = async function () {
    const btn = this;
    const textoOriginal = btn.innerHTML;

    // 1. Obtener los nuevos valores del modal
    const nuevaDescripcion = document.getElementById('editDeudaConcepto').value;

    // 2. Bloquear botón y mostrar Spinner
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Actualizando...`;

    try {
        // 3. Llamada a Supabase para actualizar descripción y saldo
        const { error } = await _supabase
            .from('deudas')
            .update({
                descripcion: nuevaDescripcion,
            })
            .eq('id', deudaSeleccionadaId);

        if (!error) {
            // ÉXITO
            bootstrap.Modal.getInstance(document.getElementById('modalEditarDeuda')).hide();
            mostrarToast('Deuda actualizada correctamente', 'bg-success');

            // Refrescar la vista del cliente y los reportes generales
            await verDetalle(clienteSeleccionadoId);
            await cargarReportes();
        } else {
            throw error;
        }
    } catch (err) {
        console.error('Error al actualizar:', err);
        mostrarToast('Error al actualizar la deuda', 'bg-danger');

        // Solo rehabilitamos si hubo error para que el usuario corrija
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    } finally {
        // El botón se reseteará solo la próxima vez que se abra el modal, 
        // pero por seguridad lo devolvemos a su estado original si no se cerró el modal.
        if (btn.disabled) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
};

function confirmarEliminarDeuda() {
    // Cerramos el modal de edición primero
    const modalEditar = bootstrap.Modal.getInstance(document.getElementById('modalEditarDeuda'));
    if (modalEditar) modalEditar.hide();

    // Abrimos el modal de confirmación
    const modalConfirmar = new bootstrap.Modal(document.getElementById('modalConfirmarEliminarDeuda'));
    modalConfirmar.show();
}

async function ejecutarEliminacionDeuda(btn) {
    // Verificación de seguridad por si el botón no llega
    const boton = btn || document.getElementById('btnEjecutarEliminar');
    if (!boton) return;

    const textoOriginal = boton.innerHTML;

    // 1. Bloqueo y Spinner
    boton.disabled = true;
    boton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ELIMINANDO...`;

    try {
        // 2. Borramos abonos primero
        const { error: errorAbonos } = await _supabase
            .from('abonos')
            .delete()
            .eq('deuda_id', deudaSeleccionadaId);

        if (errorAbonos) throw errorAbonos;

        // 3. Borramos la deuda
        const { error: errorDeuda } = await _supabase
            .from('deudas')
            .delete()
            .eq('id', deudaSeleccionadaId);

        if (errorDeuda) throw errorDeuda;

        // ÉXITO
        const modalEl = document.getElementById('modalConfirmarEliminarDeuda');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        mostrarToast('Registro eliminado', 'bg-danger');

        // Refrescamos la interfaz (importante el await para que no se crucen los procesos)
        await verDetalle(clienteSeleccionadoId);
        await cargarReportes();

    } catch (err) {
        console.error('Error al eliminar:', err);
        mostrarToast('No se pudo eliminar', 'bg-dark');
        // El botón se resetea en el finally, así que no hace falta ponerlo aquí
    } finally {
        // ESTO ES LO QUE ARREGLA EL PROBLEMA:
        // Pase lo que pase, el botón vuelve a estar activo y con su texto original
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
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
document.getElementById('btnGuardarAbono').onclick = async function () {
    const btn = this; // Referencia al botón (Guardar Abono)
    const textoOriginal = btn.innerHTML;

    const inputMonto = document.getElementById('abonoMonto');
    const montoRaw = parseFloat(inputMonto.value);
    const moneda = document.getElementById('monedaAbono').value;

    // 1. Validación rápida antes de bloquear
    if (!montoRaw || montoRaw <= 0) {
        return mostrarToast('Ingrese un monto válido', 'bg-danger');
    }

    // Convertimos a córdobas para la validación y la DB
    const montoFinalCordobas = moneda === "USD" ? montoRaw * tasaCambio : montoRaw;

    if (montoFinalCordobas > (saldoActualDeuda + 0.1)) {
        return mostrarToast('El abono excede el saldo pendiente', 'bg-danger');
    }

    // 2. Bloqueamos el botón y ponemos el Spinner
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Procesando...`;

    try {
        // 3. Registrar el abono en la base de datos
        const { error: errorAbono } = await _supabase
            .from('abonos')
            .insert([{
                deuda_id: deudaSeleccionadaId,
                monto: montoFinalCordobas
            }]);

        if (errorAbono) throw errorAbono;

        // 4. Llamar a la función SQL de Supabase para actualizar el saldo
        const { error: errorRPC } = await _supabase.rpc('registrar_pago', {
            p_deuda_id: deudaSeleccionadaId,
            p_monto: montoFinalCordobas
        });

        if (errorRPC) throw errorRPC;

        // ÉXITO
        bootstrap.Modal.getInstance(document.getElementById('modalAbono')).hide();
        mostrarToast(`Abono de ${moneda === 'USD' ? '$' + montoRaw : 'C$' + montoRaw} guardado`, 'bg-success');

        // Refrescar datos
        await verDetalle(clienteSeleccionadoId);
        await cargarReportes();

    } catch (err) {
        console.error('Error en el abono:', err);
        mostrarToast('Error al registrar abono', 'bg-danger');

        // Si hay error, regresamos el botón a su estado normal para que el usuario corrija
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
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

// Escuchar cuando cualquier modal se termina de ocultar
document.addEventListener('hidden.bs.modal', function (event) {
    const modalId = event.target.id;

    // Si es el modal de nueva deuda o nuevo abono, limpiamos los campos
    if (modalId === 'modalNuevaDeuda' || modalId === 'modalAbono') {
        const formulario = event.target.querySelector('form');
        if (formulario) {
            formulario.reset(); // Esto limpia todos los inputs del form
        } else {
            // Si no usas <form>, limpiamos los inputs uno por uno
            const inputs = event.target.querySelectorAll('input, select, textarea');
            inputs.forEach(input => input.value = '');
        }

        // También limpiamos los textos de ayuda (como el de la conversión de $)
        const feedbacks = event.target.querySelectorAll('.form-text');
        feedbacks.forEach(f => f.innerText = '');
    }
});

// Resetear botones al abrir cualquier modal
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('show.bs.modal', function () {
        const btnGuardar = this.querySelector('.btn-guardar-moderno, .btn-primary, .btn-danger');
        if (btnGuardar) {
            btnGuardar.disabled = false;
            // Asegúrate de que el texto sea el correcto según el modal
            if (this.id === 'modalNuevoCliente') btnGuardar.innerText = 'Guardar Cliente';
            if (this.id === 'modalNuevaDeuda') btnGuardar.innerText = 'Confirmar Deuda';
            if (this.id === 'modalAbono') btnGuardar.innerText = 'Guardar Abono';
        }
    });
});

function enviarRecordatorioWhatsApp(nombre, telefono, deudas) {
    // Filtrar solo las deudas que tienen saldo pendiente
    const deudasPendientes = deudas.filter(d => parseFloat(d.saldo_pendiente) > 0);
    
    if (deudasPendientes.length === 0) {
        return mostrarToast('El cliente no tiene deudas pendientes', 'bg-success');
    }

    let totalGeneral = 0;
    let resumenProductos = "";

    deudasPendientes.forEach(d => {
        const saldo = parseFloat(d.saldo_pendiente);
        totalGeneral += saldo;
        resumenProductos += `• *${d.descripcion || 'Servicio'}*: C$ ${saldo.toLocaleString()}\n`;
    });

    // Mensaje profesional y amable
    const mensaje = encodeURIComponent(
        `Hola *${nombre}*, te saluda *Lesly*!\n\n` +
        `Esperamos que te encuentres muy bien. Te compartimos un pequeño resumen de tu saldo pendiente con nosotros:\n\n` +
        `${resumenProductos}\n` +
        `*Total a pagar: C$ ${totalGeneral.toLocaleString()}*\n\n` +
        `Este es solo un recordatorio para tu control personal. ¡Cualquier duda quedamos a tus órdenes!`
    );

    // Formatear número (Nicaragua +505)
    const numeroLimpio = telefono.replace(/\D/g, '');
    const link = `https://wa.me/505${numeroLimpio}?text=${mensaje}`;

    window.open(link, '_blank');
}