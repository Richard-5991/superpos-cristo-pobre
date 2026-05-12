import io
import os
import platform
import pandas as pd
from datetime import datetime
from functools import wraps
from flask import Blueprint, render_template, request, jsonify, redirect, url_for, session, flash, make_response
from sqlalchemy import func
from decimal import Decimal, ROUND_HALF_UP
from flask import send_file
import threading
import sib_api_v3_sdk
import base64
from sib_api_v3_sdk.rest import ApiException

# Importamos los modelos
from models import db, Producto, Cliente, Factura, DetalleFactura, Caja, Usuario, Rol, Categoria

main = Blueprint('main', __name__)

# ==========================================
# --- 1. SEGURIDAD Y DECORADORES ---
# ==========================================

@main.before_app_request
def verificar_sesion():
    rutas_libres = ['main.login', 'static']
    if request.endpoint and request.endpoint not in rutas_libres:
        if 'user_cedula' not in session:
            return redirect(url_for('main.login'))

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get('rol') != 'administrador':
            flash("🚫 Acceso denegado. Solo administradores.", "danger")
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

@main.app_context_processor
def inject_caja_status():
    caja = Caja.query.filter_by(estado='abierta').first()
    return dict(caja_activa_global=caja)

# ==========================================
# --- 2. SESIÓN (LOGIN / LOGOUT) ---
# ==========================================

@main.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_cedula' in session:
        return redirect(url_for('main.index'))

    if request.method == 'POST':
        user_input = request.form.get('username')
        pass_input = request.form.get('password')
        
        # Buscamos al usuario solo por username y que esté activo
        usuario = Usuario.query.filter_by(username=user_input, activo=True).first()
        
        # Verificamos si existe el usuario Y si la clave coincide con el hash almacenado
        if usuario and usuario.check_password(pass_input):
            session.clear()
            session['user_cedula'] = usuario.cedula
            session['username'] = usuario.username
            session['nombre_completo'] = usuario.nombre_completo
            session['rol'] = usuario.rol.nombre 
            
            flash(f"¡Bienvenido de nuevo, {usuario.nombre_completo}!", "success")
            return redirect(url_for('main.index'))
        
        # Mensaje genérico por seguridad (no decir si falló el usuario o la clave)
        flash("Usuario inactivo o credenciales incorrectas.", "danger")
        return redirect(url_for('main.login'))
            
    return render_template('login.html')

@main.route('/logout')
def logout():
    session.clear()
    flash("Sesión cerrada correctamente", "info")
    return redirect(url_for('main.login'))

# ==========================================
# --- 3. RUTAS DE VISTAS PRINCIPALES ---
# ==========================================

@main.route('/')
def index():
    productos = Producto.query.filter_by(activo=True).order_by(Producto.nombre.asc()).all()
    return render_template('index.html', productos=productos)

@main.route('/inventarios')
@admin_required
def inventarios():
    productos = Producto.query.filter_by(activo=True).order_by(Producto.nombre.asc()).all()
    categorias = Categoria.query.order_by(Categoria.nombre.asc()).all()
    return render_template('inventarios.html', productos=productos, categorias=categorias)

@main.route('/clientes')
def clientes():
    # MEJORA: Solo mostrar clientes activos en la gestión ordinaria
    todos_clientes = Cliente.query.filter_by(activo=True).all()
    return render_template('clientes.html', clientes=todos_clientes)

@main.route('/usuarios')
@admin_required
def lista_usuarios():
    # MEJORA: Solo mostrar usuarios activos
    todos_los_usuarios = Usuario.query.filter_by(activo=True).all()
    roles = Rol.query.all()
    return render_template('usuarios.html', usuarios=todos_los_usuarios, roles=roles)

@main.route('/historial')
def historial():
    if 'user_cedula' not in session:
        return redirect(url_for('main.login'))

    hoy = datetime.now().date()
    fecha_seleccionada = request.args.get('fecha')
    
    query = Factura.query
    
    # Filtro de seguridad: si no es admin, solo ve sus propias ventas (fv_usuario_id)
    if session.get('rol') != 'administrador':
        query = query.filter(Factura.fv_usuario_id == session.get('user_cedula'))

    # Filtro por fecha
    if fecha_seleccionada:
        query = query.filter(func.date(Factura.fecha) == fecha_seleccionada)
        fecha_input = fecha_seleccionada
    else:
        query = query.filter(func.date(Factura.fecha) == hoy)
        fecha_input = hoy.strftime('%Y-%m-%d')

    facturas = query.order_by(Factura.id.desc()).all()

    # Mapeo de cédulas a nombres de usuario
    usuarios = Usuario.query.all()
    nombres_usuarios = {u.cedula: u.username for u in usuarios}

    return render_template('historial.html', 
                           facturas=facturas, 
                           hoy=fecha_input, 
                           nombres_usuarios=nombres_usuarios)

# ==========================================
# --- 4. API GESTIÓN DE PRODUCTOS ---
# ==========================================

@main.route('/api/agregar_producto', methods=['POST'])
@admin_required
def agregar_producto():
    data = request.get_json()
    codigo = data.get('codigo')
    existente = Producto.query.filter_by(codigo=codigo).first()
    
    if existente:
        if existente.activo:
            return jsonify({"success": False, "error": "El código ya existe"}), 400
        
        try:
            existente.nombre = data.get('nombre').upper()
            existente.detalle = data.get('detalle')
            existente.precio = float(data.get('precio', 0))
            existente.stock = int(data.get('stock', 0))
            existente.umbral_minimo = int(data.get('umbral_minimo', 5))
            existente.categoria_id = data.get('categoria_id')
            existente.activo = True 
            db.session.commit()
            return jsonify({"success": True, "mensaje": "Producto reactivado correctamente"})
        except Exception as e:
            db.session.rollback()
            return jsonify({"success": False, "error": str(e)}), 500

    try:
        nuevo = Producto(
            codigo=codigo,
            nombre=data.get('nombre').upper(),
            detalle=data.get('detalle'),
            precio=float(data.get('precio', 0)),
            stock=int(data.get('stock', 0)),
            umbral_minimo=int(data.get('umbral_minimo', 5)),
            categoria_id=data.get('categoria_id'),
            activo=True
        )
        db.session.add(nuevo)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    
@main.route('/api/eliminar_producto/<string:codigo>', methods=['DELETE'])
@admin_required
def eliminar_producto(codigo):
    producto = Producto.query.filter_by(codigo=codigo, activo=True).first()
    if not producto:
        return jsonify({"success": False, "error": "Producto no encontrado"}), 404
    
    try:
        producto.activo = False 
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@main.route('/api/verificar_producto/<string:codigo>')
def verificar_producto(codigo):
    producto = Producto.query.filter_by(codigo=codigo, activo=True).first()
    if producto:
        return jsonify({
            "success": True,
            "existe": True,
            "id": producto.id,
            "nombre": producto.nombre,
            "precio": float(producto.precio),
            "stock": producto.stock
        })
    return jsonify({"success": False, "existe": False, "error": "Producto no disponible"}), 200

@main.route('/api/editar_producto/<int:id>', methods=['POST'])
@admin_required
def editar_producto(id):
    producto = Producto.query.filter_by(id=id, activo=True).first() 
    if not producto:
        return jsonify({"success": False, "error": "No existe o está inactivo"}), 404
    
    try:
        data = request.get_json()
        producto.codigo = data.get('codigo')
        producto.nombre = data.get('nombre').upper()
        producto.precio = float(data.get('precio', 0))
        producto.stock = int(data.get('stock', 0))
        producto.umbral_minimo = int(data.get('umbral_minimo', 5))
        producto.categoria_id = data.get('categoria_id')
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# ==========================================
# --- 5. API GESTIÓN DE CLIENTES ---
# ==========================================

@main.route('/api/buscar_cliente/<cedula>')
def buscar_cliente(cedula):
    try:
        # MEJORA: Solo buscar entre clientes activos para nuevas facturas
        cliente = Cliente.query.filter_by(cedula=cedula, activo=True).first()
        if cliente:
            return jsonify({
                "success": True,
                "nombre": cliente.nombre,
                "telefono": cliente.telefono,
                "direccion": cliente.direccion
            })
        return jsonify({"success": False, "mensaje": "Cliente no registrado o inactivo"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    
@main.route('/api/eliminar_cliente/<string:cedula>', methods=['DELETE'])
def eliminar_cliente(cedula):
    cliente = Cliente.query.filter_by(cedula=cedula, activo=True).first()
    if not cliente:
        return jsonify({"success": False, "error": "Cliente no encontrado"}), 404
    try:
        # CAMBIO: Borrado Lógico en lugar de db.session.delete
        cliente.activo = False
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@main.route('/api/clientes', methods=['POST'])
def gestionar_cliente():
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form
    
    cedula = data.get('cedula', '').strip()
    if not cedula:
        return jsonify({"success": False, "error": "Cédula requerida"}), 400

    cliente = Cliente.query.filter_by(cedula=cedula).first()
    try:
        if cliente:
            cliente.nombre = data.get('nombre').upper()
            cliente.telefono = data.get('telefono')
            cliente.direccion = data.get('direccion', 'S/N').upper()
            cliente.correo = data.get('correo')
            cliente.activo = True # Si estaba inactivo y se vuelve a guardar, se reactiva
        else:
            nuevo = Cliente(
                cedula=cedula, 
                nombre=data.get('nombre').upper(),
                telefono=data.get('telefono'), 
                direccion=data.get('direccion', 'S/N').upper(),
                correo=data.get('correo'),
                activo=True
            )
            db.session.add(nuevo)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

# ==========================================
# --- 6. FACTURACIÓN Y VENTAS ---
# ==========================================

@main.route('/api/guardar_factura', methods=['POST'])
def guardar_factura():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos.'}), 400

        user_cedula = str(session.get('user_cedula'))
        
        # 1. Validar Caja Abierta
        caja_activa = Caja.query.filter_by(estado='abierta').first()
        if not caja_activa:
            return jsonify({'error': 'DEBE ABRIR CAJA PRIMERO.'}), 400

        if str(caja_activa.usuario_apertura_id) != user_cedula:
            responsable = caja_activa.usuario_apertura.nombre_completo if caja_activa.usuario_apertura else "OTRO USUARIO"
            return jsonify({'error': f'ACCESO DENEGADO: Caja de {responsable}.'}), 403

        # 2. MANEJO DE CLIENTE
        cliente_data = data.get('cliente', {})
        cedula_cliente = str(cliente_data.get('cedula', '')).strip()
        
        # Buscamos al cliente por cédula
        cliente = Cliente.query.filter_by(cedula=cedula_cliente).first()

        # LOGICA SOLO PARA CONSUMIDOR FINAL:
        # Si no existe y la cédula es la de CF, lo creamos con los campos de tu tabla
        if not cliente and cedula_cliente in ['9999999999', '9999999999999', '']:
            nuevo_cf = Cliente(
                cedula=cedula_cliente if cedula_cliente else '9999999999',
                nombre='CONSUMIDOR FINAL',
                telefono='0000000000',
                direccion='S/N',
                correo='consumidor@final.com',
                activo=True
            )
            db.session.add(nuevo_cf)
            db.session.flush()
            cliente = nuevo_cf

        # Si después de lo anterior sigue sin existir cliente (porque no era CF y no se encontró)
        if not cliente:
            return jsonify({'error': f'Cliente con cédula {cedula_cliente} no encontrado.'}), 404

        # 3. GENERAR NÚMERO FACTURA
        ultima_f = Factura.query.order_by(Factura.id.desc()).first()
        nuevo_secuencial = str(ultima_f.id + 1).zfill(9) if ultima_f else "000000001"
        nuevo_numero = f"001-001-{nuevo_secuencial}"

        # 4. CREAR FACTURA
        nueva_f = Factura(
            numero_factura=nuevo_numero,
            fecha=datetime.now(),
            cliente_id=cliente.id, # Ahora siempre tendrá un ID
            fv_usuario_id=user_cedula,
            caja_id=caja_activa.id,
            subtotal=float(data.get('subtotal', 0)),
            descuento=float(data.get('descuento', 0)),
            total=float(data.get('total', 0)),
            metodo_pago=data.get('metodo_pago', 'efectivo'),
            motivo_descuento=data.get('motivo_descuento', ''),
            anulada=False
        )
        
        db.session.add(nueva_f)
        db.session.flush()

        # 5. DETALLES Y STOCK
        for item in data.get('productos', []):
            prod = Producto.query.get(item['id'])
            if prod:
                cantidad = int(item['cantidad'])
                # Validamos stock
                if prod.stock < cantidad:
                    db.session.rollback()
                    return jsonify({'error': f'Stock insuficiente para {prod.nombre}.'}), 400

                detalle = DetalleFactura(
                    factura_id=nueva_f.id,
                    producto_id=prod.id,
                    producto_nombre=prod.nombre, 
                    cantidad=cantidad,
                    precio_unitario=float(item['precio']),
                    subtotal=cantidad * float(item['precio'])
                )
                prod.stock -= cantidad
                db.session.add(detalle)

        db.session.commit()
        return jsonify({'success': True, 'factura_id': nueva_f.id})

    except Exception as e:
        db.session.rollback()
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# --- RUTA DE IMPRESIÓN Y ENVÍO ---
@main.route('/imprimir_factura/<int:id>')
def imprimir_factura(id):
    # Capturamos los parámetros de la URL
    formato = request.args.get('formato', 'a4') 
    debe_enviar = request.args.get('enviar', 'false').lower() == 'true'
    
    try:
        from weasyprint import HTML
        import platform
        
        factura = Factura.query.get_or_404(id)
        
        # Lógica de cliente
        cliente_db = Cliente.query.get(factura.cliente_id)
        cliente_datos = cliente_db or {'nombre': 'CONSUMIDOR FINAL', 'cedula': '9999999999', 'direccion': 'S/N'}

        # Elegir el template según el formato
        template = 'formato_factura.html' if formato == 'a4' else 'formato_ticket.html'
        html_content = render_template(template, factura=factura, detalles=factura.detalles, cliente=cliente_datos)

        # Configuración GTK para Windows (solo local)
        if platform.system() == "Windows":
            gtk_bin = r'C:\Program Files\GTK3-Runtime Win64\bin'
            if os.path.exists(gtk_bin):
                if hasattr(os, 'add_dll_directory'):
                    try:
                        os.add_dll_directory(gtk_bin)
                    except:
                        pass
                os.environ['PATH'] = gtk_bin + os.pathsep + os.environ['PATH']

        # GENERACIÓN DEL PDF
        documento = HTML(string=html_content)
        pdf = documento.write_pdf(presentational_hints=True)

        # LÓGICA DE ENVÍO DE CORREO ASÍNCRONA
        if debe_enviar:
            print(f">>> Lanzando hilo de envío para factura {factura.numero_factura}...")
            # Usamos threading para que el usuario no tenga que esperar a Gmail
            email_thread = threading.Thread(
                target=enviar_correo_factura, 
                args=(factura, pdf)
            )
            email_thread.start()
        else:
            print(">>> Reimpresión detectada: No se envía correo.")

        # DEVOLVER AL NAVEGADOR (Inmediato)
        response = make_response(pdf)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=factura_{factura.numero_factura}.pdf'
        return response

    except Exception as e:
        import traceback
        print("--- ERROR EN GENERACIÓN/ENVÍO ---")
        print(traceback.format_exc())
        return f"Error: {str(e)}", 500

# ==========================================
# --- ENVIO POR CORREO ---
# ==========================================

def enviar_correo_factura(factura, pdf_binario):
    """
    Envía la factura usando la API de Brevo para saltar los bloqueos de Render.
    """
    with app.app_context():
        try:
            # 1. Obtener datos del cliente
            cliente = Cliente.query.get(factura.cliente_id)
            if not cliente or not cliente.correo:
                print(f">>> ERROR: Factura {factura.numero_factura} sin correo de destino.")
                return False

            # 2. Configuración de la API de Brevo
            configuration = sib_api_v3_sdk.Configuration()
            # REEMPLAZA ESTO CON TU CLAVE API V3 REAL
            configuration.api_key['api-key'] = os.environ.get('BREVO_API_KEY')
            api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))

            # 3. Preparar el PDF (Convertir binario a texto Base64)
            pdf_base64 = base64.b64encode(pdf_binario).decode('utf-8')

            # 4. Crear el objeto del correo
            # IMPORTANTE: 'sender' debe ser el correo que verificaste en el panel de Brevo
            remitente_email = "ricardoespinoza03@outlook.com"
            
            email_objeto = sib_api_v3_sdk.SendSmtpEmail(
                to=[{"email": cliente.correo, "name": cliente.nombre}],
                sender={"email": remitente_email, "name": "Supermercado Cristo Pobre"},
                subject=f"Factura #{factura.numero_factura} - Supermercado Cristo Pobre",
                html_content=f"""
                    <h3>Hola {cliente.nombre},</h3>
                    <p>Gracias por su compra. Adjunto a este correo encontrará su comprobante de pago.</p>
                    <p>Atentamente,<br><strong>Supermercado Cristo Pobre</strong></p>
                """,
                attachment=[{
                    "content": pdf_base64,
                    "name": f"factura_{factura.numero_factura}.pdf"
                }]
            )

            # 5. Enviar a través de la API (Puerto 443, no bloqueado por Render)
            print(f">>> Intentando enviar factura {factura.numero_factura} vía API Brevo...")
            api_instance.send_transac_email(email_objeto)
            
            print(f">>> ¡ÉXITO TOTAL! Factura enviada a {cliente.correo}")
            return True

        except ApiException as e:
            print(f"--- ERROR DE API BREVO ---")
            print(f"Status: {e.status}, Razón: {e.reason}, Cuerpo: {e.body}")
            return False
        except Exception as e:
            import traceback
            print("--- ERROR INESPERADO ---")
            print(traceback.format_exc())
            return False
        
# ==========================================
# --- 7. CONTROL DE CAJA ---
# ==========================================

@main.route('/api/verificar_estado_caja')
def verificar_estado_caja():
    # Buscamos la caja abierta
    caja = Caja.query.filter_by(estado='abierta').first()
    
    if not caja:
        return jsonify({'abierta': False})

    # Obtenemos la cédula del usuario logueado en la sesión
    user_cedula = str(session.get('user_cedula'))
    
    # Obtenemos la cédula de quien hizo la apertura en la base de datos
    responsable_id = str(caja.usuario_apertura_id)
    
    # Obtenemos el nombre del responsable para mostrarlo en la alerta de JS
    # Asumiendo que tienes la relación 'usuario_apertura' en tu modelo Caja
    nombre_responsable = caja.usuario_apertura.nombre_completo if caja.usuario_apertura else "Usuario Asignado"

    return jsonify({
        'abierta': True,
        'es_responsable': user_cedula == responsable_id,
        'responsable_nombre': nombre_responsable
    })

@main.route('/control_caja')
def vista_caja():
    # 1. Verificación de sesión
    if 'user_cedula' not in session:
        flash("Por favor, inicie sesión.", "warning")
        return redirect(url_for('main.login'))

    user_cedula = str(session.get('user_cedula'))
    user_rol = session.get('rol')
    caja_abierta = Caja.query.filter_by(estado='abierta').first()
    
    # 2. BLOQUEO DE ACCESO
    if caja_abierta:
        # Aseguramos que la comparación sea entre strings
        es_dueno = str(caja_abierta.usuario_apertura_id) == user_cedula
        es_admin = user_rol == 'administrador'
        
        if not es_dueno and not es_admin:
            flash("Acceso denegado: Solo el responsable de la caja o el administrador pueden entrar.", "danger")
            return redirect(url_for('main.index'))
    
    # 3. INICIALIZACIÓN DE VARIABLES (Siempre en float para evitar el error Decimal)
    ventas_efectivo = 0.0
    ventas_transferencia = 0.0
    total_descuentos = 0.0
    total_anulado = 0.0 
    monto_ini = 0.0
    
    # 4. CÁLCULOS SI LA CAJA ESTÁ ABIERTA
    if caja_abierta:
        monto_ini = float(caja_abierta.monto_inicial or 0.0)
        
        # Sumamos ventas en efectivo (no anuladas)
        ventas_efectivo = float(db.session.query(func.sum(Factura.total)).filter(
            Factura.caja_id == caja_abierta.id, 
            Factura.metodo_pago == 'efectivo',
            Factura.anulada == False 
        ).scalar() or 0.0)
        
        # Sumamos ventas por transferencia (no anuladas)
        ventas_transferencia = float(db.session.query(func.sum(Factura.total)).filter(
            Factura.caja_id == caja_abierta.id, 
            Factura.metodo_pago == 'transferencia',
            Factura.anulada == False 
        ).scalar() or 0.0)
        
        # Sumamos descuentos aplicados
        total_descuentos = float(db.session.query(func.sum(Factura.descuento)).filter(
            Factura.caja_id == caja_abierta.id,
            Factura.anulada == False
        ).scalar() or 0.0)

        # Sumamos facturas anuladas (informativo)
        total_anulado = float(db.session.query(func.sum(Factura.total)).filter(
            Factura.caja_id == caja_abierta.id,
            Factura.anulada == True
        ).scalar() or 0.0)

    # 5. TOTALES PARA EL SISTEMA
    # El efectivo que DEBE haber es: Lo que había al abrir + lo que se vendió en efectivo
    total_efectivo_sistema = monto_ini + ventas_efectivo
    total_transferencia_sistema = ventas_transferencia
    total_sistema = total_efectivo_sistema + total_transferencia_sistema

    return render_template('caja.html', 
                            caja_abierta=caja_abierta, 
                            ventas_efectivo=ventas_efectivo, 
                            ventas_transferencia=ventas_transferencia, 
                            total_descuentos=total_descuentos,
                            total_anulado=total_anulado,
                            total_efectivo_sistema=total_efectivo_sistema, 
                            total_transferencia_sistema=total_transferencia_sistema, 
                            total_esperado=total_sistema)

@main.route('/api/abrir_caja', methods=['POST'])
def abrir_caja():
    data = request.get_json()
    if Caja.query.filter_by(estado='abierta').first():
        return jsonify({"success": False, "error": "Ya hay una caja abierta"}), 400
    try:
        nueva = Caja(
            monto_inicial=Decimal(str(data.get('monto_inicial', 0))), 
            estado='abierta', fecha_apertura=datetime.now(),
            usuario_apertura_id=session.get('user_cedula')
        )
        db.session.add(nueva)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    
@main.route('/api/cerrar_caja', methods=['POST'])
def cerrar_caja():
    caja = Caja.query.filter_by(estado='abierta').first()
    if not caja:
        return jsonify({"success": False, "error": "No hay caja abierta"}), 404
        
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No se recibieron datos"}), 400

        TWO_PLACES = Decimal('0.01')
        
        # Convertimos los valores recibidos a Decimal de forma segura
        efectivo_f = Decimal(str(data.get('efectivo_fisico', 0))).quantize(TWO_PLACES, ROUND_HALF_UP)
        transf_f = Decimal(str(data.get('transferencia_fisico', 0))).quantize(TWO_PLACES, ROUND_HALF_UP)
        
        # Consultamos ventas en sistema
        ventas_ef = db.session.query(func.sum(Factura.total)).filter(
            Factura.caja_id == caja.id, 
            Factura.metodo_pago == 'efectivo', 
            Factura.anulada == False
        ).scalar() or Decimal('0.00')

        ventas_tr = db.session.query(func.sum(Factura.total)).filter(
            Factura.caja_id == caja.id, 
            Factura.metodo_pago == 'transferencia', 
            Factura.anulada == False
        ).scalar() or Decimal('0.00')

        # Calculamos lo que debería haber en sistema
        # Convertimos caja.monto_inicial a Decimal por si es float en la base de datos
        monto_inicial_dec = Decimal(str(caja.monto_inicial or 0))
        esp_efectivo = (monto_inicial_dec + ventas_ef).quantize(TWO_PLACES, ROUND_HALF_UP)
        esp_transf = ventas_tr.quantize(TWO_PLACES, ROUND_HALF_UP)
        
        # Validación de descuadre y observación
        observacion = data.get('observacion', '').strip()
        if efectivo_f != esp_efectivo or transf_f != esp_transf:
            if not observacion or len(observacion) < 5:
                return jsonify({"success": False, "error": "Existe un descuadre. Debe ingresar una justificación válida (mínimo 5 caracteres)."}), 400

        # Guardamos datos de cierre
        caja.estado = 'cerrada'
        caja.fecha_cierre = datetime.now()
        caja.efectivo_fisico = float(efectivo_f)
        caja.transferencias_fisico = float(transf_f)
        caja.monto_final_fisico = float(efectivo_f + transf_f)
        caja.monto_final_sistema = float(esp_efectivo + esp_transf)
        caja.observacion = observacion.upper()
        caja.diferencia = float((efectivo_f + transf_f) - (esp_efectivo + esp_transf))
        
        db.session.commit()
        return jsonify({"success": True})

    except Exception as e:
        db.session.rollback()
        print(f"Error en cierre de caja: {str(e)}") # Esto ayuda a ver el error en consola
        return jsonify({"success": False, "error": f"Error interno: {str(e)}"}), 500
      
# ==========================================
# --- 8. REPORTES E IMPORTACIÓN ---
# ==========================================

@main.route('/reportes')
@admin_required
def reportes():
    hoy = datetime.now().date()
    total_hoy = db.session.query(func.sum(Factura.total)).filter(
        func.date(Factura.fecha) == hoy,
        Factura.anulada == False
    ).scalar() or 0.0
    total_descuentos = db.session.query(func.sum(Factura.descuento)).filter(
        func.date(Factura.fecha) == hoy,
        Factura.anulada == False
    ).scalar() or 0.0
    ultimas_facturas = Factura.query.filter(
        func.date(Factura.fecha) == hoy,
        (Factura.descuento > 0) | (Factura.anulada == True)
    ).order_by(Factura.id.desc()).all()
    productos_bajos = Producto.query.filter(
        Producto.stock <= Producto.umbral_minimo, 
        Producto.activo == True
    ).all()
    top_query = db.session.query(
        DetalleFactura.producto_nombre, 
        func.sum(DetalleFactura.cantidad).label('total_vendido'),
        func.sum(DetalleFactura.subtotal).label('ingreso_total')
    ).join(Factura).filter(
        func.date(Factura.fecha) == hoy,
        Factura.anulada == False
    ).group_by(DetalleFactura.producto_nombre).order_by(func.sum(DetalleFactura.cantidad).desc()).limit(5).all()
    top_productos = [{'producto_nombre': p[0], 'total_vendido': p[1], 'ingreso_total': p[2]} for p in top_query]
    total_ventas_cont = Factura.query.filter(func.date(Factura.fecha) == hoy, Factura.anulada == False).count()
    ticket_promedio = total_hoy / total_ventas_cont if total_ventas_cont > 0 else 0.0
    ventas_semana = []
    from datetime import timedelta
    for i in range(6, -1, -1):
        dia_f = hoy - timedelta(days=i)
        total_dia = db.session.query(func.sum(Factura.total)).filter(
            func.date(Factura.fecha) == dia_f, Factura.anulada == False
        ).scalar() or 0.0
        ventas_semana.append({'dia': dia_f.strftime('%A'), 'total': float(total_dia)})
    return render_template('reportes.html', 
                            total_hoy=total_hoy, total_descuentos=total_descuentos, 
                            top_productos=top_productos, ultimas_facturas=ultimas_facturas,
                            ticket_promedio=ticket_promedio, productos_bajos=productos_bajos,
                            ventas_semana=ventas_semana, hoy=hoy.strftime('%d/%m/%Y'))

@main.route('/importar_excel', methods=['POST'])
@admin_required
def importar_excel():
    if 'archivo_excel' not in request.files:
        flash("No hay archivo seleccionado", "danger")
        return redirect(request.referrer)
    
    archivo = request.files['archivo_excel']
    if archivo.filename == '':
        flash("No has seleccionado ningún archivo", "warning")
        return redirect(request.referrer)

    try:
        df = pd.read_excel(archivo)
        
        # Limpiar espacios en blanco en los nombres de las columnas
        df.columns = [c.strip().lower() for c in df.columns]

        for _, row in df.iterrows():
            # Convertir a string y quitar espacios para evitar errores de búsqueda
            codigo_str = str(row['codigo']).strip()
            
            p = Producto.query.filter_by(codigo=codigo_str).first()
            if p:
                p.stock += int(row['stock'])
                p.precio = float(row['precio'])
                p.activo = True 
            else:
                db.session.add(Producto(
                    codigo=codigo_str, 
                    nombre=str(row['nombre']).upper().strip(),
                    detalle=str(row.get('detalle', '')) if pd.notna(row.get('detalle')) else '', 
                    precio=float(row['precio']), 
                    stock=int(row['stock']), 
                    umbral_minimo=int(row.get('umbral_minimo', 5)),
                    categoria_id=int(row.get('categoria_id', 1)), 
                    activo=True
                ))
        
        db.session.commit()
        flash("✅ ¡Excelente! Los productos se han importado correctamente.", "success")
        
    except Exception as e:
        db.session.rollback()
        # Imprime el error en la consola para que tú lo veas mientras programas
        print(f"Error en importación: {e}")
        flash(f"❌ Error al procesar el Excel: {str(e)}", "danger")
        
    return redirect(request.referrer)

# ==========================================
# --- 9. API GESTIÓN DE USUARIOS ---
# ==========================================

@main.route('/api/agregar_usuario', methods=['POST'])
@admin_required
def agregar_usuario():
    data = request.get_json()
    cedula = data.get('cedula')
    username = data.get('username')
    rol_id = data.get('rol_id')
    password_plana = data.get('password')
    
    # 1. VALIDACIÓN DE USERNAME
    usuario_con_ese_nombre = Usuario.query.filter_by(username=username).first()
    if usuario_con_ese_nombre and usuario_con_ese_nombre.cedula != cedula:
        return jsonify({
            "success": False, 
            "error": f"El nombre de usuario '{username}' ya existe."
        }), 400

    # 2. VALIDACIÓN DE ROL
    rol_obj = Rol.query.get(rol_id)
    if not rol_obj:
        return jsonify({"success": False, "error": "Debe seleccionar un rol válido."}), 400

    # 3. LÓGICA DE USUARIO EXISTENTE (POR CÉDULA)
    existente = Usuario.query.get(cedula)
    if existente:
        if existente.activo:
            return jsonify({"success": False, "error": "Esta cédula ya está registrada y activa."}), 400
        
        if not data.get('force_reactivate'):
            return jsonify({
                "success": False, 
                "is_inactive": True, 
                "nombre_antiguo": existente.nombre_completo
            }), 200

        # REACTIVACIÓN
        try:
            existente.username = username
            existente.nombre_completo = data.get('nombre')
            existente.rol_id = rol_obj.id
            existente.activo = True
            if password_plana:
                existente.set_password(password_plana) # Encriptado
            
            db.session.commit()
            return jsonify({"success": True, "mensaje": "Usuario reactivado"})
        except Exception as e:
            db.session.rollback()
            return jsonify({"success": False, "error": "Error al reactivar."}), 500

    # 4. NUEVO REGISTRO
    try:
        nuevo = Usuario(
            cedula=cedula,
            username=username,
            rol_id=rol_obj.id,
            nombre_completo=data.get('nombre'),
            activo=True
        )
        nuevo.set_password(password_plana) # Encriptado
        db.session.add(nuevo)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@main.route('/api/editar_usuario/<cedula>', methods=['POST'])
@admin_required
def editar_usuario(cedula):
    data = request.get_json()
    u = Usuario.query.filter_by(cedula=cedula, activo=True).first()
    
    if not u: 
        return jsonify({"success": False, "error": "Usuario no encontrado"}), 404
        
    try:
        rol_obj = Rol.query.get(data.get('rol_id'))
        if not rol_obj:
            return jsonify({"success": False, "error": "Rol no válido"}), 400

        u.rol_id = rol_obj.id
        u.nombre_completo = data.get('nombre')
        u.username = data.get('username')
        
        nueva_pass = data.get('password')
        if nueva_pass and nueva_pass.strip(): 
            u.set_password(nueva_pass) # Encriptado
            
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@main.route('/api/eliminar_usuario/<string:cedula>', methods=['DELETE'])
@admin_required
def eliminar_usuario(cedula):
    if cedula == session.get('user_cedula'):
        return jsonify({"success": False, "error": "No puedes desactivarte a ti mismo"}), 400
    u = Usuario.query.get(cedula)
    if u:
        try:
            # CAMBIO: Borrado Lógico
            u.activo = False
            db.session.commit()
            return jsonify({"success": True})
        except Exception as e:
            db.session.rollback()
            return jsonify({"success": False, "error": str(e)}), 500
    return jsonify({"success": False, "error": "No encontrado"}), 404

# ==========================================
# --- 10. ANULACIÓN ---
# ==========================================

@main.route('/anular-facturacion', methods=['GET', 'POST'])
def anular_facturacion():
    hoy = datetime.now().date()
    
    # 1. Obtener la caja que está abierta actualmente
    caja_activa = Caja.query.filter_by(estado='abierta').first()

    if request.method == 'POST':
        factura_id = request.form.get('factura_id')
        motivo = request.form.get('motivo')
        factura = Factura.query.get_or_404(factura_id)

        # Validación de seguridad: Solo anular si es de hoy
        if factura.fecha.date() != hoy:
            flash("Solo se anulan facturas del día.", "danger")
            return redirect(url_for('main.anular_facturacion'))
        
        # VALIDACIÓN EXTRA: No permitir anular facturas de una caja que ya se cerró
        if not caja_activa or factura.caja_id != caja_activa.id:
            flash("No puede anular una factura de una caja cerrada o de otra sesión.", "danger")
            return redirect(url_for('main.anular_facturacion'))

        try:
            for d in factura.detalles:
                prod = Producto.query.get(d.producto_id)
                if prod: prod.stock += d.cantidad
            
            factura.anulada = True
            factura.motivo_anulacion = motivo.upper()
            factura.fecha_anulacion = datetime.now()
            factura.fa_usuario_id = session.get('user_cedula')
            
            db.session.commit()
            flash(f"Factura {factura.numero_factura} anulada correctamente.", "success")
        except Exception as e:
            db.session.rollback()
            flash(f"Error: {str(e)}", "danger")
        return redirect(url_for('main.anular_facturacion'))

    # --- CONSULTA CORREGIDA ---
    # Solo mostramos facturas:
    # 1. Que no estén anuladas
    # 2. Que sean de hoy
    # 3. QUE PERTENEZCAN A LA CAJA ABIERTA ACTUALMENTE
    if caja_activa:
        facturas = Factura.query.filter(
            Factura.anulada == False, 
            func.date(Factura.fecha) == hoy,
            Factura.caja_id == caja_activa.id  # <--- Filtro clave
        ).all()
    else:
        facturas = [] # Si no hay caja abierta, no hay nada que anular
        flash("Debe tener una caja abierta para gestionar anulaciones.", "warning")

    return render_template('anular_facturacion.html', facturas=facturas)