# Панель для Яндекс Станции Лайт 2: Python (только стандартная библиотека) + adb + ffmpeg + openssl.
FROM python:3.14-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends adb ffmpeg openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py access.py glagol.py ./
COPY static ./static
COPY device ./device
COPY 3d ./3d
COPY LICENSE ./

# /data — токен Яндекса, пароль панели, сертификаты, история графиков и ключ adb (HOME).
# Свой порт adb-сервера, чтобы при network_mode: host не мешать adb на самой машине.
ENV PANEL_HOST=0.0.0.0 \
    PANEL_DATA_DIR=/data \
    HOME=/data \
    ANDROID_ADB_SERVER_PORT=5038 \
    PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8765 8766

CMD ["python", "server.py"]
