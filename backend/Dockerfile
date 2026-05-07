FROM python:3.11-slim

WORKDIR /app

# System deps for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render assigns the port via $PORT
ENV PORT=8001
EXPOSE 8001

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}"]
