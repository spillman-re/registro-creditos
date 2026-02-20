const SUPABASE_URL = 'https://cvwkjtwwewxpjoftcdwu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2d2tqdHd3ZXd4cGpvZnRjZHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTM3OTQsImV4cCI6MjA4NTk2OTc5NH0.K93vrrerStJjOeXkqdKwV_2qSDTLSB4gVyT_9oHV7cY';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let tasaCambioGlobal = 1; 
let ordenActiva = null;
let saldoActivo = 0;

// --- SINCRONIZACIÓN DE TASA ---
async function obtenerTasaDeCambio() {
    try {
        const { data, error } = await _supabase
            .from('configuracion')
            .select('valor')
            .eq('clave', 'tasa_cambio')
            .single();

        if (error) throw error;

        if (data) {
            tasaCambioGlobal = parseFloat(data.valor);
            const elTasa = document.getElementById('txtTasaProv');
            if (elTasa) elTasa.innerText = tasaCambioGlobal.toFixed(2);
            actualizarLista(); // Refresca visualmente los equivalentes en $
            cargarResumenTotales();
        }
    } catch (err) {
        console.error("Error al obtener tasa de cambio:", err.message);
    }
}

const canalConfig = _supabase
  .channel('cambios-tasa')
  .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'configuracion',
      filter: 'clave=eq.tasa_cambio' 
  }, payload => {
      tasaCambioGlobal = parseFloat(payload.new.valor);
      const elTasa = document.getElementById('txtTasaProv');
      if (elTasa) elTasa.innerText = tasaCambioGlobal.toFixed(2);
      actualizarLista();
      console.log("¡Tasa actualizada en tiempo real!");
  })
  .subscribe();

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    obtenerTasaDeCambio();
    actualizarLista();
    cargarResumenTotales();

    document.getElementById('busquedaProv').addEventListener('input', (e) => {
        actualizarLista(e.target.value);
    });

    ['modalNuevaOrden', 'modalAbonoProv'].forEach(mId => {
        document.getElementById(mId).addEventListener('show.bs.modal', () => {
            const fechaId = mId === 'modalNuevaOrden' ? 'ordFecha' : 'pagoFecha';
            document.getElementById(fechaId).value = new Date().toISOString().split('T')[0];
        });
    });

    configurarConv('ordMonto', 'ordMoneda', 'calcOrden');
    configurarConv('pagoMonto', 'pagoMoneda', 'calcPago');
});

// --- LÓGICA DE STORAGE ---
async function subirImagen(input, carpeta) {
    const file = input.files[0];
    if (!file) return null;

    if (file.size > 8 * 1024 * 1024) {
        alert("¡Imagen muy pesada! Por favor toma una foto con menos resolución o comprímela.");
        return null;
    }

    // Feedback visual en el botón
    const btnId = carpeta === 'ordenes' ? 'btnGuardarOrden' : 'btnGuardarAbono';
    const btnOriginalText = document.getElementById(btnId).innerText;
    document.getElementById(btnId).innerText = "🔄 SUBIENDO FOTO...";

    const path = `${carpeta}/${Date.now()}_${file.name}`;
    
    const { data, error } = await _supabase.storage.from('proveedores').upload(path, file);
    
    if (error) {
        alert("Error de subida: " + error.message);
        document.getElementById(btnId).innerText = btnOriginalText;
        return null;
    }
    
    const { data: { publicUrl } } = _supabase.storage.from('proveedores').getPublicUrl(path);
    return publicUrl;
}

async function borrarArchivoBucket(url) {
    if (!url || typeof url !== 'string') return;
    try {
        const identificador = '/proveedores/';
        const indice = url.indexOf(identificador);
        if (indice === -1) return;
        let pathInterno = url.substring(indice + identificador.length);
        pathInterno = decodeURIComponent(pathInterno);

        const { error } = await _supabase.storage
            .from('proveedores')
            .remove([pathInterno]);

        if (error) console.error("Error al borrar:", error.message);
    } catch (err) {
        console.error("Error en borrado:", err);
    }
}

// --- CRUD ÓRDENES ---
async function actualizarLista(busqueda = '') {
    let query = _supabase.from('deudas_proveedores').select('*').order('fecha_orden', { ascending: false });
    if (busqueda) query = query.ilike('proveedor_nombre', `%${busqueda}%`);
    
    const { data, error } = await query;
    if (error) return;

    const panel = document.getElementById('panelOrdenes');
    panel.innerHTML = data.map(o => {
        const porc = ((o.monto_total - o.saldo_pendiente) / o.monto_total) * 100;
        return `
        <div class="col-md-6 col-lg-4">
            <div class="card card-orden shadow-sm p-4">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <span class="badge bg-light text-dark border mb-2">${o.fecha_orden}</span>
                        <h5 class="fw-bold mb-0">${o.proveedor_nombre}</h5>
                    </div>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-light" type="button" data-bs-toggle="dropdown">⋮</button>
                        <ul class="dropdown-menu dropdown-menu-end shadow border-0">
                            ${o.foto_orden_url ? `<li><a class="dropdown-item fw-bold" href="${o.foto_orden_url}" target="_blank">🖼️ Ver Orden</a></li>` : '<li><span class="dropdown-item disabled">Sin foto</span></li>'}
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger fw-bold" href="javascript:void(0)" onclick="eliminarDeudaCompleta(${o.id}, '${o.foto_orden_url || ''}')">🗑️ Eliminar Deuda</a></li>
                        </ul>
                    </div>
                </div>
                
                <div class="mb-3">
                    <small class="text-muted d-block">Saldo Pendiente</small>
                    <span class="h4 fw-bold ${o.saldo_pendiente <= 0 ? 'text-success' : 'text-danger'}">${fC$(o.saldo_pendiente)}</span>
                    <small class="text-muted d-block">${fUS(o.saldo_pendiente)}</small>
                </div>

                <div class="progress mb-4" style="height: 6px; border-radius: 10px;">
                    <div class="progress-bar bg-success" style="width: ${porc}%"></div>
                </div>

                <div class="d-grid gap-2">
                    <button class="btn btn-dark py-2 rounded-3 fw-bold" onclick="prepararAbono(${o.id}, ${o.saldo_pendiente})" ${o.saldo_pendiente <= 0 ? 'disabled' : ''}>
                        ${o.saldo_pendiente <= 0 ? '✅ TOTALMENTE PAGADO' : 'REGISTRAR ABONO'}
                    </button>
                    <button class="btn btn-link btn-sm text-decoration-none text-muted" onclick="verHistorial(${o.id})">Ver abonos</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function guardarOrdenCompra() {
    const prov = document.getElementById('ordProveedor').value;
    const monto = parseFloat(document.getElementById('ordMonto').value);
    const mon = document.getElementById('ordMoneda').value;
    const fecha = document.getElementById('ordFecha').value;
    const inputFoto = document.getElementById('ordFoto');

    if (!prov || !monto) return alert('Datos incompletos');

    const btn = document.getElementById('btnGuardarOrden');
    btn.disabled = true;

    const montoC = mon === 'USD' ? monto * tasaCambioGlobal : monto;
    const url = await subirImagen(inputFoto, 'ordenes');

    const { error } = await _supabase.from('deudas_proveedores').insert({
        proveedor_nombre: prov,
        fecha_orden: fecha,
        monto_total: montoC,
        saldo_pendiente: montoC,
        moneda: mon,
        tasa_cambio_usada: tasaCambioGlobal,
        foto_orden_url: url
    });

    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('modalNuevaOrden')).hide();
        actualizarLista();
        cargarResumenTotales();
    }
    btn.disabled = false;
}

// --- ABONOS ---
function prepararAbono(id, saldo) {
    ordenActiva = id;
    saldoActivo = saldo;
    document.getElementById('txtSaldoOrden').innerText = fC$(saldo);
    new bootstrap.Modal(document.getElementById('modalAbonoProv')).show();
}

async function guardarAbonoProv() {
    const monto = parseFloat(document.getElementById('pagoMonto').value);
    const mon = document.getElementById('pagoMoneda').value;
    const fecha = document.getElementById('pagoFecha').value;
    const inputFoto = document.getElementById('pagoFoto');

    const montoC = mon === 'USD' ? monto * tasaCambioGlobal : monto;
    if (montoC > (saldoActivo + 0.5)) return alert('Monto excede saldo');

    const btn = document.getElementById('btnGuardarAbono');
    btn.disabled = true;

    const url = await subirImagen(inputFoto, 'facturas');

    await _supabase.from('pagos_proveedores').insert({
        deuda_id: ordenActiva,
        monto_abonado: montoC,
        fecha_pago: fecha,
        foto_factura_url: url
    });

    const nuevoSaldo = saldoActivo - montoC;
    await _supabase.from('deudas_proveedores').update({ saldo_pendiente: nuevoSaldo }).eq('id', ordenActiva);

    if (nuevoSaldo <= 0.01) {
        const { data: orden } = await _supabase.from('deudas_proveedores').select('foto_orden_url').eq('id', ordenActiva).single();
        if (orden.foto_orden_url) await borrarArchivoBucket(orden.foto_orden_url);
        const { data: pagos } = await _supabase.from('pagos_proveedores').select('foto_factura_url').eq('deuda_id', ordenActiva);
        for (let p of pagos) { if (p.foto_factura_url) await borrarArchivoBucket(p.foto_factura_url); }
        await _supabase.from('deudas_proveedores').update({ foto_orden_url: null }).eq('id', ordenActiva);
        await _supabase.from('pagos_proveedores').update({ foto_factura_url: null }).eq('deuda_id', ordenActiva);
    }

    bootstrap.Modal.getInstance(document.getElementById('modalAbonoProv')).hide();
    actualizarLista();
    cargarResumenTotales();
    btn.disabled = false;
}

async function verHistorial(id) {
    const { data } = await _supabase.from('pagos_proveedores').select('*').eq('deuda_id', id).order('fecha_pago', { ascending: false });
    const lista = document.getElementById('listaPagos');
    lista.innerHTML = data.map(p => `
        <div class="d-flex justify-content-between align-items-center p-3 border-bottom">
            <div>
                <small class="text-muted d-block">${p.fecha_pago}</small>
                <span class="fw-bold">${fC$(p.monto_abonado)}</span>
            </div>
            <div class="d-flex gap-2">
                ${p.foto_factura_url ? `<a href="${p.foto_factura_url}" target="_blank" class="btn btn-sm btn-light">Ver Factura</a>` : '<small class="text-muted">Sin foto</small>'}
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarAbono(${p.id}, ${p.monto_abonado}, ${p.deuda_id}, '${p.foto_factura_url || ''}')">🗑️</button>
            </div>
        </div>
    `).join('') || 'No hay abonos.';
    new bootstrap.Modal(document.getElementById('modalHistorial')).show();
}

async function eliminarAbono(pagoId, monto, deudaId, fotoUrl) {
    if (!confirm("¿Eliminar abono? El saldo de la deuda aumentará.")) return;
    const { data: deuda } = await _supabase.from('deudas_proveedores').select('saldo_pendiente').eq('id', deudaId).single();
    await _supabase.from('pagos_proveedores').delete().eq('id', pagoId);
    await _supabase.from('deudas_proveedores').update({ saldo_pendiente: parseFloat(deuda.saldo_pendiente) + parseFloat(monto) }).eq('id', deudaId);
    if (fotoUrl) await borrarArchivoBucket(fotoUrl);
    bootstrap.Modal.getInstance(document.getElementById('modalHistorial')).hide();
    actualizarLista();
    cargarResumenTotales();
}

async function eliminarDeudaCompleta(id, fotoOrdenUrl) {
    if (!confirm("¿Eliminar deuda completa y todos sus abonos/fotos?")) return;
    const { data: pagos } = await _supabase.from('pagos_proveedores').select('foto_factura_url').eq('deuda_id', id);
    if (pagos) { for (let p of pagos) { if (p.foto_factura_url) await borrarArchivoBucket(p.foto_factura_url); } }
    if (fotoOrdenUrl) await borrarArchivoBucket(fotoOrdenUrl);
    await _supabase.from('deudas_proveedores').delete().eq('id', id);
    actualizarLista();
    cargarResumenTotales();
}

// --- REPORTES ---
async function cargarResumenTotales() {
    const dDesde = document.getElementById('repDesde').value;
    const dHasta = document.getElementById('repHasta').value;
    const { data: dTotal } = await _supabase.from('deudas_proveedores').select('saldo_pendiente');
    let sumaDeuda = dTotal ? dTotal.reduce((acc, curr) => acc + parseFloat(curr.saldo_pendiente), 0) : 0;
    document.getElementById('totalDeudaGeneral').innerText = fC$(sumaDeuda);
    if (dDesde && dHasta) {
        const { data: dPagos } = await _supabase.from('pagos_proveedores').select('monto_abonado').gte('fecha_pago', dDesde).lte('fecha_pago', dHasta);
        let sumaPagos = dPagos ? dPagos.reduce((acc, curr) => acc + parseFloat(curr.monto_abonado), 0) : 0;
        document.getElementById('totalPagadoRango').innerText = fC$(sumaPagos);
    }
}

// --- FORMATO ---
function fC$(v) { return 'C$ ' + parseFloat(v).toLocaleString('es-NI', { minimumFractionDigits: 2 }); }
function fUS(v) { return '$ ' + (parseFloat(v) / tasaCambioGlobal).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

function configurarConv(montoId, monId, calcId) {
    const elMonto = document.getElementById(montoId);
    const elMon = document.getElementById(monId);
    const elCalc = document.getElementById(calcId);
    const calc = () => {
        const v = parseFloat(elMonto.value) || 0;
        if (elMon.value === 'USD') elCalc.innerText = `Equivale a: ${fC$(v * tasaCambioGlobal)}`;
        else elCalc.innerText = `Equivale a: ${fUS(v)}`;
    };
    elMonto.addEventListener('input', calc);
    elMon.addEventListener('change', calc);
}