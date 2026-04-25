FROM python:3.12-slim
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/media && chown -R app:app /app
USER app

EXPOSE 8000

# Use python -m to ensure module path is correct
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--ws", "websockets", "--log-level", "info"]
