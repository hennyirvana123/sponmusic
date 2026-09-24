FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MT3_DEVICE=cpu MT3_CHECKPOINT_DIR=/models/mt3 PORT=8000 HOME=/home/worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && pip check
RUN python -c "from mt3_infer import transcribe, load_model; from mt3_infer.utils.audio import load_audio; from importlib.metadata import version; print('mt3-infer:', version('mt3-infer')); print('torch:', version('torch'))"
COPY app.py transcriber.py test_contract.py ./
RUN python -m py_compile app.py transcriber.py test_contract.py && python -m unittest test_contract
RUN useradd --create-home worker && mkdir -p /models/mt3 && chown -R worker:worker /models
USER worker
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
