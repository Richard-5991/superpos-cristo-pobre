from flask import Flask, render_template
from models import db, Usuario, Rol, Categoria
from config import Config
import os
import time
from dotenv import load_dotenv
from flask_mail import Mail # Importamos Mail

# Cargar variables de entorno desde .env
load_dotenv() 

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

# =================================================

# IMPORTACIÓN DE RUTAS (Aquí abajo para evitar el error circular)
from routes import main
app.register_blueprint(main)

db.init_app(app)

# Seguridad (CSP)
@app.after_request
def add_security_headers(response):
    scripts = "'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com https://cdn.jsdelivr.net https://cdn.jsdelivr.net/npm/sweetalert2@11"
    styles = "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com"
    fonts = "'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com"
    imgs = "'self' data: https: blob:"
    csp = (f"default-src 'self'; script-src {scripts}; style-src {styles}; font-src {fonts}; img-src {imgs}; connect-src 'self' https://cdn.jsdelivr.net;")
    response.headers['Content-Security-Policy'] = csp
    return response

# Datos iniciales
def cargar_datos_base():
    try:
        if not Rol.query.first():
            admin_rol = Rol(id=1, nombre='administrador')
            empleado_rol = Rol(id=2, nombre='empleado')
            db.session.add(admin_rol)
            db.session.add(empleado_rol)
            db.session.commit()
            print("✅ Roles iniciales creados")

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

        if not Categoria.query.first():
            cats = ['Viveres', 'Limpieza', 'Lacteos', 'Bebidas', 'Snacks']
            for c in cats:
                db.session.add(Categoria(nombre=c))
            print("✅ Categorías creadas")

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error al cargar datos: {e}")

# 🚀 Inicialización automática
with app.app_context():
    db.create_all()
    cargar_datos_base()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"DEBUG: Mail User es {app.config['MAIL_USERNAME']}")
    app.run(host='0.0.0.0', port=port)