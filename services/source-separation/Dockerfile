FROM python:3.10-slim-bookworm
ENV PYTHONUNBUFFERED=1 PORT=8000 TORCH_HOME=/home/worker/.cache/torch
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && pip check
COPY app.py ./
RUN useradd --create-home worker
USER worker
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
