FROM python:3.12-slim
LABEL org.opencontainers.image.title="Fixarr" \
      org.opencontainers.image.description="Imports the season packs Sonarr can't, from inside Sonarr's own UI" \
      org.opencontainers.image.source="https://github.com/Apex-Tech-Labs/fixarr"
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends mkvtoolnix mediainfo && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY templates ./templates
COPY static ./static
ENV PYTHONUNBUFFERED=1
EXPOSE 8686
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8686/api/health',timeout=4)" || exit 1
CMD ["waitress-serve", "--host=0.0.0.0", "--port=8686", "--threads=8", "app:app"]
