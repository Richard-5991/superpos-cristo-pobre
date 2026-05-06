from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import Numeric, Enum
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

# ------------------------
# ROLES
# ------------------------
class Rol(db.Model):
    __tablename__ = 'rol'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

    usuarios = db.relationship('Usuario', backref='rol', lazy=True)


# ------------------------
# USUARIOS
# ------------------------
class Usuario(db.Model):
    __tablename__ = 'usuario'

    cedula = db.Column(db.String(10), primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    nombre_completo = db.Column(db.String(100), nullable=False)
    activo = db.Column(db.Boolean, default=True, nullable=False)
    rol_id = db.Column(db.Integer, db.ForeignKey('rol.id'), nullable=False)

    def set_password(self, password):
        """Genera un hash seguro para la contraseña."""
        if password:
            self.password = generate_password_hash(password)

    def check_password(self, password):
        """Verifica la contraseña contra el hash almacenado."""
        return check_password_hash(self.password, password)


# ------------------------
# CLIENTES
# ------------------------
class Cliente(db.Model):
    __tablename__ = 'cliente'

    id = db.Column(db.Integer, primary_key=True)
    cedula = db.Column(db.String(15), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    telefono = db.Column(db.String(20))
    direccion = db.Column(db.String(200))
    correo = db.Column(db.String(100))
    activo = db.Column(db.Boolean, default=True, nullable=False)

    facturas = db.relationship('Factura', backref='cliente', lazy=True)


# ------------------------
# CATEGORIAS
# ------------------------
class Categoria(db.Model):
    __tablename__ = 'categoria'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), unique=True, nullable=False)
    descripcion = db.Column(db.String(255))

    productos = db.relationship('Producto', backref='categoria', lazy=True)


# ------------------------
# PRODUCTOS
# ------------------------
class Producto(db.Model):
    __tablename__ = 'producto'

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    detalle = db.Column(db.String(255))
    precio = db.Column(Numeric(10, 2), nullable=False)
    stock = db.Column(db.Integer, default=0)
    umbral_minimo = db.Column(db.Integer, default=5)
    activo = db.Column(db.Boolean, default=True)

    categoria_id = db.Column(db.Integer, db.ForeignKey('categoria.id'))

    detalles = db.relationship('DetalleFactura', backref='producto', lazy=True)


# ------------------------
# CAJA
# ------------------------
class Caja(db.Model):
    __tablename__ = 'caja'

    id = db.Column(db.Integer, primary_key=True)
    fecha_apertura = db.Column(db.DateTime, default=datetime.now)
    fecha_cierre = db.Column(db.DateTime)
    monto_inicial = db.Column(Numeric(10, 2), nullable=False)
    monto_final_sistema = db.Column(Numeric(10, 2), default=0.00)
    monto_final_fisico = db.Column(Numeric(10, 2))
    efectivo_fisico = db.Column(Numeric(10, 2), default=0.00)
    transferencias_fisico = db.Column(Numeric(10, 2), default=0.00)
    diferencia = db.Column(Numeric(10, 2), default=0.00)
    estado = db.Column(Enum('abierta', 'cerrada', name='estado_caja'), default='abierta')
    observacion = db.Column(db.Text)

    usuario_apertura_id = db.Column(db.String(10), db.ForeignKey('usuario.cedula'))
    usuario_cierre_id = db.Column(db.String(10), db.ForeignKey('usuario.cedula'))

    # Relaciones con foreign_keys explícitas para evitar ambigüedad en Caja
    usuario_apertura = db.relationship('Usuario', foreign_keys=[usuario_apertura_id])
    usuario_cierre = db.relationship('Usuario', foreign_keys=[usuario_cierre_id])

    facturas = db.relationship('Factura', backref='caja', lazy=True)


# ------------------------
# FACTURAS (VENTAS)
# ------------------------
class Factura(db.Model):
    __tablename__ = 'factura'

    id = db.Column(db.Integer, primary_key=True)
    numero_factura = db.Column(db.String(20), unique=True, nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.now)

    cliente_id = db.Column(db.Integer, db.ForeignKey('cliente.id'))
    
    # Llaves foráneas a Usuario
    fv_usuario_id = db.Column(db.String(10), db.ForeignKey('usuario.cedula')) 
    fa_usuario_id = db.Column(db.String(10), db.ForeignKey('usuario.cedula'), nullable=True) 
    
    caja_id = db.Column(db.Integer, db.ForeignKey('caja.id'))

    subtotal = db.Column(Numeric(10, 2), default=0.00)
    descuento = db.Column(Numeric(10, 2), default=0.00)
    total = db.Column(Numeric(10, 2), default=0.00)

    metodo_pago = db.Column(db.String(50))
    motivo_descuento = db.Column(db.String(255))

    anulada = db.Column(db.Boolean, default=False)
    motivo_anulacion = db.Column(db.String(255))
    fecha_anulacion = db.Column(db.DateTime, nullable=True) 

    # Relaciones explícitas con sus respectivos backrefs
    vendedor = db.relationship('Usuario', foreign_keys=[fv_usuario_id], backref='ventas_realizadas')
    anulador = db.relationship('Usuario', foreign_keys=[fa_usuario_id], backref='anulaciones_realizadas')
    
    detalles = db.relationship('DetalleFactura', backref='factura', cascade="all, delete-orphan", lazy=True)


# ------------------------
# DETALLE FACTURA
# ------------------------
class DetalleFactura(db.Model):
    __tablename__ = 'detalle_factura'

    id = db.Column(db.Integer, primary_key=True)
    factura_id = db.Column(db.Integer, db.ForeignKey('factura.id'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('producto.id'), nullable=False)

    cantidad = db.Column(db.Integer, nullable=False)
    precio_unitario = db.Column(Numeric(10, 2), nullable=False)
    subtotal = db.Column(Numeric(10, 2), nullable=False)

    producto_nombre = db.Column(db.String(100))
