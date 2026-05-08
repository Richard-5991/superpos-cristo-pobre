from flask import Flask
from models import db, Usuario, Rol, Categoria
from routes import main
from config import Config
import os
import time

# =================================================   
# CONFIGURACIÓN DE HORA PARA ECUADOR (RENDER/LINUX)
# =================================================
os.environ['TZ'] = 'America/Guayaquil'
if hasattr(time, 'tzset'):
    time.tzset()
# =================================================

app = Flask(__name__)

# Aplicamos la configuración desde la clase Config
app.config.from_object(Config)

db.init_app(app)
app.register_blueprint(main)

# Seguridad (CSP) - Permite scripts y estilos externos necesarios
@app.after_request
def add_security_headers(response):
    scripts = "'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com https://cdn.jsdelivr.net https://cdn.jsdelivr.net/npm/sweetalert2@11"
    styles = "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com"
    fonts = "'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com"
    imgs = "'self' data: https: blob:"

    csp = (
        f"default-src 'self'; "
        f"script-src {scripts}; "
        f"style-src {styles}; "
        f"font-src {fonts}; "
        f"img-src {imgs}; "
        f"connect-src 'self' https://cdn.jsdelivr.net;"
    )

    response.headers['Content-Security-Policy'] = csp
    return response

# Datos iniciales (Se ejecuta al iniciar en Render)
def cargar_datos_base():
    try:
        # 1. Crear Roles (Asegurando IDs 1 y 2)
        if not Rol.query.first():
            admin_rol = Rol(id=1, nombre='administrador')
            empleado_rol = Rol(id=2, nombre='empleado')
            db.session.add(admin_rol)
            db.session.add(empleado_rol)
            db.session.commit()
            print("✅ Roles iniciales creados (1: admin, 2: empleado)")

        # 2. Crear Usuario Administrador inicial
        cedula_admin = '1111111111'
        if not Usuario.query.filter_by(cedula=cedula_admin).first():
            admin_user = Usuario(
                cedula=cedula_admin,
                username='admin',
                password='scrypt:32768:8:1$Qhr1l6jgvMm9gvAG$2b08d34f1b710ac2f01f267d525dd413ee370abcdf96968448fc062b7ca6fc4243f25f1acd4296666809da5d713ed5abec5e8205652de5dd974bb73ff293379d',
                nombre_completo='Administrador',
                activo=True,
                rol_id=1
            )
            db.session.add(admin_user)
            print("✅ Usuario administrador 'admin' creado")

        # 3. Crear Categorías iniciales
        if not Categoria.query.first():
            cats = ['Viveres', 'Limpieza', 'Lacteos', 'Bebidas', 'Snacks']
            for c in cats:
                db.session.add(Categoria(nombre=c))
            print("✅ Categorías iniciales creadas")

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error al cargar datos: {e}")


# 🚀 Inicialización automática en Render
with app.app_context():
    db.create_all()  # Crea las tablas si no existen (PostgreSQL)
    cargar_datos_base()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)