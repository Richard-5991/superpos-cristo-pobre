import os

class Config:
    # Si Render nos da una URL de base de datos, la usa. Si no, usa SQLite local.
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///supermercado.db')
    
    # Un pequeño fix porque Render a veces da la URL como 'postgres://' 
    # y SQLAlchemy moderno requiere 'postgresql://'
    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get('SECRET_KEY', 'clave_secreta_para_sesiones')