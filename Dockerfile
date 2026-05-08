# Usamos una imagen de Python oficial
FROM python:3.10-slim

# Instalamos las librerías de sistema corregidas
RUN apt-get update && apt-get install -y \
    python3-dev \
    gcc \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && apt-get clean

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar los archivos de requerimientos e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código
COPY . .

# Comando para arrancar la app con Gunicorn
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000"]