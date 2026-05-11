// ==========================================
// --- 1. VARIABLES GLOBALES Y CONFIGURACIÓN ---
// ==========================================
if (typeof window.detalleFactura === 'undefined') {
    window.detalleFactura = [];
}
let clienteActual = null;

// ==========================================
// --- 2. LÓGICA DE VENTAS Y FACTURACIÓN ---
// ==========================================

async function consultarCliente() {
    const cedulaElement = document.getElementById('factura_cedula');
    const inputNombre = document.getElementById('factura_nombre');
    const inputDireccion = document.getElementById('factura_direccion');
    const seccionVenta = document.getElementById('seccion-venta');
    
    if (!cedulaElement) return;
    const cedula = cedulaElement.value.trim();

    const esConsumidorFinal = (cedula === '9999999999' || cedula === '9999999999999');
    const longitudValida = (cedula.length === 10 || cedula.length === 13);

    if (!esConsumidorFinal && !longitudValida) {
        inputNombre.value = "";
        if (inputDireccion) inputDireccion.value = "";
        if (seccionVenta) {
            seccionVenta.style.opacity = "0.4";
            seccionVenta.style.pointerEvents = "none";
        }
        gestionarCamposCliente(false);
        return; 
    }

    if (esConsumidorFinal) {
        inputNombre.value = "CONSUMIDOR FINAL";
        if (inputDireccion) inputDireccion.value = "S/N";
        if (seccionVenta) {
            seccionVenta.style.opacity = "1";
            seccionVenta.style.pointerEvents = "auto";
        }
        gestionarCamposCliente(true);
        return;
    }

    if (typeof validarDocumentoEcuador === "function") {
        if (!validarDocumentoEcuador(cedula)) {
            if (longitudValida) {
                Swal.fire({
                    title: 'Identificación Inválida',
                    text: 'El número ingresado no es una cédula o RUC válido.',
                    icon: 'error'
                });
                inputNombre.value = "";
                if (inputDireccion) inputDireccion.value = "";
            }
            return;
        }
    }

    try {
        const res = await fetch(`/api/buscar_cliente/${cedula}`);
        const data = await res.json();

        // CAMBIO PARA BORRADO LÓGICO: 
        // Si el cliente existe y está activo
        if (res.ok && data.success) {
            inputNombre.value = data.nombre;
            if (inputDireccion) inputDireccion.value = data.direccion || "S/N";

            if (seccionVenta) {
                seccionVenta.style.opacity = "1";
                seccionVenta.style.pointerEvents = "auto";
            }
            gestionarCamposCliente(true);
        } 
        else {
            // Si el cliente no existe O está inactivo (borrado lógico)
            gestionarCamposCliente(false);
            
            // Verificamos si el error es porque está inactivo (el backend debe enviar este flag)
            const tituloMsg = data.is_inactive ? 'Cliente Inactivo' : 'Cliente no registrado';
            const textoMsg = data.is_inactive ? 
                'Este cliente está desactivado. ¿Desea reactivarlo y usarlo?' : 
                '¿Desea registrar al cliente en la base de datos?';

            const conf = await Swal.fire({
                title: tituloMsg,
                text: textoMsg,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Cancelar'
            });

            if (conf.isConfirmed) {
                document.getElementById('reg_cedula').value = cedula;
                const modal = new bootstrap.Modal(document.getElementById('modalClienteRapido'));
                modal.show();
                // Si estaba inactivo, el modal de guardado debe llamar a la misma API de POST 
                // y el backend se encargará de poner activo=True
            } 
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}

function validarLimpiezaInstante() {
    const cedula = document.getElementById('factura_cedula').value.trim();
    const nombre = document.getElementById('factura_nombre');
    const direccion = document.getElementById('factura_direccion');

    if (cedula.length !== 10 && cedula.length !== 13) {
        nombre.value = "";
        direccion.value = "";
    }
}

function prepararNuevaVenta() {
    const inputCedula = document.getElementById('factura_cedula');
    const inputNombre = document.getElementById('factura_nombre');
    const inputDireccion = document.getElementById('factura_direccion');
    const seccionVenta = document.getElementById('seccion-venta');

    if (inputCedula) inputCedula.value = "9999999999999";
    if (inputNombre) inputNombre.value = "CONSUMIDOR FINAL";
    if (inputDireccion) inputDireccion.value = "S/N";
    
    if (seccionVenta) {
        seccionVenta.style.opacity = "1";
        seccionVenta.style.pointerEvents = "auto";
    }
}

window.addEventListener('load', () => {
    prepararNuevaVenta();
    if (document.getElementById('tabla-factura')) {
        actualizarTabla();
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('nuevo') === 'true' && params.get('cedula')) {
        setTimeout(() => {
            // Asumiendo que esta función existe en tu código global
            if(typeof abrirModalNuevo === "function") abrirModalNuevo(); 
            const inputCedula = document.getElementById('cli_cedula');
            if (inputCedula) {
                inputCedula.value = params.get('cedula');
                document.getElementById('cli_nombre')?.focus();
            }
        }, 600);
    }
});

async function guardarClienteRapido() {
    const nombre = document.getElementById('reg_nombre').value.trim().toUpperCase();
    const cedula = document.getElementById('reg_cedula').value;
    const telefono = document.getElementById('reg_telefono').value.trim();
    const correo = document.getElementById('reg_correo').value.trim();
    const direccion = document.getElementById('reg_direccion').value.trim().toUpperCase() || "S/N";

    if (!nombre) {
        return Swal.fire('Atención', 'El nombre es obligatorio.', 'warning');
    }

    const datosCliente = {
        cedula: cedula,
        nombre: nombre,
        telefono: telefono || "0000000000",
        correo: correo || "sin@correo.com",
        direccion: direccion
    };

    try {
        const res = await fetch('/api/clientes', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosCliente)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            document.getElementById('factura_nombre').value = nombre;
            document.getElementById('factura_direccion').value = direccion;

            const seccionVenta = document.getElementById('seccion-venta');
            if (seccionVenta) {
                seccionVenta.style.opacity = "1";
                seccionVenta.style.pointerEvents = "auto";
            }

            const modalEl = document.getElementById('modalClienteRapido');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();

            Swal.fire({ 
                title: '¡Éxito!', 
                text: data.message || 'Cliente procesado correctamente.', 
                icon: 'success', 
                timer: 1500, 
                showConfirmButton: false 
            });

        } else {
            // Manejo de errores específicos del backend (como cédulas duplicadas o errores de BD)
            Swal.fire('Error', data.error || 'No se pudo guardar el cliente', 'error');
        }
    } catch (error) {
        console.error("Error en el fetch:", error);
        Swal.fire('Error', 'Fallo al conectar con el servidor', 'error');
    }
}

async function agregarProductoAFactura(id, codigo, nombre, precio) {
    try {
        const response = await fetch(`/api/verificar_producto/${codigo}`);
        if (!response.ok) throw new Error("Producto no encontrado");
        
        const data = await response.json();

        if (!data.existe || data.stock <= 0) {
            Swal.fire('Sin Stock', `El producto "${nombre}" no tiene unidades disponibles.`, 'warning');
            return;
        }

        const precioNum = parseFloat(precio);
        let itemExistente = window.detalleFactura.find(i => i.codigo === codigo);

        if (itemExistente) {
            if (itemExistente.cantidad + 1 > data.stock) {
                Swal.fire('Límite de Stock', `Solo hay ${data.stock} disponibles.`, 'info');
                return;
            }
            itemExistente.cantidad += 1;
            itemExistente.subtotal = parseFloat((itemExistente.cantidad * precioNum).toFixed(2));
        } else {
            window.detalleFactura.push({
                id: id, codigo: codigo, nombre: nombre, precio: precioNum,
                cantidad: 1, subtotal: precioNum, stockMax: data.stock
            });
        }
        actualizarTabla();
        if(typeof cerrarModal === "function") cerrarModal(); 
    } catch (e) {
        Swal.fire('Error', 'No se pudo verificar el producto.', 'error');
    }
}

function actualizarTabla() {
    const tabla = document.getElementById('tabla-factura');
    if (!tabla) return;

    if (window.detalleFactura.length === 0) {
        tabla.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-box-open fa-2x mb-2"></i><br>No hay productos</td></tr>`;
        if (typeof recalcularTotales === "function") recalcularTotales(); 
        return;
    }

    let html = "";
    window.detalleFactura.forEach((item, index) => {
        const precio = parseFloat(item.precio) || 0;
        const subtotal = parseFloat(item.subtotal) || 0;

        html += `
            <tr data-codigo="${item.codigo}">
                <td><strong>${item.nombre}</strong><br><small class="text-muted">${item.codigo}</small></td>
                <td style="width: 100px;">
                    <input type="number" class="form-control form-control-sm text-center fw-bold" 
                           value="${item.cantidad}" min="1" max="${item.stockMax || 999}"
                           onchange="modificarCantidad(${index}, this.value)">
                </td>
                <td>$ ${precio.toFixed(2)}</td>
                <td class="fw-bold text-primary">$ ${subtotal.toFixed(2)}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="eliminarItem(${index})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>`;
    });
    
    tabla.innerHTML = html;
    if (typeof recalcularTotales === "function") recalcularTotales();
}

function modificarCantidad(index, valor) {
    const item = window.detalleFactura[index];
    if (!item) return;

    let cant = parseInt(valor);

    if (isNaN(cant) || cant < 1) {
        cant = 1;
    } else if (cant > item.stockMax) {
        Swal.fire({
            title: 'Stock insuficiente',
            text: `Solo hay ${item.stockMax} unidades disponibles.`,
            icon: 'warning',
            timer: 2000,
            showConfirmButton: false
        });
        cant = item.stockMax;
    }

    item.cantidad = cant;
    item.subtotal = parseFloat((item.cantidad * item.precio).toFixed(2));

    const tabla = document.getElementById('tabla-factura');
    if (tabla) {
        const fila = tabla.rows[index];
        if (fila) {
            const input = fila.querySelector('input[type="number"]');
            if (input) input.value = item.cantidad;
            const celdaSubtotal = fila.cells[3];
            if (celdaSubtotal) {
                celdaSubtotal.innerText = `$ ${item.subtotal.toFixed(2)}`;
            }
        }
    }

    if (typeof recalcularTotales === "function") {
        recalcularTotales();
    }
}

function eliminarItem(index) {
    window.detalleFactura.splice(index, 1);
    actualizarTabla();

    if (window.detalleFactura.length === 0) {
        const inputDesc = document.getElementById('descuento-global');
        if (inputDesc) inputDesc.value = 0;
        const contenedorMotivo = document.getElementById('contenedor-motivo');
        if (contenedorMotivo) contenedorMotivo.style.display = 'none';
        const motivoInput = document.getElementById('motivo-descuento');
        if (motivoInput) motivoInput.value = "";
    }

    if (typeof recalcularTotales === "function") {
        recalcularTotales();
    }
}

async function validarYConsultar(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    consultarCliente();
}

function gestionarCamposCliente(bloquear = false) {
    const inputNombre = document.getElementById('factura_nombre');
    const inputDireccion = document.getElementById('factura_direccion');
    const fields = [inputNombre, inputDireccion];

    fields.forEach(field => {
        if (field) {
            field.readOnly = bloquear;
            field.style.backgroundColor = bloquear ? "#e9ecef" : "#ffffff";
            field.style.cursor = bloquear ? "not-allowed" : "text";
        }
    });
}

function prepararParaNuevoCliente(ced, nom, dir) {
    ced.readOnly = false; 
    ced.disabled = false; 
    ced.value = "";
    nom.value = "";
    if (dir) dir.value = "";
    gestionarCamposCliente(false);
    ced.focus();
}

async function finalizarFactura() {
    try {
        // 1. VERIFICACIÓN DE CAJA
        const checkCaja = await fetch('/api/verificar_estado_caja');
        const estadoCaja = await checkCaja.json();

        if (!estadoCaja.abierta) {
            return Swal.fire({
                title: 'Caja Cerrada',
                text: 'Debe abrir la caja antes de realizar ventas.',
                icon: 'warning',
                confirmButtonText: 'Ir a Apertura',
                showCloseButton: true
            }).then((result) => {
                if (result.isConfirmed) window.location.href = '/control_caja';
            });
        }

        if (!estadoCaja.es_responsable) {
            return Swal.fire({ 
                title: 'Acceso Denegado', 
                text: `Esta caja pertenece a ${estadoCaja.responsable_nombre}`, 
                icon: 'error', 
                showCloseButton: true 
            });
        }

    } catch (error) {
        return Swal.fire('Error', "No se pudo verificar el permiso de caja.", 'error');
    }

    // 2. CAPTURA DE DATOS
    const inputCedula = document.getElementById('factura_cedula');
    const inputNombre = document.getElementById('factura_nombre');
    const inputDireccion = document.getElementById('factura_direccion');
    const metodoPagoElement = document.getElementById('metodo-pago');
    
    const cedulaLimpia = inputCedula.value.trim();
    const nombreLimpio = inputNombre.value.trim().toUpperCase();
    const esConsumidorFinal = (cedulaLimpia === '9999999999999' || cedulaLimpia === '9999999999' || cedulaLimpia === "");

    if (window.detalleFactura.length === 0) return Swal.fire('Error', "Agregue productos a la lista.", 'warning');

    const totalVenta = parseFloat(document.getElementById('total-final').innerText.replace('$ ', '')) || 0;

    // 3. VALIDACIÓN DE IDENTIFICACIÓN > $50
    if (totalVenta > 50.00 && esConsumidorFinal) {
        await Swal.fire({ 
            title: 'Identificación Obligatoria', 
            text: 'Ventas mayores a $50 requieren datos del cliente.', 
            icon: 'error', 
            showCloseButton: true 
        });
        if (typeof prepararParaNuevoCliente === "function") prepararParaNuevoCliente(inputCedula, inputNombre, inputDireccion);
        return; 
    }

    // 4. CONFIRMACIÓN INICIAL
    const preguntaIdentidad = await Swal.fire({
        title: '¿Confirmar Venta?',
        text: `¿Venta para: ${nombreLimpio || "CONSUMIDOR FINAL"}?`,
        icon: 'question',
        showCancelButton: true,
        showCloseButton: true,
        allowOutsideClick: false,
        confirmButtonText: 'Sí, guardar venta',
        cancelButtonText: 'No, corregir datos',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#dc3545'
    });

    // Si cierra con la X o cancela, simplemente sale de la función sin recargar
    if (!preguntaIdentidad.isConfirmed) {
        if (preguntaIdentidad.dismiss === Swal.DismissReason.cancel) {
            if (typeof prepararParaNuevoCliente === "function") {
                prepararParaNuevoCliente(inputCedula, inputNombre, inputDireccion);
            }
        }
        return; 
    }

    // PREPARAR DATOS PARA EL SERVIDOR
    const datos = {
        cliente: {
            cedula: cedulaLimpia || "9999999999999",
            nombre: nombreLimpio || "CONSUMIDOR FINAL",
            direccion: (inputDireccion?.value || "S/N").trim().toUpperCase()
        },
        productos: window.detalleFactura,
        subtotal: parseFloat(document.getElementById('subtotal-bruto').innerText.replace('$ ', '')),
        descuento: parseFloat(document.getElementById('descuento-global')?.value || 0),
        motivo_descuento: document.getElementById('motivo-descuento')?.value.trim().toUpperCase() || "",
        total: totalVenta,
        metodo_pago: metodoPagoElement.value
    };

    try {
        // GUARDAMOS EN LA BASE DE DATOS
        const respuesta = await fetch('/api/guardar_factura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            return Swal.fire('Error', resultado.error || "No se pudo procesar la venta.", 'error');
        }

        const idFactura = resultado.id || resultado.factura_id;

        // 5. LÓGICA POST-GUARDADO
        if (esConsumidorFinal) {
            // Caso Consumidor Final: Directo al éxito y recarga
            await Swal.fire({ title: 'Venta Registrada', icon: 'success', timer: 1500, showConfirmButton: false });
            location.reload();
        } else {
            // Caso Cliente con Datos: Preguntar formato
            const seleccionAccion = await Swal.fire({
                title: 'Venta Guardada',
                text: '¿Cómo desea entregar el comprobante?',
                icon: 'success',
                showDenyButton: true,
                showCancelButton: true,
                showCloseButton: true,
                allowOutsideClick: false,
                confirmButtonText: '<i class="fas fa-envelope"></i> Correo',
                denyButtonText: '<i class="fas fa-receipt"></i> Ticket',
                cancelButtonText: '<i class="fas fa-file-pdf"></i> A4',
                confirmButtonColor: '#6f42c1', 
                denyButtonColor: '#17a2b8',    
                cancelButtonColor: '#28a745'
            });

            // Si cierra con la X aquí, recargamos porque la venta ya se guardó
            if (seleccionAccion.isDismissed && seleccionAccion.dismiss === Swal.DismissReason.close) {
                location.reload();
                return;
            }

            if (seleccionAccion.isConfirmed) {
                // OPCIÓN CORREO: Envío silencioso
                Swal.fire({
                    title: 'Enviando Correo...',
                    text: 'Espere un momento',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });
                
                await fetch(`/imprimir_factura/${idFactura}?formato=a4&enviar=true`);
                
                await Swal.fire({ title: '¡Enviado!', text: 'Factura enviada con éxito.', icon: 'success', timer: 1500, showConfirmButton: false });
                location.reload();

            } else {
                // OPCIÓN TICKET O A4: Abre pestaña y recarga
                let tipoFormato = seleccionAccion.isDenied ? 'ticket' : 'a4';
                window.open(`/imprimir_factura/${idFactura}?formato=${tipoFormato}&enviar=false`, '_blank');
                location.reload();
            }
        }

    } catch (error) {
        console.error(error);
        Swal.fire('Error Crítico', "Ocurrió un error al conectar con el servidor.", 'error');
    }
}

// ==========================================
// --- 3. LÓGICA DE CAJA Y CIERRES ---
// ==========================================

// 1. FUNCIÓN VISUAL: Actualiza la interfaz mientras el usuario escribe
function calcularDiferencia() {
    const sistemaEf = parseFloat(document.getElementById('monto_sistema_ef').value) || 0;
    const sistemaTr = parseFloat(document.getElementById('monto_sistema_tr').value) || 0;
    const sistemaTotal = parseFloat(document.getElementById('monto_sistema').value) || 0;

    const f_efectivo = parseFloat(document.getElementById('fisico_efectivo').value) || 0;
    const f_transferencia = parseFloat(document.getElementById('fisico_transferencia').value) || 0;
    
    const fisico_total = f_efectivo + f_transferencia;
    const diferenciaTotal = fisico_total - sistemaTotal;

    const labelDif = document.getElementById('label-diferencia');
    const seccionNota = document.getElementById('seccion-nota-obligatoria');

    const difEf = Math.abs(f_efectivo - sistemaEf);
    const difTr = Math.abs(f_transferencia - sistemaTr);

    if (difEf < 0.01 && difTr < 0.01) {
        if (labelDif) {
            labelDif.innerText = `$ ${diferenciaTotal.toFixed(2)}`;
            labelDif.className = "fw-bold mb-0 text-success fs-2 animate__animated animate__pulse";
        }
        if (seccionNota) seccionNota.classList.add('d-none');
    } 
    else if (Math.abs(diferenciaTotal) < 0.01) {
        if (labelDif) {
            labelDif.innerText = "MONTOS CRUZADOS";
            labelDif.className = "fw-bold mb-0 text-danger fs-4";
        }
        if (seccionNota) seccionNota.classList.remove('d-none');
    }
    else {
        if (labelDif) {
            labelDif.innerText = `$ ${diferenciaTotal.toFixed(2)}`;
            labelDif.className = "fw-bold mb-0 text-warning fs-2";
        }
        if (seccionNota) seccionNota.classList.remove('d-none');
    }
}

function validarMonto(input) {
    let valor = input.value;

    // Permitir solo números y punto
    valor = valor.replace(/[^0-9.]/g, '');

    // Evitar más de un punto decimal
    const partes = valor.split('.');
    if (partes.length > 2) {
        valor = partes[0] + '.' + partes[1];
    }

    // Limitar enteros a 3 dígitos
    if (partes[0].length > 3) {
        partes[0] = partes[0].slice(0, 3);
    }

    // Limitar decimales a 2 dígitos
    if (partes[1]) {
        partes[1] = partes[1].slice(0, 2);
    }

    // Reconstruir valor
    input.value = partes.join('.');
}

function validarNoNegativo(input) {
    let valor = input.value;

    // Permitir vacío o solo punto temporalmente
    if (valor === "" || valor === ".") {
        input.value = valor;
        return;
    }

    // Permitir solo números y punto
    valor = valor.replace(/[^0-9.]/g, '');

    // Evitar más de un punto
    let partes = valor.split('.');
    if (partes.length > 2) {
        valor = partes[0] + '.' + partes[1];
        partes = valor.split('.');
    }

    // Evitar negativos
    if (parseFloat(valor) < 0) {
        valor = "0";
    }

    // Limitar a 2 decimales
    if (partes[1]) {
        partes[1] = partes[1].slice(0, 2);
    }

    // Reconstruir valor
    input.value = partes.join('.');
}

// 2. FUNCIÓN DE ACCIÓN: Valida y envía los datos al servidor
async function procesarCierreCaja() {
    const s_ef = parseFloat(document.getElementById('monto_sistema_ef').value) || 0;
    const s_tr = parseFloat(document.getElementById('monto_sistema_tr').value) || 0;
    const f_ef = parseFloat(document.getElementById('fisico_efectivo').value) || 0;
    const f_tr = parseFloat(document.getElementById('fisico_transferencia').value) || 0;
    const elObs = document.getElementById('observacion_caja');

    const hayErrorEf = Math.abs(f_ef - s_ef) > 0.01;
    const hayErrorTr = Math.abs(f_tr - s_tr) > 0.01;

    if ((hayErrorEf || hayErrorTr) && Math.abs((f_ef + f_tr) - (s_ef + s_tr)) < 0.01) {
        return Swal.fire({
            title: 'Corrija los valores',
            text: 'El total coincide, pero el Efectivo y la Transferencia no son correctos individualmente. Por favor, verifique sus registros.',
            icon: 'error'
        });
    }

    if ((hayErrorEf || hayErrorTr) && elObs.value.trim().length < 5) {
        return Swal.fire({
            title: 'Nota Obligatoria',
            text: 'Existe un descuadre en caja. Debe explicar el motivo en el campo de observaciones.',
            icon: 'warning'
        });
    }

    const confirm = await Swal.fire({
        title: '¿Confirmar Cierre?',
        text: "Se dará por finalizada la jornada con los valores ingresados.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, cerrar caja',
        confirmButtonColor: '#28a745'
    });

    if (!confirm.isConfirmed) return;

    try {
        const res = await fetch('/api/cerrar_caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                efectivo_fisico: f_ef,
                transferencia_fisico: f_tr,
                observacion: elObs.value.toUpperCase() || "CIERRE SIN OBSERVACIONES"
            })
        });

        const data = await res.json();
        if (data.success) {
            Swal.fire('¡Éxito!', 'Caja cerrada correctamente.', 'success').then(() => location.reload());
        } else {
            Swal.fire('Error', data.error, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
    }
}

async function ejecutarApertura() {
    const montoInput = document.getElementById('monto_apertura');
    const monto = montoInput.value;

    if (!monto || monto < 0) {
        return Swal.fire('Monto inválido', 'Por favor ingrese un valor mayor o igual a 0', 'warning');
    }

    try {
        const res = await fetch('/api/abrir_caja', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ monto_inicial: monto })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            Swal.fire({
                title: '¡Caja Abierta!',
                text: `Se inició con $${parseFloat(monto).toFixed(2)}`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                location.reload();
            });
        } else {
            Swal.fire('Atención', data.error || 'No se pudo abrir la caja', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
    }
}

// ==========================================
// --- 4. GESTIÓN DE PRODUCTOS ---
// ==========================================

function filtrarProductos(valor) {
    const productos = document.querySelectorAll('#lista-productos-modal button');
    const busqueda = valor.toLowerCase();
    productos.forEach(item => {
        const texto = item.textContent.toLowerCase();
        if (texto.includes(busqueda)) {
            item.classList.remove('d-none');
            item.classList.add('d-flex');
        } else {
            item.classList.remove('d-flex');
            item.classList.add('d-none');
        }
    });
}

function filtrarInventario() {
    const busqueda = document.getElementById('busquedaInventario').value.toLowerCase().trim();
    const filas = document.querySelectorAll('.fila-producto');
    let contador = 0;
    
    filas.forEach(fila => {
        const contenido = fila.innerText.toLowerCase();
        if (contenido.includes(busqueda)) {
            fila.style.display = '';
            contador++;
        } else {
            fila.style.display = 'none';
        }
    });
    
    const labelTotal = document.getElementById('totalMostrados');
    if (labelTotal) labelTotal.innerText = contador;
}

async function abrirModalProductos() {
    try {
        // 1. Verificación de Seguridad
        const checkCaja = await fetch('/api/verificar_estado_caja');
        const estadoCaja = await checkCaja.json();

        // Validar si la caja está abierta
        if (!estadoCaja.abierta) {
            return Swal.fire({
                title: 'Caja Cerrada',
                text: 'Debe abrir la caja antes de buscar productos o realizar ventas.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-cash-register me-2"></i>Ir a Apertura',
                cancelButtonText: 'Cerrar',
                confirmButtonColor: '#28a745'
            }).then((result) => {
                if (result.isConfirmed) window.location.href = '/control_caja';
            });
        }

        // VALIDACIÓN: ¿Es el usuario que aperturó?
        if (!estadoCaja.es_responsable) {
            return Swal.fire({
                title: 'Acceso Denegado',
                text: `Solo el responsable de la apertura (${estadoCaja.responsable_nombre}) puede agregar productos.`,
                icon: 'error',
                confirmButtonColor: '#dc3545'
            });
        }

    } catch (error) {
        console.error("Error al verificar caja:", error);
        return Swal.fire('Error', 'No se pudo validar el estado de la caja.', 'error');
    }

    // 2. Lógica original para mostrar el modal si pasó las validaciones
    const modalEl = document.getElementById('modalBusquedaProd');
    if (!modalEl) return;

    const campoBusqueda = document.getElementById('input-filtrar-prod');
    if (campoBusqueda) {
        campoBusqueda.value = '';
        filtrarProductos(''); // Limpia el filtro previo
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    // Autofocus al buscador al abrir
    modalEl.addEventListener('shown.bs.modal', () => {
        if (campoBusqueda) campoBusqueda.focus();
    }, { once: true });
}

function abrirModalNuevoProducto() {
    const form = document.getElementById("formProducto");
    if (form) form.reset();
    
    document.getElementById("edit_mode_prod").value = "false";
    document.getElementById("prod_id_hidden").value = "";
    document.getElementById("tituloModal").innerHTML = `<i class="fas fa-plus-circle me-2"></i> Nuevo Producto`;
    
    const inputCod = document.getElementById("prod_codigo");
    if (inputCod) {
        inputCod.readOnly = false;
        inputCod.classList.remove('bg-secondary', 'bg-opacity-10');
    }

    if (document.getElementById("prod_categoria")) document.getElementById("prod_categoria").selectedIndex = 0;
    if (document.getElementById("btnTextoProd")) document.getElementById("btnTextoProd").innerText = "Guardar Producto";

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalProducto"));
    modal.show();
}

function prepararEdicionPr(id, cod, nom, det, pre, sto, cat_id, umbral) {
    document.getElementById("edit_mode_prod").value = "true";
    document.getElementById("prod_id_hidden").value = id;
    document.getElementById("tituloModal").innerHTML = `<i class="fas fa-edit me-2"></i> Editando: ${nom}`;
    
    const inputCod = document.getElementById("prod_codigo");
    if (inputCod) {
        inputCod.value = cod;
        inputCod.readOnly = true;
        inputCod.classList.add('bg-secondary', 'bg-opacity-10');
    }

    document.getElementById("prod_nombre").value = nom;
    document.getElementById("prod_detalle").value = det;
    document.getElementById("prod_precio").value = parseFloat(pre).toFixed(2);
    document.getElementById("prod_stock").value = sto;
    
    if (document.getElementById("prod_categoria")) document.getElementById("prod_categoria").value = cat_id;
    if (document.getElementById("prod_umbral")) document.getElementById("prod_umbral").value = umbral || 5;
    
    if (document.getElementById("btnTextoProd")) document.getElementById("btnTextoProd").innerText = "Actualizar Cambios";

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalProducto"));
    modal.show();
}

async function guardarProducto() {
    const esEdicion = document.getElementById("edit_mode_prod").value === "true";
    const idProd = document.getElementById("prod_id_hidden").value;
    
    const datos = {
        codigo: document.getElementById("prod_codigo").value.trim(),
        nombre: document.getElementById("prod_nombre").value.trim(),
        detalle: document.getElementById("prod_detalle").value.trim(),
        precio: document.getElementById("prod_precio").value,
        stock: document.getElementById("prod_stock").value,
        categoria_id: document.getElementById("prod_categoria").value,
        umbral_minimo: document.getElementById("prod_umbral").value
    };

    if (!datos.codigo || !datos.nombre || !datos.categoria_id) {
        return Swal.fire('Atención', 'Código, Nombre y Categoría son obligatorios', 'warning');
    }

    const url = esEdicion ? `/api/editar_producto/${idProd}` : '/api/agregar_producto';
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        
        const resData = await res.json();

        // CAMBIO: Si el servidor indica que el producto estaba inactivo (Borrado Lógico)
        if (resData.is_inactive && !esEdicion) {
            const reactivar = await Swal.fire({
                title: 'Producto Inactivo',
                text: `El código "${datos.codigo}" pertenece a un producto desactivado (${resData.nombre_antiguo}). ¿Desea reactivarlo con los nuevos datos?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Sí, reactivar'
            });

            if (reactivar.isConfirmed) {
                // Enviamos una bandera extra para forzar la reactivación
                datos.force_reactivate = true;
                const resRetry = await fetch('/api/agregar_producto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const dataRetry = await resRetry.json();
                if (dataRetry.success) {
                    Swal.fire('¡Éxito!', 'Producto reactivado correctamente', 'success').then(() => location.reload());
                    return;
                }
            } else { return; }
        }

        if (res.ok && resData.success) {
            Swal.fire({
                title: '¡Éxito!',
                text: resData.mensaje || (esEdicion ? 'Producto actualizado' : 'Producto guardado'),
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => location.reload());
        } else {
            Swal.fire('Error', resData.error || 'No se pudo guardar', 'error');
        }
    } catch (e) { 
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error'); 
    }
}

async function eliminarProducto(codigo, nombre) {
    const conf = await Swal.fire({ 
        title: `¿Quitar ${nombre}?`, 
        text: "El producto no aparecerá en ventas, pero se mantendrá en el historial.",
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, quitar',
        cancelButtonText: 'Cancelar'
    });

    if (conf.isConfirmed) {
        try {
            const res = await fetch(`/api/eliminar_producto/${codigo}`, { method: 'DELETE' });
            const result = await res.json();
            if (res.ok && result.success) {
                Swal.fire({
                    title: 'Eliminado',
                    text: 'Producto desactivado correctamente',
                    icon: 'success',
                    timer: 1000,
                    showConfirmButton: false
                }).then(() => location.reload());
            } else {
                Swal.fire('Error', result.error, 'error');
            }
        } catch (e) { 
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); 
        }
    }
}

// ==========================================
// --- 5. GESTIÓN DE PERSONAL Y USUARIOS ---
// ==========================================

function abrirModalUsuario() {
    document.getElementById('modalTitulo').innerText = "Registrar Nuevo Personal";
    const btnTexto = document.getElementById('btnTexto');
    if (btnTexto) btnTexto.innerText = "Guardar Usuario";
    
    document.getElementById('edit_mode').value = "false";
    
    const inputCed = document.getElementById('reg_cedula');
    inputCed.value = "";
    inputCed.readOnly = false;
    inputCed.style.cursor = "text"; 
    
    inputCed.classList.remove('bg-secondary', 'bg-opacity-10');
    inputCed.classList.add('bg-light');
    
    document.getElementById('reg_nombre').value = "";
    document.getElementById('reg_user').value = "";
    document.getElementById('reg_pass').value = "";
    
    const selectRol = document.getElementById('reg_rol');
    if (selectRol) selectRol.selectedIndex = 0;

    const helpPass = document.getElementById('passHelp');
    if (helpPass) helpPass.classList.add('d-none');

    const modalEl = document.getElementById('modalUsuario');
    const miModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    miModal.show();
}

// Asegúrate de que el cuarto parámetro sea el ID del rol (numérico)
function prepararEdicionUs(cedula, nombre, usuario, rolId) {
    document.getElementById('modalTitulo').innerText = "Editar Personal";
    const btnTexto = document.getElementById('btnTexto');
    if (btnTexto) btnTexto.innerText = "Actualizar Cambios";
    
    document.getElementById('edit_mode').value = "true";
    
    const inputCed = document.getElementById('reg_cedula');
    inputCed.value = cedula;
    inputCed.readOnly = true; 
    inputCed.style.cursor = "not-allowed";
    inputCed.classList.add('bg-secondary', 'bg-opacity-10');

    document.getElementById('reg_nombre').value = nombre;
    document.getElementById('reg_user').value = usuario;
    
    // CAMBIO CLAVE: Ahora asignamos el ID al select
    document.getElementById('reg_rol').value = rolId;

    document.getElementById('reg_pass').value = ""; 
    const helpText = document.getElementById('passHelp');
    if (helpText) helpText.classList.remove('d-none');

    const modalEl = document.getElementById('modalUsuario');
    const miModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    miModal.show();
}

function filtrarPersonal() {
    const filtro = document.getElementById('busquedaPersonal')?.value.toLowerCase().trim();
    const filas = document.querySelectorAll('.fila-usuario');
    let contadorVisible = 0;
    
    filas.forEach(fila => {
        if (fila.innerText.toLowerCase().includes(filtro)) {
            fila.style.display = '';
            contadorVisible++;
        } else {
            fila.style.display = 'none';
        }
    });
    
    const labelTotal = document.getElementById('totalPersonal');
    if (labelTotal) labelTotal.innerText = contadorVisible;
}

// ADICIÓN: Función para el guardado de usuario con soporte de reactivación
async function guardarUsuario() {
    const esEdicion = document.getElementById("edit_mode").value === "true";
    const cedula = document.getElementById("reg_cedula").value.trim();
    
    const datos = {
        cedula: cedula,
        nombre: document.getElementById("reg_nombre").value.trim(),
        username: document.getElementById("reg_user").value.trim(),
        password: document.getElementById("reg_pass").value,
        rol_id: document.getElementById("reg_rol").value // Envía el ID numérico
    };

    // Validaciones básicas
    if (!datos.cedula || !datos.nombre || !datos.username || !datos.rol_id) {
        return Swal.fire('Atención', 'Todos los campos son obligatorios, incluyendo el Rol.', 'warning');
    }

    if (!esEdicion && !datos.password) {
        return Swal.fire('Atención', 'Debe asignar una contraseña al nuevo usuario.', 'warning');
    }

    const url = esEdicion ? `/api/editar_usuario/${cedula}` : '/api/agregar_usuario';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resData = await res.json();

        // MANEJO DE USUARIO INACTIVO (BORRADO LÓGICO)
        if (resData.is_inactive && !esEdicion) {
            const reactivar = await Swal.fire({
                title: 'Usuario Desactivado',
                text: `La cédula "${cedula}" pertenece a ${resData.nombre_antiguo}, quien está inactivo. ¿Desea reactivarlo con los nuevos datos?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, reactivar usuario'
            });

            if (reactivar.isConfirmed) {
                datos.force_reactivate = true;
                const resRetry = await fetch('/api/agregar_usuario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const dataRetry = await resRetry.json();
                if (dataRetry.success) {
                    Swal.fire('¡Éxito!', 'Usuario reactivado correctamente', 'success').then(() => location.reload());
                } else {
                    Swal.fire('Error', dataRetry.error, 'error');
                }
            }
            return; // Detener flujo aquí si se manejó reactivación
        }

        // MANEJO DE RESPUESTA ESTÁNDAR
        if (res.ok && resData.success) {
            Swal.fire({
                title: '¡Éxito!',
                text: esEdicion ? 'Datos actualizados correctamente' : 'Usuario registrado con éxito',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => location.reload());
        } else {
            Swal.fire('Error', resData.error || 'No se pudo procesar la solicitud', 'error');
        }

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No hay conexión con el servidor', 'error');
    }
}

// ==========================================
// --- 5. GESTIÓN DE PERSONAL Y USUARIOS (Cont.) ---
// ==========================================

/**
 * Guarda o Actualiza los datos del personal
 */
async function guardarUsuario() {
    const esEdicion = document.getElementById('edit_mode').value === "true";
    const cedula = document.getElementById('reg_cedula').value.trim();
    
    const datos = {
        cedula: cedula,
        nombre: document.getElementById('reg_nombre').value.trim(),
        username: document.getElementById('reg_user').value.trim(),
        password: document.getElementById('reg_pass').value,
        rol_id: document.getElementById('reg_rol').value // Ajustado a rol_id para coincidir con backend
    };

    if (!datos.cedula || !datos.nombre || !datos.username) {
        return Swal.fire('Campos requeridos', 'Por favor complete los datos obligatorios', 'warning');
    }

    if (!validarDocumentoEcuador(datos.cedula)) {
        return Swal.fire({
            title: 'Cédula Inválida',
            text: 'El número de cédula o RUC ingresado no es válido para Ecuador.',
            icon: 'error'
        });
    }
    
    if (!esEdicion && !datos.password) {
        return Swal.fire('Contraseña requerida', 'Debe asignar una clave al nuevo usuario', 'warning');
    }

    try {
        const url = esEdicion ? `/api/editar_usuario/${cedula}` : '/api/agregar_usuario';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const result = await res.json();

        // Lógica de Reactivación para Borrado Lógico
        if (result.is_inactive && !esEdicion) {
            const reactivar = await Swal.fire({
                title: 'Usuario Inactivo',
                text: `La cédula "${cedula}" pertenece a un usuario desactivado. ¿Desea reactivarlo?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Sí, reactivar'
            });

            if (reactivar.isConfirmed) {
                datos.force_reactivate = true;
                const resRetry = await fetch('/api/agregar_usuario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const dataRetry = await resRetry.json();
                if (dataRetry.success) {
                    Swal.fire('¡Éxito!', 'Usuario reactivado correctamente', 'success').then(() => location.reload());
                    return;
                }
            } else { return; }
        }

        if (res.ok && result.success) {
            Swal.fire({
                title: '¡Éxito!',
                text: esEdicion ? 'Usuario actualizado correctamente' : 'Usuario guardado con éxito',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => location.reload());
        } else {
            Swal.fire('Error', result.error || 'No se pudo guardar', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    }
}

async function eliminarUsuario(cedula, nombre) {
    const conf = await Swal.fire({ 
        title: `¿Desactivar a ${nombre}?`, 
        text: "El usuario ya no podrá acceder al sistema, pero se mantendrá en registros históricos.",
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, desactivar'
    });

    if (conf.isConfirmed) {
        try {
            const res = await fetch(`/api/eliminar_usuario/${cedula}`, { method: 'DELETE' });
            const result = await res.json();
            
            if (res.ok && result.success) {
                Swal.fire('Desactivado', 'El usuario ha sido inhabilitado.', 'success').then(() => location.reload());
            } else {
                Swal.fire('Error', result.error || 'No se pudo eliminar', 'error');
            }
        } catch (e) { 
            Swal.fire('Error', 'Fallo de conexión', 'error'); 
        }
    }
}

// ==========================================
// --- 6. GESTIÓN DE CLIENTES ---
// ==========================================

function abrirModalNuevo() {
    const form = document.getElementById("formCliente");
    if (form) {
        form.reset();
        form.onsubmit = function(e) { 
            e.preventDefault(); 
            guardarClienteDirectorio(); 
        };
    }
    
    document.getElementById("edit_mode_cli").value = "false";
    document.getElementById("cli_cedula_hidden").value = "";
    
    const inputCedula = document.getElementById("cli_cedula");
    if (inputCedula) {
        inputCedula.readOnly = false;
        inputCedula.disabled = false;
    }
    
    document.getElementById("tituloModalCliente").innerText = "Nuevo Cliente";
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCliente')).show();
}

async function guardarClienteDirectorio() {
    const form = document.getElementById('formCliente');
    const esEdicion = document.getElementById("edit_mode_cli").value === "true";
    const cedula = document.getElementById("cli_cedula").value.trim();

    if (!esEdicion) {
        const esConsumidorFinal = (cedula === '9999999999' || cedula === '9999999999999');
        if (!esConsumidorFinal && !validarDocumentoEcuador(cedula)) {
            return Swal.fire({
                title: 'Identificación Inválida',
                text: 'La cédula o RUC ingresado no es correcto para Ecuador.',
                icon: 'error'
            });
        }
    }

    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => data[key] = value);

    if (!data.nombre) {
        return Swal.fire('Atención', 'El nombre es obligatorio', 'warning');
    }

    try {
        const response = await fetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            Swal.fire({
                title: '¡Logrado!',
                text: esEdicion ? 'Cliente actualizado' : 'Cliente registrado',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => location.reload());
        } else {
            Swal.fire('Error', result.error || 'No se pudo guardar', 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
    }
}

function prepararEdicionCliente(cedula, nombre, telf, correo, dir) {
    const form = document.getElementById("formCliente");
    if (form) {
        form.onsubmit = function(e) { 
            e.preventDefault(); 
            guardarClienteDirectorio(); 
        };
    }

    document.getElementById("edit_mode_cli").value = "true";
    document.getElementById("cli_cedula_hidden").value = cedula;
    document.getElementById("tituloModalCliente").innerText = "Editando: " + nombre;
    
    const inputCedula = document.getElementById("cli_cedula");
    if (inputCedula) {
        inputCedula.value = cedula;
        inputCedula.readOnly = true; 
    }
    
    document.getElementById("cli_nombre").value = nombre;
    document.getElementById("cli_telefono").value = (telf && telf !== 'None') ? telf : '';
    document.getElementById("cli_correo").value = (correo && correo !== 'None') ? correo : '';
    document.getElementById("cli_direccion").value = (dir && dir !== 'None') ? dir : '';
    
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCliente')).show();
}

async function eliminarCliente(cedula, nombre) {
    const conf = await Swal.fire({ 
        title: `¿Eliminar cliente ${nombre}?`, 
        text: "Esta acción lo quitará de la lista de clientes activos.",
        icon: 'warning', 
        showCancelButton: true 
    });
    if (conf.isConfirmed) {
        try {
            const res = await fetch(`/api/eliminar_cliente/${cedula}`, { method: 'DELETE' });
            if (res.ok) location.reload();
        } catch (e) { console.error(e); }
    }
}

// ==========================================
// --- 7. UTILIDADES E HISTORIAL ---
// ==========================================

function cerrarModal() {
    const modalEl = document.getElementById('modalBusquedaProd');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
}

function recalcularTotales() {
    let subtotalGeneral = 0;
    
    // 1. Calcular subtotal de los productos en memoria
    if (window.detalleFactura && window.detalleFactura.length > 0) {
        window.detalleFactura.forEach(item => {
            subtotalGeneral += parseFloat(item.subtotal) || 0;
        });
    }

    const inputDesc = document.getElementById('descuento-global');
    const contenedorMotivo = document.getElementById('contenedor-motivo');
    let descuento = (inputDesc) ? parseFloat(inputDesc.value) || 0 : 0;

    // 2. Validación: No permitir descuentos negativos
    if (descuento < 0) {
        descuento = 0;
        if (inputDesc) inputDesc.value = "0.00";
    }

    // 3. Manejo del campo "Motivo"
    if (contenedorMotivo) {
        if (descuento > 0) {
            contenedorMotivo.style.display = 'block';
        } else {
            contenedorMotivo.style.display = 'none';
            const motivoInput = document.getElementById('motivo-descuento');
            if (motivoInput) motivoInput.value = ""; // Limpiar si quitan el descuento
        }
    }

    // 4. Validación: El descuento no puede ser mayor al subtotal
    if (descuento > subtotalGeneral) {
        descuento = subtotalGeneral;
        if (inputDesc) inputDesc.value = subtotalGeneral.toFixed(2);
        
        // Opcional: Avisar al usuario
        // Swal.fire('Aviso', 'El descuento se ajustó al máximo permitido', 'info');
    }

    // 5. Cálculo Final
    let totalFinal = subtotalGeneral - descuento;
    if (totalFinal < 0) totalFinal = 0;

    // 6. Actualización de Interfaz
    const labelSub = document.getElementById('subtotal-bruto');
    const labelTotal = document.getElementById('total-final');

    if (labelSub) labelSub.innerText = `$ ${subtotalGeneral.toFixed(2)}`;
    if (labelTotal) labelTotal.innerText = `$ ${totalFinal.toFixed(2)}`;
}

// MOTOR DE VALIDACIÓN ECUADOR (Cédula/RUC)
function validarDocumentoEcuador(id) {
    if (!id || id.length < 10) return false;
    if (id.length === 13 && !id.endsWith('001')) return false;

    const cedula = id.substring(0, 10);
    const region = parseInt(cedula.substring(0, 2));
    if (region < 1 || region > 24) return false;

    const ultimoDigito = parseInt(cedula.substring(9, 10));
    let suma = 0;
    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];

    for (let i = 0; i < 9; i++) {
        let valor = parseInt(cedula[i]) * coeficientes[i];
        if (valor > 9) valor -= 9;
        suma += valor;
    }

    const digitoVerificador = (suma % 10 === 0) ? 0 : 10 - (suma % 10);
    return digitoVerificador === ultimoDigito;
}

/**
 * REIMPRESIÓN: Abre el diálogo para elegir formato PDF.
 */
async function reimprimirFactura(id, nombreCliente) {
    const result = await Swal.fire({
        title: 'Reimpresión de Nota',
        text: `Seleccione el formato para el cliente: ${nombreCliente}`,
        icon: 'info',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-file-invoice"></i> Formato A4',
        denyButtonText: '<i class="fas fa-receipt"></i> Formato Ticket',
        cancelButtonText: 'Cerrar',
        confirmButtonColor: '#28a745',
        denyButtonColor: '#17a2b8',
        cancelButtonColor: '#6c757d',
    });

    if (result.isDismissed && result.dismiss === Swal.DismissReason.cancel) return;
    
    let tipoFormato = result.isConfirmed ? 'a4' : (result.isDenied ? 'ticket' : null);
    if (!tipoFormato) return;

    window.open(`/imprimir_factura/${id}?formato=${tipoFormato}`, '_blank');
}

function filtrarHistorial() {
    const busqueda = document.getElementById("inputBusqueda").value.toLowerCase();
    const filas = document.querySelectorAll("#tablaFacturas tbody tr.fila-dato");
    let contador = 0;

    filas.forEach(fila => {
        if (fila.innerText.toLowerCase().includes(busqueda)) {
            fila.style.display = "";
            contador++;
        } else {
            fila.style.display = "none";
        }
    });
    
    const badgeContador = document.getElementById("contador");
    if (badgeContador) badgeContador.innerText = contador;
}

function filtrarPorFechaServer() {
    const fecha = document.getElementById("inputFecha").value;
    if (fecha) window.location.href = `/historial?fecha=${fecha}`;
}

function resetFiltros() {
    window.location.href = "/historial";
}

// INICIALIZADORES Y EVENTOS
window.addEventListener('load', () => {
    if (document.getElementById('tabla-factura')) {
        if (typeof actualizarTabla === 'function') actualizarTabla();
    }
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('nuevo') === 'true' && params.get('cedula')) {
        setTimeout(() => {
            abrirModalNuevo();
            const inputCedula = document.getElementById('cli_cedula');
            if (inputCedula) {
                inputCedula.value = params.get('cedula');
                document.getElementById('cli_nombre')?.focus();
            }
        }, 600);
    }
});

// Autocompletado rápido de Consumidor Final
const inputFacCedula = document.getElementById('factura_cedula');
if (inputFacCedula) {
    inputFacCedula.addEventListener('input', function(e) {
        const cedula = e.target.value.trim();
        const inputNombre = document.getElementById('factura_nombre');
        const inputDireccion = document.getElementById('factura_direccion');

        if (cedula === '9999999999' || cedula === '9999999999999') {
            if (inputNombre) inputNombre.value = 'CONSUMIDOR FINAL';
            if (inputDireccion) inputDireccion.value = 'S/N';
        }
    });
}