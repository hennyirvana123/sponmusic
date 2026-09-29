FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MT3_DEVICE=cpu MT3_CHECKPOINT_DIR=/models/mt3 PORT=8000 HOME=/home/worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
WORKDIR /app
COPY requirements.txt ./
# Select CPU wheels explicitly, then prevent the application install from replacing them.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchaudio \
    && python -c "from importlib.metadata import version; from pathlib import Path; Path('/tmp/cpu-constraints.txt').write_text(''.join(name + '==' + version(name) + '\n' for name in ('torch', 'torchaudio')))" \
    && pip install --no-cache-dir -c /tmp/cpu-constraints.txt -r requirements.txt \
    && pip check \
    && python -c "import torch; from mt3_infer import transcribe, load_model; from mt3_infer.utils.audio import load_audio; from importlib.metadata import version; assert torch.version.cuda is None, 'Expected CPU-only PyTorch'; print('mt3-infer:', version('mt3-infer')); print('torch:', version('torch')); print('torchaudio:', version('torchaudio'))" \
    && rm -rf /root/.cache/pip /tmp/cpu-constraints.txt
COPY app.py transcriber.py test_contract.py smoke_test.py ./
RUN python -m py_compile app.py transcriber.py test_contract.py smoke_test.py \
    && python -m unittest test_contract \
    && rm -rf /app/__pycache__ \
    && useradd --create-home worker \
    && mkdir -p /models/mt3 \
    && chown -R worker:worker /models
USER worker
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
